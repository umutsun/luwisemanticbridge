import { Router, Request, Response } from 'express';
import { Pool } from 'pg';
import OpenAI from 'openai';
import { EventEmitter } from 'events';
import { lsembPool } from '../config/database.config';

const router = Router();

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
      // Close existing pools if refreshing
      if (forceRefresh) {
        if (sourcePool) {
          await sourcePool.end().catch(() => {});
          sourcePool = null;
        }
        if (targetPool) {
          await targetPool.end().catch(() => {});
          targetPool = null;
        }
      }

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
        connectionTimeoutMillis: 10000, // 10 second timeout
        idleTimeoutMillis: 30000,
        max: 10
      });
      targetPool = new Pool({
        connectionString: targetConnectionString,
        connectionTimeoutMillis: 10000,
        idleTimeoutMillis: 30000,
        max: 10
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
    // Get API key from settings table
    const { lsembPool } = await import('../config/database');
    const result = await lsembPool.query(
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

// Progress tracking
class MigrationProgress extends EventEmitter {
  private progress: Map<string, any> = new Map();
  private pausedMigrations: Set<string> = new Set();
  private stoppedMigrations: Set<string> = new Set();
  private history: any[] = [];

  updateProgress(id: string, data: any) {
    const progressData = {
      ...data,
      timestamp: new Date().toISOString()
    };
    this.progress.set(id, progressData);
    this.emit('progress', { id, ...progressData });
  }

  getProgress(id: string) {
    return this.progress.get(id);
  }

  pauseMigration(id: string) {
    this.pausedMigrations.add(id);
    const current = this.progress.get(id);
    if (current) {
      this.updateProgress(id, { ...current, status: 'paused' });
    }
  }

  resumeMigration(id: string) {
    this.pausedMigrations.delete(id);
    const current = this.progress.get(id);
    if (current) {
      this.updateProgress(id, { ...current, status: 'processing' });
    }
  }

  stopMigration(id: string) {
    this.stoppedMigrations.add(id);
    const current = this.progress.get(id);
    if (current) {
      this.updateProgress(id, { ...current, status: 'stopped' });
      this.history.push({ id, ...current, stoppedAt: new Date().toISOString() });
    }
  }

  isPaused(id: string): boolean {
    return this.pausedMigrations.has(id);
  }

  isStopped(id: string): boolean {
    return this.stoppedMigrations.has(id);
  }

  clearMigration(id: string) {
    this.progress.delete(id);
    this.pausedMigrations.delete(id);
    this.stoppedMigrations.delete(id);
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
      migrationProgress.pauseMigration(activeProgress.id);
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
      migrationProgress.resumeMigration(pausedProgress.id);
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
      migrationProgress.stopMigration(activeProgress.id);
      res.json({ success: true, message: 'Migration stopped', id: activeProgress.id });
    } else {
      res.status(404).json({ error: 'No active migration to stop' });
    }
  } catch (error) {
    console.error('Stop error:', error);
    res.status(500).json({ error: 'Failed to stop migration' });
  }
});

// Pause migration
router.post('/pause/:id', async (req: Request, res: Response) => {
  const { id } = req.params;

  try {
    migrationProgress.pauseMigration(id);
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
    migrationProgress.resumeMigration(id);
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
    migrationProgress.stopMigration(id);
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
  const { batchSize = 50, sourceTable = null, tables: requestedTables = null } = req.body;

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
    const pools = await initializePools();

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

    const allPending: any[] = [];
    for (const table of tables) {
      try {
        // Normalize table name to lowercase ASCII (remove Turkish characters)
        const normalizedTableName = table.toLowerCase()
          .replace(/ö/g, 'o')
          .replace(/ü/g, 'u')
          .replace(/ş/g, 's')
          .replace(/ğ/g, 'g')
          .replace(/ç/g, 'c')
          .replace(/ı/g, 'i');

        if (unifiedEmbeddingsExists) {
          // First, get already embedded IDs from target database
          const embeddedIdsResult = await pools.targetPool.query(
            `SELECT source_id FROM unified_embeddings WHERE source_table = $1`,
            [normalizedTableName]
          );
          const embeddedIds = new Set(embeddedIdsResult.rows.map(row => row.source_id));

          // Then, get ALL records from source table (no LIMIT)
          const allRecordsResult = await pools.sourcePool.query(
            `SELECT id, * FROM public."${table}"`
          );

          // Filter out already embedded records
          const pendingRecords = allRecordsResult.rows
            .filter(row => !embeddedIds.has(row.id));

          console.log(` Table ${table}: ${allRecordsResult.rows.length} total records, ${embeddedIds.size} already embedded, ${pendingRecords.length} pending`);

          pendingRecords.forEach(row => allPending.push({ ...row, _sourceTable: normalizedTableName }));
        } else {
          // If unified_embeddings doesn't exist, get ALL records (no LIMIT)
          const result = await pools.sourcePool.query(
            `SELECT id, * FROM public."${table}"`
          );
          console.log(` Table ${table}: ${result.rows.length} records to process (no embeddings table exists)`);
          result.rows.forEach(row => allPending.push({ ...row, _sourceTable: normalizedTableName }));
        }
      } catch (err) {
        // Silently skip tables that don't exist or have errors
        console.log(`Skipping table ${table}: ${err.message}`);
      }
    }

    const total = allPending.length;
    let processed = 0;

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
      message: `Starting migration for ${tables.length} table(s): ${tables.join(', ')}`,
      tokenUsage: globalTokenUsage
    })}\n\n`);

    for (const row of allPending) {
      try {
        const table = row._sourceTable;

        // Note: LEFT JOIN already filters out duplicates (WHERE u.id IS NULL)
        // No need for additional existence check here

        // Dynamic content extraction - auto-detect content columns
        let content = '';
        let title = '';
        let sourceType = 'document';

        const tableLower = table.toLowerCase();

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
              console.log(`[Migration] Using combined fields as content for ${table}[${row.id}] (${rowKeys.length} fields)`);
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
              title = `${table} #${row.id}`;
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
          console.warn(`️ No content found for ${table}[${row.id}] - moving to skipped_embeddings`);

          // Insert into skipped_embeddings table
          try {
            await pools.targetPool.query(
              `INSERT INTO skipped_embeddings (source_table, source_type, source_id, source_name, content, skip_reason, metadata)
               VALUES ($1, $2, $3, $4, $5, $6, $7)
               ON CONFLICT (source_table, source_id) DO UPDATE SET
                 skip_reason = EXCLUDED.skip_reason,
                 metadata = EXCLUDED.metadata,
                 updated_at = CURRENT_TIMESTAMP`,
              [table, sourceType, row.id, title, '[No content available]', 'no_content', JSON.stringify({
                note: 'Skipped - no content in source table',
                skipped_at: new Date().toISOString()
              })]
            );
            console.log(` Record moved to skipped_embeddings: ${table}[${row.id}]`);
          } catch (err) {
            console.error(` Failed to insert into skipped_embeddings for ${table}[${row.id}]:`, err);
          }

          processed++;
          continue;
        }

        // Generate embedding
        console.log(` Generating embedding for ${table}[${row.id}]...`);
        const embedding = await generateEmbedding(content);

        if (embedding.length === 0) {
          console.warn(`️ Empty embedding returned for ${table}[${row.id}] - moving to skipped_embeddings`);

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
              [table, sourceType, row.id, title, content.substring(0, 500), 'empty_embedding', JSON.stringify({
                note: 'Skipped - embedding API returned empty result',
                content_length: content.length,
                skipped_at: new Date().toISOString()
              })]
            );
            console.log(` Record moved to skipped_embeddings: ${table}[${row.id}]`);
          } catch (err) {
            console.error(` Failed to insert into skipped_embeddings for ${table}[${row.id}]:`, err);
          }

          processed++;
          continue;
        }
        console.log(` Embedding generated for ${table}[${row.id}]: ${embedding.length} dimensions`);

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

        // Insert into unified_embeddings (skip if duplicate)
        // Use normalized table name for consistency
        await pools.targetPool.query(`
          INSERT INTO unified_embeddings
          (source_table, source_type, source_id, source_name, content, embedding, metadata)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          ON CONFLICT (source_table, source_id) DO NOTHING
        `, [
          tableLower, // Use normalized lowercase table name
          sourceType,
          row.id,
          title,
          content,
          `[${embedding.join(',')}]`,
          JSON.stringify(metadata)
        ]);

        processed++;

        // Send progress (only if client is still connected)
        const progress = {
          current: processed,
          total: total,
          percentage: Math.round((processed / total) * 100),
          status: 'processing',
          currentRecord: title,
          currentTable: table,
          tokenUsage: globalTokenUsage
        };

        // Also emit to progress stream listeners
        migrationProgress.emit('progress', progress);
        safeWrite(`data: ${JSON.stringify(progress)}\n\n`);
      } catch (error) {
        console.error('Embedding error:', error);
        processed++;
      }
    }

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

    if (clientConnected) res.end();
  } catch (error) {
    console.error('Generate embeddings error:', error);
    safeWrite(`data: ${JSON.stringify({ status: 'failed', error: (error as Error).message })}\n\n`);
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
        const result = await pools.sourcePool.query(
          `SELECT * FROM public."${table}" ORDER BY id LIMIT $1 OFFSET $2`,
          [batchSize, offset]
        );

        if (result.rows.length === 0) {
          hasMore = false;
          break;
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

            // Check if record already exists to avoid duplicate processing
            const existsCheck = await pools.targetPool.query(
              'SELECT id FROM unified_embeddings WHERE source_table = $1 AND source_id = $2',
              [table, row.id]
            );

            if (existsCheck.rows.length > 0) {
              totalProcessed++;
              console.log(`Skipping duplicate: ${table}[${row.id}] already exists`);
              continue;
            }

            // Extract content and determine source type
            let content = '';
            let title = '';
            let sourceType = 'document';

            if (table === 'SORUCEVAP') {
              content = `Soru: ${row.soru || ''}\n\nCevap: ${row.cevap || ''}`;
              title = (row.soru || '').substring(0, 255);
              sourceType = 'qa';
            } else if (table === 'DANISTAYKARARLARI') {
              content = row.metin || '';
              title = row.karar_no || `Karar ${row.id}`;
              sourceType = 'court_decision';
            } else if (table === 'MAKALELER') {
              content = row.icerik || '';
              title = row.baslik || `Makale ${row.id}`;
              sourceType = 'article';
            } else if (table === 'OZELGELER') {
              content = row.metin || '';
              title = row.ozelge_no || `Özelge ${row.id}`;
              sourceType = 'official_letter';
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

            if (table === 'DANISTAYKARARLARI') {
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

            // Insert into unified_embeddings (skip if duplicate)
            await pools.targetPool.query(`
              INSERT INTO unified_embeddings
              (source_table, source_type, source_id, source_name, content, embedding, metadata)
              VALUES ($1, $2, $3, $4, $5, $6, $7)
              ON CONFLICT (source_table, source_id) DO NOTHING
            `, [
              table,
              sourceType,
              row.id,
              title,
              truncatedContent,
              `[${embedding.join(',')}]`,
              JSON.stringify(metadata)
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
            console.error(`Error processing record ${row.id}:`, error);
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
      return row.karar_no || `Karar ${row.id}`;
    case 'SORUCEVAP':
      return row.soru || `Soru ${row.id}`;
    case 'MAKALELER':
      return row.baslik || `Makale ${row.id}`;
    case 'OZELGELER':
      return row.ozelge_no || `Özelge ${row.id}`;
    default:
      return `${table} ${row.id}`;
  }
}

export default router;


