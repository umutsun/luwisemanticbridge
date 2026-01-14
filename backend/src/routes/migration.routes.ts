import { Router, Request, Response } from 'express';
import { Pool } from 'pg';
import OpenAI from 'openai';
import { EventEmitter } from 'events';
import { lsembPool } from '../config/database.config';
import { initializeRedis, redisClient } from '../config/redis';

const router = Router();

// Redis keys for migration state persistence
const REDIS_KEYS = {
  ACTIVE_MIGRATION: 'migration:active',
  PROGRESS: (id: string) => `migration:progress:${id}`,
  PAUSED: (id: string) => `migration:paused:${id}`,
  STOPPED: (id: string) => `migration:stopped:${id}`,
  STATE: (id: string) => `migration:state:${id}`,
  PENDING_RECORDS: (id: string) => `migration:pending:${id}`,
  HISTORY: 'migration:history',
  HEARTBEAT: (id: string) => `migration:heartbeat:${id}`
};

// TTL for migration data in Redis (24 hours)
const MIGRATION_TTL = 86400;

// Heartbeat interval (30 seconds) and stale threshold (2 minutes)
const HEARTBEAT_INTERVAL_MS = 30000;
const STALE_THRESHOLD_MS = 120000;

// Database connections will be initialized from settings
let sourcePool: Pool | null = null;
let targetPool: Pool | null = null;
let poolInitPromise: Promise<{ sourcePool: Pool; targetPool: Pool }> | null = null;

// Validate pool connection is alive
async function validatePoolConnection(pool: Pool): Promise<boolean> {
  try {
    const client = await pool.connect();
    await client.query('SELECT 1');
    client.release();
    return true;
  } catch (error) {
    return false;
  }
}

// Initialize database pools from settings
async function initializePools(forceRefresh: boolean = false): Promise<{ sourcePool: Pool; targetPool: Pool }> {
  // Return cached pools if valid (unless force refresh)
  if (!forceRefresh && sourcePool && targetPool) {
    // Quick validation - check if pools are still alive
    const [sourceValid, targetValid] = await Promise.all([
      validatePoolConnection(sourcePool),
      validatePoolConnection(targetPool)
    ]);

    if (sourceValid && targetValid) {
      return { sourcePool, targetPool };
    }

    // Pools are stale, need to refresh
    console.log('[Migration] Cached pools are stale, refreshing...');
    forceRefresh = true;
  }

  // If already initializing, wait for it
  if (poolInitPromise && !forceRefresh) {
    return poolInitPromise;
  }

  // Create initialization promise
  poolInitPromise = (async () => {
    try {
      // IMPORTANT: Never end pools - just let them drain naturally
      // Ending pools while migration is running causes "Cannot use pool after end" errors
      // Old pools will be garbage collected when no longer referenced
      const oldSourcePool = sourcePool;
      const oldTargetPool = targetPool;
      sourcePool = null;
      targetPool = null;

      const { pool: lsembPool } = await import('../config/database');

      // Get database settings from settings table
      const result = await lsembPool.query(
        `SELECT key, value FROM settings WHERE key LIKE 'database.%'`
      );

      const dbSettings: any = {};
      result.rows.forEach(row => {
        const key = row.key.replace('database.', '');
        try {
          dbSettings[key] = JSON.parse(row.value);
        } catch {
          dbSettings[key] = row.value;
        }
      });

      // Build connection strings from settings
      const username = dbSettings.user || dbSettings.username;
      const database = dbSettings.name || dbSettings.database;
      const host = dbSettings.host || process.env.POSTGRES_HOST || 'localhost';
      const port = dbSettings.port || process.env.POSTGRES_PORT || 5432;
      const password = dbSettings.password || process.env.POSTGRES_PASSWORD;

      const sourceConnectionString = `postgresql://${username}:${password}@${host}:${port}/${database}`;

      // Target is same as main database (lsemb)
      const targetConnectionString = process.env.DATABASE_URL || sourceConnectionString;

      console.log(`[Migration] Source DB: ${database} on ${host}:${port}`);
      console.log(`[Migration] Target DB: Using ${process.env.DATABASE_URL ? 'DATABASE_URL' : 'source connection'}`);

      sourcePool = new Pool({
        connectionString: sourceConnectionString,
        connectionTimeoutMillis: 60000, // 60 second timeout for initial connection
        idleTimeoutMillis: 60000, // 1 minute idle timeout - release connections quickly
        max: 5, // Reduced from 15 - we don't need many concurrent connections
        min: 1, // Keep at least 1 connection alive
        allowExitOnIdle: false, // Keep pool alive
        statement_timeout: 120000, // 2 minute statement timeout
        query_timeout: 120000, // 2 minute query timeout
      });
      targetPool = new Pool({
        connectionString: targetConnectionString,
        connectionTimeoutMillis: 60000,
        idleTimeoutMillis: 60000, // 1 minute idle timeout
        max: 5, // Reduced from 15
        min: 1,
        allowExitOnIdle: false,
        statement_timeout: 120000,
        query_timeout: 120000,
      });

      // Validate connections before returning
      const [sourceValid, targetValid] = await Promise.all([
        validatePoolConnection(sourcePool),
        validatePoolConnection(targetPool)
      ]);

      if (!sourceValid || !targetValid) {
        throw new Error(`Pool validation failed: source=${sourceValid}, target=${targetValid}`);
      }

      console.log('✓ Migration pools initialized and validated');
      return { sourcePool, targetPool };
    } catch (error) {
      console.error('Failed to initialize migration pools:', error);
      // Clear the promise so next call will retry
      poolInitPromise = null;
      throw error;
    }
  })();

  return poolInitPromise;
}

// OpenAI client (lazy loading)
let openai: OpenAI | null = null;

async function getOpenAIClient(): Promise<OpenAI | null> {
  if (openai) {
    return openai;
  }

  try {
    // Get API key from settings table - use default export 'pool'
    const dbModule = await import('../config/database');
    const dbPool = dbModule.default || dbModule.pool;

    if (!dbPool) {
      console.error('Database pool not available yet');
      return null;
    }

    const result = await dbPool.query(
      'SELECT value FROM settings WHERE key = $1',
      ['openai.apiKey']
    );

    if (result.rows.length > 0 && result.rows[0].value) {
      const apiKey = result.rows[0].value;
      // Check if it's a JSON object with apiKey property
      let key = apiKey;
      try {
        const parsed = JSON.parse(apiKey);
        if (typeof parsed === 'object' && parsed.apiKey) {
          key = parsed.apiKey;
        }
      } catch {
        // Use as-is if not JSON
      }

      openai = new OpenAI({ apiKey: key });
      return openai;
    }
  } catch (error) {
    console.error('Error fetching OpenAI API key from settings:', error);
  }

  console.warn('OpenAI API key not found in settings. Migration features will be disabled.');
  return null;
}

// Progress tracking with Redis persistence
class MigrationProgress extends EventEmitter {
  private progress: Map<string, any> = new Map();
  private pausedMigrations: Set<string> = new Set();
  private stoppedMigrations: Set<string> = new Set();
  private history: any[] = [];
  private redisInitialized = false;
  // Track actually running migrations (not just restored state)
  private runningMigrations: Set<string> = new Set();
  // Heartbeat intervals for each migration
  private heartbeatIntervals: Map<string, NodeJS.Timeout> = new Map();

  constructor() {
    super();
    // Initialize Redis and restore state on startup
    this.initRedis();
  }

  // Mark a migration as actually running (process is active) and start heartbeat
  markAsRunning(id: string) {
    this.runningMigrations.add(id);
    this.startHeartbeat(id);
    console.log(`🏃 Migration ${id} marked as actively running`);
  }

  // Mark a migration as no longer running and stop heartbeat
  markAsStopped(id: string) {
    this.runningMigrations.delete(id);
    this.stopHeartbeat(id);
    console.log(`⏹️ Migration ${id} marked as stopped`);
  }

  // Start heartbeat for a migration
  private async startHeartbeat(id: string) {
    // Clear any existing heartbeat
    this.stopHeartbeat(id);

    // Update heartbeat immediately
    await this.updateHeartbeat(id);

    // Set up interval
    const interval = setInterval(async () => {
      await this.updateHeartbeat(id);
    }, HEARTBEAT_INTERVAL_MS);

    this.heartbeatIntervals.set(id, interval);
    console.log(`💓 Heartbeat started for migration ${id}`);
  }

  // Stop heartbeat for a migration
  private stopHeartbeat(id: string) {
    const interval = this.heartbeatIntervals.get(id);
    if (interval) {
      clearInterval(interval);
      this.heartbeatIntervals.delete(id);
      console.log(`💔 Heartbeat stopped for migration ${id}`);
    }
  }

  // Update heartbeat timestamp in Redis
  private async updateHeartbeat(id: string) {
    try {
      const redis = redisClient();
      if (!redis || redis.status !== 'ready') return;

      const timestamp = Date.now();
      await redis.setex(REDIS_KEYS.HEARTBEAT(id), 300, timestamp.toString()); // 5 min TTL
      // console.log(`💓 Heartbeat updated for ${id}: ${timestamp}`);
    } catch (error) {
      console.error(`❌ Failed to update heartbeat for ${id}:`, error);
    }
  }

  // Check if a migration is stale (no heartbeat for STALE_THRESHOLD_MS)
  async isStale(id: string): Promise<boolean> {
    try {
      const redis = redisClient();
      if (!redis || redis.status !== 'ready') return false;

      const heartbeat = await redis.get(REDIS_KEYS.HEARTBEAT(id));
      if (!heartbeat) return true; // No heartbeat = stale

      const lastHeartbeat = parseInt(heartbeat, 10);
      const elapsed = Date.now() - lastHeartbeat;

      return elapsed > STALE_THRESHOLD_MS;
    } catch (error) {
      console.error(`❌ Failed to check heartbeat for ${id}:`, error);
      return false;
    }
  }

  // Clean up stale migration
  async cleanupStaleMigration(id: string) {
    console.log(`🧹 Cleaning up stale migration: ${id}`);

    try {
      const redis = redisClient();
      if (redis && redis.status === 'ready') {
        await redis.del(REDIS_KEYS.ACTIVE_MIGRATION);
        await redis.del(REDIS_KEYS.HEARTBEAT(id));
        await redis.del(REDIS_KEYS.PROGRESS(id));
        await redis.del(REDIS_KEYS.PAUSED(id));
        await redis.del(REDIS_KEYS.STOPPED(id));
      }

      this.runningMigrations.delete(id);
      this.pausedMigrations.delete(id);
      this.stoppedMigrations.delete(id);
      this.progress.delete(id);

      console.log(`✅ Stale migration ${id} cleaned up`);
    } catch (error) {
      console.error(`❌ Failed to cleanup stale migration ${id}:`, error);
    }
  }

  // Check if a migration is actually running (not just restored state)
  isActuallyRunning(id: string): boolean {
    return this.runningMigrations.has(id);
  }

  // Check if any migration is actually running
  hasRunningMigration(): boolean {
    return this.runningMigrations.size > 0;
  }

  private async initRedis() {
    try {
      await initializeRedis();
      this.redisInitialized = true;
      console.log('✅ Migration Redis persistence initialized');
      // Restore state from Redis
      await this.restoreStateFromRedis();
      // Check for stale migrations and trigger auto-resume after a delay
      // Wait 30 seconds to ensure all services (database, OpenAI) are ready
      setTimeout(() => this.checkAndAutoResume(), 30000);
    } catch (error) {
      console.warn('⚠️ Redis not available for migration persistence:', error);
    }
  }

  // Auto-resume stale migrations on startup
  private async checkAndAutoResume() {
    try {
      const redis = redisClient();
      if (!redis || redis.status !== 'ready') return;

      const activeMigrationId = await redis.get(REDIS_KEYS.ACTIVE_MIGRATION);
      if (!activeMigrationId) {
        console.log('📋 No active migration to resume');
        return;
      }

      // Check if migration is already running in this process
      if (this.runningMigrations.has(activeMigrationId)) {
        console.log(`✅ Migration ${activeMigrationId} already running`);
        return;
      }

      // Check if migration was stopped or paused
      const isStopped = await redis.get(REDIS_KEYS.STOPPED(activeMigrationId));
      const isPaused = await redis.get(REDIS_KEYS.PAUSED(activeMigrationId));

      if (isStopped === 'true') {
        console.log(`⏹️ Migration ${activeMigrationId} was stopped, cleaning up`);
        await this.cleanupStaleMigration(activeMigrationId);
        return;
      }

      if (isPaused === 'true') {
        console.log(`⏸️ Migration ${activeMigrationId} is paused, waiting for manual resume`);
        return;
      }

      // Migration was interrupted (crash/restart) - trigger auto-resume
      const progressData = await redis.get(REDIS_KEYS.PROGRESS(activeMigrationId));
      if (progressData) {
        const progress = JSON.parse(progressData);
        console.log(`🔄 AUTO-RESUME: Found interrupted migration ${activeMigrationId}`);
        console.log(`   Progress: ${progress.current}/${progress.total} (${progress.percentage}%)`);
        console.log(`   Last table: ${progress.currentTable}`);
        console.log(`   Triggering auto-resume in 5 seconds...`);

        // Trigger auto-resume after a short delay
        setTimeout(async () => {
          try {
            await this.triggerAutoResume(activeMigrationId);
          } catch (error) {
            console.error('❌ Auto-resume failed:', error);
          }
        }, 5000);
      }
    } catch (error) {
      console.error('❌ Error checking for auto-resume:', error);
    }
  }

  // Trigger auto-resume by calling the internal resume logic
  private async triggerAutoResume(migrationId: string) {
    console.log(`🚀 AUTO-RESUME: Starting migration ${migrationId}`);

    // Import and call the resume function
    // This will be handled by the resumeMigration function
    this.emit('auto-resume', migrationId);
  }

  private async restoreStateFromRedis() {
    try {
      const redis = redisClient();
      if (!redis || redis.status !== 'ready') {
        console.log('📡 Redis not ready, skipping state restoration');
        return;
      }

      // Restore active migration
      const activeMigrationId = await redis.get(REDIS_KEYS.ACTIVE_MIGRATION);
      if (activeMigrationId) {
        console.log(`📥 Found active migration in Redis: ${activeMigrationId}`);

        // Restore progress
        const progressData = await redis.get(REDIS_KEYS.PROGRESS(activeMigrationId));
        if (progressData) {
          const parsed = JSON.parse(progressData);
          this.progress.set(activeMigrationId, parsed);
          console.log(`📥 Restored progress for migration ${activeMigrationId}: ${parsed.current}/${parsed.total}`);
        }

        // Restore paused state
        const isPaused = await redis.get(REDIS_KEYS.PAUSED(activeMigrationId));
        if (isPaused === 'true') {
          this.pausedMigrations.add(activeMigrationId);
          console.log(`📥 Migration ${activeMigrationId} was paused`);
        }

        // Restore stopped state
        const isStopped = await redis.get(REDIS_KEYS.STOPPED(activeMigrationId));
        if (isStopped === 'true') {
          this.stoppedMigrations.add(activeMigrationId);
          console.log(`📥 Migration ${activeMigrationId} was stopped`);
        }
      }

      // Restore history
      const historyData = await redis.get(REDIS_KEYS.HISTORY);
      if (historyData) {
        this.history = JSON.parse(historyData);
        console.log(`📥 Restored ${this.history.length} migration history entries`);
      }

      console.log('✅ Migration state restored from Redis');
    } catch (error) {
      console.error('❌ Error restoring migration state from Redis:', error);
    }
  }

  private async persistToRedis(id: string, data: any) {
    try {
      const redis = redisClient();
      if (!redis || redis.status !== 'ready') return;

      // Save progress data
      await redis.setex(REDIS_KEYS.PROGRESS(id), MIGRATION_TTL, JSON.stringify(data));

      // Save active migration ID if processing
      if (data.status === 'processing' || data.status === 'paused') {
        await redis.setex(REDIS_KEYS.ACTIVE_MIGRATION, MIGRATION_TTL, id);
      }
    } catch (error) {
      console.error('Error persisting migration to Redis:', error);
    }
  }

  async updateProgress(id: string, data: any) {
    const progressData = {
      ...data,
      timestamp: new Date().toISOString()
    };
    this.progress.set(id, progressData);
    this.emit('progress', { id, ...progressData });

    // Persist to Redis
    await this.persistToRedis(id, progressData);
  }

  getProgress(id: string) {
    return this.progress.get(id);
  }

  async pauseMigration(id: string) {
    this.pausedMigrations.add(id);
    const current = this.progress.get(id);
    if (current) {
      await this.updateProgress(id, { ...current, status: 'paused' });
    }

    // Persist paused state to Redis
    try {
      const redis = redisClient();
      if (redis && redis.status === 'ready') {
        await redis.setex(REDIS_KEYS.PAUSED(id), MIGRATION_TTL, 'true');
      }
    } catch (error) {
      console.error('Error persisting paused state to Redis:', error);
    }
  }

  async resumeMigration(id: string) {
    this.pausedMigrations.delete(id);
    const current = this.progress.get(id);
    if (current) {
      await this.updateProgress(id, { ...current, status: 'processing' });
    }

    // Clear paused state from Redis
    try {
      const redis = redisClient();
      if (redis && redis.status === 'ready') {
        await redis.del(REDIS_KEYS.PAUSED(id));
      }
    } catch (error) {
      console.error('Error clearing paused state from Redis:', error);
    }
  }

  async stopMigration(id: string) {
    this.stoppedMigrations.add(id);
    this.runningMigrations.delete(id); // Mark as no longer running
    this.stopHeartbeat(id); // Stop heartbeat updates

    const current = this.progress.get(id);
    if (current) {
      const stoppedData = { ...current, status: 'stopped', stoppedAt: new Date().toISOString() };
      // Don't update progress - we want to clear it completely
      this.history.push({ id, ...stoppedData });

      // Clear all Redis state for this migration
      try {
        const redis = redisClient();
        if (redis && redis.status === 'ready') {
          await redis.del(REDIS_KEYS.ACTIVE_MIGRATION);
          await redis.del(REDIS_KEYS.PROGRESS(id));
          await redis.del(REDIS_KEYS.HEARTBEAT(id));
          await redis.del(REDIS_KEYS.PAUSED(id));
          await redis.del(REDIS_KEYS.STOPPED(id));
          await redis.setex(REDIS_KEYS.HISTORY, MIGRATION_TTL * 7, JSON.stringify(this.history));
        }
      } catch (error) {
        console.error('Error clearing Redis state:', error);
      }

      // Clear from local state
      this.progress.delete(id);
      this.pausedMigrations.delete(id);
    }
    console.log(`⏹️ Migration ${id} stopped by user - all state cleared`);
  }

  isPaused(id: string): boolean {
    return this.pausedMigrations.has(id);
  }

  isStopped(id: string): boolean {
    return this.stoppedMigrations.has(id);
  }

  async clearMigration(id: string) {
    this.progress.delete(id);
    this.pausedMigrations.delete(id);
    this.stoppedMigrations.delete(id);

    // Clear from Redis
    try {
      const redis = redisClient();
      if (redis && redis.status === 'ready') {
        await redis.del(REDIS_KEYS.PROGRESS(id));
        await redis.del(REDIS_KEYS.PAUSED(id));
        await redis.del(REDIS_KEYS.STOPPED(id));
        await redis.del(REDIS_KEYS.STATE(id));
        await redis.del(REDIS_KEYS.PENDING_RECORDS(id));

        // Clear active migration if this was it
        const activeMigration = await redis.get(REDIS_KEYS.ACTIVE_MIGRATION);
        if (activeMigration === id) {
          await redis.del(REDIS_KEYS.ACTIVE_MIGRATION);
        }
      }
    } catch (error) {
      console.error('Error clearing migration from Redis:', error);
    }
  }

  async completeMigration(id: string) {
    const current = this.progress.get(id);
    if (current) {
      const completedData = { ...current, status: 'completed', completedAt: new Date().toISOString() };
      this.progress.set(id, completedData);
      this.history.push({ id, ...completedData });
    }

    // Clear active migration from Redis
    try {
      const redis = redisClient();
      if (redis && redis.status === 'ready') {
        await redis.del(REDIS_KEYS.ACTIVE_MIGRATION);
        await redis.del(REDIS_KEYS.PENDING_RECORDS(id));
        await redis.setex(REDIS_KEYS.HISTORY, MIGRATION_TTL * 7, JSON.stringify(this.history));
      }
    } catch (error) {
      console.error('Error completing migration in Redis:', error);
    }
  }

  async savePendingRecords(id: string, records: any[]) {
    try {
      const redis = redisClient();
      if (redis && redis.status === 'ready') {
        // Save in batches of 1000 to avoid memory issues
        const chunks = [];
        for (let i = 0; i < records.length; i += 1000) {
          chunks.push(records.slice(i, i + 1000));
        }

        // Save total count and chunk info
        await redis.setex(
          REDIS_KEYS.STATE(id),
          MIGRATION_TTL,
          JSON.stringify({ totalChunks: chunks.length, totalRecords: records.length })
        );

        // Save each chunk
        for (let i = 0; i < chunks.length; i++) {
          await redis.setex(
            `${REDIS_KEYS.PENDING_RECORDS(id)}:${i}`,
            MIGRATION_TTL,
            JSON.stringify(chunks[i])
          );
        }

        console.log(`💾 Saved ${records.length} pending records to Redis in ${chunks.length} chunks`);
      }
    } catch (error) {
      console.error('Error saving pending records to Redis:', error);
    }
  }

  async getPendingRecords(id: string): Promise<any[]> {
    try {
      const redis = redisClient();
      if (!redis || redis.status !== 'ready') return [];

      const stateData = await redis.get(REDIS_KEYS.STATE(id));
      if (!stateData) return [];

      const state = JSON.parse(stateData);
      const records: any[] = [];

      // Load each chunk
      for (let i = 0; i < state.totalChunks; i++) {
        const chunkData = await redis.get(`${REDIS_KEYS.PENDING_RECORDS(id)}:${i}`);
        if (chunkData) {
          records.push(...JSON.parse(chunkData));
        }
      }

      console.log(`📥 Loaded ${records.length} pending records from Redis`);
      return records;
    } catch (error) {
      console.error('Error loading pending records from Redis:', error);
      return [];
    }
  }

  async getActiveMigrationId(): Promise<string | null> {
    try {
      const redis = redisClient();
      if (!redis || redis.status !== 'ready') return null;
      return await redis.get(REDIS_KEYS.ACTIVE_MIGRATION);
    } catch (error) {
      console.error('Error getting active migration ID from Redis:', error);
      return null;
    }
  }

  async setActiveMigrationId(id: string | null) {
    try {
      const redis = redisClient();
      if (!redis || redis.status !== 'ready') return;

      if (id) {
        await redis.setex(REDIS_KEYS.ACTIVE_MIGRATION, MIGRATION_TTL, id);
      } else {
        await redis.del(REDIS_KEYS.ACTIVE_MIGRATION);
      }
    } catch (error) {
      console.error('Error setting active migration ID in Redis:', error);
    }
  }

  getHistory() {
    return this.history;
  }

  getAllProgress() {
    return Array.from(this.progress.entries()).map(([id, data]) => ({
      id,
      ...data
    }));
  }
}

const migrationProgress = new MigrationProgress();

// Auto-resume event listener - triggered on startup if there's an interrupted migration
migrationProgress.on('auto-resume', async (migrationId: string) => {
  console.log(`🔄 AUTO-RESUME EVENT: Handling migration ${migrationId}`);

  try {
    // Get saved state from Redis
    const redis = redisClient();
    if (!redis || redis.status !== 'ready') {
      console.error('❌ Redis not available for auto-resume');
      return;
    }

    const progressData = await redis.get(REDIS_KEYS.PROGRESS(migrationId));
    if (!progressData) {
      console.error('❌ No progress data found for auto-resume');
      return;
    }

    const progress = JSON.parse(progressData);

    // Get the state (tables, settings, etc.)
    const stateData = await redis.get(REDIS_KEYS.STATE(migrationId));
    let state: any = {};
    if (stateData) {
      state = JSON.parse(stateData);
    }

    console.log(`📊 Auto-resume state:`, {
      current: progress.current,
      total: progress.total,
      currentTable: progress.currentTable,
      tables: state.tables?.length || 'unknown'
    });

    // Call the internal resume function
    await executeAutoResume(migrationId, progress, state);
  } catch (error) {
    console.error('❌ Auto-resume handler error:', error);
    // Clean up on failure
    await migrationProgress.cleanupStaleMigration(migrationId);
  }
});

// Internal function to execute auto-resume
async function executeAutoResume(migrationId: string, progress: any, state: any) {
  console.log(`🚀 Executing auto-resume for migration ${migrationId}`);

  // Mark as running
  migrationProgress.markAsRunning(migrationId);

  try {
    const pools = await initializePools();

    // Get tables from state or re-discover
    let tables = state.tables || [];
    if (tables.length === 0) {
      const tablesResult = await pools.sourcePool.query(`
        SELECT tablename FROM pg_tables
        WHERE schemaname = 'public' AND tablename LIKE 'csv_%'
        ORDER BY tablename
      `);
      tables = tablesResult.rows.map((r: any) => r.tablename);
    }

    console.log(`📋 Tables to process: ${tables.join(', ')}`);

    // Get embedding settings with retry for startup timing
    let embeddingSettings: { provider: string; model: string; apiKey: string | null };
    let openaiClient: OpenAI | null = null;
    let retryCount = 0;
    const maxRetries = 5;

    while (retryCount < maxRetries) {
      try {
        embeddingSettings = await getEmbeddingSettings();
        openaiClient = await getOpenAIClient();
        if (openaiClient) break;
      } catch (err) {
        console.log(`⏳ Waiting for OpenAI client (attempt ${retryCount + 1}/${maxRetries})...`);
      }
      retryCount++;
      await new Promise(resolve => setTimeout(resolve, 3000)); // Wait 3 seconds between retries
    }

    if (!openaiClient) {
      throw new Error('OpenAI client not available after retries');
    }

    // Get already embedded IDs
    const embeddedResult = await pools.targetPool.query(`
      SELECT DISTINCT source_id, source_table FROM unified_embeddings
    `);
    const embeddedMap = new Map<string, Set<number>>();
    for (const row of embeddedResult.rows) {
      if (!embeddedMap.has(row.source_table)) {
        embeddedMap.set(row.source_table, new Set());
      }
      embeddedMap.get(row.source_table)!.add(parseInt(row.source_id, 10));
    }

    console.log(`📊 Already embedded records across ${embeddedMap.size} tables`);

    // Continue processing from where we left off
    let totalProcessed = progress.current || 0;
    const BATCH_SIZE = 10;
    const BATCH_FETCH_SIZE = 50;

    let tokenUsage = progress.tokenUsage || {
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
      estimated_cost: 0
    };

    for (const table of tables) {
      // Check if stopped
      if (migrationProgress.isStopped(migrationId)) {
        console.log(`⏹️ Migration ${migrationId} stopped during auto-resume`);
        break;
      }

      // Check if paused
      while (migrationProgress.isPaused(migrationId)) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      const tableEmbeddedIds = embeddedMap.get(table) || new Set();
      let offset = 0;
      let hasMore = true;

      while (hasMore) {
        // Fetch batch
        const batchResult = await pools.sourcePool.query(
          `SELECT id, * FROM public."${table}" ORDER BY id::int LIMIT $1 OFFSET $2`,
          [BATCH_FETCH_SIZE, offset]
        );

        if (batchResult.rows.length === 0) {
          hasMore = false;
          break;
        }

        // Filter out already embedded
        const pendingBatch = batchResult.rows.filter(
          (row: any) => !tableEmbeddedIds.has(parseInt(row.row_id, 10))
        );

        // Process in smaller batches
        for (let i = 0; i < pendingBatch.length; i += BATCH_SIZE) {
          const batch = pendingBatch.slice(i, i + BATCH_SIZE);

          if (batch.length === 0) continue;

          // Check pause/stop
          if (migrationProgress.isStopped(migrationId)) break;
          while (migrationProgress.isPaused(migrationId)) {
            await new Promise(resolve => setTimeout(resolve, 1000));
          }

          // Generate embeddings
          const texts = batch.map((record: any) => {
            const content = Object.entries(record)
              .filter(([key]) => !['id', 'created_at', 'updated_at', 'embedding'].includes(key))
              .map(([key, value]) => `${key}: ${value || ''}`)
              .join('\n');
            return content.substring(0, 8000);
          });

          try {
            const embeddingResponse = await openaiClient.embeddings.create({
              model: embeddingSettings.model || 'text-embedding-3-small',
              input: texts,
              dimensions: 1536
            });

            // Update token usage
            if (embeddingResponse.usage) {
              tokenUsage.prompt_tokens += embeddingResponse.usage.prompt_tokens;
              tokenUsage.total_tokens += embeddingResponse.usage.total_tokens;
              tokenUsage.estimated_cost = tokenUsage.total_tokens * 0.0001 / 1000;
            }

            // Save embeddings
            for (let j = 0; j < batch.length; j++) {
              const record = batch[j];
              const embedding = embeddingResponse.data[j].embedding;
              const content = texts[j];
              const tokenEstimate = Math.ceil(content.length / 3); // ~3 chars/token for Turkish

              await pools.targetPool.query(`
                INSERT INTO unified_embeddings
                (source_table, source_type, source_id, source_name, content, embedding, metadata, tokens_used, model_used, embedding_provider)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                ON CONFLICT (source_table, source_id) DO UPDATE SET
                  tokens_used = EXCLUDED.tokens_used,
                  model_used = EXCLUDED.model_used,
                  updated_at = NOW()
              `, [
                table,
                'csv',
                record.id,
                record.title || record.baslik || `Record ${record.id}`,
                content,
                JSON.stringify(embedding),
                JSON.stringify({
                  originalId: record.id,
                  table,
                  embeddingModel: embeddingSettings.model || 'text-embedding-3-small'
                }),
                tokenEstimate,
                embeddingSettings.model || 'text-embedding-3-small',
                'openai'
              ]);

              totalProcessed++;
            }

            // Update progress
            const percentage = Math.round((totalProcessed / progress.total) * 100);
            migrationProgress.updateProgress(migrationId, {
              current: totalProcessed,
              total: progress.total,
              percentage,
              status: 'processing',
              currentRecord: batch[0]?.id || '',
              currentTable: table,
              tokenUsage,
              timestamp: new Date().toISOString()
            });

            console.log(`📊 Auto-resume progress: ${totalProcessed}/${progress.total} (${percentage}%)`);

            // Small delay between batches
            await new Promise(resolve => setTimeout(resolve, 100));

          } catch (embeddingError: any) {
            console.error(`❌ Embedding error in auto-resume:`, embeddingError.message);
            // Continue with next batch on error
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
        }

        offset += BATCH_FETCH_SIZE;
        hasMore = batchResult.rows.length === BATCH_FETCH_SIZE;

        // Memory cleanup
        if (offset % 500 === 0 && global.gc) {
          global.gc();
        }
      }
    }

    // Migration complete
    console.log(`✅ Auto-resume migration ${migrationId} completed!`);
    console.log(`📊 Total processed: ${totalProcessed}/${progress.total}`);
    console.log(`💰 Token usage: ${tokenUsage.total_tokens} tokens (~$${tokenUsage.estimated_cost.toFixed(4)})`);

    migrationProgress.updateProgress(migrationId, {
      current: totalProcessed,
      total: progress.total,
      percentage: 100,
      status: 'completed',
      currentTable: 'Done',
      tokenUsage,
      timestamp: new Date().toISOString()
    });

    migrationProgress.markAsStopped(migrationId);

    // Clean up Redis
    const redis = redisClient();
    if (redis && redis.status === 'ready') {
      await redis.del(REDIS_KEYS.ACTIVE_MIGRATION);
    }

  } catch (error: any) {
    console.error(`❌ Auto-resume execution error:`, error);
    migrationProgress.markAsStopped(migrationId);

    migrationProgress.updateProgress(migrationId, {
      ...progress,
      status: 'error',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
}

// Token tracking
interface TokenUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  estimated_cost: number;
}

let globalTokenUsage: TokenUsage = {
  prompt_tokens: 0,
  completion_tokens: 0,
  total_tokens: 0,
  estimated_cost: 0
};

// Get migration statistics
router.get('/stats', async (req: Request, res: Response) => {
  try {
    // Force refresh pools if requested (useful after settings change)
    const forceRefresh = req.query.refresh === 'true';
    const pools = await initializePools(forceRefresh);

    // Get embedding provider and model from settings (use correct keys from llmSettings)
    const embeddingSettings = await getEmbeddingSettings();

    // Use provider and model from settings
    let embeddingProvider = embeddingSettings.provider || 'openai';
    let embeddingModel = embeddingSettings.model || 'text-embedding-ada-002';

    // Get all tables from source database dynamically
    const tablesResult = await pools.sourcePool.query(`
      SELECT tablename
      FROM pg_tables
      WHERE schemaname = 'public'
      AND tablename NOT IN ('spatial_ref_sys')
      ORDER BY tablename
    `);
    const tables = tablesResult.rows.map(r => r.tablename);

    // Get total token usage from unified_embeddings
    let totalTokensUsed = 0;
    let estimatedCost = 0;

    try {
      const tokenResult = await pools.targetPool.query(`
        SELECT SUM(tokens_used) as total_tokens
        FROM unified_embeddings
        WHERE tokens_used IS NOT NULL
      `);

      totalTokensUsed = parseInt(tokenResult.rows[0]?.total_tokens || 0);

      // Calculate estimated cost based on provider
      // OpenAI text-embedding-ada-002: $0.0001 per 1K tokens
      // Google text-embedding-004: Free (for now)
      if (embeddingProvider === 'openai') {
        estimatedCost = (totalTokensUsed / 1000) * 0.0001;
      }
    } catch (tokenError) {
      console.log('Could not fetch token usage:', tokenError.message);
    }

    // Map embedding model to dimension
    const getEmbeddingDimension = (model: string): number => {
      const dimensionMap: Record<string, number> = {
        'text-embedding-3-small': 1536,
        'text-embedding-3-large': 3072,
        'text-embedding-ada-002': 1536,
        'text-embedding-004': 768, // Google
      };
      return dimensionMap[model] || 1536; // Default to 1536
    };

    const embeddingDimension = getEmbeddingDimension(embeddingModel);

    const stats = {
      totalRecords: 0,
      embeddedRecords: 0,
      skippedRecords: 0,
      pendingRecords: 0,
      tables: [] as any[],
      tokenUsage: {
        total_tokens: totalTokensUsed,
        estimated_cost: estimatedCost
      },
      embeddingProvider,
      embeddingModel,
      embeddingDimension
    };

    for (const table of tables) {
      try {
        // Use quotes around table name for case-sensitive tables (like EMLAKMEVZUAT)
        const countResult = await pools.sourcePool.query(
          `SELECT COUNT(*) FROM public."${table}"`
        );
        const count = parseInt(countResult.rows[0].count);

        // Check embedded count from unified_embeddings table
        let embedded = 0;
        try {
          const embeddedResult = await pools.targetPool.query(
            `SELECT COUNT(DISTINCT source_id) as count
             FROM unified_embeddings
             WHERE LOWER(source_table) = LOWER($1)`,
            [table]
          );
          embedded = parseInt(embeddedResult.rows[0]?.count || 0);
        } catch (embeddedError: any) {
          // Table doesn't exist yet - that's fine, embedded count is 0
          if (embeddedError.code !== '42P01') {
            throw embeddedError;
          }
        }

        // Check skipped count from skipped_embeddings table
        let skipped = 0;
        try {
          const skippedResult = await pools.targetPool.query(
            `SELECT COUNT(DISTINCT source_id) as count
             FROM skipped_embeddings
             WHERE LOWER(source_table) = LOWER($1)`,
            [table]
          );
          skipped = parseInt(skippedResult.rows[0]?.count || 0);
        } catch (skippedError: any) {
          // Table doesn't exist yet - that's fine, skipped count is 0
          if (skippedError.code !== '42P01') {
            throw skippedError;
          }
        }

        stats.tables.push({
          name: table,
          count: count,
          embedded: embedded,
          skipped: skipped
        });

        stats.totalRecords += count;
        stats.embeddedRecords += embedded;
        stats.skippedRecords += skipped;
      } catch (error) {
        console.error(`Error checking table ${table}:`, error);
      }
    }
    
    stats.pendingRecords = stats.totalRecords - stats.embeddedRecords - stats.skippedRecords;
    
    res.json(stats);
  } catch (error) {
    console.error('Stats error:', error);
    res.status(500).json({ error: 'Failed to get stats' });
  }
});

// Start migration
router.post('/start', async (req: Request, res: Response) => {
  const { sourceTable, batchSize = 100, chunkSize = 1000, overlapSize = 200 } = req.body;
  const migrationId = Date.now().toString();
  
  res.json({ migrationId, status: 'started' });
  
  // Run migration in background
  performMigration(migrationId, {
    sourceTable,
    batchSize,
    chunkSize,
    overlapSize
  });
});

// Get migration progress
router.get('/progress', async (req: Request, res: Response) => {
  const { id } = req.query;

  if (id) {
    const progress = migrationProgress.getProgress(id as string);
    res.json(progress || { status: 'not_found' });
  } else {
    // Return latest migration progress
    const latestId = Array.from(migrationProgress['progress'].keys()).pop();
    if (latestId) {
      res.json(migrationProgress.getProgress(latestId));
    } else {
      res.json({ status: 'idle' });
    }
  }
});

// Check if migration is active (actually running, not just restored state)
router.get('/active', async (req: Request, res: Response) => {
  const activeMigrationId = await migrationProgress.getActiveMigrationId();

  if (!activeMigrationId) {
    return res.json({
      isActive: false,
      status: 'idle'
    });
  }

  // Check if this migration is ACTUALLY running
  const isActuallyRunning = migrationProgress.isActuallyRunning(activeMigrationId);
  const progress = migrationProgress.getProgress(activeMigrationId);

  if (isActuallyRunning) {
    res.json({
      isActive: true,
      status: progress?.status || 'processing',
      migrationId: activeMigrationId,
      progress: progress
    });
  } else {
    // Migration state exists but not actually running - needs recovery
    res.json({
      isActive: false,
      status: 'interrupted',
      migrationId: activeMigrationId,
      progress: progress,
      needsRecovery: true
    });
  }
});

// SSE Progress Stream - for real-time updates after page refresh
router.get('/progress-stream', (req: Request, res: Response) => {
  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering
  res.flushHeaders();

  // Send current progress state immediately
  const allProgress = migrationProgress.getAllProgress();
  const activeProgress = allProgress.find(p => p.status === 'processing' || p.status === 'paused');

  if (activeProgress) {
    res.write(`data: ${JSON.stringify(activeProgress)}\n\n`);
  } else {
    res.write(`data: ${JSON.stringify({ status: 'idle' })}\n\n`);
  }

  // Listen for progress updates
  const onProgress = (data: any) => {
    try {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    } catch (e) {
      // Client disconnected
    }
  };

  migrationProgress.on('progress', onProgress);

  // Send heartbeat every 30 seconds to keep connection alive
  const heartbeat = setInterval(() => {
    try {
      res.write(`: heartbeat\n\n`);
    } catch (e) {
      clearInterval(heartbeat);
    }
  }, 30000);

  // Cleanup on client disconnect
  req.on('close', () => {
    migrationProgress.off('progress', onProgress);
    clearInterval(heartbeat);
  });
});

// Pause migration (without ID - uses latest)
router.post('/pause', async (req: Request, res: Response) => {
  try {
    const allProgress = migrationProgress.getAllProgress();
    const activeProgress = allProgress.find(p => p.status === 'processing');
    if (activeProgress) {
      await migrationProgress.pauseMigration(activeProgress.id);
      res.json({ success: true, message: 'Migration paused', id: activeProgress.id });
    } else {
      res.status(404).json({ error: 'No active migration to pause' });
    }
  } catch (error) {
    console.error('Pause error:', error);
    res.status(500).json({ error: 'Failed to pause migration' });
  }
});

// Resume migration (without ID - uses latest)
router.post('/resume', async (req: Request, res: Response) => {
  try {
    const allProgress = migrationProgress.getAllProgress();
    const pausedProgress = allProgress.find(p => p.status === 'paused');
    if (pausedProgress) {
      await migrationProgress.resumeMigration(pausedProgress.id);
      res.json({ success: true, message: 'Migration resumed', id: pausedProgress.id });
    } else {
      res.status(404).json({ error: 'No paused migration to resume' });
    }
  } catch (error) {
    console.error('Resume error:', error);
    res.status(500).json({ error: 'Failed to resume migration' });
  }
});

// Stop migration (without ID - uses latest)
router.post('/stop', async (req: Request, res: Response) => {
  try {
    const allProgress = migrationProgress.getAllProgress();
    const activeProgress = allProgress.find(p => p.status === 'processing' || p.status === 'paused');
    if (activeProgress) {
      await migrationProgress.stopMigration(activeProgress.id);
      res.json({ success: true, message: 'Migration stopped', id: activeProgress.id });
    } else {
      res.status(404).json({ error: 'No active migration to stop' });
    }
  } catch (error) {
    console.error('Stop error:', error);
    res.status(500).json({ error: 'Failed to stop migration' });
  }
});

// Check for interrupted migration that can be recovered (after backend restart)
router.get('/recoverable', async (req: Request, res: Response) => {
  try {
    const activeMigrationId = await migrationProgress.getActiveMigrationId();

    if (!activeMigrationId) {
      return res.json({ hasRecoverable: false, isActive: false });
    }

    // Check if this migration is ACTUALLY running (not just restored state)
    const isActuallyRunning = migrationProgress.isActuallyRunning(activeMigrationId);

    if (isActuallyRunning) {
      // Migration process is actively running
      const progress = migrationProgress.getProgress(activeMigrationId);
      return res.json({
        hasRecoverable: false,
        isActive: true,
        migrationId: activeMigrationId,
        progress: progress
      });
    }

    // Migration state exists but process is not running - it was interrupted
    // Get stored progress from Redis/memory
    const progress = migrationProgress.getProgress(activeMigrationId);

    res.json({
      hasRecoverable: true,
      isActive: false,
      migrationId: activeMigrationId,
      progress: progress,
      message: 'Backend yeniden başlatıldıktan sonra yarıda kalan migration bulundu. Devam etmek istiyor musunuz?'
    });
  } catch (error) {
    console.error('Recovery check error:', error);
    res.status(500).json({ error: 'Failed to check for recoverable migration' });
  }
});

// Clear interrupted migration state (dismiss recovery)
router.post('/dismiss-recovery', async (req: Request, res: Response) => {
  try {
    const activeMigrationId = await migrationProgress.getActiveMigrationId();

    if (activeMigrationId) {
      await migrationProgress.clearMigration(activeMigrationId);
      console.log(`🗑️ Dismissed recovery for migration: ${activeMigrationId}`);
    }

    res.json({ success: true, message: 'Recovery dismissed' });
  } catch (error) {
    console.error('Dismiss recovery error:', error);
    res.status(500).json({ error: 'Failed to dismiss recovery' });
  }
});

// Pause migration
router.post('/pause/:id', async (req: Request, res: Response) => {
  const { id } = req.params;

  try {
    await migrationProgress.pauseMigration(id);
    res.json({ success: true, message: 'Migration paused' });
  } catch (error) {
    console.error('Pause error:', error);
    res.status(500).json({ error: 'Failed to pause migration' });
  }
});

// Resume migration
router.post('/resume/:id', async (req: Request, res: Response) => {
  const { id } = req.params;

  try {
    await migrationProgress.resumeMigration(id);
    res.json({ success: true, message: 'Migration resumed' });
  } catch (error) {
    console.error('Resume error:', error);
    res.status(500).json({ error: 'Failed to resume migration' });
  }
});

// Stop migration
router.post('/stop/:id', async (req: Request, res: Response) => {
  const { id } = req.params;

  try {
    await migrationProgress.stopMigration(id);
    res.json({ success: true, message: 'Migration stopped' });
  } catch (error) {
    console.error('Stop error:', error);
    res.status(500).json({ error: 'Failed to stop migration' });
  }
});

// Get migration history
router.get('/history', async (req: Request, res: Response) => {
  try {
    const history = migrationProgress.getHistory();
    res.json(history);
  } catch (error) {
    console.error('History error:', error);
    res.status(500).json({ error: 'Failed to get history' });
  }
});

// Get skipped records
router.get('/skipped', async (req: Request, res: Response) => {
  try {
    const { table, page = '1', limit = '100' } = req.query;
    const pools = await initializePools();
    const pageNum = Math.max(1, parseInt(page as string) || 1);
    const limitNum = Math.min(500, Math.max(1, parseInt(limit as string) || 100));
    const offset = (pageNum - 1) * limitNum;

    // Build WHERE clause
    let whereClause = '';
    const params: any[] = [];

    if (table) {
      whereClause = ` WHERE LOWER(source_table) = LOWER($1)`;
      params.push(table);
    }

    // Get total count first
    const countQuery = `SELECT COUNT(*) FROM skipped_embeddings${whereClause}`;
    const countResult = await pools.targetPool.query(countQuery, params);
    const total = parseInt(countResult.rows[0].count);

    // Get paginated records
    let query = `
      SELECT
        id,
        source_table,
        source_type,
        source_id,
        source_name,
        LEFT(content, 200) as content_preview,
        skip_reason,
        metadata,
        created_at,
        updated_at
      FROM skipped_embeddings
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `;

    const result = await pools.targetPool.query(query, [...params, limitNum, offset]);

    res.json({
      success: true,
      total: total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum),
      count: result.rows.length,
      records: result.rows
    });
  } catch (error: any) {
    console.error('Error fetching skipped records:', error);

    // If table doesn't exist yet, return empty array
    if (error.code === '42P01') {
      res.json({
        success: true,
        count: 0,
        records: []
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Failed to fetch skipped records',
        message: error.message
      });
    }
  }
});

// Delete skipped records (supports both individual IDs and delete-all-for-table)
router.delete('/skipped', async (req: Request, res: Response) => {
  try {
    const { table, bulkDelete } = req.query;
    const { ids } = req.body;

    const pools = await initializePools();

    // Delete ALL records for a specific table (bulkDelete=true)
    if (bulkDelete === 'true' && table) {
      console.log(`Bulk deleting ALL skipped records for table: ${table}`);
      const result = await pools.targetPool.query(
        `DELETE FROM skipped_embeddings WHERE LOWER(source_table) = LOWER($1)`,
        [table]
      );
      return res.json({
        success: true,
        deletedCount: result.rowCount,
        message: `Deleted ${result.rowCount} skipped record(s) for ${table}`
      });
    }

    // Delete specific IDs
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No record IDs provided'
      });
    }

    // Delete records by IDs
    const result = await pools.targetPool.query(
      `DELETE FROM skipped_embeddings WHERE id = ANY($1::int[])`,
      [ids]
    );

    res.json({
      success: true,
      deletedCount: result.rowCount,
      message: `Successfully deleted ${result.rowCount} skipped record(s)`
    });
  } catch (error: any) {
    console.error('Error deleting skipped records:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete skipped records',
      message: error.message
    });
  }
});

// Generate embeddings
router.post('/generate', async (req: Request, res: Response) => {
  const { batchSize = 50, sourceTable = null, tables: requestedTables = null, resumeMigrationId = null } = req.body;

  // Check if there's already an active migration (from Redis)
  const existingMigrationId = await migrationProgress.getActiveMigrationId();
  if (existingMigrationId && !resumeMigrationId) {
    // Check if migration is actually running (has recent heartbeat)
    const isStale = await migrationProgress.isStale(existingMigrationId);
    const isActuallyRunning = migrationProgress.isActuallyRunning(existingMigrationId);

    if (isStale || !isActuallyRunning) {
      // Migration is stale (no heartbeat) or not actually running - clean it up
      console.log(`🧹 Found stale migration ${existingMigrationId}, cleaning up...`);
      await migrationProgress.cleanupStaleMigration(existingMigrationId);
    } else {
      // Migration is actually running - reject new migration
      const activeProgress = migrationProgress.getAllProgress().find(p => p.status === 'processing');
      console.log(`⚠️ Migration actually running: ${existingMigrationId}`);
      return res.status(409).json({
        error: 'Migration already in progress',
        message: 'Zaten aktif bir migration işlemi var. Lütfen tamamlanmasını bekleyin veya durdurun.',
        activeMigrationId: existingMigrationId,
        progress: activeProgress
      });
    }
  }

  // Use existing migration ID if resuming, otherwise generate new one
  const activeMigrationId = resumeMigrationId || `migration-${Date.now()}`;
  console.log(`🚀 ${resumeMigrationId ? 'Resuming' : 'Starting new'} migration: ${activeMigrationId}`);

  // Set active migration in Redis and mark as actually running
  await migrationProgress.setActiveMigrationId(activeMigrationId);
  migrationProgress.markAsRunning(activeMigrationId);

  // Track client connection - embedding continues even if client disconnects
  let clientConnected = true;
  req.on('close', () => {
    clientConnected = false;
    console.log('📡 Client disconnected - embedding continues in background');
  });

  // Safe write helper - only writes if client is still connected
  const safeWrite = (data: string) => {
    if (clientConnected) {
      try {
        res.write(data);
        if (typeof (res as any).flush === 'function') {
          (res as any).flush();
        }
      } catch (e) {
        clientConnected = false;
      }
    }
  };

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': req.headers.origin || '*',
    'Access-Control-Allow-Credentials': 'true',
    'X-Accel-Buffering': 'no' // Disable nginx buffering for SSE
  });

  try {
    let pools = await initializePools();

    // Get embedding settings (will be used for metadata tracking)
    const { pool: lsembPool } = await import('../config/database');
    const settingsResult = await lsembPool.query(`
      SELECT key, value FROM settings
      WHERE key IN ('llmSettings.embeddingProvider', 'llmSettings.activeEmbeddingModel')
    `);

    let embeddingProvider = 'openai';
    let embeddingModel = 'text-embedding-ada-002';

    settingsResult.rows.forEach(row => {
      if (row.key === 'llmSettings.embeddingProvider') {
        embeddingProvider = row.value;
      } else if (row.key === 'llmSettings.activeEmbeddingModel') {
        // Extract model from format like "google/text-embedding-004"
        const parts = row.value.split('/');
        embeddingModel = parts.length === 2 ? parts[1] : row.value;
      }
    });

    // Get available tables from source database dynamically
    let tables: string[] = [];

    // Support both 'tables' array (from frontend) and 'sourceTable' string (legacy)
    if (requestedTables && Array.isArray(requestedTables) && requestedTables.length > 0) {
      tables = requestedTables;
      console.log(` Using requested tables: ${tables.join(', ')}`);
    } else if (sourceTable) {
      tables = [sourceTable];
      console.log(` Using source table: ${sourceTable}`);
    } else {
      // Auto-discover tables from source database
      try {
        const tablesResult = await pools.sourcePool.query(`
          SELECT tablename
          FROM pg_tables
          WHERE schemaname = 'public'
          AND tablename NOT IN ('spatial_ref_sys', 'settings', 'users', 'sessions')
          ORDER BY tablename
        `);
        tables = tablesResult.rows.map(r => r.tablename);
        console.log(` Auto-discovered tables: ${tables.join(', ')}`);

        if (tables.length === 0) {
          safeWrite(`data: ${JSON.stringify({
            current: 0,
            total: 0,
            percentage: 100,
            status: 'completed',
            message: 'No source tables found in database',
            tokenUsage: globalTokenUsage
          })}\n\n`);
          if (clientConnected) res.end();
          return;
        }
      } catch (err) {
        console.error('Error discovering tables:', err);
        safeWrite(`data: ${JSON.stringify({ status: 'failed', error: 'Could not discover source tables' })}\n\n`);
        if (clientConnected) res.end();
        return;
      }
    }

    // Check if unified_embeddings table exists
    let unifiedEmbeddingsExists = false;
    try {
      await pools.targetPool.query(`SELECT 1 FROM unified_embeddings LIMIT 1`);
      unifiedEmbeddingsExists = true;
    } catch (err) {
      console.log(`️ unified_embeddings table does not exist, will process all records`);
    }

    // MEMORY OPTIMIZATION: Count pending records first, then process in batches
    // This prevents loading all records into memory at once (was causing OOM for 130k+ records)

    interface TablePendingInfo {
      table: string;
      normalizedName: string;
      pendingCount: number;
      totalCount: number;
      embeddedIds: Set<number>;
    }

    const tablePendingInfo: TablePendingInfo[] = [];
    let totalPending = 0;

    // Phase 1: Count pending records per table (memory efficient - only IDs)
    for (const table of tables) {
      try {
        const normalizedTableName = table.toLowerCase()
          .replace(/ö/g, 'o')
          .replace(/ü/g, 'u')
          .replace(/ş/g, 's')
          .replace(/ğ/g, 'g')
          .replace(/ç/g, 'c')
          .replace(/ı/g, 'i');

        // Get total count from source
        const countResult = await pools.sourcePool.query(
          `SELECT COUNT(*)::int as count FROM public."${table}"`
        );
        const totalCount = countResult.rows[0]?.count || 0;

        let embeddedIds = new Set<number>();
        let pendingCount = totalCount;

        if (unifiedEmbeddingsExists) {
          // Only get IDs of already embedded records (not full rows)
          // Match all possible source_table variations:
          // - Normalized name (e.g., danistaykararlari) - what we insert with
          // - Original table name (e.g., csv_danistaykararlari)
          // - Display name format (e.g., Csv Danistaykararlari, Danistaykararlari)
          // - Without csv_ prefix (e.g., danistaykararlari)
          const displayName = table
            .split('_')
            .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');

          const embeddedIdsResult = await pools.targetPool.query(
            `SELECT DISTINCT source_id FROM unified_embeddings
             WHERE LOWER(source_table) = LOWER($1)
                OR LOWER(source_table) = LOWER($2)
                OR LOWER(source_table) = LOWER($3)
                OR LOWER(source_table) = LOWER($4)
                OR LOWER(metadata->>'table') = LOWER($1)`,
            [normalizedTableName, table, displayName, table.replace(/^csv_/i, '')]
          );
          // IMPORTANT: Convert source_id to number for proper Set comparison
          // PostgreSQL bigint comes as string in some cases, but row.row_id comparison uses parseInt
          embeddedIds = new Set(embeddedIdsResult.rows.map(row => parseInt(row.source_id, 10)));
          pendingCount = totalCount - embeddedIds.size;
        }

        console.log(` Table ${table}: ${totalCount} total, ${embeddedIds.size} embedded, ${pendingCount} pending`);

        if (pendingCount > 0) {
          tablePendingInfo.push({
            table,
            normalizedName: normalizedTableName,
            pendingCount,
            totalCount,
            embeddedIds
          });
          totalPending += pendingCount;
        }
      } catch (err: any) {
        console.log(`Skipping table ${table}: ${err.message}`);
      }
    }

    const total = totalPending;
    let processed = 0;
    let lastEmittedPercentage = -1; // Track last emitted percentage to prevent spam

    if (total === 0) {
      console.log(` No pending records found in tables: ${tables.join(', ')}`);
      console.log(` All selected tables are fully embedded`);
      safeWrite(`data: ${JSON.stringify({
        current: 0,
        total: 0,
        percentage: 100,
        status: 'completed',
        currentTable: tables[0] || null,
        message: ` All records in selected tables (${tables.join(', ')}) are already embedded. No new records to process.`,
        completedTables: tables,
        tokenUsage: globalTokenUsage
      })}\n\n`);
      if (clientConnected) res.end();
      return;
    }

    // Send initial progress update
    safeWrite(`data: ${JSON.stringify({
      current: 0,
      total: total,
      percentage: 0,
      status: 'processing',
      currentTable: tables[0] || null,
      message: `Starting migration for ${tables.length} table(s): ${tables.join(', ')} (${total} pending records)`,
      tokenUsage: globalTokenUsage
    })}\n\n`);

    // Phase 2: Process each table with pagination (memory efficient)
    const BATCH_FETCH_SIZE = batchSize * 2; // Fetch 2x batch at a time for efficiency

    for (const tableInfo of tablePendingInfo) {
      const { table, normalizedName: normalizedTableName, embeddedIds } = tableInfo;
      let tableProcessed = 0;

      // Detect primary key column (row_id or id)
      let pkColumn = 'row_id';
      try {
        // Test if row_id exists by trying to query it
        await pools.sourcePool.query(`SELECT row_id FROM public."${table}" LIMIT 1`);
      } catch (err: any) {
        if (err.message.includes('column "row_id" does not exist')) {
          pkColumn = 'id';
          console.log(`ℹ️  Table ${table} uses 'id' column instead of 'row_id'`);
        }
      }

      // Calculate starting point: skip already embedded records
      let startFromId = 0;
      if (embeddedIds.size > 0) {
        startFromId = Math.max(...Array.from(embeddedIds));
        console.log(`📊 Processing table: ${table} (${tableInfo.pendingCount} pending, starting from ${pkColumn} > ${startFromId})`);
      } else {
        console.log(`📊 Processing table: ${table} (${tableInfo.pendingCount} pending, starting from beginning)`);
      }

      while (true) {
        // Fetch a batch of records from source (with pagination)
        // Use WHERE {pkColumn} > startFromId to skip already embedded records
        // ORDER BY {pkColumn} for consistent numeric sorting
        let batchResult;
        let retryCount = 0;
        const maxRetries = 3;

        while (retryCount < maxRetries) {
          try {
            batchResult = await pools.sourcePool.query(
              `SELECT * FROM public."${table}" WHERE ${pkColumn} > $1 ORDER BY ${pkColumn} LIMIT $2`,
              [startFromId, BATCH_FETCH_SIZE]
            );
            break; // Success, exit retry loop
          } catch (dbError: any) {
            retryCount++;
            console.error(`❌ DB query failed (attempt ${retryCount}/${maxRetries}):`, dbError.message);

            if (retryCount >= maxRetries) {
              throw dbError; // Give up after max retries
            }

            // Wait before retry (exponential backoff)
            const waitTime = Math.min(5000 * retryCount, 15000);
            console.log(`⏳ Waiting ${waitTime}ms before retry...`);
            await new Promise(resolve => setTimeout(resolve, waitTime));

            // Refresh pools on connection errors
            if (dbError.message.includes('timeout') || dbError.message.includes('terminated') || dbError.message.includes('ECONNRESET')) {
              console.log('🔄 Refreshing database pools...');
              pools = await initializePools(true);
            }
          }
        }

        if (!batchResult || batchResult.rows.length === 0) break; // No more records

        // Normalize PK column to row_id for consistent code usage
        if (pkColumn === 'id') {
          batchResult.rows.forEach((row: any) => {
            row.row_id = row.id;
          });
        }

        // Update startFromId to last row in this batch (for next iteration if needed)
        const lastRowId = Math.max(...batchResult.rows.map((r: any) => parseInt(r.row_id, 10)));

        // Filter out already embedded records
        // Note: PK value might be string or number depending on source table, so we compare as numbers
        const pendingBatch = unifiedEmbeddingsExists
          ? batchResult.rows.filter(row => !embeddedIds.has(parseInt(row.row_id, 10)))
          : batchResult.rows;

        // If all records in this batch are already embedded
        if (pendingBatch.length === 0) {
          // If this was a partial batch (less than BATCH_FETCH_SIZE), we've reached the end
          if (batchResult.rows.length < BATCH_FETCH_SIZE) {
            console.log(`✅ Reached end of table ${table} (last batch: ${batchResult.rows.length} rows, all embedded)`);
            break;
          }
          // Otherwise, continue to next batch range (may have gaps in sequence)
          console.log(`⏭️ Batch fully embedded for ${table} (${batchResult.rows.length} rows), advancing to next batch from ${pkColumn} > ${lastRowId}...`);
          startFromId = lastRowId;
          continue; // Skip to next batch
        }

        // Process each record in this batch
        for (const row of pendingBatch) {
          try {
            // Use table name from outer loop (already normalized)
            const tableLower = normalizedTableName;

            // Dynamic content extraction - auto-detect content columns
            let content = '';
            let title = '';
            let sourceType = 'document';

        // Helper: Case-insensitive column value lookup (handles Soru, SORU, soru, etc.)
        const getColumnValue = (row: any, keys: string[]): string | null => {
          // Get all row keys for case-insensitive matching
          const rowKeys = Object.keys(row);
          for (const searchKey of keys) {
            // Direct match first
            if (row[searchKey] && String(row[searchKey]).trim().length > 0) {
              return String(row[searchKey]);
            }
            // Case-insensitive match
            const matchedKey = rowKeys.find(k => k.toLowerCase() === searchKey.toLowerCase());
            if (matchedKey && row[matchedKey] && String(row[matchedKey]).trim().length > 0) {
              return String(row[matchedKey]);
            }
          }
          return null;
        };

        // Auto-detect content columns based on common patterns
        // Priority order for content: script_text, metin, icerik, content, text, cevap, description, body
        const contentKeys = ['script_text', 'metin', 'icerik', 'content', 'text', 'cevap', 'description', 'body', 'aciklama'];
        const titleKeys = ['baslik', 'title', 'ad', 'name', 'soru', 'karar_no', 'ozelge_no', 'subject', 'konu'];
        const questionKeys = ['soru', 'question', 'q'];
        const answerKeys = ['cevap', 'answer', 'a'];

        // Check if this is a Q&A table (has both question and answer columns)
        const questionValue = getColumnValue(row, questionKeys);
        const answerValue = getColumnValue(row, answerKeys);
        const hasQuestion = !!questionValue;
        const hasAnswer = !!answerValue;

        if (hasQuestion && hasAnswer) {
          // Q&A format - use pre-extracted values
          content = `Soru: ${questionValue}\n\nCevap: ${answerValue}`;
          title = questionValue!.substring(0, 255);
          sourceType = 'qa';
        } else {
          // Regular document format
          // Find first non-empty content field (case-insensitive)
          content = getColumnValue(row, contentKeys) || '';

          // FALLBACK: If no standard content field found, combine ALL row fields as content
          // This handles CSV tables where column names don't match standard patterns
          if (!content || content.trim().length === 0) {
            const rowKeys = Object.keys(row).filter(k =>
              k !== 'id' &&
              k !== '_sourceTable' &&
              k !== 'created_at' &&
              k !== 'updated_at' &&
              row[k] !== null &&
              row[k] !== undefined &&
              String(row[k]).trim().length > 0
            );

            if (rowKeys.length > 0) {
              // Combine all fields as "key: value" pairs
              content = rowKeys.map(key => `${key}: ${row[key]}`).join('\n');
              console.log(`[Migration] Using combined fields as content for ${table}[${row.row_id}] (${rowKeys.length} fields)`);
            }
          }

          // Find first non-empty title field (case-insensitive)
          const titleValue = getColumnValue(row, titleKeys);
          if (titleValue) {
            title = titleValue.substring(0, 255);
          }

          // Fallback title - use first text field or table name
          if (!title) {
            // Try to find any short text field for title
            const rowKeys = Object.keys(row).filter(k =>
              k !== 'id' && k !== '_sourceTable' &&
              row[k] && typeof row[k] === 'string' &&
              row[k].length > 0 && row[k].length <= 255
            );
            if (rowKeys.length > 0) {
              title = String(row[rowKeys[0]]).substring(0, 255);
            } else {
              title = `${table} #${row.row_id}`;
            }
          }

          // Infer source type from table name
          if (tableLower.includes('karar') || tableLower.includes('court') || tableLower.includes('decision')) {
            sourceType = 'court_decision';
          } else if (tableLower.includes('makale') || tableLower.includes('article')) {
            sourceType = 'article';
          } else if (tableLower.includes('ozelge') || tableLower.includes('letter')) {
            sourceType = 'official_letter';
          } else if (tableLower.includes('soru') || tableLower.includes('qa')) {
            sourceType = 'qa';
          } else {
            sourceType = 'document';
          }
        }

        if (!content || content.trim().length === 0) {
          console.warn(`️ No content found for ${table}[${row.row_id}] - moving to skipped_embeddings`);

          // Insert into skipped_embeddings table
          try {
            const skipResult = await pools.targetPool.query(
              `INSERT INTO skipped_embeddings (source_table, source_type, source_id, source_name, content, skip_reason, metadata)
               VALUES ($1, $2, $3, $4, $5, $6, $7)
               ON CONFLICT (source_table, source_id) DO NOTHING
               RETURNING id`,
              [table, sourceType, row.row_id, title, '[No content available]', 'no_content', JSON.stringify({
                note: 'Skipped - no content in source table',
                skipped_at: new Date().toISOString()
              })]
            );

            // Only increment processed if record was actually inserted
            if (skipResult.rows.length > 0) {
              console.log(`✓ Record moved to skipped_embeddings: ${table}[${row.row_id}]`);
              // Add to embeddedIds Set (skipped records should not be re-processed)
              embeddedIds.add(parseInt(row.row_id, 10));
              processed++;
            } else {
              console.log(`⚠️ Record ${row.row_id} already in skipped_embeddings, skipping count increment`);
            }
          } catch (err) {
            console.error(`✗ Failed to insert into skipped_embeddings for ${table}[${row.row_id}]:`, err);
          }

          continue;
        }

        // Generate embedding
        console.log(` Generating embedding for ${table}[${row.row_id}]...`);
        const embedding = await generateEmbedding(content);

        if (embedding.length === 0) {
          console.warn(`️ Empty embedding returned for ${table}[${row.row_id}] - moving to skipped_embeddings`);

          // Insert into skipped_embeddings table
          try {
            await pools.targetPool.query(
              `INSERT INTO skipped_embeddings (source_table, source_type, source_id, source_name, content, skip_reason, metadata)
               VALUES ($1, $2, $3, $4, $5, $6, $7)
               ON CONFLICT (source_table, source_id) DO UPDATE SET
                 skip_reason = EXCLUDED.skip_reason,
                 content = EXCLUDED.content,
                 metadata = EXCLUDED.metadata,
                 updated_at = CURRENT_TIMESTAMP`,
              [table, sourceType, row.row_id, title, content.substring(0, 500), 'empty_embedding', JSON.stringify({
                note: 'Skipped - embedding API returned empty result',
                content_length: content.length,
                skipped_at: new Date().toISOString()
              })]
            );
            console.log(` Record moved to skipped_embeddings: ${table}[${row.row_id}]`);
          } catch (err) {
            console.error(` Failed to insert into skipped_embeddings for ${table}[${row.row_id}]:`, err);
          }

          // Add to embeddedIds Set (skipped records should not be re-processed)
          embeddedIds.add(parseInt(row.row_id, 10));

          processed++;
          continue;
        }
        console.log(` Embedding generated for ${table}[${row.row_id}]: ${embedding.length} dimensions`);

        // Prepare metadata - dynamically include all relevant fields
        const metadata: any = {
          embeddingProvider,
          embeddingModel,
          tokens_used: Math.ceil(content.length / 4)
        };

        // Auto-extract metadata from all row fields (excluding system fields and already extracted content)
        const systemFields = ['id', '_sourceTable', 'created_at', 'updated_at', 'embedding'];
        const extractedFields = new Set([
          ...contentKeys.filter(k => row[k]),
          ...titleKeys.filter(k => row[k]),
          ...questionKeys.filter(k => row[k]),
          ...answerKeys.filter(k => row[k])
        ]);

        // Add all other fields as metadata
        Object.keys(row).forEach(key => {
          const keyLower = key.toLowerCase();
          // Skip system fields, extracted content fields, and null/undefined values
          if (!systemFields.includes(keyLower) && !extractedFields.has(key) && row[key] !== null && row[key] !== undefined) {
            // Skip very large fields (likely already used as content)
            const value = row[key];
            if (typeof value === 'string' && value.length > 1000) {
              return; // Skip large text fields
            }
            metadata[key] = value;
          }
        });

        // Insert into unified_embeddings with token tracking
        // Calculate token estimate: ~3 chars per token for Turkish text
        const estimatedTokens = Math.ceil(content.length / 3);

        const insertResult = await pools.targetPool.query(`
          INSERT INTO unified_embeddings
          (source_table, source_type, source_id, source_name, content, embedding, metadata, tokens_used, model_used, embedding_provider)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          ON CONFLICT (source_table, source_id) DO NOTHING
          RETURNING id
        `, [
          tableLower, // Use normalized lowercase table name
          sourceType,
          row.row_id,
          title,
          content,
          `[${embedding.join(',')}]`,
          JSON.stringify(metadata),
          estimatedTokens,
          metadata.embeddingModel || 'text-embedding-ada-002',
          metadata.embeddingProvider || 'openai'
        ]);

        // Only increment processed if record was actually inserted (not skipped due to conflict)
        if (insertResult.rows.length > 0) {
          // Add to embeddedIds Set to prevent re-processing in subsequent batches
          embeddedIds.add(parseInt(row.row_id, 10));
          processed++;
        } else {
          console.log(`⚠️ Record ${row.row_id} already exists (conflict detected), skipping count increment`);
        }

        // Calculate progress
        const currentPercentage = Math.round((processed / total) * 100);
        const progress = {
          current: processed,
          total: total,
          percentage: currentPercentage,
          status: 'processing',
          currentRecord: title,
          currentTable: table,
          tokenUsage: globalTokenUsage
        };

        // Persist to Redis every 10 records to allow recovery after restart
        if (processed % 10 === 0 || processed === total) {
          await migrationProgress.updateProgress(activeMigrationId, progress);
        }

        // Emit SSE ONLY when percentage changes (prevents frontend RAM spam)
        // Always emit on first record and last record
        if (currentPercentage !== lastEmittedPercentage || processed === 1 || processed === total) {
          lastEmittedPercentage = currentPercentage;
          migrationProgress.emit('progress', { id: activeMigrationId, ...progress });
          safeWrite(`data: ${JSON.stringify(progress)}\n\n`);
        }
          } catch (error) {
            console.error(`✗ Embedding error for ${table}[${row.row_id}]:`, error);
            // Don't increment processed on error - we'll retry this record on next run
          }
        } // end for (row of pendingBatch)

        // Check if we've reached the total (prevents over-processing)
        if (processed >= total) {
          console.log(`✅ Reached total records (${processed}/${total}) for ${table}, stopping`);
          break;
        }

        // Move to next batch by updating startFromId
        // This allows us to skip already processed records efficiently
        startFromId = lastRowId;

        // Memory cleanup hint
        if (global.gc) {
          global.gc();
        }
      } // end while (true) - pagination loop

      console.log(`✅ Completed table ${table}: ${tableProcessed} records processed`);
    } // end for (tableInfo of tablePendingInfo)

    // Migration completed
    const completedProgress = {
      current: processed,
      total: total,
      percentage: 100,
      status: 'completed',
      currentTable: tables[tables.length - 1] || null,
      message: ` Migration completed! Processed ${processed} record(s) from ${tables.length} table(s).`,
      completedTables: tables,
      tokenUsage: globalTokenUsage
    };

    console.log(`✅ Migration completed: ${processed}/${total} records from ${tables.length} table(s)`);
    migrationProgress.emit('progress', completedProgress);
    safeWrite(`data: ${JSON.stringify(completedProgress)}\n\n`);

    // Clear active migration ID from Redis and mark as no longer running
    migrationProgress.markAsStopped(activeMigrationId);
    await migrationProgress.setActiveMigrationId(null);
    await migrationProgress.completeMigration(activeMigrationId);

    if (clientConnected) res.end();
  } catch (error) {
    console.error('Generate embeddings error:', error);
    safeWrite(`data: ${JSON.stringify({ status: 'failed', error: (error as Error).message })}\n\n`);

    // Clear active migration ID from Redis on error and mark as stopped
    migrationProgress.markAsStopped(activeMigrationId);
    await migrationProgress.setActiveMigrationId(null);

    if (clientConnected) res.end();
  }
});

// Clear table data
router.delete('/clear/:table', async (req: Request, res: Response) => {
  const { table } = req.params;

  try {
    const pools = await initializePools();
    await pools.targetPool.query(
      'DELETE FROM unified_embeddings WHERE source_table = $1',
      [table]
    );
    res.json({ success: true, message: `Cleared ${table} data` });
  } catch (error) {
    console.error('Clear error:', error);
    res.status(500).json({ error: 'Failed to clear data' });
  }
});

// Helper: Get embedding settings
async function getEmbeddingSettings(): Promise<{ provider: string; model: string; apiKey: string | null }> {
  try {
    if (!lsembPool) {
      console.error(' lsembPool is not available');
      return { provider: 'google', model: 'text-embedding-004', apiKey: null };
    }

    // Get embedding provider and model
    const settingsResult = await lsembPool.query(
      `SELECT key, value FROM settings WHERE key IN ($1, $2)`,
      ['llmSettings.embeddingProvider', 'llmSettings.activeEmbeddingModel']
    );

    let provider = 'openai';
    let model = 'text-embedding-ada-002';

    settingsResult.rows.forEach(row => {
      if (row.key === 'llmSettings.embeddingProvider') {
        provider = row.value;
      } else if (row.key === 'llmSettings.activeEmbeddingModel') {
        // Extract model from format like "google/text-embedding-004" or "openai/text-embedding-3-small"
        const parts = row.value.split('/');
        if (parts.length === 2) {
          model = parts[1];
        } else {
          model = row.value;
        }
      }
    });

    // Check if provider supports embeddings
    if (provider === 'claude' || provider === 'anthropic') {
      console.warn(`️ ${provider} does not support embeddings API. Please use OpenAI or Google for embeddings.`);
      console.warn(` Falling back to Google embeddings...`);
      provider = 'google';
      model = 'text-embedding-004';
    }

    // Get API key based on provider
    let apiKey: string | null = null;
    if (provider === 'google') {
      const googleKeyResult = await lsembPool.query(
        'SELECT value FROM settings WHERE key = $1',
        ['google.apiKey']
      );
      apiKey = googleKeyResult.rows.length > 0 ? googleKeyResult.rows[0].value : null;
    } else if (provider === 'openai') {
      const openaiKeyResult = await lsembPool.query(
        'SELECT value FROM settings WHERE key = $1',
        ['openai.apiKey']
      );
      if (openaiKeyResult.rows.length > 0) {
        const keyValue = openaiKeyResult.rows[0].value;
        try {
          const parsed = JSON.parse(keyValue);
          apiKey = typeof parsed === 'object' && parsed.apiKey ? parsed.apiKey : keyValue;
        } catch {
          apiKey = keyValue;
        }
      }
    }

    return { provider, model, apiKey };
  } catch (error) {
    console.error('Error fetching embedding settings:', error);
    return { provider: 'openai', model: 'text-embedding-ada-002', apiKey: null };
  }
}

// Helper: Generate embedding (supports multiple providers)
async function generateEmbedding(text: string): Promise<number[]> {
  try {
    const { provider, model, apiKey } = await getEmbeddingSettings();

    if (!apiKey) {
      console.warn(`${provider} API key not available. Skipping embedding generation.`);
      return [];
    }

    const truncatedText = text.substring(0, 8000); // Truncate to limit

    if (provider === 'google') {
      // Google Text Embedding API
      console.log(`Using Google embedding: ${model}`);
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:embedContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: `models/${model}`,
            content: { parts: [{ text: truncatedText }] }
          })
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Google API error: ${errorText}`);
      }

      const data = await response.json();
      const embedding = data.embedding.values;

      // Track token usage (estimate for Google)
      const estimatedTokens = Math.ceil(text.length / 3.5); // Google uses ~3.5 chars/token
      globalTokenUsage.prompt_tokens += estimatedTokens;
      globalTokenUsage.total_tokens += estimatedTokens;
      globalTokenUsage.estimated_cost += (estimatedTokens / 1000) * 0.00001; // Google pricing

      return embedding;
    } else if (provider === 'openai') {
      // OpenAI Embedding API
      console.log(`Using OpenAI embedding: ${model}`);
      const openaiClient = new OpenAI({ apiKey });

      const response = await openaiClient.embeddings.create({
        model: model,
        input: truncatedText
      });

      // Track token usage (estimate for OpenAI)
      const estimatedTokens = Math.ceil(text.length / 4);
      globalTokenUsage.prompt_tokens += estimatedTokens;
      globalTokenUsage.total_tokens += estimatedTokens;
      globalTokenUsage.estimated_cost += (estimatedTokens / 1000) * 0.0001; // OpenAI pricing

      return response.data[0].embedding;
    } else {
      console.warn(`Unsupported embedding provider: ${provider}`);
      return [];
    }
  } catch (error) {
    console.error('Embedding generation error:', error);
    // Return empty array instead of throwing error to prevent crashes
    return [];
  }
}

// Helper: Chunk text
function chunkText(text: string, chunkSize: number, overlap: number): string[] {
  if (!text || text.length <= chunkSize) {
    return [text || ''];
  }
  
  const chunks: string[] = [];
  let start = 0;
  
  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    chunks.push(text.substring(start, end));
    start += chunkSize - overlap;
  }
  
  return chunks;
}

// Background migration process
async function performMigration(migrationId: string, config: any) {
  const { sourceTable, batchSize, chunkSize, overlapSize } = config;

  try {
    const pools = await initializePools();

    // Setup target schema - ensure unified_embeddings table exists
    await pools.targetPool.query('CREATE EXTENSION IF NOT EXISTS vector');
    await pools.targetPool.query(`
      CREATE TABLE IF NOT EXISTS unified_embeddings (
        id SERIAL PRIMARY KEY,
        source_table VARCHAR(100) NOT NULL,
        source_type VARCHAR(50) NOT NULL,
        source_id INTEGER NOT NULL,
        source_name VARCHAR(255) NOT NULL,
        content TEXT NOT NULL,
        embedding VECTOR(1536) NOT NULL,
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT unique_source_record UNIQUE (source_table, source_id)
      )
    `);

    // Create indexes
    await pools.targetPool.query(`
      CREATE INDEX IF NOT EXISTS idx_unified_embeddings_embedding_vector
      ON unified_embeddings USING hnsw (embedding vector_cosine_ops)
    `);

    // Get available tables from source database dynamically
    let tables: string[] = [];
    if (sourceTable && sourceTable !== 'all') {
      tables = [sourceTable];
    } else {
      // Auto-discover tables from source database
      try {
        const tablesResult = await pools.sourcePool.query(`
          SELECT tablename
          FROM pg_tables
          WHERE schemaname = 'public'
          AND tablename NOT IN ('spatial_ref_sys', 'settings', 'users', 'sessions')
          ORDER BY tablename
        `);
        tables = tablesResult.rows.map(r => r.tablename);

        if (tables.length === 0) {
          console.log('No source tables found in database');
          migrationProgress.updateProgress(migrationId, {
            status: 'completed',
            message: 'No source tables found'
          });
          return;
        }
      } catch (err) {
        console.error('Error discovering tables:', err);
        migrationProgress.updateProgress(migrationId, {
          status: 'failed',
          error: 'Could not discover source tables'
        });
        return;
      }
    }

    let totalProcessed = 0;
    let totalRecords = 0;

    // Get total count
    for (const table of tables) {
      try {
        const countResult = await pools.sourcePool.query(`SELECT COUNT(*) FROM public."${table}"`);
        totalRecords += parseInt(countResult.rows[0].count);
      } catch (err) {
        console.log(`Skipping table ${table}: ${err.message}`);
      }
    }

    migrationProgress.updateProgress(migrationId, {
      current: 0,
      total: totalRecords,
      percentage: 0,
      status: 'starting',
      currentTable: tables[0]
    });

    // Process each table
    for (const table of tables) {
      const tableConfig = getTableConfig(table);
      let offset = 0;
      let hasMore = true;

      while (hasMore) {
        // Order by id as integer to match how embeddings were originally created
        // (text sorting differs from numeric sorting: '10001' < '1806' in text but not numerically)
        const result = await pools.sourcePool.query(
          `SELECT * FROM public."${table}" ORDER BY id::int LIMIT $1 OFFSET $2`,
          [batchSize, offset]
        );

        if (result.rows.length === 0) {
          hasMore = false;
          break;
        }

        // OPTIMIZATION: Batch-check existing IDs in one query instead of per-record
        // Convert IDs to integers (source tables may have text IDs)
        const batchIds = result.rows.map(r => parseInt(r.id, 10)).filter(id => !isNaN(id));
        const existingCheck = await pools.targetPool.query(
          `SELECT source_id FROM unified_embeddings WHERE LOWER(source_table) = LOWER($1) AND source_id = ANY($2::bigint[])`,
          [table, batchIds]
        );
        const existingIds = new Set(existingCheck.rows.map(r => Number(r.source_id)));

        // Count skipped duplicates in batch
        const skippedCount = existingIds.size;
        if (skippedCount > 0) {
          console.log(`Batch check: ${skippedCount}/${batchIds.length} already exist in ${table}, processing ${batchIds.length - skippedCount} new`);
          totalProcessed += skippedCount;
        }

        for (const row of result.rows) {
          try {
            // Check if migration is paused or stopped
            if (migrationProgress.isStopped(migrationId)) {
              console.log(`Migration ${migrationId} stopped by user`);
              return;
            }

            // Wait while paused
            while (migrationProgress.isPaused(migrationId)) {
              await new Promise(resolve => setTimeout(resolve, 1000));
            }

            // Skip if already exists (using batch-fetched Set)
            // Convert row.row_id to number for comparison (may be text type)
            const rowIdNum = parseInt(row.row_id, 10);
            if (existingIds.has(rowIdNum)) {
              continue;
            }

            // Extract content and determine source type
            let content = '';
            let title = '';
            let sourceType = 'document';

            // Handle csv_* tables (Vergilex format)
            if (table === 'csv_sorucevap') {
              content = `Soru: ${row.soru || ''}\n\nCevap: ${row.cevap || ''}`;
              title = (row.soru || '').substring(0, 255);
              sourceType = 'qa';
            } else if (table === 'csv_danistaykararlari') {
              content = row.icerik || '';
              title = row.konusu || `Karar ${row.row_id}`;
              sourceType = 'court_decision';
            } else if (table.startsWith('csv_makale_arsiv')) {
              content = row.icerik || '';
              title = row.konusu || `Makale ${row.row_id}`;
              sourceType = 'article';
            } else if (table === 'csv_ozelge') {
              content = row.icerik || '';
              title = row.konusu || `Özelge ${row.row_id}`;
              sourceType = 'official_letter';
            } else if (table === 'csv_hukdkk' || table === 'csv_maliansiklopedi') {
              content = row.icerik || '';
              title = row.konusu || `${table} ${row.row_id}`;
              sourceType = 'legal_document';
            }
            // Legacy uppercase tables (original format)
            else if (table === 'SORUCEVAP') {
              content = `Soru: ${row.soru || ''}\n\nCevap: ${row.cevap || ''}`;
              title = (row.soru || '').substring(0, 255);
              sourceType = 'qa';
            } else if (table === 'DANISTAYKARARLARI') {
              content = row.metin || '';
              title = row.karar_no || `Karar ${row.row_id}`;
              sourceType = 'court_decision';
            } else if (table === 'MAKALELER') {
              content = row.icerik || '';
              title = row.baslik || `Makale ${row.row_id}`;
              sourceType = 'article';
            } else if (table === 'OZELGELER') {
              content = row.metin || '';
              title = row.ozelge_no || `Özelge ${row.row_id}`;
              sourceType = 'official_letter';
            }
            // Generic fallback for any other table with icerik/konusu columns
            else if (row.icerik) {
              content = row.icerik || '';
              title = row.konusu || row.baslik || `${table} ${row.row_id}`;
              sourceType = 'document';
            }
            // Generic fallback for tables with English column names (content/title)
            else if (row.content) {
              content = row.content || '';
              title = row.title || row.excerpt || `${table} ${row.row_id}`;
              sourceType = 'document';
            }

            if (!content || content.trim().length === 0) continue;

            // Generate embedding for full content (truncated if too long)
            const truncatedContent = content.substring(0, 8000);
            const embedding = await generateEmbedding(truncatedContent);

            if (embedding.length === 0) continue;

            // Get current embedding settings for metadata
            const embedSettings = await getEmbeddingSettings();

            // Prepare metadata
            const metadata: any = {
              embeddingProvider: embedSettings.provider,
              embeddingModel: embedSettings.model,
              tokens_used: Math.ceil(truncatedContent.length / 4)
            };

            // Add table-specific metadata for csv_* tables
            if (table === 'csv_danistaykararlari') {
              metadata.karar_no = row.kararno;
              metadata.esas_no = row.esasno;
              metadata.karar_tarihi = row.tarih;
              metadata.daire = row.daire;
            } else if (table === 'csv_sorucevap') {
              metadata.tarih = row.tarih;
            } else if (table.startsWith('csv_makale_arsiv')) {
              metadata.yil = table.replace('csv_makale_arsiv_', '');
            } else if (table === 'csv_ozelge') {
              metadata.tarih = row.tarih;
            }
            // Legacy uppercase tables
            else if (table === 'DANISTAYKARARLARI') {
              metadata.karar_no = row.karar_no;
              metadata.karar_tarihi = row.karar_tarihi;
              metadata.daire = row.daire;
            } else if (table === 'SORUCEVAP') {
              metadata.kategori = row.kategori;
              metadata.tarih = row.tarih;
            } else if (table === 'MAKALELER') {
              metadata.yazar = row.yazar;
              metadata.yayin_tarihi = row.yayin_tarihi;
            } else if (table === 'OZELGELER') {
              metadata.ozelge_no = row.ozelge_no;
              metadata.kurum = row.kurum;
            }

            // Insert into unified_embeddings with token tracking
            const tokensUsed = Math.ceil(truncatedContent.length / 3);

            await pools.targetPool.query(`
              INSERT INTO unified_embeddings
              (source_table, source_type, source_id, source_name, content, embedding, metadata, tokens_used, model_used, embedding_provider)
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
              ON CONFLICT (source_table, source_id) DO UPDATE SET
                tokens_used = EXCLUDED.tokens_used,
                model_used = EXCLUDED.model_used,
                updated_at = NOW()
            `, [
              table,
              sourceType,
              row.row_id,
              title,
              truncatedContent,
              `[${embedding.join(',')}]`,
              JSON.stringify(metadata),
              tokensUsed,
              metadata.embeddingModel || 'text-embedding-ada-002',
              metadata.embeddingProvider || 'openai'
            ]);
            
            totalProcessed++;
            
            // Update progress
            migrationProgress.updateProgress(migrationId, {
              current: totalProcessed,
              total: totalRecords,
              percentage: Math.round((totalProcessed / totalRecords) * 100),
              status: 'processing',
              currentTable: table,
              currentRecord: getTitle(table, row),
              tokenUsage: globalTokenUsage
            });
            
          } catch (error) {
            console.error(`Error processing record ${row.row_id}:`, error);
          }
        }
        
        offset += batchSize;
      }
    }
    
    // Complete
    migrationProgress.updateProgress(migrationId, {
      current: totalProcessed,
      total: totalRecords,
      percentage: 100,
      status: 'completed',
      tokenUsage: globalTokenUsage
    });
    migrationProgress.completeMigration(migrationId);

  } catch (error) {
    console.error('Migration error:', error);
    migrationProgress.updateProgress(migrationId, {
      status: 'failed',
      error: (error as Error).message
    });
    migrationProgress.completeMigration(migrationId);
  }
}

function getTableConfig(table: string) {
  const configs: any = {
    DANISTAYKARARLARI: {
      textField: 'metin',
      titleField: 'karar_no'
    },
    SORUCEVAP: {
      textFields: ['soru', 'cevap'],
      titleField: 'soru'
    },
    MAKALELER: {
      textField: 'icerik',
      titleField: 'baslik'
    },
    OZELGELER: {
      textField: 'metin',
      titleField: 'ozelge_no'
    }
  };
  return configs[table] || {};
}

function getTitle(table: string, row: any): string {
  switch(table) {
    case 'DANISTAYKARARLARI':
      return row.karar_no || `Karar ${row.row_id}`;
    case 'SORUCEVAP':
      return row.soru || `Soru ${row.row_id}`;
    case 'MAKALELER':
      return row.baslik || `Makale ${row.row_id}`;
    case 'OZELGELER':
      return row.ozelge_no || `Özelge ${row.row_id}`;
    default:
      return `${table} ${row.row_id}`;
  }
}

export default router;


