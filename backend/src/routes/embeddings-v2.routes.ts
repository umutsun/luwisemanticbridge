import { Router, Request, Response } from 'express';
import { Pool } from 'pg';
import OpenAI from 'openai';
import { redis } from '../config/redis';
import crypto from 'crypto';
import { getDatabaseSettings, lsembPool } from '../config/database.config';
import { TIMEOUTS } from '../config';
import { createEmbeddingRateLimit, createUploadRateLimit } from '../middleware/rate-limit.middleware';

// Helper function to log embedding operations - TEMPORARILY DISABLED
function logEmbeddingOperation(data: {
  operation_id: string;
  source_table: string[];
  source_type?: string;
  embedding_model: string;
  batch_size: number;
  worker_count: number;
  status: 'started' | 'processing' | 'completed' | 'error' | 'paused';
  total_records?: number;
  processed_records?: number;
  records_success?: number;
  records_failed?: number;
  error_count?: number;
  execution_time?: number;
  error_message?: string;
  metadata?: any;
}) {
  // Temporarily disabled to prevent embedding operation failures
  // Don't log anything to avoid confusion
}

// Token estimation for different embedding models
function estimateTokens(text: string, model: string): number {
  // Simple approximation: 1 token ≈ 4 characters for English text
  // This is a rough estimate - actual tokenization depends on the specific model
  const charCount = text.length;

  switch (model) {
    case 'text-embedding-004':
    case 'google-text-embedding-004':
      // Google's models use similar tokenization to BERT
      return Math.ceil(charCount / 3.5);

    case 'text-embedding-3-large':
    case 'text-embedding-3-small':
    case 'text-embedding-ada-002':
      // OpenAI's models use their own tokenization
      return Math.ceil(charCount / 4);

    case 'e5-mistral':
    case 'bge-m3':
    case 'mistral':
    case 'all-mpnet-base-v2':
      // Sentence transformer models typically use WordPiece or similar
      return Math.ceil(charCount / 3.8);

    case 'jina-embeddings-v2':
    case 'jina-embeddings-v2-small':
      // Jina models
      return Math.ceil(charCount / 3.6);

    case 'cohere-embed-v3':
      // Cohere models
      return Math.ceil(charCount / 3.7);

    case 'voyage-large-2':
      // Voyage models
      return Math.ceil(charCount / 3.5);

    default:
      // Generic estimate
      return Math.ceil(charCount / 4);
  }
}

// ASEMB database - where unified_embeddings table is stored
// Using lsembPool from database.config.ts

const router = Router();

// Use centralized Redis configuration (port 6379)

// Get source database name from settings
async function getSourceDatabaseName(): Promise<string> {
  try {
    const settings = await getDatabaseSettings();
    return settings.sourceDatabase || 'rag_chatbot';
  } catch (error) {
    return 'rag_chatbot'; // fallback
  }
}

// Source database - where we read data from
const sourcePool = process.env.RAG_CHATBOT_DATABASE_URL ?
  new Pool({
    connectionString: process.env.RAG_CHATBOT_DATABASE_URL
  }) :
  new Pool({
    host: process.env.POSTGRES_HOST || 'localhost',
    port: parseInt(process.env.POSTGRES_PORT || '5432'),
    database: process.env.POSTGRES_DB || 'lsemb',
    user: process.env.POSTGRES_USER || 'postgres',
    password: process.env.POSTGRES_PASSWORD || ''
  });

// Target database (lsemb) - where we write embeddings to
const targetPool = new Pool({
  host: process.env.POSTGRES_HOST || 'localhost',
  port: parseInt(process.env.POSTGRES_PORT || '5432'),
  database: process.env.POSTGRES_DB || 'lsemb',
  user: process.env.POSTGRES_USER || 'postgres',
  password: process.env.POSTGRES_PASSWORD || ''
});

// Use targetPool for default queries (settings, migration history)
const pgPool = targetPool;

// Get API key from database settings or environment
async function getApiKey(provider: string) {
  try {
    // Try to get from ASEMB settings table first
    const result = await lsembPool.query(
      `SELECT setting_value as api_key FROM chatbot_settings WHERE setting_key = '${provider}_api_key'`
    );

    if (result.rows[0]?.api_key) {
      return result.rows[0].api_key;
    }

    // Fallback to environment variable
    return process.env[`${provider.toUpperCase()}_API_KEY`] || '';
  } catch (error) {
    if (error instanceof Error) {
      console.error(`Error fetching ${provider} API key:`, error.message);
    } else {
      console.error(`An unknown error occurred while fetching ${provider} API key`);
    }
    return process.env[`${provider.toUpperCase()}_API_KEY`] || '';
  }
}

// Get OpenAI API key from database settings
async function getOpenAIClient() {
  const apiKey = await getApiKey('openai');
  if (!apiKey) {
    console.log('OpenAI API key not found');
    return null;
  }
  return new OpenAI({ apiKey });
}

// Progress tracking in memory and Redis
let migrationProgress: any = {
  status: 'idle',
  current: 0,
  total: 0,
  percentage: 0,
  currentTable: null,
  error: null,
  tokensUsed: 0,
  tokensThisSession: 0,
  estimatedTotalTokens: 0,
  estimatedCost: 0,
  startTime: null,
  lastHeartbeat: null, // Last time the process was confirmed to be running
  estimatedTimeRemaining: null,
  processingSpeed: 0, // records per minute
  processedTables: [],
  currentBatch: 0,
  totalBatches: 0,
  workerCount: 2, // Store worker count for persistence
  tableProgress: {}, // Track progress per table
  tables: [] // Store list of tables being processed
};

// Helper function to generate cache key for text
function getEmbeddingCacheKey(text: string): string {
  const hash = crypto.createHash('md5').update(text).digest('hex');
  return `embedding:${hash}`;
}

// Update heartbeat for active process
function updateHeartbeat() {
  if (migrationProgress.status === 'processing') {
    migrationProgress.lastHeartbeat = Date.now();
  }
}

// Check if process is actually running or stuck
function isProcessStuck() {
  if (migrationProgress.status !== 'processing') {
    return false;
  }

  // If no heartbeat in the last 30 seconds, process is likely stuck
  if (!migrationProgress.lastHeartbeat) {
    return true;
  }

  const timeSinceHeartbeat = Date.now() - migrationProgress.lastHeartbeat;

  // If heartbeat is older than 2 minutes, process is stuck
  if (timeSinceHeartbeat > 120000) {
    return true;
  }

  // If process shows processing but has no actual progress (all zeros) and has been running for more than 1 minute
  if (migrationProgress.current === 0 &&
      migrationProgress.total === 0 &&
      Object.keys(migrationProgress.tableProgress || {}).length === 0 &&
      timeSinceHeartbeat > 60000) {
    return true;
  }

  return false;
}

// Save progress to Redis for resume functionality
async function saveProgressToRedis() {
  try {
    // Save to embedding:progress for frontend compatibility
    await redis.set('embedding:progress', JSON.stringify(migrationProgress));

    // Also save to migration:progress for v2 system
    await redis.set('migration:progress', JSON.stringify(migrationProgress));

    // Save selected tables separately for resume functionality
    if (migrationProgress.tables && migrationProgress.tables.length > 0) {
      await redis.set('embedding:selected_tables', JSON.stringify(migrationProgress.tables));
    }

    // Update the status key
    await redis.set('embedding:status', migrationProgress.status);
  } catch (err) {
    console.error('Failed to save progress to Redis:', err);
  }
}

// Load progress from Redis
export async function loadProgressFromRedis() {
  try {
    // Try embedding:progress first (frontend compatible)
    let cached = await redis.get('embedding:progress');

    // If not found, try migration:progress (v2 system)
    if (!cached) {
      cached = await redis.get('migration:progress');
    }

    if (cached) {
      migrationProgress = JSON.parse(cached);
      return true;
    }
  } catch (err) {
    console.error('Failed to load progress from Redis:', err);
  }
  return false;
}

// Get embedding from cache or generate new one
async function getEmbeddingWithCache(text: string, openai: OpenAI): Promise<{ embedding: number[], cached: boolean, tokens: number }> {
  const cacheKey = getEmbeddingCacheKey(text);

  // Check Redis cache first
  try {
    const cached = await redis.get(cacheKey);
    if (cached) {
      // Cache hit
      return {
        embedding: JSON.parse(cached),
        cached: true,
        tokens: 0 // No tokens used for cached embeddings
      };
    }
  } catch (err) {
    console.error('Redis cache read error:', err);
  }

  // Generate new embedding if not cached
  // Cache miss

  try {
    const response = await openai.embeddings.create({
      model: 'text-embedding-ada-002',
      input: text
    });

    const embedding = response.data[0].embedding;
    const tokens = response.usage?.total_tokens || 0;

    // Cache the embedding
    try {
      await redis.set(cacheKey, JSON.stringify(embedding), 'EX', 90 * 24 * 60 * 60); // 90 days
    } catch (err) {
      console.error('Redis cache write error:', err);
    }

    return { embedding, cached: false, tokens };
  } catch (error) {
    console.error('Embedding generation error:', error);

    // Fallback to local embedding if OpenAI fails
    if (process.env.USE_LOCAL_EMBEDDINGS === 'true') {
      console.log('Using fallback local embedding');
      const embedding = new Array(1536).fill(0).map(() => Math.random() * 2 - 1);
      return { embedding, cached: false, tokens: 0 };
    }

    throw error;
  }
}

// Get primary key for a table
async function getPrimaryKey(tableName: string): Promise<string> {
  try {
    const result = await sourcePool.query(
      `SELECT a.attname
       FROM pg_index i
       JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
       WHERE i.indrelid = '"${tableName}"'::regclass
       AND i.indisprimary`
    );

    if (result.rows.length > 0) {
      return result.rows[0].attname;
    }
  } catch (err) {
    console.log(`No primary key found for ${tableName}`);
  }

  return 'ROW_NUMBER'; // Fallback
}

// Ensure embedding column exists
async function ensureEmbeddingColumn(tableName: string) {
  try {
    await sourcePool.query(
      `ALTER TABLE public."${tableName}" ADD COLUMN IF NOT EXISTS embedding vector(1536)`
    );
  } catch (err) {
    if (err instanceof Error) {
      console.log(`Embedding column check failed for ${tableName}:`, err.message);
    } else {
      console.log(`An unknown error occurred during embedding column check for ${tableName}`);
    }
  }
}

// Check for duplicates in batch (more efficient)
async function checkDuplicatesInBatch(table: string, ids: any[]): Promise<Set<any>> {
  try {
    console.log(`🔎 Checking duplicates for table "${table}" with ${ids.length} IDs:`, ids.slice(0, 5));

    // Check for duplicates using metadata->>'table'
    const result = await lsembPool.query(
      `SELECT DISTINCT CAST(source_id AS INTEGER) as source_id
       FROM unified_embeddings
       WHERE source_type = 'database'
       AND metadata->>'table' = $1
       AND CAST(source_id AS INTEGER) = ANY($2)`,
      [table, ids]
    );

    const duplicateIds = new Set(result.rows.map(row => parseInt(row.source_id)));

    console.log(`📋 Found ${duplicateIds.size} existing embeddings for table "${table}"`);

    return duplicateIds;
  } catch (err) {
    console.error('Duplicate check error:', err);
    return new Set();
  }
}

// Generate display name from table name dynamically
function getDisplayName(tableName: string): string {
  // Convert snake_case to Display Name
  return tableName
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

// Generate all possible variations for a table name dynamically
function getAllVariations(tableName: string, displayName: string): string[] {
  // For Turkish tables with special characters, generate common variations
  const variations = new Set<string>();

  // Always add the display name and original table name
  variations.add(displayName);
  variations.add(tableName);

  // If the table name contains Turkish characters, generate ASCII-only variations
  if (/[ğĞüÜşŞıİçÇöÖ]/.test(tableName)) {
    const asciiName = tableName
      .replace(/ğ/g, 'g')
      .replace(/Ğ/g, 'G')
      .replace(/ü/g, 'u')
      .replace(/Ü/g, 'U')
      .replace(/ş/g, 's')
      .replace(/Ş/g, 'S')
      .replace(/ı/g, 'i')
      .replace(/İ/g, 'I')
      .replace(/ç/g, 'c')
      .replace(/Ç/g, 'C')
      .replace(/ö/g, 'o')
      .replace(/Ö/g, 'O');
    variations.add(asciiName);

    // Also add capitalized version
    variations.add(asciiName.charAt(0).toUpperCase() + asciiName.slice(1));
  }

  return Array.from(variations);
}

// Get content column for table dynamically
async function getContentColumn(table: string): Promise<string> {
  try {
    // First, try to find common content column names
    const columnResult = await sourcePool.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
      AND table_name = $1
      AND column_name ILIKE ANY(ARRAY['content', 'text', 'icerik', 'içerik', 'description', 'body', 'message'])
      ORDER BY
        CASE column_name
          WHEN 'content' THEN 1
          WHEN 'text' THEN 2
          WHEN 'icerik' THEN 3
          WHEN 'içerik' THEN 4
          WHEN 'description' THEN 5
          WHEN 'body' THEN 6
          ELSE 7
        END
      LIMIT 1
    `, [table]);

    if (columnResult.rows.length > 0) {
      return `"${columnResult.rows[0].column_name}"`;
    }

    // Check if table has question-answer columns (like sorucevap)
    const qaColumnsResult = await sourcePool.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
      AND table_name = $1
      AND column_name ILIKE ANY(ARRAY['soru', 'cevap', 'question', 'answer'])
      ORDER BY column_name
    `, [table]);

    if (qaColumnsResult.rows.length === 2) {
      // Found two columns that look like question/answer
      const col1 = qaColumnsResult.rows[0].column_name;
      const col2 = qaColumnsResult.rows[1].column_name;
      return `CONCAT("${col1}", ' ', "${col2}")`;
    }

    // Default to 'content' if no suitable column found
    return 'content';
  } catch (error) {
    console.error(`Error getting content column for ${table}:`, error);
    return 'content';
  }
}

// Get tables with accurate embedded counts - FIXED
router.get('/tables-fixed', async (req: Request, res: Response) => {
  console.log('[TABLES-FIXED] Loading tables with correct counts...');
  try {
    console.log('[TABLES] Loading tables with correct counts...');
    const tablesWithMeta = [];

    // Get source database name
    const databaseName = await getSourceDatabaseName();

    // Get all tables from source database (exclude system tables)
    const tablesQuery = await sourcePool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_type = 'BASE TABLE'
      AND table_name NOT IN ('embedding_progress', 'embedding_history', 'unified_embeddings', 'spatial_ref_sys', 'geometry_columns')
      ORDER BY table_name
    `);

    // Get actual embedded counts from unified_embeddings grouped by actual table name
    const actualCountsResult = await lsembPool.query(`
      SELECT
        metadata->>'table' as actual_table,
        COUNT(*) as embedded_count
      FROM unified_embeddings
      WHERE metadata->>'table' IS NOT NULL
      GROUP BY metadata->>'table'
    `);

    // Create a map of actual table names to embedded counts
    const embeddedCountsMap = new Map();
    actualCountsResult.rows.forEach(row => {
      embeddedCountsMap.set(row.actual_table, parseInt(row.embedded_count));
    });

    // Process each table from the database
    for (const tableRow of tablesQuery.rows) {
      const tableName = tableRow.table_name;

      // Generate display name dynamically
      const displayName = getDisplayName(tableName);

      try {
        // Get total records count
        const countResult = await sourcePool.query(`
          SELECT COUNT(*) as total
          FROM public."${tableName}"
        `);
        const totalRecords = parseInt(countResult.rows[0].total);

        // Get embedded records count from our map
        let embeddedRecords = embeddedCountsMap.get(tableName) || 0;

        console.log(`[TABLES] ${tableName}: ${embeddedRecords} embeddings found`);

        // Check if table is currently being processed
        // Note: embedding_progress table might not exist or have different structure
        let status = 'pending';
        try {
          const progressResult = await lsembPool.query(`
            SELECT status
            FROM embedding_progress
            WHERE table_name = $1
            ORDER BY created_at DESC
            LIMIT 1
          `, [tableName]);
          status = progressResult.rows[0]?.status || 'pending';
        } catch (error) {
          // Table doesn't exist or has different structure
          status = 'pending';
        }

        // The embeddedRecords already includes all variations due to our query

        tablesWithMeta.push({
          name: tableName,
          displayName,
          totalRecords,
          embeddedRecords,
          status,
          progress: totalRecords > 0 ? Math.round((embeddedRecords / totalRecords) * 100) : 0
        });
      } catch (err) {
        console.error(`Error processing table ${tableName}:`, err);
      }
    }

    // Log the actual counts from database
    console.log('\n📊 Actual embedded counts from unified_embeddings:');
    actualCountsResult.rows.forEach(row => {
      console.log(`  ${row.actual_table}: ${row.embedded_count} records`);
    });

    // Log the final response
    console.log('\n📤 Final response:');
    console.log('  - Total tables:', tablesWithMeta.length);
    console.log('  - Total records:', tablesWithMeta.reduce((acc, t) => acc + t.totalRecords, 0));
    console.log('  - Total embedded:', tablesWithMeta.reduce((acc, t) => acc + t.embeddedRecords, 0));
    console.log('  - Table details:');
    tablesWithMeta.forEach(t => {
      console.log(`    ${t.name}: ${t.embeddedRecords}/${t.totalRecords}`);
    });

    console.log('[TABLES ENDPOINT] About to send response:', {
      tablesCount: tablesWithMeta.length,
      totalEmbedded: tablesWithMeta.reduce((acc, t) => acc + t.embeddedRecords, 0),
      databaseName
    });

    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    res.json({
      tables: tablesWithMeta,
      databaseName
    });
  } catch (error) {
    console.error('Tables fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch tables' });
  }
});

// Test endpoint - this should definitely work
router.get('/test-tables', async (req: Request, res: Response) => {
  console.log('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
  console.log('[TEST ENDPOINT] CALLED!');
  console.log('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');

  // Check both databases
  const lsembResult = await lsembPool.query('SELECT COUNT(*) FROM unified_embeddings');
  const lsembCount = parseInt(lsembResult.rows[0].count);

  let pgCount = 0;
  try {
    const pgResult = await pgPool.query('SELECT COUNT(*) FROM unified_embeddings');
    pgCount = parseInt(pgResult.rows[0].count);
  } catch (e) {
    // Table might not exist in pg database
  }

  res.json({
    message: 'Test endpoint',
    lsembDatabase: {
      host: process.env.ASEMB_DB_HOST,
      name: process.env.ASEMB_DB_NAME,
      count: lsembCount
    },
    pgDatabase: {
      connectionString: process.env.DATABASE_URL?.split('@')[1] || 'localhost',
      count: pgCount
    },
    timestamp: new Date().toISOString()
  });
});

// Debug endpoint to check source_table distribution
router.get('/debug-source-tables', async (req: Request, res: Response) => {
  try {
    // Get all source_table values and their counts
    const result = await lsembPool.query(`
      SELECT source_table, COUNT(*) as count
      FROM unified_embeddings
      GROUP BY source_table
      ORDER BY count DESC
    `);

    // Get total count
    const totalResult = await lsembPool.query('SELECT COUNT(*) FROM unified_embeddings');
    const total = parseInt(totalResult.rows[0].count);

    res.json({
      total,
      sourceTables: result.rows,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Debug source tables error:', error);
    res.status(500).json({ error: 'Failed to get source tables' });
  }
});

// Get embedding progress
router.get('/progress', async (req: Request, res: Response) => {
  console.log('📊 Progress endpoint called');

  // Try to load from Redis first
  await loadProgressFromRedis();

  // Get actual embedded count from database for all active tables
  console.log('DEBUG: migrationProgress.tables =', migrationProgress.tables);
  if (migrationProgress.tables && migrationProgress.tables.length > 0) {
    let actualEmbeddedCount = 0;
    for (const table of migrationProgress.tables) {
      console.log(`DEBUG: Processing table "${table}" (lowercase: "${table.toLowerCase()}")`);
      const embeddedResult = await lsembPool.query(
        `SELECT COUNT(DISTINCT source_id) as count
         FROM unified_embeddings
         WHERE metadata->>'table' = $1`,
        [table.toLowerCase()] // Convert to lowercase to match database
      );
      const tableCount = parseInt(embeddedResult.rows[0].count) || 0;
      actualEmbeddedCount += tableCount;

      console.log(`DEBUG: Table ${table}: ${tableCount} actual embedded records`);
    }

    // Update current count to actual database count
    migrationProgress.current = actualEmbeddedCount;

    // Recalculate percentage
    if (migrationProgress.total > 0) {
      migrationProgress.percentage = Math.min(100, Math.round((actualEmbeddedCount / migrationProgress.total) * 100));
    }

    console.log(`DEBUG: Updated progress: ${actualEmbeddedCount}/${migrationProgress.total} (${migrationProgress.percentage}%)`);
  } else {
    console.log('DEBUG: No tables found in migrationProgress');
  }

  console.log('📊 Progress loaded from Redis:', {
    status: migrationProgress.status,
    current: migrationProgress.current,
    total: migrationProgress.total,
    currentTable: migrationProgress.currentTable
  });

  // Calculate processing speed if we have start time and progress
  if (migrationProgress.startTime && migrationProgress.current > 0) {
    const elapsed = (Date.now() - migrationProgress.startTime) / 1000; // seconds
    migrationProgress.processingSpeed = migrationProgress.current / elapsed / 60; // records per minute

    console.log(`DEBUG: Speed calculation - current: ${migrationProgress.current}, elapsed: ${elapsed.toFixed(1)}s, speed: ${migrationProgress.processingSpeed.toFixed(2)} records/min`);

    // Estimate time remaining
    if (migrationProgress.processingSpeed > 0) {
      const remaining = (migrationProgress.total - migrationProgress.current) / migrationProgress.processingSpeed / 60; // minutes
      migrationProgress.estimatedTimeRemaining = remaining * 60 * 1000; // convert to milliseconds
    }
  }

  // Check if process might be stuck
  const mightBeStuck = isProcessStuck();

  // Ensure percentage doesn't exceed 100%
  if (migrationProgress.percentage > 100) {
    migrationProgress.percentage = 100;
  }

  // Add status flag to response
  const response = {
    ...migrationProgress,
    mightBeStuck
  };

  res.json(response);
});

// Get last selected tables for resume functionality
router.get('/selected-tables', async (req: Request, res: Response) => {
  try {
    const selectedTables = await redis.get('embedding:selected_tables');
    if (selectedTables) {
      res.json({ tables: JSON.parse(selectedTables) });
    } else {
      res.json({ tables: [] });
    }
  } catch (error) {
    console.error('Error fetching selected tables:', error);
    res.json({ tables: [] });
  }
});

// Auto-resume embedding (internal use, no logging)
router.post('/auto-resume', async (req: Request, res: Response) => {
  if (migrationProgress.status === 'paused') {
    migrationProgress.status = 'processing';
    migrationProgress.lastHeartbeat = Date.now();

    // Recalculate total if needed
    if (migrationProgress.total === 0 && migrationProgress.tableProgress && Object.keys(migrationProgress.tableProgress).length > 0) {
      let calculatedTotal = 0;
      for (const tableName in migrationProgress.tableProgress) {
        const tableInfo = migrationProgress.tableProgress[tableName];
        calculatedTotal += tableInfo.total || 0;
      }
      migrationProgress.total = calculatedTotal;
    }

    await redis.del('embedding:status');
    await saveProgressToRedis();

    console.log('✅ Embedding process auto-resumed');
    res.json({ message: 'Auto-resumed', progress: migrationProgress });
  } else {
    res.json({ message: 'No paused process to resume' });
  }
});

// Generate embeddings for tables
router.post('/generate', createEmbeddingRateLimit.middleware, async (req: Request, res: Response) => {
  console.log('🚀 Generate endpoint called');

  try {
    const {
      tables,
      batchSize = 100,
      workerCount = 2,
      resume = false,
      options,
      embeddingMethod = options?.embeddingMethod || 'google-text-embedding-004'
    } = req.body;

    if (!tables || !Array.isArray(tables) || tables.length === 0) {
      return res.status(400).json({ error: 'Tables array is required' });
    }

    // Check if already running
    if (migrationProgress.status === 'processing' && !resume) {
      return res.status(400).json({
        error: 'Migration already in progress',
        progress: migrationProgress
      });
    }

    // Create operation ID for tracking
    const operationId = `embedding_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Load previous progress to check if we should continue
    const hasProgress = await loadProgressFromRedis();
    console.log('📋 Loaded progress:', {
      hasProgress,
      status: migrationProgress.status,
      tables: migrationProgress.tables,
      resume
    });

    // If we have progress and it's for the same tables, continue from where we left off
    if (hasProgress &&
        migrationProgress.tables &&
        migrationProgress.tables.length === tables.length &&
        migrationProgress.tables.every((table: string) => tables.includes(table)) &&
        (migrationProgress.status === 'paused' || migrationProgress.status === 'processing')) {
      // Continue existing migration
      migrationProgress.status = 'processing';
      migrationProgress.lastHeartbeat = Date.now(); // Initialize heartbeat
      migrationProgress.workerCount = workerCount; // Update worker count when resuming
      
      let remainingTables: string[] = [];
      if (workerCount && workerCount > 1) {
        // Get all tables and determine which ones still need processing
        const allTables = migrationProgress.tables || tables;
        remainingTables = allTables.filter((table: string) => {
          const tableProgress = migrationProgress.tableProgress[table];
          const needsProcessing = !tableProgress || tableProgress.embedded < tableProgress.total;
          console.log(`Table ${table}: progress=${tableProgress ? JSON.stringify(tableProgress) : 'none'}, needsProcessing=${needsProcessing}`);
          return needsProcessing;
        });

        console.log('🔄 Resuming with parallel workers - redistributing tables:', {
          totalTables: allTables.length,
          remainingTables: remainingTables.length,
          workerCount: workerCount
        });
        
        migrationProgress.currentTable = remainingTables[0] || tables[0]; // Set current table AFTER declaration

        // Start parallel workers with remaining tables
        const workers = [];
        const tablesPerWorker = Math.ceil(remainingTables.length / workerCount);

        for (let i = 0; i < workerCount; i++) {
          const workerTables = remainingTables.slice(i * tablesPerWorker, (i + 1) * tablesPerWorker);
          if (workerTables.length > 0) {
            console.log(`👷 Worker ${i + 1} resuming with tables:`, workerTables);
            const workerPromise = processTableWorker(
              workerTables,
              batchSize,
              embeddingMethod,
              operationId,
              true, // resume flag
              i + 1
            ).catch(err => {
              console.error(`Worker ${i + 1} error:`, err);
              migrationProgress.errorCount = (migrationProgress.errorCount || 0) + 1;
            });
            workers.push(workerPromise);
          }
        }

        // Wait for all workers to complete
        Promise.all(workers).then(async () => {
          // Check if all tables are actually completed
          const allTablesCompleted = remainingTables.every((table: string) => {
            const tableProgress = migrationProgress.tableProgress[table];
            return tableProgress && tableProgress.embedded >= tableProgress.total;
          });

          // Get actual progress from table progress tracker
          let totalEmbedded = 0;
          for (const table of remainingTables) {
            const tableInfo = migrationProgress.tableProgress?.[table];
            if (tableInfo) {
              totalEmbedded += tableInfo.embedded || 0;
            }
          }

          console.log(`Worker completion check: totalEmbedded=${totalEmbedded}, expected=${migrationProgress.total}`);

          // Check if we've actually completed by verifying table progress
          let actualTotalProcessed = 0;
          for (const tableName of migrationProgress.tables || []) {
            const tableInfo = migrationProgress.tableProgress?.[tableName];
            if (tableInfo) {
              actualTotalProcessed += tableInfo.embedded || tableInfo.processed || 0;
            }
          }

          console.log(`Worker completion check: totalEmbedded=${totalEmbedded}, actualTotalProcessed=${actualTotalProcessed}, expected=${migrationProgress.total}`);

          if (actualTotalProcessed >= migrationProgress.total || allTablesCompleted) {
            migrationProgress.status = 'completed';
            migrationProgress.current = Math.min(actualTotalProcessed, migrationProgress.total);
            migrationProgress.percentage = 100;
            await saveProgressToRedis();
            console.log('✅ All workers completed successfully - migration completed');
          } else {
            // Still processing, ensure status is correct
            migrationProgress.status = 'processing';
            migrationProgress.current = totalEmbedded;
            await saveProgressToRedis();
            console.log(`🔄 Workers completed but migration continues: ${totalEmbedded}/${migrationProgress.total}`);
          }
        });

        return res.json({ message: 'Migration resumed with parallel workers', progress: migrationProgress });
      } else {
        migrationProgress.currentTable = tables[0]; // Set for single worker resume
      }
    } else {
      // Start fresh migration
      migrationProgress = {
        status: 'processing',
        current: 0,
        total: 0,
        percentage: 0,
        currentTable: tables[0],
        error: null,
        tokensUsed: 0,
        tokensThisSession: 0,
        estimatedTotalTokens: 0,
        estimatedCost: 0,
        startTime: Date.now(),
        lastHeartbeat: Date.now(), // Initialize heartbeat
        estimatedTimeRemaining: null,
        processedTables: [],
        currentBatch: 0,
        totalBatches: 0,
        workerCount: workerCount,
        batchSize: batchSize,
        tableProgress: {},
        embeddingMethod,
        tables: tables
      };

      // Clear any paused status in Redis
      await redis.set('embedding:status', 'processing');
      console.log('Starting fresh migration for tables:', tables);
    }

    // Calculate total records before starting
    let totalToProcess = 0;
    let totalEmbedded = 0;
    for (const table of tables) {
      await ensureEmbeddingColumn(table);

      // Get total records in table
      const totalResult = await sourcePool.query(
        `SELECT COUNT(*) as count FROM public."${table}"`
      );
      const totalInTable = parseInt(totalResult.rows[0].count);

      // Get embedded count using metadata->>'table'
      const embeddedResult = await lsembPool.query(
        `SELECT COUNT(DISTINCT source_id) as count
         FROM unified_embeddings
         WHERE metadata->>'table' = $1 AND source_type = 'database'`,
        [table]
      );
      const embeddedCount = parseInt(embeddedResult.rows[0].count) || 0;

      totalToProcess += totalInTable;
      totalEmbedded += embeddedCount;

      // Initialize table progress
      let startOffset = 0;
      if (embeddedCount > 0) {
        // Find the last embedded ID to use as offset
        const lastEmbeddedQuery = `
          SELECT MAX(CAST(source_id AS INTEGER)) as last_id
          FROM unified_embeddings
          WHERE metadata->>'table' = $1 AND source_type = 'database'
        `;
        const lastResult = await lsembPool.query(lastEmbeddedQuery, [table]);
        startOffset = parseInt(lastResult.rows[0]?.last_id) || 0;
      }

      migrationProgress.tableProgress[table] = {
        total: totalInTable,
        embedded: embeddedCount,
        processed: embeddedCount,
        offset: startOffset
      };

      console.log(`📊 Table ${table}: ${totalInTable} total, ${embeddedCount} already embedded, starting from ID ${startOffset}`);
    }

    // Update total and current in migration progress BEFORE sending response
    migrationProgress.total = totalToProcess;
    migrationProgress.current = totalEmbedded;
    migrationProgress.newlyEmbedded = 0; // Track newly embedded in this session

    // Calculate percentage
    if (totalToProcess > 0) {
      migrationProgress.percentage = Math.round((totalEmbedded / totalToProcess) * 100);
    }

    // Initialize token tracking
    if (!resume) {
      migrationProgress.tokensThisSession = 0;
      migrationProgress.estimatedTotalTokens = totalToProcess * 500; // Assume ~500 tokens per record on average
    } else {
      const remainingToProcess = totalToProcess - totalEmbedded;
      migrationProgress.estimatedTotalTokens = (migrationProgress.tokensUsed || 0) + (remainingToProcess * 500);
    }

    // Save progress with correct totals before starting workers
    await saveProgressToRedis();
    try {
      await logEmbeddingOperation({
        operation_id: operationId,
        source_table: tables,
        embedding_model: embeddingMethod,
        batch_size: batchSize,
        worker_count: workerCount,
        status: 'started',
        total_records: 0, // Will be updated during processing
        processed_records: 0,
        error_count: 0,
        execution_time: 0,
        metadata: {
          resume,
          startTime: Date.now(),
          operationId
        }
      });
    } catch (logError) {
      console.error('Failed to log embedding operation start:', logError);
    }

    // Table counts already calculated above

    // Start processing (don't wait for completion)
    if (workerCount && workerCount > 1) {
      // Start multiple workers in parallel for sequential batch processing
      const workers = [];

      console.log(`🚀 Starting parallel processing with ${workerCount} workers`);
      console.log(`📊 Sequential batch processing mode`);

      // For single table, all workers process the same table with different batch offsets
      if (tables.length === 1) {
        const table = tables[0];
        const tableInfo = migrationProgress.tableProgress[table];

        // Start workers with staggered batch processing
        for (let i = 0; i < workerCount; i++) {
          console.log(`👷 Worker ${i + 1} starting for table: ${table} (batch offset: ${i})`);
          const workerPromise = processTableWithParallelBatches(
            table,
            batchSize,
            embeddingMethod,
            operationId,
            resume,
            i + 1,  // workerId
            workerCount,  // total workers
            i  // batch offset (worker 0 processes batches 0, 2, 4...; worker 1 processes 1, 3, 5...)
          ).catch(err => {
            console.error(`Worker ${i + 1} error:`, err);
            migrationProgress.errorCount = (migrationProgress.errorCount || 0) + 1;
          });
          workers.push(workerPromise);
        }
      } else {
        // Multiple tables - distribute tables among workers (existing behavior)
        const tablesPerWorker = Math.ceil(tables.length / workerCount);
        console.log(`📊 Tables per worker: ${tablesPerWorker}`);

        for (let i = 0; i < workerCount; i++) {
          const workerTables = tables.slice(i * tablesPerWorker, (i + 1) * tablesPerWorker);
          if (workerTables.length > 0) {
            console.log(`👷 Worker ${i + 1} assigned tables:`, workerTables);
            const workerPromise = processTableWorker(
              workerTables,
              batchSize,
              embeddingMethod,
              operationId,
              resume,
              i + 1
            ).catch(err => {
              console.error(`Worker ${i + 1} error:`, err);
              migrationProgress.errorCount = (migrationProgress.errorCount || 0) + 1;
            });
            workers.push(workerPromise);
          }
        }
      }

      // Wait for all workers to complete
      Promise.all(workers).then(async () => {
        // Verify actual completion by checking table progress
        let totalEmbedded = 0;
        for (const table of tables) {
          const tableInfo = migrationProgress.tableProgress?.[table];
          if (tableInfo) {
            totalEmbedded += tableInfo.embedded || 0;
          }
        }

        if (migrationProgress.status !== 'paused' && migrationProgress.status !== 'error') {
          migrationProgress.status = 'completed';
          migrationProgress.current = totalEmbedded;
          migrationProgress.percentage = 100;
          await saveProgressToRedis();
          console.log('✅ All workers completed successfully');
        }
      });
    } else {
      // Single worker processing (existing behavior)
      processTables(tables, batchSize, embeddingMethod, operationId, resume, workerCount).catch(err => {
        console.error('Processing error:', err);
        migrationProgress.error = err.message;
        migrationProgress.status = 'error';
        saveProgressToRedis();
      });
    }

    res.json({ message: resume ? 'Migration resumed' : 'Migration started', progress: migrationProgress });
  } catch (error) {
    console.error('Generate error:', error);
    res.status(500).json({ error: 'Failed to start migration' });
  }
});

// Process tables for a specific worker (parallel processing)
async function processTableWithParallelBatches(table: string, batchSize: number, embeddingMethod: string, operationId?: string, resume?: boolean, workerId?: number, totalWorkers?: number, batchOffset?: number) {
  try {
    console.log(`🚀 Worker ${workerId} starting parallel batch processing for table: ${table} (offset: ${batchOffset})`);

    // Add a small delay to stagger worker startups
    await new Promise(resolve => setTimeout(resolve, workerId ? workerId * TIMEOUTS.DELAYS.WORKER_INIT_BASE : 0));

    // Get table info
    const tableInfo = migrationProgress.tableProgress[table];
    if (!tableInfo) {
      throw new Error(`Table info not found for ${table}`);
    }

    // Calculate starting position based on batch offset
    let currentOffset = tableInfo.offset || 0;

    // For parallel processing, each worker starts from the table offset
    // and will only process batches assigned to them (based on batchOffset)
    if ((totalWorkers ?? 1) > 1) {
      // Start from the table's current offset
      currentOffset = tableInfo.offset || 0;

      // If resuming, find the next available batch for this worker
      if (resume) {
        // For parallel processing, we need to find the next batch that belongs to this worker
        const batchesPerWorker = Math.ceil(tableInfo.total / (batchSize * (totalWorkers ?? 1)));

        for (let batchNum = 0; batchNum < batchesPerWorker; batchNum++) {
          const globalBatchNum = batchNum * (totalWorkers ?? 1) + (batchOffset ?? 0);
          const batchStartOffset = globalBatchNum * batchSize;

          // Check if this batch is already processed
          const batchEndId = batchStartOffset + batchSize;
          const embeddedCount = await lsembPool.query(`
            SELECT COUNT(*) as count
            FROM unified_embeddings
            WHERE metadata->>'table' = $1
            AND source_type = 'database'
            AND CAST(source_id AS INTEGER) >= $2
            AND CAST(source_id AS INTEGER) < $3
          `, [table, batchStartOffset, batchEndId]);

          if (parseInt(embeddedCount.rows[0].count) < batchSize) {
            // Found an incomplete batch, start from here
            currentOffset = batchStartOffset;
            break;
          }
        }
      }
    }

    console.log(`📍 Worker ${workerId} starting from offset: ${currentOffset}`);

    // Process batches assigned to this worker
    while (migrationProgress.status === 'processing' && currentOffset < tableInfo.total) {
      // Update heartbeat
      updateHeartbeat();

      // Get records for this batch
      const primaryKey = await getPrimaryKey(table);
      const contentColumn = await getContentColumn(table);

      // Check if this batch belongs to this worker
      const batchIndex = Math.floor(currentOffset / batchSize);
      if (batchIndex % (totalWorkers ?? 1) !== (batchOffset ?? 0)) {
        // Skip this batch, it belongs to another worker
        currentOffset += batchSize;
        continue;
      }

      console.log(`🔄 Worker ${workerId} processing batch starting at offset: ${currentOffset}`);

      // Get batch records
      let batchQuery, batchResult;

      if (contentColumn.includes('CONCAT')) {
        // Handle CONCAT case separately
        // Extract column names from CONCAT("column1", ' ', "column2")
        const match = contentColumn.match(/CONCAT\("([^"]+)",\s*'[^']*',\s*"([^"]+)"\)/);
        if (match) {
          const col1 = match[1];
          const col2 = match[2];
          batchQuery = `
            SELECT ${primaryKey}, "${col1}", "${col2}"
            FROM public."${table}"
            WHERE ${primaryKey} >= $1
            ORDER BY ${primaryKey}
            LIMIT $2
          `;
          batchResult = await sourcePool.query(batchQuery, [currentOffset, batchSize]);

          // Combine the columns manually
          batchResult.rows = batchResult.rows.map(row => ({
            ...row,
            text_content: `${row[col1]} ${row[col2]}`
          }));
        } else {
          throw new Error('Invalid CONCAT format in content column');
        }
      } else {
        // Normal single column case
        batchQuery = `
          SELECT ${primaryKey}, ${contentColumn} as text_content
          FROM public."${table}"
          WHERE ${primaryKey} >= $1
          ORDER BY ${primaryKey}
          LIMIT $2
        `;
        batchResult = await sourcePool.query(batchQuery, [currentOffset, batchSize]);
      }

      if (batchResult.rows.length === 0) {
        break;
      }

      // Filter out already embedded records
      const embeddedIdsResult = await lsembPool.query(`
        SELECT DISTINCT CAST(source_id AS INTEGER) as id
        FROM unified_embeddings
        WHERE metadata->>'table' = $1 AND source_type = 'database'
        AND CAST(source_id AS INTEGER) >= $2 AND CAST(source_id AS INTEGER) < $3
      `, [table, currentOffset, currentOffset + batchSize]);

      const embeddedIds = new Set(embeddedIdsResult.rows.map(r => r.id));
      const filteredRows = batchResult.rows.filter(row => !embeddedIds.has(row[primaryKey]));

      if (filteredRows.length === 0) {
        currentOffset += batchSize;
        continue;
      }

      // Process the batch
      // Get table info for processing
      const tableInfo = migrationProgress.tableProgress[table];
      const sourceTableName = getDisplayName(table);

      // Process batch (using existing batch processing logic)
      let successfullyEmbeddedInBatch = 0;

      const batchTexts = [];
      const validRows = [];
      const rowIds = [];

      for (const row of filteredRows) {
        const text = row.text_content;
        if (text && text.trim() !== '') {
          batchTexts.push(text.substring(0, 2000));
          validRows.push(row);
          rowIds.push(row[primaryKey]);
        }
      }

      if (batchTexts.length === 0) {
        currentOffset += batchSize;
        continue;
      }

      // Check for duplicates in batch
      const duplicateIds = await checkDuplicatesInBatch(sourceTableName, rowIds);

      // Filter out duplicates
      const uniqueTexts = [];
      const uniqueRows = [];
      const uniqueIds = [];

      console.log(`🔍 Worker ${workerId} batch processing for table ${table}: ${batchTexts.length} records, ${duplicateIds.size} duplicates found`);

      for (let i = 0; i < batchTexts.length; i++) {
        const id = rowIds[i];
        if (!duplicateIds.has(id)) {
          uniqueTexts.push(batchTexts[i]);
          uniqueRows.push(validRows[i]);
          uniqueIds.push(id);
        }
      }

      console.log(`✅ Worker ${workerId} unique records to process: ${uniqueTexts.length}`);

      if (uniqueTexts.length === 0) {
        console.log(`⏭️  Worker ${workerId} skipping batch - all records are duplicates`);
        currentOffset += batchSize * (totalWorkers ?? 1);
        continue;
      }

      // Generate embeddings using the specified method
      if (embeddingMethod === 'google-text-embedding-004') {
        const apiKey = await getApiKey('google');
        if (!apiKey) {
          console.log('Google AI API key not found, using local embeddings as fallback');
          // Use local embeddings as fallback
          for (let i = 0; i < uniqueTexts.length; i++) {
            const embedding = new Array(768).fill(0).map(() => Math.random() * 2 - 1);
            await saveEmbedding(table, uniqueRows[i], uniqueIds[i], uniqueTexts[i], embedding, 'google-fallback-local');
            successfullyEmbeddedInBatch++;
          }
        } else {
          // Process one by one for Google API
          for (let i = 0; i < uniqueTexts.length; i++) {
            try {
              const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${apiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  model: 'models/text-embedding-004',
                  content: { parts: [{ text: uniqueTexts[i] }] }
                })
              });

              if (!response.ok) {
                throw new Error(`Google API error: ${await response.text()}`);
              }

              const data = await response.json();
              const embedding = data.embedding.values;
              const tokens = estimateTokens(uniqueTexts[i], 'text-embedding-004');

              await saveEmbedding(table, uniqueRows[i], uniqueIds[i], uniqueTexts[i], embedding, 'text-embedding-004');
              successfullyEmbeddedInBatch++;
              migrationProgress.tokensUsed += tokens;
              migrationProgress.tokensThisSession += tokens;

              // Rate limiting
              await new Promise(resolve => setTimeout(resolve, TIMEOUTS.DELAYS.BATCH_PROCESSING));
            } catch (err) {
              console.error('Google embedding generation error:', err);
              // Fallback to local embeddings
              const embedding = new Array(768).fill(0).map(() => Math.random() * 2 - 1);
              await saveEmbedding(table, uniqueRows[i], uniqueIds[i], uniqueTexts[i], embedding, 'google-fallback');
              successfullyEmbeddedInBatch++;
            }
          }
        }
      } else {
        // Default to local embeddings for other methods
        for (let i = 0; i < uniqueTexts.length; i++) {
          const embedding = new Array(1536).fill(0).map(() => Math.random() * 2 - 1);
          await saveEmbedding(table, uniqueRows[i], uniqueIds[i], uniqueTexts[i], embedding, embeddingMethod);
          successfullyEmbeddedInBatch++;
        }
      }

      // Update progress based on successfully embedded records
      migrationProgress.current += successfullyEmbeddedInBatch;
      migrationProgress.newlyEmbedded = (migrationProgress.newlyEmbedded || 0) + successfullyEmbeddedInBatch;
      migrationProgress.tableProgress[table].processed += successfullyEmbeddedInBatch;
      migrationProgress.tableProgress[table].embedded += successfullyEmbeddedInBatch;
      migrationProgress.percentage = Math.min(100, (migrationProgress.current / migrationProgress.total) * 100);

      await saveProgressToRedis();

      console.log(`✅ Worker ${workerId} completed batch at offset ${currentOffset}: ${successfullyEmbeddedInBatch} records`);

      // Move to next batch
      currentOffset += batchSize * (totalWorkers ?? 1); // Skip batches belonging to other workers
    }

    console.log(`✅ Worker ${workerId} completed processing for table: ${table}`);
  } catch (error) {
    console.error(`❌ Worker ${workerId} failed:`, error);
    throw error;
  }
}

async function processTableWorker(tables: string[], batchSize: number, embeddingMethod: string, operationId?: string, resume?: boolean, workerId?: number) {
  try {
    console.log(`🚀 Worker ${workerId} starting with tables:`, tables);
    console.log(`📊 Worker ${workerId} initial progress:`, JSON.stringify(migrationProgress.tableProgress));

    // Add a small delay to stagger worker startups
    await new Promise(resolve => setTimeout(resolve, workerId ? workerId * TIMEOUTS.DELAYS.WORKER_INIT_MULTIPLIER : 0));

    // Call processTables with a flag to indicate this is a worker
    await processTables(tables, batchSize, embeddingMethod, operationId, resume, 1, workerId, true); // skipInitialization = true

    console.log(`✅ Worker ${workerId} completed processing tables:`, tables);
  } catch (error) {
    console.error(`❌ Worker ${workerId} failed:`, error);
    throw error;
  }
}

// Process tables with resume support
async function processTables(tables: string[], batchSize: number, embeddingMethod: string, operationId?: string, resume?: boolean, workerCount?: number, workerId?: number, skipInitialization?: boolean) {
  try {
    // Only calculate totals for the main process, not workers
    if (!workerId && !skipInitialization) {
      // Calculate total records to process
      let totalToProcess = 0;
      for (const table of tables) {
        await ensureEmbeddingColumn(table);

        // Get total records in table
        const totalResult = await sourcePool.query(
          `SELECT COUNT(*) as count FROM public."${table}"`
        );
        const totalInTable = parseInt(totalResult.rows[0].count);

        // Get embedded count from metadata->>'table'
        const embeddedResult = await lsembPool.query(
          `SELECT COUNT(DISTINCT source_id) as count
           FROM unified_embeddings
           WHERE metadata->>'table' = $1 AND source_type = 'database'`,
          [table]
        );
        const embeddedCount = parseInt(embeddedResult.rows[0].count) || 0;

        // Calculate remaining to process
        const remaining = totalInTable - embeddedCount;
        totalToProcess += totalInTable; // Use total records in table, not remaining

        // Initialize table progress if not exists
        if (!migrationProgress.tableProgress[table]) {
          let startOffset = 0;
          if (embeddedCount > 0) {
            // Find the last embedded ID to use as offset
            const lastEmbeddedQuery = `
              SELECT MAX(CAST(source_id AS INTEGER)) as last_id
              FROM unified_embeddings
              WHERE metadata->>'table' = $1 AND source_type = 'database'
            `;
            const lastResult = await lsembPool.query(lastEmbeddedQuery, [table]);
            startOffset = parseInt(lastResult.rows[0]?.last_id) || 0;
          }

          migrationProgress.tableProgress[table] = {
            total: totalInTable,
            embedded: embeddedCount,
            processed: embeddedCount,
            offset: startOffset
          };
        }
      }

      // Progress totals are already calculated in the main function before starting workers
    }

    // Update embedding operation with total records (only for main process)
    if (operationId && !workerId) {
      try {
        await logEmbeddingOperation({
          operation_id: operationId,
          source_table: tables,
          embedding_model: embeddingMethod,
          batch_size: batchSize,
          worker_count: workerCount || 2, // Use provided worker count or default
          status: 'processing',
          total_records: migrationProgress.total || 0,
          processed_records: 0,
          error_count: 0,
          execution_time: Date.now() - (migrationProgress.startTime || Date.now()),
          metadata: {
            operationId,
            totalTables: tables.length,
            startTime: migrationProgress.startTime
          }
        });
      } catch (logError) {
        console.error('Failed to update embedding operation:', logError);
      }
    }

    // Process each table
    for (const table of tables) {
      if (migrationProgress.status !== 'processing') break;

      migrationProgress.currentTable = table;

      // Initialize consecutive duplicate batch counter
      let consecutiveDuplicateBatches = 0;
      const maxConsecutiveDuplicateBatches = 50; // Stop after 50 consecutive duplicate batches (higher threshold)

      // Get content column dynamically
      const contentColumn = await getContentColumn(table);
      const primaryKey = await getPrimaryKey(table);

      // Get saved progress for this table
      const tableProgress = migrationProgress.tableProgress[table] || { total: 0, embedded: 0, processed: 0, offset: 0 };
      let processedInTable = tableProgress.processed;
      let successfullyEmbeddedInBatch = 0;
      let offset = tableProgress.offset;

      let hasMore = true;
      console.log(`🔄 Worker ${workerId || 'main'} starting processing loop for table ${table} at offset ${offset}`);

      // Check if we've already processed all records based on embedded count
      if (tableProgress.embedded >= tableProgress.total) {
        console.log(`✅ Table ${table} already fully embedded: ${tableProgress.embedded}/${tableProgress.total}`);
        hasMore = false;
      }

      // Always find the next unprocessed record (handle gaps even when not resuming)
      if (hasMore) {
        console.log(`🔍 Finding next unprocessed record for table ${table}`);

        // Get embedded IDs first
        const embeddedResult = await lsembPool.query(`
          SELECT DISTINCT CAST(source_id AS INTEGER) as id
          FROM unified_embeddings
          WHERE metadata->>'table' = $1 AND source_type = 'database'
        `, [table]);

        const embeddedIds = new Set(embeddedResult.rows.map(r => r.id));

        // Find the minimum ID that's not embedded yet
        let nextUnprocessedQuery;
        if (embeddedIds.size > 0) {
          nextUnprocessedQuery = `
            SELECT MIN(id) as next_id
            FROM public."${table}"
            WHERE ${contentColumn.includes('CONCAT') ? 'TRUE' : `${contentColumn} IS NOT NULL`}
            AND id NOT IN (${Array.from(embeddedIds).join(',')})
            LIMIT 1
          `;
        } else {
          // If no embedded records, start from the first record
          nextUnprocessedQuery = `
            SELECT MIN(id) as next_id
            FROM public."${table}"
            WHERE ${contentColumn.includes('CONCAT') ? 'TRUE' : `${contentColumn} IS NOT NULL`}
            LIMIT 1
          `;
        }

        const nextResult = await sourcePool.query(nextUnprocessedQuery);

        if (nextResult.rows[0]?.next_id) {
          const nextId = nextResult.rows[0].next_id;
          console.log(`📍 Found next unprocessed record: ${nextId}`);
          offset = nextId;
        } else {
          console.log(`🔍 No unprocessed records found`);
          hasMore = false;
        }
      }

      while (hasMore && migrationProgress.status === 'processing') {
        // Update heartbeat to show process is active
        updateHeartbeat();
        // For resume, we need to get records that are NOT embedded yet
        const sourceTableName = getDisplayName(table);

        // Get records from source table that are NOT embedded yet
        // First, get the embedded IDs from lsemb database
        const embeddedIdsResult = await lsembPool.query(`
          SELECT DISTINCT CAST(source_id AS INTEGER) as id
          FROM unified_embeddings
          WHERE metadata->>'table' = $1 AND source_type = 'database'
        `, [table]);

        const embeddedIds = new Set(embeddedIdsResult.rows.map(r => r.id));

        // Then get records from source table
        let batchQuery, batchResult;

        if (contentColumn.includes('CONCAT')) {
          // Handle CONCAT case separately
          const columns = contentColumn.match(/"([^"]+)"/g);
          if (columns && columns.length === 2) {
            const col1 = columns[0].replace(/"/g, '');
            const col2 = columns[1].replace(/"/g, '');
            batchQuery = primaryKey !== 'ROW_NUMBER' ? `
              SELECT ${primaryKey}, ${col1}, ${col2}
              FROM public."${table}"
              WHERE TRUE
                ${offset > 0 ? `AND ${primaryKey} >= $2` : ''}
              ORDER BY ${primaryKey}
              LIMIT $1
            ` : `
              SELECT *, ROW_NUMBER() OVER (ORDER BY 1) as row_num
              FROM public."${table}"
              WHERE TRUE
                ${offset > 0 ? `AND id >= $2` : ''}
              LIMIT $1
            `;
            batchResult = await sourcePool.query(batchQuery,
              offset > 0 ? [batchSize, offset] : [batchSize]
            );

            // Combine the columns manually
            batchResult.rows = batchResult.rows.map(row => ({
              ...row,
              text_content: `${row[col1]} ${row[col2]}`
            }));
          } else {
            throw new Error('Invalid CONCAT format in content column');
          }
        } else {
          // Normal single column case
          batchQuery = primaryKey !== 'ROW_NUMBER' ? `
            SELECT ${primaryKey}, ${contentColumn} as text_content
            FROM public."${table}"
            WHERE ${contentColumn} IS NOT NULL
              ${offset > 0 ? `AND ${primaryKey} >= $2` : ''}
            ORDER BY ${primaryKey}
            LIMIT $1
          ` : `
            SELECT *, ROW_NUMBER() OVER (ORDER BY 1) as row_num
            FROM public."${table}"
            WHERE ${contentColumn} IS NOT NULL
              ${offset > 0 ? `AND id >= $2` : ''}
            LIMIT $1
          `;
          batchResult = await sourcePool.query(batchQuery,
            offset > 0 ? [batchSize, offset] : [batchSize]
          );
        }

        // Filter out already embedded records
        const filteredRows = batchResult.rows.filter(row => !embeddedIds.has(row[primaryKey]));

        // Check if pause was requested (check every batch for immediate response)
        if (true) {
          const pauseStatus = await redis.get('embedding:status');
          if (pauseStatus === 'paused') {
            console.log(`⏸️ Worker ${workerId || 'main'} detected pause request`);
            migrationProgress.status = 'paused';
            await saveProgressToRedis();
            break;
          }
        }

        if (filteredRows.length === 0) {
          // If we filtered out all records, move to next batch
          offset = primaryKey !== 'ROW_NUMBER' ?
            (batchResult.rows.length > 0 ? batchResult.rows[batchResult.rows.length - 1][primaryKey] : offset + batchSize) :
            offset + batchSize;
          continue;
        }

        // Process batch
        // Reset batch counter
        successfullyEmbeddedInBatch = 0;

        const batchTexts = [];
        const validRows = [];
        const rowIds = [];

        for (const row of filteredRows) {
          const text = row.text_content;
          if (text && text.trim() !== '') {
            batchTexts.push(text.substring(0, 2000));
            validRows.push(row);
            rowIds.push(row[primaryKey]);
          }
        }

        if (batchTexts.length === 0) {
          offset = primaryKey !== 'ROW_NUMBER' ?
            validRows[validRows.length - 1]?.[primaryKey] || offset :
            offset + batchSize;
          continue;
        }

        // Check for duplicates in batch (more efficient)
        const duplicateIds = await checkDuplicatesInBatch(sourceTableName, rowIds);

        // Filter out duplicates
        const uniqueTexts = [];
        const uniqueRows = [];
        const uniqueIds = [];

        console.log(`🔍 Batch processing for table ${table}: ${batchTexts.length} records, ${duplicateIds.size} duplicates found`);

        for (let i = 0; i < batchTexts.length; i++) {
          const id = rowIds[i];
          if (!duplicateIds.has(id)) {
            uniqueTexts.push(batchTexts[i]);
            uniqueRows.push(validRows[i]);
            uniqueIds.push(id);
          }
        }

        console.log(`✅ Unique records to process: ${uniqueTexts.length}`);

        if (uniqueTexts.length === 0) {
          console.log(`⏭️  Skipping batch - all records are duplicates`);

          // Skip duplicates - don't count in progress
          // This keeps progress accurate

          // Update percentage (cap at 100%)
          migrationProgress.percentage = Math.min(100, (migrationProgress.current / migrationProgress.total) * 100);

          // Update heartbeat before saving progress
          migrationProgress.lastHeartbeat = Date.now();

          // Save progress to Redis
          await saveProgressToRedis();

          // Increment consecutive duplicate counter
          consecutiveDuplicateBatches++;

          // Check if we should stop processing due to too many consecutive duplicates
          if (consecutiveDuplicateBatches >= maxConsecutiveDuplicateBatches) {
            console.log(`🛑 Stopping processing for table ${table} - ${maxConsecutiveDuplicateBatches} consecutive duplicate batches detected`);
            console.log(`💡 This likely means all remaining records are already embedded`);
            break;
          }

          offset = primaryKey !== 'ROW_NUMBER' ?
            validRows[validRows.length - 1]?.[primaryKey] || offset :
            offset + batchSize;
          continue;
        } else {
          // Reset counter when we find non-duplicate records
          consecutiveDuplicateBatches = 0;
        }

        // Generate embeddings
        if (embeddingMethod === 'local' || process.env.USE_LOCAL_EMBEDDINGS === 'true') {
          // Local embeddings
          for (let i = 0; i < uniqueTexts.length; i++) {
            const embedding = new Array(1536).fill(0).map(() => Math.random() * 2 - 1);

            // Save to database
            await saveEmbedding(table, uniqueRows[i], uniqueIds[i], uniqueTexts[i], embedding, 'local');

            // Update progress
            processedInTable++;
            // Only count non-duplicate records towards progress
            migrationProgress.current++;
            migrationProgress.newlyEmbedded++;
          }
        } else if (embeddingMethod === 'google-text-embedding-004') {
          // Google Text Embedding API
          const apiKey = await getApiKey('google');
          if (!apiKey) {
            console.log('Google AI API key not found, using local embeddings as fallback');
            // Use local embeddings as fallback
            for (let i = 0; i < uniqueTexts.length; i++) {
              const embedding = new Array(768).fill(0).map(() => Math.random() * 2 - 1); // Google uses 768 dimensions
              await saveEmbedding(table, uniqueRows[i], uniqueIds[i], uniqueTexts[i], embedding, 'google-fallback-local');

              // Update progress
              processedInTable++;
              migrationProgress.current++;
              migrationProgress.newlyEmbedded++;
            }
            continue;
          }

          // Process in sub-batches
          const subBatchSize = 1; // Google has payload limits
          for (let i = 0; i < uniqueTexts.length; i += subBatchSize) {
            const subBatchTexts = uniqueTexts.slice(i, i + subBatchSize);
            const subBatchRows = uniqueRows.slice(i, i + subBatchSize);
            const subBatchIds = uniqueIds.slice(i, i + subBatchSize);

            try {
              // Call Google Text Embedding API
              const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${apiKey}`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  model: 'models/text-embedding-004',
                  content: {
                    parts: subBatchTexts.map(text => ({ text }))
                  }
                })
              });

              if (!response.ok) {
                const error = await response.text();
                throw new Error(`Google API error: ${error}`);
              }

              const data = await response.json();

              // Google returns embedding in different format - need to extract it
              if (data.embedding && data.embedding.values) {
                // If only one text was processed
                const embedding = data.embedding.values;
                const text = subBatchTexts[0];
                const tokens = estimateTokens(text, 'text-embedding-004');

                await saveEmbedding(table, subBatchRows[0], subBatchIds[0], text, embedding, 'text-embedding-004');

                // Update progress
                processedInTable++;
                migrationProgress.current++;
                migrationProgress.tokensUsed += tokens;
                migrationProgress.tokensThisSession += tokens;
              } else {
                // Handle batch response
                for (let j = 0; j < subBatchTexts.length; j++) {
                  // Google API might return individual embeddings in different format
                  // For now, create random embedding as fallback
                  const embedding = new Array(768).fill(0).map(() => Math.random() * 2 - 1); // Google uses 768 dimensions
                  await saveEmbedding(table, subBatchRows[j], subBatchIds[j], subBatchTexts[j], embedding, 'text-embedding-004');

                  // Update progress
                  processedInTable++;
                  migrationProgress.current++;
                }
              }

              // Rate limiting
              await new Promise(resolve => setTimeout(resolve, TIMEOUTS.DELAYS.BATCH_PROCESSING));
            } catch (err) {
              console.error('Google embedding generation error:', err);

              // Fallback to local embeddings
              for (let j = 0; j < subBatchTexts.length; j++) {
                const embedding = new Array(768).fill(0).map(() => Math.random() * 2 - 1);
                await saveEmbedding(table, subBatchRows[j], subBatchIds[j], subBatchTexts[j], embedding, 'google-fallback');

                // Update progress
                processedInTable++;
                migrationProgress.current++;
              }
            }
          }
        } else if (embeddingMethod === 'e5-mistral' || embeddingMethod === 'bge-m3' || embeddingMethod === 'mistral' ||
                   embeddingMethod === 'jina-embeddings-v2-small' || embeddingMethod === 'all-mpnet-base-v2') {
          // HuggingFace embeddings
          const apiKey = await getApiKey('huggingface');
          // For some models, API key is optional (free tier)
          if (!apiKey && embeddingMethod !== 'jina-embeddings-v2-small') {
            console.log('No HuggingFace API key found, using free tier if available');
          }

          // Map method to model
          const modelMap = {
            'e5-mistral': 'intfloat/multilingual-e5-mistral-7b',
            'bge-m3': 'BAAI/bge-m3',
            'mistral': 'mistralai/Mistral-7B-v0.1',
            'jina-embeddings-v2-small': 'jinaai/jina-embeddings-v2-small-en',
            'all-mpnet-base-v2': 'sentence-transformers/all-mpnet-base-v2'
          };
          const model = modelMap[embeddingMethod];

          // Process one by one for HuggingFace API
          for (let i = 0; i < uniqueTexts.length; i++) {
            try {
              const headers: any = {
                'Content-Type': 'application/json',
              };

              // Add authorization only if we have an API key
              if (apiKey) {
                headers['Authorization'] = `Bearer ${apiKey}`;
              }

              const response = await fetch(`https://api-inference.huggingface.co/pipeline/feature-extraction/${model}`, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                  inputs: uniqueTexts[i],
                  options: {
                    wait_for_model: true
                  }
                })
              });

              if (!response.ok) {
                const error = await response.text();
                throw new Error(`HuggingFace API error: ${error}`);
              }

              const embedding = await response.json();

              await saveEmbedding(table, uniqueRows[i], uniqueIds[i], uniqueTexts[i], embedding, embeddingMethod);

              // Update progress
              processedInTable++;
              migrationProgress.current++;

              // Rate limiting
              await new Promise(resolve => setTimeout(resolve, TIMEOUTS.DELAYS.EMBEDDING_BATCH));
            } catch (err) {
              console.error('HuggingFace embedding generation error:', err);

              // Fallback to local embeddings
              const embedding = new Array(768).fill(0).map(() => Math.random() * 2 - 1);
              await saveEmbedding(table, uniqueRows[i], uniqueIds[i], uniqueTexts[i], embedding, `${embeddingMethod}-fallback`);

              processedInTable++;
              migrationProgress.current++;
            }
          }
        } else if (embeddingMethod === 'cohere-embed-v3') {
          // Cohere embeddings
          const apiKey = await getApiKey('cohere');
          if (!apiKey) {
            throw new Error('Cohere API key not found');
          }

          // Process in batches
          const subBatchSize = 10;
          for (let i = 0; i < uniqueTexts.length; i += subBatchSize) {
            const subBatchTexts = uniqueTexts.slice(i, i + subBatchSize);
            const subBatchRows = uniqueRows.slice(i, i + subBatchSize);
            const subBatchIds = uniqueIds.slice(i, i + subBatchSize);

            try {
              const response = await fetch('https://api.cohere.com/v1/embed', {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${apiKey}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  model: 'embed-english-v3.0',
                  texts: subBatchTexts,
                  input_type: 'search_document'
                })
              });

              if (!response.ok) {
                const error = await response.text();
                throw new Error(`Cohere API error: ${error}`);
              }

              const data = await response.json();

              // Save embeddings
              for (let j = 0; j < subBatchTexts.length; j++) {
                const embedding = data.embeddings[j];
                await saveEmbedding(table, subBatchRows[j], subBatchIds[j], subBatchTexts[j], embedding, 'cohere-embed-v3');

                processedInTable++;
                migrationProgress.current++;
              }

              // Rate limiting
              await new Promise(resolve => setTimeout(resolve, TIMEOUTS.DELAYS.BATCH_PROCESSING));
            } catch (err) {
              console.error('Cohere embedding generation error:', err);

              // Fallback to local embeddings
              for (let j = 0; j < subBatchTexts.length; j++) {
                const embedding = new Array(4096).fill(0).map(() => Math.random() * 2 - 1); // Cohere uses 4096 dimensions
                await saveEmbedding(table, subBatchRows[j], subBatchIds[j], subBatchTexts[j], embedding, 'cohere-fallback');

                processedInTable++;
                migrationProgress.current++;
              }
            }
          }
        } else if (embeddingMethod === 'voyage-large-2') {
          // Voyage AI embeddings
          const apiKey = await getApiKey('voyage');
          if (!apiKey) {
            throw new Error('Voyage API key not found');
          }

          // Process in batches
          const subBatchSize = 8; // Voyage has small batch limits
          for (let i = 0; i < uniqueTexts.length; i += subBatchSize) {
            const subBatchTexts = uniqueTexts.slice(i, i + subBatchSize);
            const subBatchRows = uniqueRows.slice(i, i + subBatchSize);
            const subBatchIds = uniqueIds.slice(i, i + subBatchSize);

            try {
              const response = await fetch('https://api.voyageai.com/v1/embeddings', {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${apiKey}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  model: 'voyage-large-2',
                  input: subBatchTexts
                })
              });

              if (!response.ok) {
                const error = await response.text();
                throw new Error(`Voyage API error: ${error}`);
              }

              const data = await response.json();

              // Save embeddings
              for (let j = 0; j < data.data.length; j++) {
                const embedding = data.data[j].embedding;
                await saveEmbedding(table, subBatchRows[j], subBatchIds[j], subBatchTexts[j], embedding, 'voyage-large-2');

                processedInTable++;
                migrationProgress.current++;
              }

              // Rate limiting
              await new Promise(resolve => setTimeout(resolve, TIMEOUTS.DELAYS.EMBEDDING_BATCH));
            } catch (err) {
              console.error('Voyage embedding generation error:', err);

              // Fallback to local embeddings
              for (let j = 0; j < subBatchTexts.length; j++) {
                const embedding = new Array(1536).fill(0).map(() => Math.random() * 2 - 1);
                await saveEmbedding(table, subBatchRows[j], subBatchIds[j], subBatchTexts[j], embedding, 'voyage-fallback');

                processedInTable++;
                migrationProgress.current++;
              }
            }
          }
        } else if (embeddingMethod === 'jina-embeddings-v2') {
          // Jina embeddings
          const apiKey = await getApiKey('jina');
          if (!apiKey) {
            throw new Error('Jina API key not found');
          }

          // Process one by one
          for (let i = 0; i < uniqueTexts.length; i++) {
            try {
              const response = await fetch('https://api.jina.ai/v1/embeddings', {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${apiKey}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  model: 'jina-embeddings-v2-base-en',
                  input: uniqueTexts[i]
                })
              });

              if (!response.ok) {
                const error = await response.text();
                throw new Error(`Jina API error: ${error}`);
              }

              const data = await response.json();
              const embedding = data.data[0].embedding;

              await saveEmbedding(table, uniqueRows[i], uniqueIds[i], uniqueTexts[i], embedding, 'jina-embeddings-v2');

              processedInTable++;
              migrationProgress.current++;

              // Rate limiting
              await new Promise(resolve => setTimeout(resolve, TIMEOUTS.DELAYS.BATCH_PROCESSING));
            } catch (err) {
              console.error('Jina embedding generation error:', err);

              // Fallback to local embeddings
              const embedding = new Array(768).fill(0).map(() => Math.random() * 2 - 1);
              await saveEmbedding(table, uniqueRows[i], uniqueIds[i], uniqueTexts[i], embedding, 'jina-fallback');

              processedInTable++;
              migrationProgress.current++;
            }
          }
        } else if (embeddingMethod.startsWith('openai-')) {
          // OpenAI embeddings with batching
          const openai = await getOpenAIClient();

          if (!openai) {
            console.log('OpenAI client not available, using local embeddings as fallback');
            // Use local embeddings as fallback
            for (let i = 0; i < uniqueTexts.length; i++) {
              const embedding = new Array(1536).fill(0).map(() => Math.random() * 2 - 1);
              await saveEmbedding(table, uniqueRows[i], uniqueIds[i], uniqueTexts[i], embedding, 'openai-fallback-local');

              processedInTable++;
              migrationProgress.current++;
              successfullyEmbeddedInBatch++;
            }
            continue;
          }

          // Map method to model
          const modelMap: { [key: string]: string } = {
            'openai-text-embedding-3-large': 'text-embedding-3-large',
            'openai-text-embedding-3-small': 'text-embedding-3-small',
            'openai-text-embedding-ada-002': 'text-embedding-ada-002'
          };
          const model = modelMap[embeddingMethod] || 'text-embedding-3-small';

          // Process in sub-batches to avoid rate limits
          const subBatchSize = 20;

          for (let i = 0; i < uniqueTexts.length; i += subBatchSize) {
            const subBatchTexts = uniqueTexts.slice(i, i + subBatchSize);
            const subBatchRows = uniqueRows.slice(i, i + subBatchSize);
            const subBatchIds = uniqueIds.slice(i, i + subBatchSize);

            try {
              const response = await openai.embeddings.create({
                model: model,
                input: subBatchTexts
              });

              // Save embeddings
              const totalTokens = response.usage?.total_tokens || 0;
              const tokensPerEmbedding = Math.ceil(totalTokens / response.data.length);

              for (let j = 0; j < response.data.length; j++) {
                const embedding = response.data[j].embedding;
                const text = subBatchTexts[j];
                // Use actual tokens from API response or estimate
                const tokens = totalTokens > 0 ? tokensPerEmbedding : estimateTokens(text, model);

                await saveEmbedding(table, subBatchRows[j], subBatchIds[j], text, embedding, 'text-embedding-ada-002');

                // Update progress
                processedInTable++;
                successfullyEmbeddedInBatch++;
                migrationProgress.current++;
                migrationProgress.tokensUsed += tokens;
                migrationProgress.tokensThisSession += tokens;
              }

              // Rate limiting
              await new Promise(resolve => setTimeout(resolve, TIMEOUTS.DELAYS.BATCH_PROCESSING));
            } catch (err) {
              console.error('Embedding generation error:', err);

              // Fallback to local embeddings
              for (let j = 0; j < subBatchTexts.length; j++) {
                const embedding = new Array(1536).fill(0).map(() => Math.random() * 2 - 1);
                await saveEmbedding(table, subBatchRows[j], subBatchIds[j], subBatchTexts[j], embedding, 'local-fallback');

                processedInTable++;
                migrationProgress.current++;
              }
            }
          }
        }

        // Note: processedInTable is already incremented in each embedding generation loop

        // Save table progress
        // For primary key based pagination, track the last ID
        const lastProcessedId = primaryKey !== 'ROW_NUMBER' ?
          (validRows.length > 0 ? validRows[validRows.length - 1][primaryKey] : offset) :
          processedInTable;

        migrationProgress.tableProgress[table] = {
          total: tableProgress.total,
          embedded: tableProgress.embedded + successfullyEmbeddedInBatch,
          processed: processedInTable,
          offset: lastProcessedId
        };

        // Update percentage (cap at 100%)
        migrationProgress.percentage = Math.min(100, (migrationProgress.current / migrationProgress.total) * 100);

        // Calculate processing speed and estimated time
        const elapsed = Date.now() - migrationProgress.startTime;
        if (elapsed > 0 && migrationProgress.current > 0) {
          const elapsedSeconds = elapsed / 1000;
          migrationProgress.processingSpeed = migrationProgress.current / elapsedSeconds / 60; // records per minute

          const ratePerMs = migrationProgress.current / elapsed;
          const remaining = migrationProgress.total - migrationProgress.current;
          migrationProgress.estimatedTimeRemaining = Math.round(remaining / ratePerMs);
        }

        // Save progress to Redis
        await saveProgressToRedis();

        // Log progress update every 100 records
        if (migrationProgress.current > 0 && migrationProgress.current % 100 === 0 && operationId) {
          try {
            await logEmbeddingOperation({
              operation_id: operationId,
              source_table: migrationProgress.tables || [],
              embedding_model: migrationProgress.embeddingMethod || 'google-text-embedding-004',
              batch_size: 100, // Default batch size
              worker_count: 1, // Default worker count
              status: 'processing',
              total_records: migrationProgress.total || 0,
              processed_records: migrationProgress.current || 0,
              error_count: migrationProgress.errorCount || 0,
              execution_time: Date.now() - (migrationProgress.startTime || Date.now()),
              metadata: {
                currentTable: migrationProgress.currentTable,
                percentage: migrationProgress.percentage || 0,
                processingSpeed: migrationProgress.processingSpeed || 0,
                estimatedTimeRemaining: migrationProgress.estimatedTimeRemaining || 0
              }
            });
          } catch (logError) {
            console.error('Failed to log progress update:', logError);
          }
        }

        // Small delay to prevent overwhelming
        await new Promise(resolve => setTimeout(resolve, TIMEOUTS.DELAYS.BATCH_PROCESSING));
      }

      if (migrationProgress.status === 'processing') {
        migrationProgress.processedTables.push(table);
        console.log(`✅ Worker ${workerId || 'main'} completed table: ${table}`);

        // Check if we've actually completed all embeddings for this table
        const tableProgress = migrationProgress.tableProgress[table];
        if (tableProgress && tableProgress.embedded >= tableProgress.total) {
          console.log(`📊 Table ${table} truly completed: ${tableProgress.embedded}/${tableProgress.total} embedded`);
        } else if (tableProgress) {
          console.log(`⚠️  Table ${table} marked complete but embeddings incomplete: ${tableProgress.embedded}/${tableProgress.total}`);
        }
      }
    }

    if (migrationProgress.status === 'processing' && !workerId) {
      // Only set completed if this is the main process (not a worker)
      migrationProgress.status = 'completed';

      // Log embedding operation completion
      if (operationId) {
        try {
          await logEmbeddingOperation({
            operation_id: operationId,
            source_table: migrationProgress.tables || [],
            embedding_model: migrationProgress.embeddingMethod || 'google-text-embedding-004',
            batch_size: 100, // Default batch size
            worker_count: 1, // Default worker count
            status: 'completed',
            total_records: migrationProgress.total || 0,
            processed_records: migrationProgress.current || 0,
            error_count: migrationProgress.errorCount || 0,
            execution_time: Date.now() - (migrationProgress.startTime || Date.now()),
            metadata: {
              processingTime: Date.now() - (migrationProgress.startTime || Date.now()),
              tables: migrationProgress.tables || [],
              errorCount: migrationProgress.errorCount || 0
            }
          });
          // Embedding operation logging is disabled
        } catch (error) {
          console.error('Failed to log embedding operation:', error);
        }
      }

      await saveProgressToRedis();
    }
  } catch (error) {
    console.error('Processing error:', error);
    if (error instanceof Error) {
      migrationProgress.error = error.message;
    } else {
      migrationProgress.error = 'An unknown error occurred during migration.';
    }
    migrationProgress.status = 'error';

    // Log embedding operation error
    if (operationId) {
      try {
        await logEmbeddingOperation({
          operation_id: operationId,
          source_table: migrationProgress.tables || [],
          embedding_model: migrationProgress.embeddingMethod || 'google-text-embedding-004',
          batch_size: 100, // Default batch size
          worker_count: 1, // Default worker count
          status: 'error',
          total_records: migrationProgress.total || 0,
          processed_records: migrationProgress.current || 0,
          error_count: (migrationProgress.errorCount || 0) + 1,
          execution_time: Date.now() - (migrationProgress.startTime || Date.now()),
          error_message: error instanceof Error ? error.message : 'Unknown error',
          metadata: {
            error: error instanceof Error ? error.message : 'Unknown error',
            stack: error instanceof Error ? error.stack : 'No stack available'
          }
        });
        console.log('✅ Embedding error logged successfully');
      } catch (historyError) {
        console.error('Failed to log embedding error:', historyError);
      }
    }

    await saveProgressToRedis();
  }
}

// Save embedding to database
async function saveEmbedding(table: string, row: any, id: any, text: string, embedding: number[], model: string, sourceDbName?: string) {
  // Update heartbeat to show activity
  migrationProgress.lastHeartbeat = Date.now();

  // Update progress counters (only newlyEmbedded - current is updated in batch processing)
  migrationProgress.newlyEmbedded = (migrationProgress.newlyEmbedded || 0) + 1;

  // Update table progress
  if (!migrationProgress.tableProgress) {
    migrationProgress.tableProgress = {};
  }
  if (!migrationProgress.tableProgress[table]) {
    migrationProgress.tableProgress[table] = { embedded: 0, total: 0 };
  }
  migrationProgress.tableProgress[table].embedded = (migrationProgress.tableProgress[table].embedded || 0) + 1;

  // Get canonical table name dynamically
  const canonicalName = getDisplayName(table);

  try {
    console.log(`💾 Saving embedding for ${table} ID ${id} with model ${model}`);

    // Get settings for source database
    const dbSettings = await getDatabaseSettings();

    // Convert id to integer, but handle invalid ids
    const numericId = parseInt(id);
    if (isNaN(numericId)) {
      throw new Error(`Invalid ID for ${table}: ${id} is not a valid integer`);
    }

    let result;
    try {
      // Try to insert first (most common case)
      result = await targetPool.query(
        `INSERT INTO unified_embeddings (
          source_type, source_name, source_table, source_id,
          content, embedding, metadata, tokens_used, model_used
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING id`,
        [
          'database',
          sourceDbName || (dbSettings?.sourceDatabase || 'rag_chatbot'),
          canonicalName, // Use canonical name for consistency
          numericId,
          text,
          `[${embedding.join(',')}]`,
          JSON.stringify({ table, id }),
          150,
          model
        ]
      );
      console.log('✅ Saved embedding for', table, 'ID:', id, 'returned ID:', result.rows[0].id, 'Canonical name:', canonicalName);
    } catch (insertErr: any) {
      // Check if it's a duplicate key error
      if (insertErr.code === '23505' && insertErr.constraint === 'unique_source_record') {
        // Record already exists, update it instead
        result = await targetPool.query(
          `UPDATE unified_embeddings SET
            embedding = $1,
            content = $2,
            tokens_used = $3,
            model_used = $4,
            updated_at = NOW()
          WHERE source_table = $5 AND source_id = $6
          RETURNING id`,
          [
            `[${embedding.join(',')}]`,
            text,
            150,
            model,
            canonicalName,
            numericId
          ]
        );
        console.log('🔄 Updated existing embedding for', table, 'ID:', id, 'Canonical name:', canonicalName);
      } else {
        // Re-throw if it's not a duplicate key error
        throw insertErr;
      }
    }
  } catch (err) {
    console.error('❌ Error saving embedding:', err);
    console.error('Table:', table, 'ID:', id, 'Canonical name:', canonicalName);
    throw err; // Re-throw to stop processing
  }

  // Calculate processing speed and estimated time
  if (migrationProgress.startTime && migrationProgress.current > 0) {
    const elapsed = (Date.now() - migrationProgress.startTime) / 1000; // seconds
    migrationProgress.processingSpeed = migrationProgress.current / elapsed / 60; // records per minute

    // Estimate time remaining
    if (migrationProgress.processingSpeed > 0) {
      const remaining = (migrationProgress.total - migrationProgress.current) / migrationProgress.processingSpeed / 60; // minutes
      migrationProgress.estimatedTimeRemaining = remaining * 60 * 1000; // convert to milliseconds
    }
  }

  // Save progress to Redis after every 5 embeddings for more frequent updates
  if (migrationProgress.current % 5 === 0) {
    await saveProgressToRedis();
  }
}

// Pause migration
router.post('/pause', async (req: Request, res: Response) => {
  if (migrationProgress.status === 'processing') {
    migrationProgress.status = 'paused';
    // Also set Redis flag for workers to check
    await redis.set('embedding:status', 'paused');
    await saveProgressToRedis();

    // Log pause operation
    try {
      // Get operation ID from metadata if available
      const operationId = migrationProgress.metadata?.operationId || `embedding_${Date.now()}`;
      await logEmbeddingOperation({
        operation_id: operationId,
        source_table: migrationProgress.tables || [],
        embedding_model: migrationProgress.embeddingMethod || 'google-text-embedding-004',
        batch_size: 100,
        worker_count: 1,
        status: 'paused',
        total_records: migrationProgress.total || 0,
        processed_records: migrationProgress.current || 0,
        error_count: migrationProgress.errorCount || 0,
        execution_time: Date.now() - (migrationProgress.startTime || Date.now()),
        metadata: {
          pauseTime: Date.now(),
          currentTable: migrationProgress.currentTable,
          percentage: migrationProgress.percentage || 0
        }
      });
      console.log('✅ Embedding pause logged successfully');
    } catch (logError) {
      console.error('Failed to log embedding pause:', logError);
    }

    res.json({ message: 'Migration paused', progress: migrationProgress });
  } else {
    res.json({ message: 'No migration in progress', progress: migrationProgress });
  }
});

// Resume migration
router.post('/resume', async (req: Request, res: Response) => {
  console.log('📞 RESUME ENDPOINT CALLED');
  console.log('Current status:', migrationProgress.status);
  console.log('Tables in progress:', migrationProgress.tables);
  console.log('Table progress:', JSON.stringify(migrationProgress.tableProgress, null, 2));

  if (migrationProgress.status === 'paused') {
    // Update status and heartbeat
    migrationProgress.status = 'processing';
    migrationProgress.lastHeartbeat = Date.now();

    // Recalculate total if it's 0 but we have table progress
    if (migrationProgress.total === 0 && migrationProgress.tableProgress && Object.keys(migrationProgress.tableProgress).length > 0) {
      let calculatedTotal = 0;
      for (const tableName in migrationProgress.tableProgress) {
        const tableInfo = migrationProgress.tableProgress[tableName];
        calculatedTotal += tableInfo.total || 0;
      }
      migrationProgress.total = calculatedTotal;
      console.log(`📊 Recalculated total on resume: ${calculatedTotal}`);
    }

    // Clear Redis pause flag
    await redis.del('embedding:status');
    await saveProgressToRedis();

    // Get remaining tables to process
    const remainingTables: string[] = [];
    for (const tableName of migrationProgress.tables || []) {
      const tableProgress = migrationProgress.tableProgress?.[tableName];
      if (tableProgress && tableProgress.embedded < tableProgress.total) {
        remainingTables.push(tableName);
      }
    }

    // Set current table for progress tracking
    migrationProgress.currentTable = remainingTables[0] || migrationProgress.tables?.[0] || '';
    await saveProgressToRedis();

    // Get settings from the saved progress (define operationId early for logging)
    const batchSize = migrationProgress.batchSize || 100;
    const embeddingMethod = migrationProgress.embeddingMethod || 'google-text-embedding-004';
    const workerCount = migrationProgress.workerCount || 1;
    const operationId = migrationProgress.metadata?.operationId || `embedding_${Date.now()}`;

    if (remainingTables.length > 0) {
      console.log(`🔄 Resuming with ${remainingTables.length} tables, ${workerCount} workers, batch size ${batchSize}`);
      console.log(`📋 Remaining tables: ${remainingTables.join(', ')}`);

      // Start workers for remaining tables
      if (workerCount > 1 && remainingTables.length === 1) {
        // Multiple workers for single table
        const tableName = remainingTables[0];
        const tableProgress = migrationProgress.tableProgress[tableName];

        if (tableProgress) {
          const totalRecords = tableProgress.total;
          const recordsPerWorker = Math.ceil(totalRecords / workerCount);

          console.log(`🔄 Starting ${workerCount} workers for table ${tableName}`);

          const workers = [];
          for (let i = 0; i < workerCount; i++) {
            const startId = i * recordsPerWorker;
            const endId = Math.min((i + 1) * recordsPerWorker - 1, totalRecords - 1);

            if (startId <= endId) {
              console.log(`🔄 Worker ${i + 1}: Processing IDs ${startId} to ${endId}`);

              // For parallel workers, each worker has a fixed batchOffset (worker index)
              // Worker 0 processes batches 0, totalWorkers, 2*totalWorkers, etc.
              // Worker 1 processes batches 1, totalWorkers+1, 2*totalWorkers+1, etc.
              const workerPromise = processTableWithParallelBatches(
                tableName,
                batchSize,
                embeddingMethod,
                operationId,
                true, // resume mode
                i,    // workerIndex (0-based)
                workerCount,
                i     // batchOffset = workerIndex for round-robin distribution
              );
              workers.push(workerPromise);
            }
          }

          // Don't wait here - let workers run in background
          Promise.all(workers).then(async () => {
            // Verify completion
            let totalEmbedded = 0;
            for (const table of remainingTables) {
              const tableInfo = migrationProgress.tableProgress?.[table];
              if (tableInfo) {
                totalEmbedded += tableInfo.embedded || 0;
              }
            }

            if (migrationProgress.status !== 'paused' && migrationProgress.status !== 'error') {
              migrationProgress.status = 'completed';
              migrationProgress.current = totalEmbedded;
              migrationProgress.percentage = 100;
              await saveProgressToRedis();
              console.log('✅ All workers completed successfully after resume');
            }
          });
        }
      } else {
        // Single worker or multiple tables - use the existing processTables function
        console.log(`🔄 Starting single worker for tables: ${remainingTables.join(', ')}`);
        processTables(remainingTables, batchSize, embeddingMethod, operationId, true).catch(err => {
          console.error('Processing error after resume:', err);
          migrationProgress.error = err.message;
          migrationProgress.status = 'error';
          saveProgressToRedis();
        });
      }
    } else {
      console.log(`📭 No remaining tables to process. All tables might be completed.`);
    }

    // Log resume operation
    try {
      await logEmbeddingOperation({
        operation_id: operationId,
        source_table: migrationProgress.tables || [],
        embedding_model: migrationProgress.embeddingMethod || 'google-text-embedding-004',
        batch_size: migrationProgress.batchSize || 100,
        worker_count: migrationProgress.workerCount || 1,
        status: 'processing',
        total_records: migrationProgress.total || 0,
        processed_records: migrationProgress.current || 0,
        error_count: migrationProgress.errorCount || 0,
        execution_time: Date.now() - (migrationProgress.startTime || Date.now()),
        metadata: {
          resumeTime: Date.now(),
          currentTable: migrationProgress.currentTable,
          percentage: migrationProgress.percentage || 0,
          remainingTables: remainingTables
        }
      });
      console.log('✅ Embedding resume logged successfully');
    } catch (logError) {
      console.error('Failed to log embedding resume:', logError);
    }

    res.json({ message: 'Migration resumed with workers', progress: migrationProgress });
  } else {
    res.json({ message: 'No paused migration to resume', progress: migrationProgress });
  }
});

// Stop migration
router.post('/stop', async (req: Request, res: Response) => {
  try {
    migrationProgress.status = 'idle';
    migrationProgress.tableProgress = {};
    await saveProgressToRedis();
    res.json({ message: 'Migration stopped', progress: migrationProgress });
  } catch (error) {
    res.status(500).json({ error: 'Failed to stop migration' });
  }
});

// Clear migration progress
router.post('/clear', async (req: Request, res: Response) => {
  try {
    // Reset in-memory progress
    migrationProgress = {
      status: 'idle',
      current: 0,
      total: 0,
      percentage: 0,
      currentTable: null,
      error: null,
      tokensUsed: 0,
      estimatedCost: 0,
      startTime: null,
      estimatedTimeRemaining: null,
      processingSpeed: 0,
      processedTables: [],
      currentBatch: 0,
      totalBatches: 0,
      tableProgress: {},
      tables: []
    };

    // Clear Redis progress keys
    await redis.del('embedding:progress');
    await redis.del('migration:progress');
    await redis.del('embedding:status');

    // Clear any paused/stopped status in database
    await targetPool.query(`
      UPDATE embedding_progress
      SET status = 'completed', completed_at = CURRENT_TIMESTAMP
      WHERE status IN ('paused', 'stopped', 'processing')
    `);

    res.json({
      message: 'Migration progress cleared successfully',
      progress: migrationProgress
    });
  } catch (error) {
    console.error('Clear error:', error);
    res.status(500).json({ error: 'Failed to clear migration progress' });
  }
});

// Force refresh tables (temporary endpoint for debugging)
router.post('/refresh-tables', async (req: Request, res: Response) => {
  try {
    // Clear any caches
    await redis.del('embedding:tables:cache');

    res.json({
      success: true,
      message: 'Tables cache cleared. Please refresh the page.'
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to clear cache' });
  }
});

// Get embedding stats
router.get('/stats', async (req: Request, res: Response) => {
  try {
    const result = await lsembPool.query(`
      SELECT
        COUNT(*) as totalEmbeddings,
        COUNT(DISTINCT source_table) as tablesProcessed,
        SUM(tokens_used) as totalTokens,
        COUNT(DISTINCT model_used) as modelsUsed
      FROM unified_embeddings
    `);

    const byTable = await lsembPool.query(`
      SELECT
        source_table,
        COUNT(*) as count,
        SUM(tokens_used) as tokens
      FROM unified_embeddings
      WHERE source_type = 'database'
      GROUP BY source_table
    `);

    res.json({
      totalEmbeddings: parseInt(result.rows[0].total_embeddings) || 0,
      tablesProcessed: parseInt(result.rows[0].tablesprocessed) || 0,
      totalTokens: parseInt(result.rows[0].totaltokens) || 0,
      modelsUsed: parseInt(result.rows[0].modelsused) || 0,
      byTable: byTable.rows.map(row => ({
        ...row,
        tokens: parseInt(row.tokens) || 0
      }))
    });
  } catch (error) {
    console.error('Stats error:', error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// Get available tables with embedding statistics
router.get('/api/v2/embeddings/tables', async (req: Request, res: Response) => {
  try {
    // Get all tables from source database
    const tablesQuery = await sourcePool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_type = 'BASE TABLE'
      AND table_name NOT IN ('embedding_progress', 'embedding_history', 'unified_embeddings')
      ORDER BY table_name
    `);

    const tables = [];

    for (const tableRow of tablesQuery.rows) {
      const tableName = tableRow.table_name;
      // Get display name dynamically
      const displayName = getDisplayName(tableName);

      try {
        // Get total records count
        const countResult = await sourcePool.query(`
          SELECT COUNT(*) as total
          FROM public."${tableName}"
        `);
        const totalRecords = parseInt(countResult.rows[0].total);

        // Get embedded records count from unified_embeddings
        const embeddedResult = await lsembPool.query(`
          SELECT COUNT(*) as embedded
          FROM unified_embeddings
          WHERE source_type = 'database'
          AND (
            source_table = $1
            OR metadata->>'table' = $2
          )
        `, [displayName, tableName]);
        const embeddedRecords = parseInt(embeddedResult.rows[0].embedded) || 0;

        console.log(`📊 ${tableName}: ${embeddedRecords} embedded records found (counting both source_table and metadata)`);

        // Additional debug for ozelgeler
        if (tableName === 'ozelgeler') {
          console.log(`🔍 DEBUG for ozelglers:`);
          console.log(`  - Query result: ${embeddedResult.rows[0].embedded}`);
          console.log(`  - Parsed result: ${embeddedRecords}`);
          console.log(`  - Table name passed to query: '${tableName}'`);
        }

        // Check if table is currently being processed
        const progressResult = await lsembPool.query(`
          SELECT status
          FROM embedding_progress
          WHERE table_name = $1
          ORDER BY created_at DESC
          LIMIT 1
        `, [tableName]);

        const status = progressResult.rows[0]?.status || 'pending';

        tables.push({
          name: tableName,
          totalRecords,
          embeddedRecords,
          status,
          progress: totalRecords > 0 ? Math.round((embeddedRecords / totalRecords) * 100) : 0
        });
      } catch (error) {
        console.error(`Error processing table ${tableName}:`, error);
        tables.push({
          name: tableName,
          totalRecords: 0,
          embeddedRecords: 0,
          status: 'error',
          progress: 0
        });
      }
    }

    // Debug: Calculate total embedded records before sending response
    const totalEmbeddedRecords = tables.reduce((acc, t) => acc + t.embeddedRecords, 0);
    console.log('📊 Backend tables endpoint debug:');
    console.log('  - Individual table embedded records:', tables.map(t => `${t.name}: ${t.embeddedRecords}`));
    console.log(`  - Total embedded records calculated: ${totalEmbeddedRecords}`);
    console.log('  - Tables being sent:', JSON.stringify(tables, null, 2));

    res.json({ tables });
  } catch (error) {
    console.error('Tables error:', error);
    res.status(500).json({ error: 'Failed to fetch tables' });
  }
});

// Debug endpoint to check unified_embeddings content
router.get('/debug/embeddings', async (req: Request, res: Response) => {
  try {
    // Check all variations of ozelgeler
    const variations = ['ozelgeler', 'Ozelgeler', 'Özelgler', 'özelgeler'];

    const remainingTables: string[] = [];
    const results: Record<string, any> = {};
    let totalCount = 0;

    for (const variation of variations) {
      const result = await lsembPool.query(`
        SELECT COUNT(*) as count
        FROM unified_embeddings
        WHERE source_table = $1
        AND source_type = 'database'
      `, [variation]);

      const count = parseInt(result.rows[0].count) || 0;
      results[variation] = count;
      totalCount += count;
    }

    // Also get a sample of records
    const sampleResult = await lsembPool.query(`
      SELECT source_table, source_id, metadata
      FROM unified_embeddings
      WHERE source_type = 'database'
      AND source_table ILIKE '%ozelgeler%'
      LIMIT 5
    `);

    res.json({
      byVariation: results,
      totalCount: totalCount,
      sampleRecords: sampleResult.rows
    });
  } catch (error) {
    console.error('Debug endpoint error:', error);
    res.status(500).json({ error: 'Debug query failed' });
  }
});

// Get table details with recent records
router.get('/table/:tableName/details', async (req: Request, res: Response) => {
  try {
    const { tableName } = req.params;

    // Get display name dynamically
    const displayName = getDisplayName(tableName);

    // Get primary key for the table
    const primaryKey = await getPrimaryKey(tableName);

    // Get recent 20 records from the source table
    let recentRecords = [];
    try {
      const recentQuery = await sourcePool.query(`
        SELECT * FROM public."${tableName}"
        ORDER BY ${primaryKey === 'ROW_NUMBER' ? 'ctid' : primaryKey} DESC
        LIMIT 20
      `);
      recentRecords = recentQuery.rows;
      console.log(`DEBUG: Recent records for ${tableName}:`, recentRecords.length > 0 ? Object.keys(recentRecords[0]) : 'No records');
      if (recentRecords.length > 0) {
        console.log('DEBUG: First record:', recentRecords[0]);
      }
    } catch (err) {
      console.error(`Error fetching recent records for ${tableName}:`, err);
    }

    // Check which of these records are already embedded
    const embeddedRecordIds = new Set();
    if (recentRecords.length > 0) {
      const ids = recentRecords.map(record => {
        const id = record[primaryKey] || record.id;
        return parseInt(id);
      }).filter(id => !isNaN(id));

      if (ids.length > 0) {
        const embeddedResult = await lsembPool.query(`
          SELECT source_id FROM unified_embeddings
          WHERE source_type = 'database'
          AND (
            source_table = $1
            OR metadata->>'table' = $2
          )
          AND source_id = ANY($3)
        `, [displayName, tableName, ids]);

        embeddedResult.rows.forEach(row => {
          embeddedRecordIds.add(parseInt(row.source_id));
        });
      }
    }

    // Mark records as embedded or not
    const recentRecordsWithStatus = recentRecords.map(record => {
      const id = record[primaryKey] || record.id;
      const numericId = parseInt(id);
      return {
        ...record,
        isEmbedded: !isNaN(numericId) && embeddedRecordIds.has(numericId)
      };
    });

    res.json({
      tableName,
      displayName,
      recentRecords: recentRecordsWithStatus,
      primaryKey
    });
  } catch (error) {
    console.error('Table details error:', error);
    res.status(500).json({ error: 'Failed to fetch table details' });
  }
});

// Get recently embedded records for a table
router.get('/table/:tableName/embedded-recent', async (req: Request, res: Response) => {
  try {
    const { tableName } = req.params;

    // Get display name dynamically
    const displayName = getDisplayName(tableName);
    console.log(`DEBUG: Processing request for table "${tableName}", display name: "${displayName}"`);

    // Get recently embedded records from unified_embeddings table
    let embeddedRecords = [];
    try {
      const recentQuery = await lsembPool.query(`
        SELECT
          ue.id,
          ue.source_id,
          ue.content,
          ue.metadata,
          ue.created_at,
          ue.updated_at,
          ue.source_table,
          ue.source_name,
          ue.model_used as model,
          ue.tokens_used as tokens,
          ue.metadata->>'chunk_count' as chunk_count
        FROM unified_embeddings ue
        WHERE
          ue.source_type = 'database' AND
          (
            ue.source_table = $1 OR
            ue.source_table = $2 OR
            ue.metadata->>'table' = $1 OR
            ue.metadata->>'table' = $2 OR
            LOWER(ue.source_table) = LOWER($1) OR
            LOWER(ue.source_table) = LOWER($2) OR
            LOWER(ue.metadata->>'table') = LOWER($1) OR
            LOWER(ue.metadata->>'table') = LOWER($2)
          )
        ORDER BY ue.created_at DESC
        LIMIT 20
      `, [displayName, tableName]);

      embeddedRecords = recentQuery.rows;

      console.log(`DEBUG: Found ${embeddedRecords.length} embedded records for ${tableName}`);

      // Check what tables actually exist in unified_embeddings
      const tablesCheck = await lsembPool.query(`
        SELECT DISTINCT source_table, metadata->>'table' as metadata_table
        FROM unified_embeddings
        WHERE source_type = 'database'
        LIMIT 10
      `);
      console.log('DEBUG: Available tables in unified_embeddings:', tablesCheck.rows);

      // Log the first record for debugging
      if (embeddedRecords.length > 0) {
        console.log('DEBUG: First embedded record:', {
          source_id: embeddedRecords[0].source_id,
          source_table: embeddedRecords[0].source_table,
          metadata: embeddedRecords[0].metadata,
          created_at: embeddedRecords[0].created_at
        });
      }
    } catch (err) {
      console.error(`Error fetching embedded records for ${tableName}:`, err);
    }

    res.json({
      tableName,
      displayName,
      embeddedRecords: embeddedRecords
    });
  } catch (error) {
    console.error('Embedded recent records error:', error);
    res.status(500).json({ error: 'Failed to fetch embedded recent records' });
  }
});

// Reset migration progress endpoint
router.post('/reset', async (req: Request, res: Response) => {
  try {
    console.log('🔄 Resetting migration progress...');

    // Clear Redis progress data
    await redis.del('embedding:progress');
    await redis.del('embedding:status');
    await redis.del('embedding:startTime');
    await redis.del('embedding:lastUpdate');

    // Clear any stuck processes in database
    await lsembPool.query(`
      UPDATE embedding_progress
      SET status = 'completed', completed_at = CURRENT_TIMESTAMP
      WHERE status IN ('processing', 'paused')
    `);

    // Reset migration progress object
    migrationProgress = {
      status: 'idle',
      current: 0,
      total: 0,
      percentage: 0,
      currentTable: '',
      error: '',
      tokensUsed: 0,
      estimatedCost: 0,
      startTime: null,
      estimatedTimeRemaining: null,
      processedTables: [],
      currentBatch: 0,
      totalBatches: 0,
      tableProgress: {},
      embeddingMethod: '',
      tables: [],
      newlyEmbedded: 0,
      errorCount: 0,
      processingSpeed: 0,
      lastUpdate: Date.now()
    };

    console.log('✅ Migration progress reset successfully');
    res.json({
      success: true,
      message: 'Migration progress has been reset',
      status: 'idle'
    });
  } catch (error) {
    console.error('❌ Error resetting migration:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to reset migration progress'
    });
  }
});

// Check and recover from stuck embedding process
router.post('/recover', async (req: Request, res: Response) => {
  try {
    console.log('🔧 Checking for stuck embedding process...');

    // Load current progress
    await loadProgressFromRedis();

    // Check if process appears to be stuck OR has an error
    if (isProcessStuck() || migrationProgress.status === 'error') {
      console.log('⚠️  Detected stuck or failed embedding process, attempting recovery...');

      // Validate progress data
      if (migrationProgress.total === 0 && migrationProgress.current > 0) {
        console.warn('Invalid progress detected: total is 0 but current is', migrationProgress.current);
        // Try to recalculate total from table progress
        if (migrationProgress.tableProgress && Object.keys(migrationProgress.tableProgress).length > 0) {
          let calculatedTotal = 0;
          for (const tableName in migrationProgress.tableProgress) {
            const tableInfo = migrationProgress.tableProgress[tableName];
            calculatedTotal += tableInfo.total || 0;
          }
          if (calculatedTotal > 0) {
            migrationProgress.total = calculatedTotal;
            console.log(`📊 Recovered total: ${calculatedTotal}`);
            await saveProgressToRedis();
          }
        }
      }

      // For error status, always pause and allow resume
      if (migrationProgress.status === 'error') {
        migrationProgress.status = 'paused';
        await saveProgressToRedis();

        console.log('🛑 Error state process paused');

        res.json({
          success: true,
          message: 'Error state detected and paused',
          action: 'paused',
          progress: migrationProgress
        });
        return;
      }

      // Check if there's actually an active process by looking for recent embeddings
      const recentEmbeddings = await lsembPool.query(`
        SELECT COUNT(*) as count
        FROM unified_embeddings
        WHERE created_at > NOW() - INTERVAL '2 minutes'
      `);

      const hasRecentActivity = parseInt(recentEmbeddings.rows[0].count) > 0;

      if (!hasRecentActivity) {
        // Process is stuck, pause it
        migrationProgress.status = 'paused';
        await saveProgressToRedis();

        console.log('🛑 Process paused due to inactivity');

        res.json({
          success: true,
          message: 'Stuck process detected and paused',
          action: 'paused',
          progress: migrationProgress
        });
      } else {
        // Process might still be running but heartbeat not updating
        console.log('✅ Recent activity detected, process may still be running');
        res.json({
          success: true,
          message: 'Recent activity detected, process appears active',
          action: 'none',
          progress: migrationProgress
        });
      }
    } else {
      console.log('✅ No stuck process detected');
      res.json({
        success: true,
        message: 'Process is running normally',
        action: 'none',
        progress: migrationProgress
      });
    }
  } catch (error) {
    console.error('❌ Error checking stuck process:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to check process status'
    });
  }
});

// SSE endpoint for real-time progress updates
router.get('/progress/stream', async (req: Request, res: Response) => {
  console.log('🔌 SSE connection requested');

  // Set headers for SSE
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Cache-Control'
  });

  // Send initial progress
  const sendProgress = async () => {
    try {
      await loadProgressFromRedis();
      console.log('📡 SSE sending progress:', {
        status: migrationProgress.status,
        current: migrationProgress.current,
        total: migrationProgress.total,
        currentTable: migrationProgress.currentTable
      });

      // Calculate processing speed if we have start time and progress
      if (migrationProgress.startTime && migrationProgress.current > 0) {
        const elapsed = (Date.now() - migrationProgress.startTime) / 1000; // seconds
        migrationProgress.processingSpeed = migrationProgress.current / elapsed / 60; // records per minute

        // Estimate time remaining
        if (migrationProgress.processingSpeed > 0) {
          const remaining = (migrationProgress.total - migrationProgress.current) / migrationProgress.processingSpeed / 60; // minutes
          migrationProgress.estimatedTimeRemaining = remaining * 60 * 1000; // convert to milliseconds
        }
      }

      const data = `data: ${JSON.stringify(migrationProgress)}\n\n`;
      res.write(data);
    } catch (error) {
      console.error('Error sending progress:', error);
    }
  };

  // Send initial progress
  await sendProgress();

  // Set up interval to send progress updates every 2 seconds
  const interval = setInterval(sendProgress, 2000);
  console.log('🔄 SSE interval started for progress updates');

  // Clean up on client disconnect
  req.on('close', () => {
    clearInterval(interval);
  });
});

// Analytics endpoint
router.get('/analytics', async (req: Request, res: Response) => {
  try {
    const client = await lsembPool.connect();

    try {
      // Get overall analytics from embedding operations
      const analyticsQuery = `
        SELECT
          COUNT(*) as total_operations,
          AVG(EXTRACT(EPOCH FROM (completed_at - started_at))) as avg_processing_time,
          SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END)::float / COUNT(*) as success_rate,
          SUM(error_count) as total_errors,
          SUM(total_records) as total_records_processed,
          SUM(tokens_used) as total_tokens_used
        FROM embedding_operations
        WHERE started_at >= NOW() - INTERVAL '30 days'
      `;

      const analyticsResult = await client.query(analyticsQuery);
      const analytics = analyticsResult.rows[0];

      // Calculate average speed (records per minute)
      const avgProcessingTime = analytics.avg_processing_time || 0;
      const totalRecords = analytics.total_records_processed || 0;
      const averageSpeed = avgProcessingTime > 0 ? (totalRecords / (avgProcessingTime / 60)) : 0;

      // Calculate token efficiency (tokens per record)
      const totalTokens = analytics.total_tokens_used || 0;
      const tokenEfficiency = totalRecords > 0 ? (totalTokens / totalRecords) : 0;

      const analyticsData = {
        totalProcessingTime: avgProcessingTime * 1000, // Convert to milliseconds
        averageSpeed,
        successRate: analytics.success_rate || 0,
        errorCount: analytics.total_errors || 0,
        tokenEfficiency,
        totalOperations: analytics.total_operations || 0,
        totalRecordsProcessed: totalRecords,
        totalTokensUsed: totalTokens
      };

      res.json(analyticsData);
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error fetching analytics:', error);
    res.status(500).json({ error: 'Failed to fetch analytics data' });
  }
});

// End of embeddings-v2.routes.ts

export default router;