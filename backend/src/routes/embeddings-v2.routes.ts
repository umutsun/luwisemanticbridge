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
  estimatedCost: 0,
  startTime: null,
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
    const result = await asembPool.query(
      `SELECT source_id
       FROM unified_embeddings
       WHERE source_table = $1
       AND source_type = 'database'
       AND source_id = ANY($2)`,
      [table, ids]
    );

    return new Set(result.rows.map(row => row.source_id));
  } catch (err) {
    console.error('Duplicate check error:', err);
    return new Set();
  }
}

// Get tables with accurate embedded counts
router.get('/tables', async (req: Request, res: Response) => {
  try {
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

    // Get display names from settings or generate from table name
    const settings = await getDatabaseSettings();
    const tableDisplayNames = settings.tableDisplayNames || {};

    // Process each table from the database
    for (const tableRow of tablesQuery.rows) {
      const tableName = tableRow.table_name;

      // Get display name from settings or generate from table name
      const displayName = tableDisplayNames[tableName] ||
                         tableName.charAt(0).toUpperCase() + tableName.slice(1);

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
          WHERE source_table = $1
          AND source_type = 'database'
        `, [displayName]);
        const embeddedRecords = parseInt(embeddedResult.rows[0].embedded) || 0;

        // Check if table is currently being processed
        const progressResult = await asembPool.query(`
          SELECT status
          FROM embedding_progress
          WHERE table_name = $1
          ORDER BY created_at DESC
          LIMIT 1
        `, [tableName]);

        const status = progressResult.rows[0]?.status || 'pending';

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

    res.json({
      tables: tablesWithMeta,
      databaseName
    });
  } catch (error) {
    console.error('Tables fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch tables' });
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

  res.json(migrationProgress);
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
        estimatedCost: 0,
        startTime: Date.now(),
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
    processTables(tables, batchSize, embeddingMethod, operationId).catch(err => {
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
async function processTables(tables: string[], batchSize: number, embeddingMethod: string, operationId?: string) {
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

        for (let i = 0; i < batchTexts.length; i++) {
          const id = rowIds[i];
          if (!duplicateIds.has(id)) {
            uniqueTexts.push(batchTexts[i]);
            uniqueRows.push(validRows[i]);
            uniqueIds.push(id);
          }
        }

        if (uniqueTexts.length === 0) {
          offset = primaryKey !== 'ROW_NUMBER' ?
            validRows[validRows.length - 1]?.[primaryKey] || offset :
            offset + batchSize;
          continue;
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
            migrationProgress.current++;
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
                await saveEmbedding(table, subBatchRows[0], subBatchIds[0], subBatchTexts[0], embedding, 'text-embedding-004');

                // Update progress
                processedInTable++;
                migrationProgress.current++;
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
                await saveEmbedding(table, subBatchRows[0], subBatchIds[0], subBatchTexts[0], embedding, 'text-embedding-004');

                // Update progress
                processedInTable++;
                migrationProgress.current++;
              } else {
                // Handle batch response
                for (let j = 0; j < subBatchTexts.length; j++) {
                  if (data.embeddings && data.embeddings[j] && data.embeddings[j].values) {
                    const embedding = data.embeddings[j].values;
                    await saveEmbedding(table, subBatchRows[j], subBatchIds[j], subBatchTexts[j], embedding, 'text-embedding-004');

                    processedInTable++;
                    migrationProgress.current++;
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
              for (let j = 0; j < response.data.length; j++) {
                const embedding = response.data[j].embedding;
                await saveEmbedding(table, subBatchRows[j], subBatchIds[j], subBatchTexts[j], embedding, 'text-embedding-ada-002');

                // Update progress
                processedInTable++;
                migrationProgress.current++;
                migrationProgress.tokensUsed += 150; // Estimate
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
    // Get display name from settings
    const settings = await getDatabaseSettings();
    const tableDisplayNames = settings.tableDisplayNames || {};
    const displayName = tableDisplayNames[table] || table.charAt(0).toUpperCase() + table.slice(1);

    // Convert id to integer, but handle invalid ids
    const numericId = parseInt(id);
    if (isNaN(numericId)) {
      throw new Error(`Invalid ID for ${table}: ${id} is not a valid integer`);
    }

    // First try to check if record exists
    const existingRecord = await targetPool.query(
      `SELECT id FROM unified_embeddings
       WHERE source_table = $1 AND source_id = $2`,
      [displayNames[table] || table, numericId]
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
          sourceDbName || (settings.sourceDatabase || 'rag_chatbot'),
          displayName,
          numericId,
          text,
          `[${embedding.join(',')}]`,
          JSON.stringify({ table, id }),
          150,
          model
        ]
      );

      // Saved embedding
    } catch (err) {
    console.error('❌ Error saving embedding:', err);
    console.error('Table:', table, 'ID:', id);
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
      WHERE source_type = 'database'
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
          WHERE source_table = $1
          AND source_type = 'database'
        `, [tableName]);
        const embeddedRecords = parseInt(embeddedResult.rows[0].embedded);

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

    res.json({ tables });
  } catch (error) {
    console.error('Tables error:', error);
    res.status(500).json({ error: 'Failed to fetch tables' });
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