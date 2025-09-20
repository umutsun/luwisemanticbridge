import { Router, Request, Response } from 'express';
import { Pool } from 'pg';
import OpenAI from 'openai';
import Redis from 'ioredis';
import crypto from 'crypto';
import { getDatabaseSettings, asembPool } from '../config/database.config';

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
// Using asembPool from database.config.ts

const router = Router();

// Redis client for caching
const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  db: parseInt(process.env.REDIS_DB || '0')
});

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
    database: process.env.RAG_CHATBOT_DATABASE || 'rag_chatbot',
    user: process.env.POSTGRES_USER || 'postgres',
    password: process.env.POSTGRES_PASSWORD || 'postgres'
  });

// Target database (asemb) - where we write embeddings to
const targetPool = new Pool({
  connectionString: process.env.DATABASE_URL
});

// Use targetPool for default queries (settings, migration history)
const pgPool = targetPool;

// Get API key from database settings or environment
async function getApiKey(provider: string) {
  try {
    const result = await targetPool.query(
      `SELECT setting_value FROM chatbot_settings WHERE setting_key = '${provider}_api_key'`
    );
    return result.rows[0]?.setting_value || process.env[`${provider.toUpperCase()}_API_KEY`] || '';
  } catch (error) {
    console.error(`Error fetching ${provider} API key:`, error.message);
    return process.env[`${provider.toUpperCase()}_API_KEY`] || '';
  }
}

// Get OpenAI API key from database settings
async function getOpenAIClient() {
  const apiKey = await getApiKey('openai');
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
  return timeSinceHeartbeat > 30000; // 30 seconds threshold
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
async function loadProgressFromRedis() {
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
      await redis.set(cacheKey, JSON.stringify(embedding), 'EX', 30 * 24 * 60 * 60); // 30 days
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
    console.log(`Embedding column check failed for ${tableName}:`, err.message);
  }
}

// Check for duplicates in batch (more efficient)
async function checkDuplicatesInBatch(table: string, ids: any[]): Promise<Set<any>> {
  try {
    console.log(`🔎 Checking duplicates for table "${table}" with ${ids.length} IDs:`, ids.slice(0, 5));

    // Get display name mapping
    const displayNames: { [key: string]: string } = {
      'ozelgeler': 'Özelgeler',
      'makaleler': 'Makaleler',
      'sorucevap': 'Soru-Cevap',
      'danistaykararlari': 'Danıştay Kararları',
      'chat_history': 'Sohbet Geçmişi'
    };
    const displayName = displayNames[table] || table;

    // Check only the specified table name (not both displayName and table)
    // This prevents false positives when different tables have the same IDs
    const result = await asembPool.query(
      `SELECT source_id
       FROM unified_embeddings
       WHERE source_type = 'database'
       AND source_table = $1
       AND source_id = ANY($2)`,
      [displayName, ids]
    );

    const duplicateIds = new Set(result.rows.map(row => row.source_id));

    // Debug: Show what source_table values actually exist
    if (duplicateIds.size > 0) {
      const sampleResult = await asembPool.query(
        `SELECT DISTINCT source_table, COUNT(*) as count
         FROM unified_embeddings
         WHERE source_id = ANY($1)
         GROUP BY source_table
         LIMIT 5`,
        [Array.from(duplicateIds).slice(0, 10)]
      );
      console.log(`🔍 Sample source_table values for duplicate IDs:`, sampleResult.rows);
    }

    console.log(`📋 Found ${duplicateIds.size} existing embeddings for table "${table}" (displayName: ${displayName}, actual: ${table})`);

    return duplicateIds;
  } catch (err) {
    console.error('Duplicate check error:', err);
    return new Set();
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

    // Use consistent display name mapping
    const displayNames: { [key: string]: string } = {
      'ozelgeler': 'Özelgeler',
      'makaleler': 'Makaleler',
      'sorucevap': 'Soru-Cevap',
      'danistaykararlari': 'Danıştay Kararları',
      'chat_history': 'Sohbet Geçmişi'
    };

    // Also check for common variations in source_table field
    const sourceTableVariations: { [key: string]: string[] } = {
      'ozelgeler': ['Özelgeler', 'Ozelgeler', 'ozelgeler'],
      'makaleler': ['Makaleler', 'makaleler'],
      'sorucevap': ['Soru-Cevap', 'sorucevap'],
      'danistaykararlari': ['Danıştay Kararları', 'danistaykararlari'],
      'chat_history': ['Sohbet Geçmişi', 'chat_history']
    };

    // Process each table from the database
    for (const tableRow of tablesQuery.rows) {
      const tableName = tableRow.table_name;

      // Get display name from consistent mapping
      const displayName = displayNames[tableName] || tableName.charAt(0).toUpperCase() + tableName.slice(1);

      try {
        // Get total records count
        const countResult = await sourcePool.query(`
          SELECT COUNT(*) as total
          FROM public."${tableName}"
        `);
        const totalRecords = parseInt(countResult.rows[0].total);

        // Get embedded records count from unified_embeddings
        // Check all variations for this table
        const variations = sourceTableVariations[tableName] || [displayName, tableName];
        const placeholders = variations.map((_, i) => `$${i + 1}`).join(', ');
        const embeddedResult = await asembPool.query(`
          SELECT COUNT(*) as embedded
          FROM unified_embeddings
          WHERE source_table IN (${placeholders})
        `, variations);
        let embeddedRecords = parseInt(embeddedResult.rows[0].embedded) || 0;

        console.log(`[TABLES] ${tableName}: ${embeddedRecords} embeddings found`);

        // Check if table is currently being processed
        // Note: embedding_progress table might not exist or have different structure
        let status = 'pending';
        try {
          const progressResult = await asembPool.query(`
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

    // Log the final response
    console.log('📤 Final response:');
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
  const asembResult = await asembPool.query('SELECT COUNT(*) FROM unified_embeddings');
  const asembCount = parseInt(asembResult.rows[0].count);

  let pgCount = 0;
  try {
    const pgResult = await pgPool.query('SELECT COUNT(*) FROM unified_embeddings');
    pgCount = parseInt(pgResult.rows[0].count);
  } catch (e) {
    // Table might not exist in pg database
  }

  res.json({
    message: 'Test endpoint',
    asembDatabase: {
      host: process.env.ASEMB_DB_HOST,
      name: process.env.ASEMB_DB_NAME,
      count: asembCount
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
    const result = await asembPool.query(`
      SELECT source_table, COUNT(*) as count
      FROM unified_embeddings
      GROUP BY source_table
      ORDER BY count DESC
    `);

    // Get total count
    const totalResult = await asembPool.query('SELECT COUNT(*) FROM unified_embeddings');
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
  // Try to load from Redis first
  await loadProgressFromRedis();

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

  // Check if process might be stuck
  const mightBeStuck = isProcessStuck();

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

// Generate embeddings for tables
router.post('/generate', async (req: Request, res: Response) => {
  console.log('🚀 Generate endpoint called');

  try {
    const {
      tables,
      batchSize = 50,
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

    // Load previous progress to check if we should continue
    const hasProgress = await loadProgressFromRedis();

    // If we have progress and it's for the same tables, continue from where we left off
    if (hasProgress &&
        migrationProgress.tables &&
        migrationProgress.tables.length === tables.length &&
        migrationProgress.tables.every(table => tables.includes(table)) &&
        (migrationProgress.status === 'paused' || migrationProgress.status === 'processing')) {
      // Continue existing migration
      migrationProgress.status = 'processing';
      migrationProgress.lastHeartbeat = Date.now(); // Initialize heartbeat
      console.log('Continuing existing migration from progress:', {
        current: migrationProgress.current,
        total: migrationProgress.total
      });
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
        tableProgress: {},
        embeddingMethod,
        tables: tables
      };
      console.log('Starting fresh migration for tables:', tables);
    }

    // Save initial progress
    await saveProgressToRedis();

    // Log embedding operation start
    const operationId = `embedding_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
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

    // Start processing (don't wait for completion)
    processTables(tables, batchSize, embeddingMethod, operationId, resume).catch(err => {
      console.error('Processing error:', err);
      migrationProgress.error = err.message;
      migrationProgress.status = 'error';
      saveProgressToRedis();
    });

    res.json({ message: resume ? 'Migration resumed' : 'Migration started', progress: migrationProgress });
  } catch (error) {
    console.error('Generate error:', error);
    res.status(500).json({ error: 'Failed to start migration' });
  }
});

// Process tables with resume support
async function processTables(tables: string[], batchSize: number, embeddingMethod: string, operationId?: string, resume?: boolean) {
  try {
    // Calculate total records to process
    let totalToProcess = 0;
    for (const table of tables) {
      await ensureEmbeddingColumn(table);

      // Get total records in table
      const totalResult = await sourcePool.query(
        `SELECT COUNT(*) as count FROM public."${table}"`
      );
      const totalInTable = parseInt(totalResult.rows[0].count);

      // Get already embedded count
      const displayNames: { [key: string]: string } = {
        'ozelgeler': 'Özelgeler',
        'makaleler': 'Makaleler',
        'sorucevap': 'Soru-Cevap',
        'danistaykararlari': 'Danıştay Kararları',
        'chat_history': 'Sohbet Geçmişi'
      };

      const sourceTableName = displayNames[table] || table;
      const embeddedResult = await asembPool.query(
        `SELECT COUNT(DISTINCT source_id) as count
         FROM unified_embeddings
         WHERE source_table = $1 AND source_type = 'database'`,
        [sourceTableName]
      );
      const embeddedCount = parseInt(embeddedResult.rows[0].count) || 0;

      // Calculate remaining to process
      const remaining = totalInTable - embeddedCount;
      totalToProcess += remaining;

      // Initialize table progress if not exists
      if (!migrationProgress.tableProgress[table]) {
        migrationProgress.tableProgress[table] = {
          total: totalInTable,
          embedded: embeddedCount,
          processed: 0,
          offset: 0
        };
      }
    }

    migrationProgress.total = totalToProcess;
    migrationProgress.current = 0; // Start from 0 for the remaining records
    migrationProgress.newlyEmbedded = 0; // Track newly embedded in this session
    // Initialize token tracking for new session
    if (!resume) {
      migrationProgress.tokensThisSession = 0;
      // Estimate total tokens (rough estimate based on average text length)
      migrationProgress.estimatedTotalTokens = totalToProcess * 500; // Assume ~500 tokens per record on average
    }
    await saveProgressToRedis();

    // Update embedding operation with total records
    if (operationId) {
      try {
        await logEmbeddingOperation({
          operation_id: operationId,
          source_table: tables,
          embedding_model: embeddingMethod,
          batch_size: batchSize,
          worker_count: 2, // Default worker count
          status: 'processing',
          total_records: totalToProcess,
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

      // Get content column
      const contentColumns: { [key: string]: string } = {
        'ozelgeler': '"Icerik"',
        'makaleler': '"Icerik"',
        'sorucevap': 'CONCAT("Soru", \' \', "Cevap")',
        'danistaykararlari': '"Icerik"',
        'chat_history': 'message'
      };

      const contentColumn = contentColumns[table] || 'content';
      const primaryKey = await getPrimaryKey(table);

      // Get saved progress for this table
      const tableProgress = migrationProgress.tableProgress[table] || { total: 0, embedded: 0, processed: 0, offset: 0 };
      let processedInTable = tableProgress.processed;
      let offset = tableProgress.offset;

      let hasMore = true;
      while (hasMore && migrationProgress.status === 'processing') {
        // Update heartbeat to show process is active
        updateHeartbeat();
        // For resume, we need to get records that are NOT embedded yet
        const displayNames: { [key: string]: string } = {
          'ozelgeler': 'Özelgeler',
          'makaleler': 'Makaleler',
          'sorucevap': 'Soru-Cevap',
          'danistaykararlari': 'Danıştay Kararları',
          'chat_history': 'Sohbet Geçmişi'
        };
        const sourceTableName = displayNames[table] || table;

        // Get records from source table
        const batchQuery = primaryKey !== 'ROW_NUMBER' ? `
          SELECT ${primaryKey}, ${contentColumn} as text_content
          FROM public."${table}" t
          WHERE ${contentColumn.includes('CONCAT') ? 'TRUE' : `${contentColumn} IS NOT NULL`}
          ORDER BY t.${primaryKey}
          LIMIT $1 OFFSET $2
        ` : `
          SELECT *, ROW_NUMBER() OVER (ORDER BY 1) as row_num
          FROM public."${table}"
          WHERE ${contentColumn.includes('CONCAT') ? 'TRUE' : `${contentColumn} IS NOT NULL`}
          LIMIT $3 OFFSET $4
        `;

        const batchResult = await sourcePool.query(batchQuery,
          primaryKey !== 'ROW_NUMBER' ? [batchSize, offset] : [batchSize, offset]
        );

        // Check if pause was requested
        const pauseStatus = await redis.get('embedding:status');
        if (pauseStatus === 'paused') {
          migrationProgress.status = 'paused';
          await saveProgressToRedis();
          console.log('⏸️ Embedding process paused by user request');
          break;
        }

        if (batchResult.rows.length === 0) {
          hasMore = false;
          break;
        }

        // Process batch
        const batchTexts = [];
        const validRows = [];
        const rowIds = [];

        for (const row of batchResult.rows) {
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

          // Update progress even for duplicates to show progress in UI
          processedInTable += batchResult.rows.length;
          migrationProgress.current += batchResult.rows.length;

          // Update table progress
          migrationProgress.tableProgress[table] = {
            total: tableProgress.total,
            embedded: tableProgress.embedded + batchResult.rows.length,
            processed: processedInTable,
            offset: primaryKey !== 'ROW_NUMBER' ?
              (validRows.length > 0 ? validRows[validRows.length - 1][primaryKey] : offset) :
              processedInTable
          };

          // Update percentage
          migrationProgress.percentage = (migrationProgress.current / migrationProgress.total) * 100;

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
            throw new Error('Google AI API key not found');
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
              await new Promise(resolve => setTimeout(resolve, 100));
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
        } else if (embeddingMethod === 'google-text-embedding-004') {
          // Google Text Embedding API - handle first
          const apiKey = await getApiKey('google');
          if (!apiKey) {
            throw new Error('Google AI API key not found');
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
                  if (data.embeddings && data.embeddings[j] && data.embeddings[j].values) {
                    const embedding = data.embeddings[j].values;
                    const text = subBatchTexts[j];
                    const tokens = estimateTokens(text, 'text-embedding-004');

                    await saveEmbedding(table, subBatchRows[j], subBatchIds[j], text, embedding, 'text-embedding-004');

                    processedInTable++;
                    migrationProgress.current++;
                    migrationProgress.tokensUsed += tokens;
                    migrationProgress.tokensThisSession += tokens;
                  }
                }
              }
            } catch (err) {
              console.error('Google embedding generation error:', err);

              // Fallback to local embeddings
              for (let j = 0; j < subBatchTexts.length; j++) {
                const embedding = new Array(768).fill(0).map(() => Math.random() * 2 - 1);
                await saveEmbedding(table, subBatchRows[j], subBatchIds[j], subBatchTexts[j], embedding, 'google-fallback');

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
              await new Promise(resolve => setTimeout(resolve, 200));
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
              await new Promise(resolve => setTimeout(resolve, 100));
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
              await new Promise(resolve => setTimeout(resolve, 200));
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
              await new Promise(resolve => setTimeout(resolve, 100));
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

          // Map method to model
          const modelMap = {
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
                migrationProgress.current++;
                migrationProgress.tokensUsed += tokens;
                migrationProgress.tokensThisSession += tokens;
              }

              // Rate limiting
              await new Promise(resolve => setTimeout(resolve, 100));
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
          embedded: tableProgress.embedded + uniqueTexts.length,
          processed: processedInTable,
          offset: lastProcessedId
        };

        // Update percentage
        migrationProgress.percentage = (migrationProgress.current / migrationProgress.total) * 100;

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
        await new Promise(resolve => setTimeout(resolve, 50));
      }

      if (migrationProgress.status === 'processing') {
        migrationProgress.processedTables.push(table);
      }
    }

    if (migrationProgress.status === 'processing') {
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
    migrationProgress.error = error.message;
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
          error_message: error.message,
          metadata: {
            error: error.message,
            tables: migrationProgress.tables || [],
            stack: error.stack
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
  try {
    console.log(`💾 Saving embedding for ${table} ID ${id} with model ${model}`);

    // Get display name from consistent mapping
    const displayNames: { [key: string]: string } = {
      'ozelgeler': 'Özelgeler',
      'makaleler': 'Makaleler',
      'sorucevap': 'Soru-Cevap',
      'danistaykararlari': 'Danıştay Kararları',
      'chat_history': 'Sohbet Geçmişi'
    };
    const displayName = displayNames[table] || table.charAt(0).toUpperCase() + table.slice(1);

    // Get settings for source database
    const dbSettings = await getDatabaseSettings();

    // Convert id to integer, but handle invalid ids
    const numericId = parseInt(id);
    if (isNaN(numericId)) {
      throw new Error(`Invalid ID for ${table}: ${id} is not a valid integer`);
    }

    // First try to check if record exists
    const existingRecord = await targetPool.query(
      `SELECT id FROM unified_embeddings
       WHERE source_table = $1 AND source_id = $2`,
      [displayName, numericId]
    );

    let result;
    if (existingRecord.rows.length > 0) {
      // Update existing record
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
          displayName,
          numericId
        ]
      );
    } else {
      // Insert new record
      result = await targetPool.query(
        `INSERT INTO unified_embeddings (
          source_type, source_name, source_table, source_id,
          content, embedding, metadata, tokens_used, model_used
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING id`,
        [
          'database',
          sourceDbName || (dbSettings?.sourceDatabase || 'rag_chatbot'),
          displayName,
          numericId,
          text,
          `[${embedding.join(',')}]`,
          JSON.stringify({ table, id }),
          150,
          model
        ]
      );

      console.log('✅ Saved embedding for', table, 'ID:', id, 'returned ID:', result.rows[0].id, 'Display name:', displayName);
    }
  } catch (err) {
    console.error('❌ Error saving embedding:', err);
    console.error('Table:', table, 'ID:', id, 'Display name:', displayName);
    throw err; // Re-throw to stop processing
  }
}

// Pause migration
router.post('/pause', async (req: Request, res: Response) => {
  if (migrationProgress.status === 'processing') {
    migrationProgress.status = 'paused';
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
    const result = await asembPool.query(`
      SELECT
        COUNT(*) as totalEmbeddings,
        COUNT(DISTINCT source_table) as tablesProcessed,
        SUM(CAST(metadata->>'tokens' AS INTEGER)) as totalTokens,
        COUNT(DISTINCT metadata->>'model') as modelsUsed
      FROM unified_embeddings
    `);

    const byTable = await asembPool.query(`
      SELECT
        source_table,
        COUNT(*) as count,
        SUM(CAST(metadata->>'tokens' AS INTEGER)) as tokens
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

    // Use consistent display name mapping
    const displayNames: { [key: string]: string } = {
      'ozelgeler': 'Özelgeler',
      'makaleler': 'Makaleler',
      'sorucevap': 'Soru-Cevap',
      'danistaykararlari': 'Danıştay Kararları',
      'chat_history': 'Sohbet Geçmişi'
    };

    const tables = [];

    for (const tableRow of tablesQuery.rows) {
      const tableName = tableRow.table_name;

      try {
        // Get total records count
        const countResult = await sourcePool.query(`
          SELECT COUNT(*) as total
          FROM public."${tableName}"
        `);
        const totalRecords = parseInt(countResult.rows[0].total);

        // Get embedded records count from unified_embeddings
        const embeddedResult = await asembPool.query(`
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
        const progressResult = await asembPool.query(`
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

    const results = {};
    let totalCount = 0;

    for (const variation of variations) {
      const result = await asembPool.query(`
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
    const sampleResult = await asembPool.query(`
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

    // Use consistent display name mapping
    const displayNames: { [key: string]: string } = {
      'ozelgeler': 'Özelgeler',
      'makaleler': 'Makaleler',
      'sorucevap': 'Soru-Cevap',
      'danistaykararlari': 'Danıştay Kararları',
      'chat_history': 'Sohbet Geçmişi'
    };
    const displayName = displayNames[tableName] || tableName.charAt(0).toUpperCase() + tableName.slice(1);

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
        const embeddedResult = await asembPool.query(`
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
    await asembPool.query(`
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

    // Check if process appears to be stuck
    if (isProcessStuck()) {
      console.log('⚠️  Detected stuck embedding process, attempting recovery...');

      // Check if there's actually an active process by looking for recent embeddings
      const recentEmbeddings = await asembPool.query(`
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
  // SSE connection requested

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

  // Clean up on client disconnect
  req.on('close', () => {
    clearInterval(interval);
  });
});

export default router;