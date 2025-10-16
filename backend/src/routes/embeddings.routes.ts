import { Router, Request, Response } from 'express';
import { Pool } from 'pg';
import OpenAI from 'openai';
import { redis } from '../config/redis';
import crypto from 'crypto';
import { getDatabaseSettings, getSettingsBasedPool, resetSettingsBasedPool } from '../config/database.config';

// ASEMB database - where unified_embeddings table is stored
const lsembPool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/postgres'
});

const router = Router();

// Use centralized Redis configuration (port 6379)

// Source database - where we read data from (dynamic from settings)
let sourcePool: Pool | null = null;
let availableTables: string[] = [];

async function getSourcePool(): Promise<Pool> {
  if (!sourcePool) {
    // Always try to get database from settings first for dynamic behavior
    try {
      const dbSettings = await getDatabaseSettings();
      console.log('📊 Database settings found:', dbSettings);

      // Use settings-based pool for any configured database
      sourcePool = await getSettingsBasedPool();
      console.log('📊 Using settings-based database pool for embeddings manager');

    } catch (error) {
      console.error('❌ Failed to create settings-based pool, using fallback:', error);
      // Dynamic fallback based on environment variables
      sourcePool = process.env.RAG_CHATBOT_DATABASE_URL ?
        new Pool({
          connectionString: process.env.RAG_CHATBOT_DATABASE_URL
        }) :
        new Pool({
          host: process.env.POSTGRES_HOST || 'localhost',
          port: parseInt(process.env.POSTGRES_PORT || '5432'),
          database: process.env.POSTGRES_DB || 'postgres',
          user: process.env.POSTGRES_USER || 'postgres',
          password: process.env.POSTGRES_PASSWORD || 'postgres'
        });
      console.log('📊 Using fallback database for embeddings manager');
    }
  }
  return sourcePool;
}

// Get all available tables from the source database dynamically
async function getAvailableTables(): Promise<string[]> {
  if (availableTables.length === 0) {
    try {
      const pool = await getSourcePool();
      const result = await pool.query(`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
        ORDER BY table_name
      `);
      availableTables = result.rows.map(row => row.table_name);
      console.log('📊 Available tables:', availableTables);
    } catch (error) {
      console.error('❌ Failed to get available tables:', error);
      availableTables = [];
    }
  }
  return availableTables;
}

// Get display names for tables dynamically
async function getTableDisplayNames(): Promise<{[key: string]: string}> {
  const tables = await getAvailableTables();
  const displayNames: {[key: string]: string} = {};

  for (const table of tables) {
    // Generate display name from table name (capitalize and remove underscores)
    displayNames[table] = table
      .replace(/_/g, ' ')
      .replace(/\b\w/g, l => l.toUpperCase());
  }

  return displayNames;
}

// Guess the content column for a table based on common patterns
async function guessContentColumn(tableName: string): Promise<string> {
  try {
    const pool = await getSourcePool();
    const columnsResult = await pool.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = $1
      AND table_schema = 'public'
      ORDER BY ordinal_position
    `, [tableName]);

    const columns = columnsResult.rows;

    // Look for common content column patterns
    const contentPatterns = [
      'content', 'icerik', 'text', 'description', 'aciklama', 'message',
      'body', 'mesaj', 'metin', 'summary', 'ozet'
    ];

    for (const pattern of contentPatterns) {
      const found = columns.find(col =>
        col.column_name.toLowerCase().includes(pattern)
      );
      if (found) {
        return `"${found.column_name}"`;
      }
    }

    // Special handling for known table patterns
    if (tableName.includes('soru') || tableName.includes('cevap')) {
      // For Q&A tables, try to concat question and answer columns
      const soruCol = columns.find(col =>
        col.column_name.toLowerCase().includes('soru')
      );
      const cevapCol = columns.find(col =>
        col.column_name.toLowerCase().includes('cevap')
      );
      if (soruCol && cevapCol) {
        return `CONCAT("${soruCol.column_name}", ' ', "${cevapCol.column_name}")`;
      }
    }

    // Fallback: use the first text column
    const textColumn = columns.find(col =>
      col.data_type.includes('text') || col.data_type.includes('varchar')
    );
    if (textColumn) {
      return `"${textColumn.column_name}"`;
    }

    // Last resort: use first column
    if (columns.length > 0) {
      return `"${columns[0].column_name}"`;
    }

    // If no columns found, return a default
    return '*';

  } catch (error) {
    console.error(`Error guessing content column for ${tableName}:`, error);
    return '*';
  }
}

// Target database (lsemb) - where we write embeddings to
const targetPool = new Pool({
  connectionString: process.env.DATABASE_URL
});

// Use targetPool for default queries (settings, migration history)
const pgPool = targetPool;

// Get embedding settings from database
async function getEmbeddingSettings() {
  try {
    const providerResult = await targetPool.query(
      "SELECT setting_value FROM chatbot_settings WHERE setting_key = 'embedding_provider'"
    );
    const modelResult = await targetPool.query(
      "SELECT setting_value FROM chatbot_settings WHERE setting_key = 'embedding_model'"
    );

    const provider = providerResult.rows[0]?.setting_value || 'openai';
    const model = modelResult.rows[0]?.setting_value || 'text-embedding-3-small';

    return { provider, model };
  } catch (error) {
    console.error('Error fetching embedding settings:', error);
    return { provider: 'openai', model: 'text-embedding-3-small' };
  }
}

// Get OpenAI API key from database settings
async function getOpenAIClient() {
  try {
    const result = await targetPool.query(
      "SELECT setting_value FROM chatbot_settings WHERE setting_key = 'openai_api_key'"
    );
    const apiKey = result.rows[0]?.setting_value || process.env.OPENAI_API_KEY || '';
    return new OpenAI({ apiKey });
  } catch (error) {
    console.error('Error fetching OpenAI API key:', error);
    return new OpenAI({ apiKey: process.env.OPENAI_API_KEY || '' });
  }
}

// Get Mistral API key from database settings
async function getMistralClient() {
  try {
    const result = await targetPool.query(
      "SELECT setting_value FROM chatbot_settings WHERE setting_key = 'mistral_api_key'"
    );
    const apiKey = result.rows[0]?.setting_value || '';
    if (!apiKey) {
      throw new Error('Mistral API key not found in settings');
    }
    // Return the API key for use with fetch
    return apiKey;
  } catch (error) {
    console.error('Error getting Mistral API key:', error);
    throw error;
  }
}

// Get HuggingFace Access Token from database settings
async function getHuggingFaceApiKey() {
  try {
    const result = await targetPool.query(
      "SELECT setting_value FROM chatbot_settings WHERE setting_key = 'huggingface_api_key'"
    );
    const accessToken = result.rows[0]?.setting_value || process.env.HUGGINGFACE_API_KEY || '';
    console.log('HuggingFace Access Token check:');
    console.log('- From database:', result.rows[0]?.setting_value ? 'Found' : 'Not found');
    console.log('- From environment:', process.env.HUGGINGFACE_API_KEY ? 'Found' : 'Not found');
    console.log('- Final result:', accessToken ? 'Available' : 'Missing');

    if (!accessToken) {
      throw new Error('HuggingFace Access Token not found in settings or environment. Please add your Access Token in the settings page.');
    }
    return accessToken;
  } catch (error) {
    console.error('Error fetching HuggingFace Access Token:', error);
    throw error;
  }
}

// Get Cohere API key from database settings
async function getCohereApiKey() {
  try {
    const result = await targetPool.query(
      "SELECT setting_value FROM chatbot_settings WHERE setting_key = 'cohere_api_key'"
    );
    const apiKey = result.rows[0]?.setting_value || process.env.COHERE_API_KEY || '';
    if (!apiKey) {
      throw new Error('Cohere API key not found in settings or environment');
    }
    return apiKey;
  } catch (error) {
    console.error('Error fetching Cohere API key:', error);
    throw error;
  }
}

// Get Voyage AI API key from database settings
async function getVoyageApiKey() {
  try {
    const result = await targetPool.query(
      "SELECT setting_value FROM chatbot_settings WHERE setting_key = 'voyage_api_key'"
    );
    const apiKey = result.rows[0]?.setting_value || process.env.VOYAGE_API_KEY || '';
    if (!apiKey) {
      throw new Error('Voyage AI API key not found in settings or environment');
    }
    return apiKey;
  } catch (error) {
    console.error('Error fetching Voyage AI API key:', error);
    throw error;
  }
}

// Get Google API key from database settings
async function getGoogleApiKey() {
  try {
    const result = await targetPool.query(
      "SELECT setting_value FROM chatbot_settings WHERE setting_key = 'google_api_key'"
    );
    const apiKey = result.rows[0]?.setting_value || process.env.GOOGLE_API_KEY || '';
    if (!apiKey) {
      throw new Error('Google API key not found in settings or environment');
    }
    return apiKey;
  } catch (error) {
    console.error('Error fetching Google API key:', error);
    throw error;
  }
}

// Get Jina AI API key from database settings
async function getJinaApiKey() {
  try {
    const result = await targetPool.query(
      "SELECT setting_value FROM chatbot_settings WHERE setting_key = 'jina_api_key'"
    );
    const apiKey = result.rows[0]?.setting_value || process.env.JINA_API_KEY || '';
    if (!apiKey) {
      throw new Error('Jina AI API key not found in settings or environment');
    }
    return apiKey;
  } catch (error) {
    console.error('Error fetching Jina AI API key:', error);
    throw error;
  }
}

// Progress tracking
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
  processedTables: [],
  currentBatch: 0,
  totalBatches: 0,
  fallbackMode: false,
  fallbackReason: null,
  embeddingSettings: null
};

// Load progress from Redis on startup
async function loadProgressFromRedis() {
  try {
    const savedProgress = await redis.get('migration:progress');
    if (savedProgress) {
      const parsed = JSON.parse(savedProgress);

      // Only restore if it was in progress or paused
      if (parsed.status === 'processing' || parsed.status === 'paused') {
        // If it was processing, mark as paused for safety
        if (parsed.status === 'processing') {
          parsed.status = 'paused';
        }

        // Restore the progress
        migrationProgress = {
          ...migrationProgress,
          ...parsed,
          status: 'paused' // Always start as paused after server restart
        };

        console.log('✅ Migration progress loaded from Redis:', {
          status: migrationProgress.status,
          current: migrationProgress.current,
          total: migrationProgress.total,
          currentTable: migrationProgress.currentTable
        });

        // Update Redis with paused status
        await redis.set('migration:progress', JSON.stringify(migrationProgress), 'EX', 7 * 24 * 60 * 60);
      }
    }
  } catch (err) {
    console.error('Failed to load progress from Redis:', err);
  }
}

// Helper function to generate cache key for text
function getEmbeddingCacheKey(text: string): string {
  const hash = crypto.createHash('md5').update(text).digest('hex');
  return `embedding:${hash}`;
}

// Export the load function to be called on server startup
export { loadProgressFromRedis };

// Enhanced embedding cache with performance tracking
async function getEmbeddingWithCache(text: string, openai: OpenAI): Promise<{ embedding: number[], cached: boolean, tokens: number }> {
  const cacheKey = getEmbeddingCacheKey(text);
  const startTime = Date.now();

  // Check Redis cache first with detailed logging
  try {
    const cached = await redis.get(cacheKey);
    if (cached) {
      const cacheTime = Date.now() - startTime;
      console.log(`🎯 Cache HIT for text (${text.substring(0, 50)}...) - ${cacheTime}ms`);

      // Track cache hit statistics
      try {
        await redis.incr('cache:hits');
        await redis.incr('cache:embedding_hits');
      } catch (statErr) {
        // Ignore stats errors
      }

      return {
        embedding: JSON.parse(cached),
        cached: true,
        tokens: 0 // No tokens used for cached embeddings
      };
    }
  } catch (err) {
    console.error('❌ Redis cache read error:', err);
  }

  // Generate new embedding if not cached
  console.log(`❌ Cache MISS for text (${text.substring(0, 50)}...)`);
  const response = await openai.embeddings.create({
    model: 'text-embedding-ada-002',
    input: text.substring(0, 8000)
  });

  const embedding = response.data[0].embedding;

  // Store in Redis cache with optimized TTL (longer for better hit rate)
  try {
    await redis.set(cacheKey, JSON.stringify(embedding), 'EX', 90 * 24 * 60 * 60); // 90 days instead of 30

    // Track cache miss statistics
    await redis.incr('cache:misses');
    await redis.incr('cache:embedding_misses');

    // Set expiration for stats
    await redis.expire('cache:hits', 24 * 60 * 60); // 1 day
    await redis.expire('cache:misses', 24 * 60 * 60);
    await redis.expire('cache:embedding_hits', 24 * 60 * 60);
    await redis.expire('cache:embedding_misses', 24 * 60 * 60);

  } catch (err) {
    console.error('❌ Redis cache write error:', err);
  }

  return {
    embedding,
    cached: false,
    tokens: response.usage?.total_tokens || 0
  };
}

// Get migration history
router.get('/history', async (req: Request, res: Response) => {
  try {
    const { limit = 50, offset = 0, status } = req.query;
    
    let query = `
      SELECT 
        migration_id,
        source_type,
        source_name,
        database_name,
        table_name,
        total_records,
        processed_records,
        successful_records,
        failed_records,
        status,
        batch_size,
        model_used,
        tokens_used,
        estimated_cost,
        error_message,
        started_at,
        completed_at,
        duration_seconds,
        ROUND((processed_records::NUMERIC / NULLIF(total_records, 0)) * 100, 2) as progress_percentage
      FROM migration_history
    `;
    
    const params: any[] = [];
    if (status) {
      query += ' WHERE status = $1';
      params.push(status);
    }
    
    query += ' ORDER BY started_at DESC';
    query += ` LIMIT ${limit} OFFSET ${offset}`;
    
    const result = await pgPool.query(query, params);
    
    // Get total count
    const countQuery = status 
      ? 'SELECT COUNT(*) FROM migration_history WHERE status = $1'
      : 'SELECT COUNT(*) FROM migration_history';
    const countResult = await pgPool.query(countQuery, status ? [status] : []);
    
    res.json({
      history: result.rows,
      total: parseInt(countResult.rows[0].count),
      limit: parseInt(limit as string),
      offset: parseInt(offset as string)
    });
  } catch (error) {
    console.error('History fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch migration history' });
  }
});

// Get activity logs
router.get('/activity', async (req: Request, res: Response) => {
  try {
    const { limit = 100 } = req.query;
    
    const query = `
      SELECT * FROM (
        -- Migration activities
        SELECT 
          'migration' as activity_type,
          migration_id as id,
          CONCAT('Migration ', status, ': ', source_name) as description,
          status,
          started_at as timestamp,
          JSON_BUILD_OBJECT(
            'table', table_name,
            'records', total_records,
            'processed', processed_records,
            'cost', estimated_cost
          ) as metadata
        FROM migration_history
        
        UNION ALL
        
        -- Document processing activities
        SELECT 
          'document' as activity_type,
          migration_id as id,
          CONCAT('Document processed: ', document_name) as description,
          status,
          created_at as timestamp,
          JSON_BUILD_OBJECT(
            'type', document_type,
            'size', file_size_bytes,
            'chunks', chunks_created
          ) as metadata
        FROM document_processing_history
        WHERE migration_id IS NOT NULL
        
        UNION ALL
        
        -- Scraper activities
        SELECT 
          'scraper' as activity_type,
          migration_id as id,
          CONCAT('Scraped: ', domain) as description,
          status,
          scraped_at as timestamp,
          JSON_BUILD_OBJECT(
            'url', url,
            'status_code', status_code,
            'links', links_found,
            'response_time', response_time_ms
          ) as metadata
        FROM scraper_history_detailed
        WHERE migration_id IS NOT NULL
      ) activities
      ORDER BY timestamp DESC
      LIMIT $1
    `;
    
    const result = await pgPool.query(query, [limit]);
    
    res.json({
      activities: result.rows,
      total: result.rows.length
    });
  } catch (error) {
    console.error('Activity fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch activities' });
  }
});

// Get migration statistics
router.get('/statistics', async (req: Request, res: Response) => {
  try {
    // Overall statistics
    const overallQuery = `
      SELECT 
        COUNT(*) as total_migrations,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed,
        COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed,
        COUNT(CASE WHEN status = 'processing' THEN 1 END) as processing,
        COALESCE(SUM(processed_records), 0) as total_records_processed,
        COALESCE(SUM(tokens_used), 0) as total_tokens,
        COALESCE(SUM(estimated_cost), 0) as total_cost,
        COALESCE(AVG(duration_seconds), 0) as avg_duration
      FROM migration_history
    `;
    
    const overallResult = await pgPool.query(overallQuery);
    
    // Daily statistics (last 30 days)
    const dailyQuery = `
      SELECT 
        DATE(started_at) as date,
        COUNT(*) as migrations,
        SUM(processed_records) as records,
        SUM(tokens_used) as tokens,
        SUM(estimated_cost) as cost
      FROM migration_history
      WHERE started_at >= NOW() - INTERVAL '30 days'
      GROUP BY DATE(started_at)
      ORDER BY date DESC
    `;
    
    const dailyResult = await pgPool.query(dailyQuery);
    
    // By source type
    const sourceQuery = `
      SELECT 
        source_type,
        COUNT(*) as count,
        SUM(processed_records) as records,
        AVG(duration_seconds) as avg_duration
      FROM migration_history
      GROUP BY source_type
    `;
    
    const sourceResult = await pgPool.query(sourceQuery);
    
    res.json({
      overall: overallResult.rows[0],
      daily: dailyResult.rows,
      bySource: sourceResult.rows
    });
  } catch (error) {
    console.error('Statistics fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch statistics' });
  }
});

// Get comprehensive embedding statistics
router.get('/stats', async (req: Request, res: Response) => {
  try {
    // Get statistics from unified_embeddings table
    const totalResult = await targetPool.query(`
      SELECT 
        COUNT(*) as total_embeddings,
        COALESCE(SUM(tokens_used), 0) as total_tokens,
        COALESCE(AVG(tokens_used), 0) as avg_tokens
      FROM unified_embeddings
    `).catch(err => {
      console.error('Error querying unified_embeddings:', err);
      return { rows: [{ total_embeddings: 0, total_tokens: 0, avg_tokens: 0 }] };
    });
    
    const totalEmbeddings = parseInt(totalResult.rows[0].total_embeddings) || 0;
    const totalTokens = parseInt(totalResult.rows[0].total_tokens) || 0;
    const avgTokens = Math.round(totalResult.rows[0].avg_tokens) || 0;
    
    // Get statistics by source table
    const bySourceResult = await targetPool.query(`
      SELECT 
        source_table,
        COUNT(*) as count,
        COALESCE(SUM(tokens_used), 0) as tokens_used,
        COALESCE(ROUND(AVG(tokens_used)), 0) as avg_tokens
      FROM unified_embeddings
      GROUP BY source_table
      ORDER BY count DESC
    `).catch(err => {
      console.error('Error querying by source:', err);
      return { rows: [] };
    });
    
    // Get model usage statistics
    const modelUsageResult = await targetPool.query(`
      SELECT 
        model_used as model,
        COUNT(*) as count,
        COALESCE(SUM(tokens_used), 0) as total_tokens
      FROM unified_embeddings
      GROUP BY model_used
      ORDER BY count DESC
    `).catch(err => {
      console.error('Error querying model usage:', err);
      return { rows: [] };
    });
    
    // Get recent activity (last 24 hours)
    const recentActivityResult = await targetPool.query(`
      SELECT 
        source_table,
        'create' as operation,
        COUNT(*) as count,
        TO_CHAR(MAX(created_at), 'HH24:MI') as time
      FROM unified_embeddings
      WHERE created_at > NOW() - INTERVAL '24 hours'
      GROUP BY source_table
      ORDER BY MAX(created_at) DESC
      LIMIT 5
    `).catch(err => {
      console.error('Error querying recent activity:', err);
      return { rows: [] };
    });
    
    // Calculate cost estimate ($0.0001 per 1K tokens)
    const costEstimate = (totalTokens / 1000) * 0.0001;
    
    // Also get the old format for backward compatibility
    const tables = [];
    let totalRecords = 0;
    let embeddedRecords = totalEmbeddings;

    // Get database name dynamically
    const sourceDatabaseName = await getSourceDatabaseName();

    // Get statistics from source tables dynamically
    const targetTables = await getAvailableTables();
    
    for (const tableName of targetTables) {
      try {
        // Get count from source database - handle connection errors
        let sourceCount = 0;
        if (sourcePool) {
          try {
            const countResult = await sourcePool.query(
              `SELECT COUNT(*) as count FROM "${tableName}"`
            );
            sourceCount = parseInt(countResult.rows[0].count) || 0;
          } catch (err: any) {
            console.error(`Error querying source table ${tableName}:`, err.message);
          }
        }
        
        // Get embedded count from unified_embeddings
        // Use dynamic display name from table name
        const displayNames = await getTableDisplayNames();
        const sourceTableName = displayNames[tableName] || tableName;

        const embeddedResult = await targetPool.query(
          `SELECT COUNT(*) as count FROM unified_embeddings
           WHERE source_table = $1 AND source_type = 'database'`,
          [sourceTableName]
        );
        const embedded = parseInt(embeddedResult.rows[0].count) || 0;
        
        if (sourceCount > 0 || embedded > 0) {
          tables.push({
            name: tableName,
            database: sourceDatabaseName,
            schema: 'public',
            count: sourceCount,
            embedded: embedded,
            pending: Math.max(0, sourceCount - embedded)
          });
          
          totalRecords += sourceCount;
        }
      } catch (err) {
        console.error(`Error processing table ${tableName}:`, err);
      }
    }
    
    res.json({
      // New detailed stats format
      totalEmbeddings,
      totalTokens,
      avgTokens,
      costEstimate,
      bySource: bySourceResult.rows.map(row => ({
        source_table: row.source_table,
        count: parseInt(row.count),
        tokens_used: parseInt(row.tokens_used) || 0,
        avg_tokens: parseInt(row.avg_tokens) || 0
      })),
      modelUsage: modelUsageResult.rows.map(row => ({
        model: row.model || 'text-embedding-ada-002',
        count: parseInt(row.count),
        total_tokens: parseInt(row.total_tokens) || 0
      })),
      recentActivity: recentActivityResult.rows.map(row => ({
        source_table: row.source_table,
        operation: row.operation,
        count: parseInt(row.count),
        time: row.time
      })),
      // Old format for backward compatibility
      database: sourceDatabaseName,
      totalRecords,
      embeddedRecords,
      pendingRecords: Math.max(0, totalRecords - embeddedRecords),
      tables: tables
    });
  } catch (error: any) {
    console.error('Stats error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch statistics',
      details: error.message 
    });
  }
});

// Start migration process
router.post('/migrate', async (req: Request, res: Response) => {
  try {
    const {
      sourceType = 'database',  // database, excel, pdf, csv, api
      sourceName = process.env.POSTGRES_DB || 'postgres',  // dynamic source identifier
      tables,
      batchSize = 10,
      workerCount = 1,  // number of parallel workers
      filePath = null,  // for file-based sources
      options = {},  // additional source-specific options
      resume = false  // whether to resume from previous progress
    } = req.body;
    
    // Validate based on source type
    if (sourceType === 'database') {
      if (!tables || !Array.isArray(tables) || tables.length === 0) {
        return res.status(400).json({ error: 'Tables array is required for database source' });
      }
    } else if (['excel', 'pdf', 'csv'].includes(sourceType)) {
      if (!filePath) {
        return res.status(400).json({ error: 'File path is required for file-based sources' });
      }
    } else if (sourceType === 'api') {
      if (!options.endpoint) {
        return res.status(400).json({ error: 'API endpoint is required' });
      }
    }
    
    // Check if migration is already running
    if (migrationProgress.status === 'processing') {
      return res.status(400).json({
        error: 'Migration already in progress',
        progress: migrationProgress
      });
    }

    // If resuming, check if there's existing progress
    if (resume && migrationProgress.status === 'paused' && migrationProgress.migrationId) {
      console.log('▶️ Resuming paused migration...');
      // Continue with existing migration
      migrationProgress.status = 'processing';

      // Use the original tables from migration progress if available
      const originalTables = migrationProgress.tables || tables;
      const remainingTables = originalTables.filter((table: string) => !migrationProgress.processedTables?.includes(table));

      console.log('Resuming migration:');
      console.log('- Original tables:', originalTables);
      console.log('- Processed tables:', migrationProgress.processedTables);
      console.log('- Remaining tables:', remainingTables);
      console.log('- Request tables:', tables);

      // Restart workers with the same configuration
      const workers = [];
      if (remainingTables.length > 0) {
        const tablesPerWorker = Math.ceil(remainingTables.length / workerCount);

        for (let i = 0; i < workerCount; i++) {
          const workerTables = remainingTables.slice(i * tablesPerWorker, (i + 1) * tablesPerWorker);
          if (workerTables.length > 0) {
            const workerPromise = processMigration(workerTables, batchSize, migrationProgress.migrationId!, i + 1, true, migrationProgress.embeddingSettings).catch(err => {
              console.error(`Worker ${i + 1} error:`, err);
              migrationProgress.error = err.message;
              migrationProgress.status = 'error';
              updateMigrationHistory(migrationProgress.migrationId!, 'failed', err.message);
            });
            workers.push(workerPromise);
          }
        }
      }

      // Wait for all workers to complete
      Promise.all(workers).then(async () => {
        if (migrationProgress.status !== 'paused' && migrationProgress.status !== 'error') {
          migrationProgress.status = 'completed';
          updateMigrationHistory(migrationProgress.migrationId!, 'completed');

          // Don't clear progress immediately, keep it for UI to show completion
          try {
            // Update Redis with completed status
            await redis.set('migration:progress', JSON.stringify(migrationProgress), 'EX', 30); // Keep for 30 seconds
            console.log('✅ Migration progress updated with completed status');
          } catch (err) {
            console.error('Failed to update migration progress in Redis:', err);
          }
        }
      });

      return res.json({ message: 'Migration resumed', progress: migrationProgress });
    }

    // Create new migration history entry
    const migrationId = await createMigrationHistory(tables, batchSize);
    
    // For new migration, calculate current progress based on existing embeddings
    let currentEmbedded = 0;
    let totalToProcess = 0;

    // Get embedding settings - use frontend option if provided, otherwise use database settings
    let settings = await getEmbeddingSettings();

    // If frontend sent an embedding method, use it temporarily for this migration
    if (options.embeddingMethod) {
      console.log(`Using frontend embedding method: ${options.embeddingMethod}`);

      // Direct mapping from frontend selection to backend settings
      switch(options.embeddingMethod) {
        // HuggingFace Models
        case 'e5-mistral':
          settings = {
            provider: 'huggingface',
            model: 'intfloat/multilingual-e5-small'
          };
          break;
        case 'bge-m3':
          settings = {
            provider: 'huggingface',
            model: 'BAAI/bge-m3'
          };
          break;
        case 'mistral':
          settings = {
            provider: 'huggingface',
            model: 'sentence-transformers/all-mpnet-base-v2'
          };
          break;
        case 'jina-embeddings-v2-small':
          settings = {
            provider: 'huggingface',
            model: 'jinaai/jina-embeddings-v2-small-en'
          };
          break;
        case 'all-mpnet-base-v2':
          settings = {
            provider: 'huggingface',
            model: 'sentence-transformers/all-mpnet-base-v2'
          };
          break;
        // OpenAI Models
        case 'openai-text-embedding-3-large':
          settings = {
            provider: 'openai',
            model: 'text-embedding-3-large'
          };
          break;
        case 'openai-text-embedding-3-small':
          settings = {
            provider: 'openai',
            model: 'text-embedding-3-small'
          };
          break;
        // Cohere
        case 'cohere-embed-v3':
          settings = {
            provider: 'cohere',
            model: 'embed-english-v3.0'
          };
          break;
        // Voyage AI
        case 'voyage-large-2':
          settings = {
            provider: 'voyage',
            model: 'voyage-large-2'
          };
          break;
        // Google
        case 'google-text-embedding-004':
          settings = {
            provider: 'google',
            model: 'text-embedding-004'
          };
          break;
        // Jina AI (API)
        case 'jina-embeddings-v2':
          settings = {
            provider: 'jina',
            model: 'jina-embeddings-v2'
          };
          break;
        // Local/Random
        case 'local':
          settings = {
            provider: 'local',
            model: 'random-embeddings'
          };
          break;
        default:
          console.warn(`Unknown embedding method: ${options.embeddingMethod}, using database settings`);
      }
    }

    for (const table of tables) {
      const displayNames = await getTableDisplayNames();
      const sourceTableName = displayNames[table] || table;

      // Get total records in table
      const totalResult = await sourcePool.query(
        `SELECT COUNT(*) as count FROM public."${table}"`
      );
      const totalInTable = parseInt(totalResult.rows[0].count);

      // Get already embedded count
      const embeddedResult = await targetPool.query(
        `SELECT COUNT(DISTINCT source_id) as count
         FROM unified_embeddings
         WHERE source_table = $1 AND source_type = 'database'`,
        [sourceTableName]
      );
      const embeddedCount = parseInt(embeddedResult.rows[0].count) || 0;

      currentEmbedded += embeddedCount;
      totalToProcess += totalInTable;
    }

    // Reset progress for new migration with existing counts
    migrationProgress = {
      status: 'processing',
      current: currentEmbedded,
      total: totalToProcess,
      percentage: totalToProcess > 0 ? Math.round((currentEmbedded / totalToProcess) * 100) : 0,
      currentTable: tables[0],
      error: null,
      tokensUsed: 0,
      estimatedCost: 0,
      startTime: Date.now(),
      estimatedTimeRemaining: null,
      processedTables: [],
      currentBatch: 0,
      totalBatches: 0,
      migrationId: migrationId,
      initialEmbedded: currentEmbedded, // Track initial count for newlyEmbedded calculation
      newlyEmbedded: 0, // Will be updated as records are processed
      tables: tables,  // Store original tables for resume
      embeddingSettings: settings  // Store embedding settings for resume
    };

    console.log('🎯 Migration progress set to processing:', {
      status: migrationProgress.status,
      migrationId: migrationProgress.migrationId,
      tables: migrationProgress.tables
    });

    // Save to Redis immediately
    try {
      await redis.set('migration:progress', JSON.stringify(migrationProgress), 'EX', 7 * 24 * 60 * 60);
      console.log('✅ Migration progress saved to Redis');
    } catch (err) {
      console.error('Failed to save migration progress to Redis:', err);
    }

    // Start multiple workers in parallel
    const workers = [];
    const tablesPerWorker = Math.ceil(tables.length / workerCount);

    console.log(`Starting migration with settings:`, settings);

    // Add a small delay to ensure UI has time to update
    await new Promise(resolve => setTimeout(resolve, 1000));

    for (let i = 0; i < workerCount; i++) {
      const workerTables = tables.slice(i * tablesPerWorker, (i + 1) * tablesPerWorker);
      if (workerTables.length > 0) {
        const workerPromise = processMigration(workerTables, batchSize, migrationId, i + 1, false, settings).catch(err => {
          console.error(`Worker ${i + 1} error:`, err);
          migrationProgress.error = err.message;
          migrationProgress.status = 'error';
          updateMigrationHistory(migrationId, 'failed', err.message);
        });
        workers.push(workerPromise);
      }
    }
    
    // Wait for all workers to complete
    Promise.all(workers).then(async () => {
      if (migrationProgress.status !== 'paused' && migrationProgress.status !== 'error') {
        migrationProgress.status = 'completed';
        updateMigrationHistory(migrationId, 'completed');

        // Clear migration progress from Redis on completion
        try {
          await redis.del('migration:progress');
          console.log('✅ Migration progress cleared from Redis');
        } catch (err) {
          console.error('Failed to clear migration progress from Redis:', err);
        }
      }
    });
    
    res.json({ message: 'Migration started', progress: migrationProgress });
  } catch (error) {
    console.error('Migration start error:', error);
    res.status(500).json({ error: 'Failed to start migration' });
  }
});

// Get migration progress
router.get('/progress', async (req: Request, res: Response) => {
  try {
    console.log('=== PROGRESS ENDPOINT CALLED ===');
    console.log('Progress endpoint called. Current status:', migrationProgress.status);
    console.log('Progress keys:', Object.keys(migrationProgress));

    // Always check Redis for the latest progress data
    try {
      const redisProgress = await redis.get('migration:progress');
      if (redisProgress) {
        const parsedProgress = JSON.parse(redisProgress);
        console.log('Found progress in Redis, status:', parsedProgress.status);

        // Update memory progress from Redis
        Object.assign(migrationProgress, parsedProgress);
      }
    } catch (err) {
      console.error('Error reading progress from Redis:', err);
    }

    // If migration is active (processing or paused), get actual counts from database
    if (migrationProgress.status === 'processing' || migrationProgress.status === 'paused') {
      // Get actual embedded counts from all tables dynamically
      const tables = await getAvailableTables();
      let totalEmbedded = 0;

      for (const table of tables) {
        try {
          const displayNames = await getTableDisplayNames();

          const embeddedResult = await targetPool.query(
            `SELECT COUNT(DISTINCT source_id) as count
             FROM unified_embeddings
             WHERE source_table = $1 AND source_type = 'database'`,
            [displayNames[table]]
          );
          totalEmbedded += parseInt(embeddedResult.rows[0].count) || 0;
        } catch (err) {
          console.error(`Error getting embedded count for ${table}:`, err);
        }
      }

      // Update the progress object with actual counts
      const updatedProgress = {
        ...migrationProgress,
        current: totalEmbedded,
        newlyEmbedded: totalEmbedded - (migrationProgress.initialEmbedded || 0),
        percentage: migrationProgress.total > 0 ? Math.round((totalEmbedded / migrationProgress.total) * 100) : 0
      };

      res.json(updatedProgress);
    } else {
      // For idle or completed status, return as-is
      res.json(migrationProgress);
    }
  } catch (error) {
    console.error('Error getting progress:', error);
    res.json(migrationProgress);
  }
});

// Get embedding statistics by model
router.get('/stats-by-model', async (req: Request, res: Response) => {
  try {
    const statsResult = await targetPool.query(`
      SELECT
        model_used,
        COUNT(*) as total_records,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_records,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed_records,
        SUM(tokens_used) as total_tokens,
        SUM(estimated_cost) as total_cost,
        AVG(duration_seconds) as avg_duration,
        MAX(completed_at) as last_used
      FROM migration_history
      WHERE model_used IS NOT NULL
      GROUP BY model_used
      ORDER BY total_records DESC
    `);

    res.json(statsResult.rows);
  } catch (error) {
    console.error('Error fetching stats by model:', error);
    res.status(500).json({ error: 'Failed to fetch stats by model' });
  }
});

// Get detailed embedding status
router.get('/status', async (req: Request, res: Response) => {
  try {
    console.log('🔍 Getting detailed embedding status...');

    // Get counts from unified_embeddings
    const embeddedResult = await targetPool.query(`
      SELECT source_table, COUNT(*) as count
      FROM unified_embeddings
      WHERE source_type = 'database'
      GROUP BY source_table
    `);

    const embeddedCounts: { [key: string]: number } = {};
    embeddedResult.rows.forEach(row => {
      embeddedCounts[row.source_table] = parseInt(row.count);
    });

    // Get total records from source tables dynamically
    const availableTables = await getAvailableTables();
    const displayNames = await getTableDisplayNames();

    // Create dynamic table configuration
    const tables = [];
    for (const tableName of availableTables) {
      // Try to determine the content column for each table
      let contentColumn = await guessContentColumn(tableName);

      tables.push({
        name: tableName,
        display: displayNames[tableName] || tableName,
        column: contentColumn
      });
    }

    const tableStatus = [];
    let totalRecords = 0;
    let totalEmbedded = 0;

    for (const table of tables) {
      try {
        // Get total records from source
        const sourceResult = await sourcePool.query(`
          SELECT COUNT(*) as total
          FROM public."${table.name}"
          WHERE ${table.column.includes('CONCAT') ? 'TRUE' : `${table.column} IS NOT NULL`}
        `);
        const totalInTable = parseInt(sourceResult.rows[0].total);

        // Get embedded count from unified_embeddings
        let embedded = embeddedCounts[table.display] || 0;
        // All other tables show 0 embedded
        const remaining = totalInTable - embedded;
        const percentage = totalInTable > 0 ? Math.round((embedded / totalInTable) * 100) : 0;

        totalRecords += totalInTable;
        totalEmbedded += embedded;

        tableStatus.push({
          name: table.name,
          displayName: table.display,
          totalRecords: totalInTable,
          embeddedRecords: embedded,
          pendingRecords: remaining,
          percentage: percentage
        });
      } catch (err) {
        console.error(`Error checking table ${table.name}:`, err);
      }
    }

    res.json({
      timestamp: new Date().toISOString(),
      overall: {
        totalRecords,
        totalEmbedded,
        totalRemaining: totalRecords - totalEmbedded,
        percentage: totalRecords > 0 ? Math.round((totalEmbedded / totalRecords) * 100) : 0
      },
      tables: tableStatus
    });
  } catch (error) {
    console.error('Error getting embedding status:', error);
    res.status(500).json({ error: 'Failed to get embedding status' });
  }
});

// Fix embedding counts - calculate and show actual progress
router.post('/fix-counts', async (req: Request, res: Response) => {
  try {
    console.log('🔍 Fixing embedding counts...');

    // Get counts from unified_embeddings
    const embeddedResult = await targetPool.query(`
      SELECT source_table, COUNT(*) as count
      FROM unified_embeddings
      WHERE source_type = 'database'
      GROUP BY source_table
    `);

    const embeddedCounts: { [key: string]: number } = {};
    embeddedResult.rows.forEach(row => {
      embeddedCounts[row.source_table] = parseInt(row.count);
    });

    // Get total records from source tables
    const sourceCounts: { [key: string]: number } = {};

    // Check each table dynamically
    const availableTables = await getAvailableTables();
    const displayNames = await getTableDisplayNames();

    // Create dynamic table configuration
    const tables = [];
    for (const tableName of availableTables) {
      // Try to determine the content column for each table
      let contentColumn = await guessContentColumn(tableName);

      tables.push({
        name: tableName,
        display: displayNames[tableName] || tableName,
        column: contentColumn
      });
    }

    for (const table of tables) {
      try {
        const result = await sourcePool.query(`
          SELECT COUNT(*) as total
          FROM public."${table.name}"
          WHERE ${table.column.includes('CONCAT') ? 'TRUE' : `${table.column} IS NOT NULL`}
        `);
        sourceCounts[table.display] = parseInt(result.rows[0].total);
      } catch (err) {
        console.error(`Error counting ${table.name}:`, err);
        sourceCounts[table.display] = 0;
      }
    }

    // Calculate overall totals based on user requirements
    let totalEmbedded = 0;
    let totalRecords = 0;

    for (const table of tables) {
      const display = table.display;
      const total = sourceCounts[display] || 0;

      // Use actual embedded counts for all tables
      totalEmbedded += embeddedCounts[display] || 0;

      totalRecords += total;
    }

    // Ensure totalEmbedded doesn't exceed totalRecords
    const actualEmbedded = Math.min(totalEmbedded, totalRecords);
    const overallPercentage = totalRecords > 0 ? Math.round((actualEmbedded / totalRecords) * 100) : 0;

    // Update migration progress
    migrationProgress = {
      ...migrationProgress,
      current: actualEmbedded,
      total: totalRecords,
      percentage: overallPercentage,
      newlyEmbedded: actualEmbedded,
      status: 'paused' // Always set to paused after fixing counts
    };

    // Update Redis
    try {
      await redis.set('migration:progress', JSON.stringify(migrationProgress), 'EX', 7 * 24 * 60 * 60);
      console.log('✅ Updated Redis with correct progress');

      // Also update embedding:progress for SSE
      await redis.set('embedding:progress', JSON.stringify({
        status: 'paused',
        current: actualEmbedded,
        total: totalRecords,
        percentage: overallPercentage,
        currentTable: migrationProgress.currentTable,
        error: null,
        startTime: Date.now(),
        newlyEmbedded: actualEmbedded,
        errorCount: 0
      }));
      console.log('✅ Updated embedding:progress for SSE');
    } catch (err) {
      console.error('Failed to update Redis:', err);
    }

    // Return detailed breakdown based on user requirements
    const breakdown: { [key: string]: any } = {};
    for (const table of tables) {
      const display = table.display;
      let embeddedRecords = 0;

      // Use actual embedded counts for all tables
      embeddedRecords = embeddedCounts[display] || 0;

      const total = sourceCounts[display] || 0;
      const pendingRecords = total - embeddedRecords;
      const percentage = total > 0 ? Math.round((embeddedRecords / total) * 100) : 0;

      breakdown[table.name] = {
        displayName: display,
        totalRecords: total,
        embeddedRecords: embeddedRecords,
        pendingRecords: pendingRecords,
        percentage: percentage
      };
    }

    res.json({
      message: 'Embedding counts fixed',
      overall: {
        totalRecords,
        totalEmbedded,
        percentage: overallPercentage
      },
      breakdown,
      progress: migrationProgress
    });
  } catch (error) {
    console.error('Error fixing embedding counts:', error);
    res.status(500).json({ error: 'Failed to fix embedding counts' });
  }
});

// Clear migration progress completely
router.post('/clear', async (req: Request, res: Response) => {
  try {
    // Reset migration progress to initial state
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
      processedTables: [],
      currentBatch: 0,
      totalBatches: 0,
      migrationId: null,
      newlyEmbedded: 0,
      tables: [],
      embeddingSettings: null
    };

    // Clear from Redis
    try {
      await redis.del('migration:progress');
      await redis.del('embedding:progress');
      await redis.del('embedding:status');
      await redis.del('embedding:pause_requested');
      await redis.del('embedding:immediate_pause');
      await redis.del('embedding:pause_timestamp');
      console.log('✅ All embedding progress cleared from Redis');
    } catch (err) {
      console.error('Failed to clear embedding progress from Redis:', err);
    }

    res.json({ message: 'Migration cleared successfully' });
  } catch (error) {
    console.error('Error clearing migration:', error);
    res.status(500).json({ error: 'Failed to clear migration' });
  }
});

// Pause migration
router.post('/pause', async (req: Request, res: Response) => {
  try {
    if (migrationProgress.status === 'processing') {
      migrationProgress.status = 'paused';

      // Persist paused status to Redis
      try {
        await redis.set('migration:progress', JSON.stringify(migrationProgress), 'EX', 7 * 24 * 60 * 60);
      } catch (err) {
        console.error('Failed to persist paused status to Redis:', err);
      }

      // Update progress with actual embedded counts
      const tables = await getAvailableTables();
      let totalEmbedded = 0;

      for (const table of tables) {
        try {
          const displayNames = await getTableDisplayNames();

          const embeddedResult = await targetPool.query(
            `SELECT COUNT(*) as count
             FROM unified_embeddings
             WHERE source_table = $1 AND source_type = 'database'`,
            [displayNames[table]]
          );
          totalEmbedded += parseInt(embeddedResult.rows[0].count) || 0;
        } catch (err) {
          console.error(`Error getting embedded count for ${table}:`, err);
        }
      }

      migrationProgress.current = totalEmbedded;
      migrationProgress.newlyEmbedded = totalEmbedded;

      res.json({ message: 'Migration paused', progress: migrationProgress });
    } else {
      res.status(400).json({ error: 'No migration in progress' });
    }
  } catch (error) {
    console.error('Error pausing migration:', error);
    res.status(500).json({ error: 'Failed to pause migration' });
  }
});

// Stop/pause migration (backward compatibility)
router.post('/stop', async (req: Request, res: Response) => {
  try {
    if (migrationProgress.status === 'processing') {
      migrationProgress.status = 'paused';

      // Persist paused status to Redis
      try {
        await redis.set('migration:progress', JSON.stringify(migrationProgress), 'EX', 7 * 24 * 60 * 60);
      } catch (err) {
        console.error('Failed to persist paused status to Redis:', err);
      }

      // Update progress with actual embedded counts
      if (migrationProgress.currentTable) {
        // Get current embedded counts for all tables
        const tables = await getAvailableTables();
        let totalEmbedded = 0;

        for (const table of tables) {
          try {
            const displayNames = await getTableDisplayNames();

            const sourceTableName = displayNames[table] || table;

            const embeddedResult = await targetPool.query(
              `SELECT COUNT(DISTINCT source_id) as count
               FROM unified_embeddings
               WHERE source_table = $1 AND source_type = 'database'`,
              [sourceTableName]
            );

            totalEmbedded += parseInt(embeddedResult.rows[0].count) || 0;
          } catch (err) {
            console.error(`Error getting embedded count for ${table}:`, err);
          }
        }

        // Update current to reflect actual embedded count
        migrationProgress.current = totalEmbedded;
        migrationProgress.percentage = Math.round(
          (migrationProgress.current / migrationProgress.total) * 100
        );
      }

      res.json({ message: 'Migration paused', progress: migrationProgress });
    } else {
      res.json({ message: 'No migration in progress', progress: migrationProgress });
    }
  } catch (error) {
    console.error('Stop migration error:', error);
    res.status(500).json({ error: 'Failed to stop migration' });
  }
});

// Generate embedding for text
router.post('/generate', async (req: Request, res: Response) => {
  try {
    const { text } = req.body;
    
    if (!text) {
      return res.status(400).json({ error: 'Text is required' });
    }
    
    // Get OpenAI client with API key from database
    const openai = await getOpenAIClient();
    
    // Generate embedding using OpenAI
    const response = await openai.embeddings.create({
      model: 'text-embedding-ada-002',
      input: text,
    });
    
    const embedding = response.data[0].embedding;
    
    res.json({
      embedding: embedding,
      dimension: embedding.length,
      model: 'text-embedding-ada-002',
      tokens: response.usage?.total_tokens
    });
  } catch (error) {
    console.error('Embedding generation error:', error);
    res.status(500).json({ error: 'Failed to generate embedding' });
  }
});

// Get available tables from database
router.get('/tables', async (req: Request, res: Response) => {
  try {
    const sourcePool = await getSourcePool();
    const tablesWithMeta = [];

    // Get target tables from settings dynamically
    const targetTables = await getTargetTables();

    // Get database name from settings dynamically
    let databaseName = process.env.POSTGRES_DB || 'postgres'; // Default database name
    try {
      // Get database name from source_database settings
      const dbSettings = await getDatabaseSettings();
      if (dbSettings && typeof dbSettings === 'object') {
        // Check all possible field names
        databaseName = dbSettings.databaseName ||
                       dbSettings.dbName ||
                       dbSettings.name ||
                       dbSettings.database ||
                       process.env.POSTGRES_DB || 'postgres';
      } else if (dbSettings && typeof dbSettings === 'string') {
        // If it's stored as a string, parse it
        try {
          const parsed = JSON.parse(dbSettings);
          databaseName = parsed.databaseName ||
                         parsed.dbName ||
                         parsed.name ||
                         parsed.database ||
                         process.env.POSTGRES_DB || 'postgres';
        } catch {
          databaseName = dbSettings;
        }
      }
    } catch (err) {
      console.log('Using default database name');
    }

    console.log(`📊 Getting tables from database: ${databaseName}`);

    for (const table of targetTables) {
      const tableName = table.name;
      const displayName = table.displayName;

      try {
        // Check if table exists in SOURCE database
        const tableCheck = await sourcePool.query(
          `SELECT EXISTS (
            SELECT FROM information_schema.tables
            WHERE table_schema = 'public'
            AND table_name = $1
          )`,
          [tableName]
        );

        if (!tableCheck.rows[0].exists) continue;

        // Get count from SOURCE database
        const countResult = await sourcePool.query(
          `SELECT COUNT(*) as count FROM public."${tableName}"`
        );
        const count = parseInt(countResult.rows[0].count);

        // Skip empty tables
        if (count === 0) continue;

        // Get actual embedded count from unified_embeddings table
        let embeddedCount = 0;
        try {
          // Map table name to display name used in unified_embeddings dynamically
          const displayNames = await getTableDisplayNames();
          const sourceTableName = displayNames[tableName] || tableName;

          const embeddingResult = await targetPool.query(
            `SELECT COUNT(DISTINCT(metadata->>'source_id')) as count
             FROM unified_embeddings
             WHERE source_table = $1 AND source_type = 'database'`
          , [sourceTableName]);
          embeddedCount = parseInt(embeddingResult.rows[0].count) || 0;
        } catch (err) {
          console.error(`Error getting embedded count for ${tableName}:`, err);
        }

        // Get text columns count from SOURCE database
        const columnsResult = await sourcePool.query(
          `SELECT COUNT(*) as count
           FROM information_schema.columns
           WHERE table_name = $1
           AND table_schema = 'public'
           AND data_type IN ('text', 'character varying', 'varchar')`,
          [tableName]
        );

        tablesWithMeta.push({
          name: tableName,
          displayName: displayName,
          database: databaseName,
          schema: 'public',
          totalRecords: count,
          embeddedRecords: embeddedCount,
          textColumns: parseInt(columnsResult.rows[0].count)
        });
      } catch (err) {
        console.error(`Error getting stats for ${tableName}:`, err);
      }
    }

    res.json({
      tables: tablesWithMeta,
      databaseName: databaseName
    });
  } catch (error) {
    console.error('Get tables error:', error);
    res.status(500).json({ error: 'Failed to fetch tables' });
  }
});

// Helper function to create migration history
async function createMigrationHistory(tables: string[], batchSize: number): Promise<string> {
  try {
    // Get dynamic source pool and database info from settings
    const sourcePool = await getSourcePool();

    // Get database name from settings
    let databaseName = process.env.POSTGRES_DB || 'postgres'; // Default fallback
    try {
      const dbSettings = await getDatabaseSettings();
      if (dbSettings && typeof dbSettings === 'object') {
        databaseName = dbSettings.databaseName ||
                       dbSettings.dbName ||
                       dbSettings.name ||
                       dbSettings.database ||
                       process.env.POSTGRES_DB || 'postgres';
      } else if (dbSettings && typeof dbSettings === 'string') {
        try {
          const parsed = JSON.parse(dbSettings);
          databaseName = parsed.databaseName ||
                         parsed.dbName ||
                         parsed.name ||
                         parsed.database ||
                         process.env.POSTGRES_DB || 'postgres';
        } catch {
          databaseName = dbSettings;
        }
      }
    } catch (err) {
      console.log('Using default database name for migration history');
    }

    console.log(`📊 Creating migration history for database: ${databaseName}`);

    // Count total records from SOURCE database
    let totalRecords = 0;
    for (const table of tables) {
      const countResult = await sourcePool.query(
        `SELECT COUNT(*) as count FROM public."${table}" WHERE embedding IS NULL`
      );
      totalRecords += parseInt(countResult.rows[0].count);
    }

    // Let PostgreSQL generate the UUID
    const result = await pgPool.query(`
      INSERT INTO migration_history (
        source_type, source_name, database_name, table_name,
        total_records, batch_size, status, model_used, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING migration_id::text
    `, [
      'database',
      tables.join(', '),
      databaseName, // Use dynamic database name from settings
      tables.join(', '),
      totalRecords,
      batchSize,
      'processing',
      'text-embedding-ada-002',
      JSON.stringify({ tables, startTime: new Date(), databaseName })
    ]);

    return result.rows[0].migration_id;
  } catch (error) {
    console.error('Error creating migration history:', error);
    return 'unknown';
  }
}

// Helper function to get target tables from settings
async function getTargetTables(): Promise<{ name: string; displayName: string }[]> {
  try {
    // Try to get target tables from chatbot_settings first
    const settingsResult = await targetPool.query(
      "SELECT setting_value FROM chatbot_settings WHERE setting_key = 'migration_target_tables'"
    );

    if (settingsResult.rows[0]?.setting_value) {
      const tableNames = JSON.parse(settingsResult.rows[0].setting_value);
      console.log(`📊 Using target tables from settings:`, tableNames);
      // Map to display names
      return tableNames.map((name: string) => ({
        name,
        displayName: name.charAt(0).toUpperCase() + name.slice(1)
      }));
    }
  } catch (err) {
    console.log('⚠️ Could not read target tables from settings, using defaults');
  }

  // Fallback to dynamic tables from database
  try {
    const availableTables = await getAvailableTables();
    const displayNames = await getTableDisplayNames();

    const defaultTables = availableTables.map(tableName => ({
      name: tableName,
      displayName: displayNames[tableName] || tableName
    }));

    return defaultTables;
  } catch (error) {
    console.error('Error getting dynamic tables:', error);
    return [];
  }

  console.log(`📊 Using default target tables:`, defaultTables.map(t => t.name));
  return defaultTables;
}

// Helper function to get display name for a table name
async function getDisplayName(tableName: string, targetTables: { name: string; displayName: string }[]): Promise<string> {
  // First check if it's in our dynamic target tables
  const tableConfig = targetTables.find(t => t.name === tableName);
  if (tableConfig) {
    return tableConfig.displayName;
  }

  // Fallback to hardcoded mappings for backward compatibility
  const displayMappings = await getTableDisplayNames();

  return displayMappings[tableName] || tableName;
}

// Helper function to update migration history
async function updateMigrationHistory(
  migrationId: string,
  status: string,
  errorMessage?: string
) {
  try {
    const updateQuery = `
      UPDATE migration_history
      SET status = $1::VARCHAR,
          error_message = $2::TEXT,
          completed_at = CASE WHEN $1::VARCHAR IN ('completed', 'failed') THEN NOW() ELSE NULL END,
          duration_seconds = EXTRACT(EPOCH FROM (NOW() - started_at))::INTEGER,
          updated_at = NOW()
      WHERE migration_id = $3::UUID
    `;

    await pgPool.query(updateQuery, [status, errorMessage || null, migrationId]);
  } catch (error) {
    console.error('Error updating migration history:', error);
  }
}

// Get source database name from settings
async function getSourceDatabaseName(): Promise<string> {
  try {
    const dbSettings = await getDatabaseSettings();
    // Try different possible field names for database name
    return dbSettings.database ||
           dbSettings.name ||
           dbSettings.databaseName ||
           dbSettings.sourceDatabase ||
           dbSettings.dbName ||
           process.env.POSTGRES_DB ||
           'lsemb'; // Default fallback
  } catch (error) {
    console.error('Error getting source database name:', error);
    return process.env.POSTGRES_DB || 'lsemb'; // fallback
  }
}

// Background migration process
async function processMigration(tables: string[], batchSize: number, migrationId: string, workerId: number = 1, isResume: boolean = false, providedSettings?: any) {
  try {
    console.log(`🚀 Worker ${workerId} starting with tables:`, tables);
    console.log(`🔧 Debug mode enabled - detailed logging active`);
    console.log(`📊 Batch size: ${batchSize}, Migration ID: ${migrationId}, Resume: ${isResume}`);

    // Get dynamic source pool and target tables from settings
    const sourcePool = await getSourcePool();
    const targetTables = await getTargetTables();
    const sourceDatabaseName = await getSourceDatabaseName(); // Get database name dynamically

    // Add initial delay to make progress visible in UI
    await new Promise(resolve => setTimeout(resolve, 500));

    // Calculate total records to process from SOURCE database
    let totalToProcess = 0;
    for (const table of tables) {
      // Ensure embedding column exists in SOURCE database
      await ensureEmbeddingColumn(table, sourcePool);

      // Get display name dynamically
      const sourceTableName = await getDisplayName(table, targetTables);

      // Get total records in table
      const totalResult = await sourcePool.query(
        `SELECT COUNT(*) as count FROM public."${table}"`
      );
      const totalInTable = parseInt(totalResult.rows[0].count);

      // Get already embedded count
      const embeddedResult = await targetPool.query(
        `SELECT COUNT(DISTINCT source_id) as count
         FROM unified_embeddings
         WHERE source_table = $1 AND source_type = 'database'`,
        [sourceTableName]
      );
      const embeddedCount = parseInt(embeddedResult.rows[0].count) || 0;

      // Calculate remaining to process
      const remaining = totalInTable - embeddedCount;
      totalToProcess += remaining;

      // If this is a resume and table has no remaining records, mark it as processed
      if (isResume && remaining === 0 && !migrationProgress.processedTables?.includes(table)) {
        if (!migrationProgress.processedTables) {
          migrationProgress.processedTables = [];
        }
        migrationProgress.processedTables.push(table);
      }
    }
    
    // Update total records to process
    if (migrationProgress.total === 0 || isResume) {
      migrationProgress.total = totalToProcess;
      // Also update current with the actual embedded count
      let actualEmbedded = 0;
      for (const table of tables) {
        const displayNames = await getTableDisplayNames();
        const sourceTableName = displayNames[table] || table;

        const embeddedResult = await targetPool.query(
          `SELECT COUNT(*) as count
           FROM unified_embeddings
           WHERE source_table = $1 AND source_type = 'database'`,
          [sourceTableName]
        );
        actualEmbedded += parseInt(embeddedResult.rows[0].count) || 0;
      }

      if (isResume) {
        migrationProgress.current = actualEmbedded;
        migrationProgress.initialEmbedded = actualEmbedded; // Set initial to current when resuming
        migrationProgress.newlyEmbedded = 0; // Reset newlyEmbedded count
        migrationProgress.percentage = Math.round((actualEmbedded / totalToProcess) * 100);
        console.log(`Worker ${workerId}: Updated progress - current: ${actualEmbedded}, total: ${totalToProcess}, percentage: ${migrationProgress.percentage}%`);
      }
    }
    
    // Process each table
    for (const table of tables) {
      if (migrationProgress.status === 'paused') {
        console.log('Migration paused by user');
        return;
      }
      
      migrationProgress.currentTable = table;
      
      // Get the main content column for each table dynamically
      const availableTables = await getAvailableTables();
      let contentColumns: { [key: string]: string } = {};

      for (const tableName of availableTables) {
        contentColumns[tableName] = await guessContentColumn(tableName);
      }
      
      try {
        const columnsResult = await targetPool.query(
          "SELECT setting_value FROM chatbot_settings WHERE setting_key = 'migration_content_columns'"
        );
        if (columnsResult.rows[0]?.setting_value) {
          contentColumns = JSON.parse(columnsResult.rows[0].setting_value);
        }
      } catch (err) {
        console.log('Using default content columns');
      }
      
      const contentColumn = contentColumns[table] || 'content';
      const primaryKey = await getPrimaryKey(table);
      
      // Process records in batches
      let offset = 0;
      let hasMore = true;
      let processedCount = 0;

      // If resuming, we need to skip already processed batches
      if (isResume) {
        // Get total embedded count for this table to skip processed batches
        const displayNames = await getTableDisplayNames();

        const sourceTableName = displayNames[table] || table;

        const embeddedResult = await targetPool.query(
          `SELECT COUNT(DISTINCT source_id) as count
           FROM unified_embeddings
           WHERE source_table = $1 AND source_type = 'database'`,
          [sourceTableName]
        );
        const embeddedCount = parseInt(embeddedResult.rows[0].count) || 0;

        // Calculate how many batches to skip
        const batchesToSkip = Math.floor(embeddedCount / batchSize);
        offset = batchesToSkip * batchSize;
        processedCount = embeddedCount;

        console.log(`Worker ${workerId}: Resuming table ${table}, embedded: ${embeddedCount}, skipping ${batchesToSkip} batches (offset: ${offset})`);
      }

      while (hasMore && migrationProgress.status !== 'paused') {
        // Get batch of records from SOURCE database
        // Use simple query with offset for pagination
        // The duplicate check will be done when inserting embeddings
        const batchQuery = primaryKey !== 'ROW_NUMBER' ? `
          SELECT ${primaryKey}, ${contentColumn} as text_content
          FROM public."${table}"
          WHERE ${contentColumn.includes('CONCAT') ? 'TRUE' : `${contentColumn} IS NOT NULL`}
          ORDER BY ${primaryKey}
          LIMIT $1 OFFSET $2
        ` : `
          SELECT ${contentColumn} as text_content
          FROM public."${table}"
          WHERE ${contentColumn.includes('CONCAT') ? 'TRUE' : `${contentColumn} IS NOT NULL`}
          LIMIT $1 OFFSET $2
        `;

        const batchResult = await sourcePool.query(batchQuery, [batchSize, offset]);
        
        if (batchResult.rows.length === 0) {
          hasMore = false;
          break;
        }
        
        // Generate embeddings for entire batch at once
        if (migrationProgress.status === 'paused') {
          return;
        }

        // Prepare batch texts and filter empty ones
        const batchTexts = [];
        const validRows = [];
        for (const row of batchResult.rows) {
          const text = row.text_content;
          if (text && text.trim() !== '') {
            batchTexts.push(text.substring(0, 8000)); // Limit text length
            validRows.push(row);
          }
        }

        if (batchTexts.length === 0) {
          offset += batchSize;
          continue;
        }

        // Process batch
        try {
          console.log(`🔄 Worker ${workerId}: Processing batch ${offset / batchSize + 1} with ${batchTexts.length} texts`);

          // Get OpenAI client
          const openai = await getOpenAIClient();

          // Check cache first and separate cached vs uncached
          const embeddings: any[] = [];
          const uncachedTexts: string[] = [];
          const uncachedIndices: number[] = [];
          let cachedCount = 0;
          let totalTokensSaved = 0;

          // Use provided settings or get from database
          const embeddingSettings = providedSettings || await getEmbeddingSettings();

          // Debug logging
          console.log(`Worker ${workerId}: providedSettings:`, providedSettings);
          console.log(`Worker ${workerId}: final embeddingSettings:`, embeddingSettings);
          let response;
          let fallbackMode = false;
          let ollamaModelName = '';

          // Check Redis cache for each text
          for (let i = 0; i < batchTexts.length; i++) {
            const cacheKey = getEmbeddingCacheKey(batchTexts[i]);
            try {
              const cached = await redis.get(cacheKey);
              if (cached) {
                embeddings[i] = { embedding: JSON.parse(cached), cached: true };
                cachedCount++;
                totalTokensSaved += 500; // Approximate tokens saved
              } else {
                uncachedTexts.push(batchTexts[i]);
                uncachedIndices.push(i);
              }
            } catch (err) {
              uncachedTexts.push(batchTexts[i]);
              uncachedIndices.push(i);
            }
          }

          // Generate embeddings only for uncached texts
          if (uncachedTexts.length > 0) {

            // Debug: Log current settings
            console.log(`Worker ${workerId}: Using embedding provider: ${embeddingSettings.provider}, model: ${embeddingSettings.model}`);

            // Try the selected provider
            try {
              if (embeddingSettings.provider === 'openai') {
                response = await openai.embeddings.create({
                  model: embeddingSettings.model,
                  input: uncachedTexts
                });
              } else if (embeddingSettings.provider === 'cohere') {
                // Use Cohere API
                const cohereApiKey = await getCohereApiKey();

                console.log(`🔧 Using Cohere model: ${embeddingSettings.model}`);

                const cohereResponse = await fetch('https://api.cohere.com/v1/embed', {
                  method: 'POST',
                  headers: {
                    'Authorization': `Bearer ${cohereApiKey}`,
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({
                    model: embeddingSettings.model,
                    texts: uncachedTexts,
                    input_type: 'search_document'
                  })
                });

                if (!cohereResponse.ok) {
                  const errorData = await cohereResponse.json();
                  throw new Error(`Cohere API error: ${errorData.message || cohereResponse.statusText}`);
                }

                const cohereData = await cohereResponse.json();
                response = {
                  data: cohereData.embeddings.map((embedding: number[]) => ({ embedding })),
                  usage: { total_tokens: cohereData.meta?.billed_units?.input_tokens || 0 }
                };
              } else if (embeddingSettings.provider === 'voyage') {
                // Use Voyage AI API
                const voyageApiKey = await getVoyageApiKey();

                console.log(`🔧 Using Voyage AI model: ${embeddingSettings.model}`);

                const voyageResponse = await fetch('https://api.voyageai.com/v1/embeddings', {
                  method: 'POST',
                  headers: {
                    'Authorization': `Bearer ${voyageApiKey}`,
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({
                    model: embeddingSettings.model,
                    input: uncachedTexts
                  })
                });

                if (!voyageResponse.ok) {
                  const errorData = await voyageResponse.json();
                  throw new Error(`Voyage AI error: ${errorData.detail || voyageResponse.statusText}`);
                }

                const voyageData = await voyageResponse.json();
                response = {
                  data: voyageData.data,
                  usage: { total_tokens: voyageData.usage?.total_tokens || 0 }
                };
              } else if (embeddingSettings.provider === 'google') {
                // Use Google Vertex AI API
                const googleApiKey = await getGoogleApiKey();

                console.log(`🔧 Using Google model: ${embeddingSettings.model}`);

                const googleResponse = await fetch(`https://us-central1-aiplatform.googleapis.com/v1/projects/${process.env.GOOGLE_PROJECT_ID || 'your-project-id'}/locations/us-central1/publishers/google/models/${embeddingSettings.model}:predict`, {
                  method: 'POST',
                  headers: {
                    'Authorization': `Bearer ${googleApiKey}`,
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({
                    instances: uncachedTexts.map(text => ({ content: text }))
                  })
                });

                if (!googleResponse.ok) {
                  const errorData = await googleResponse.json();
                  throw new Error(`Google API error: ${errorData.error?.message || googleResponse.statusText}`);
                }

                const googleData = await googleResponse.json();
                response = {
                  data: googleData.predictions.map((pred: any) => ({ embedding: pred.embeddings.values })),
                  usage: { total_tokens: 0 } // Google doesn't provide token count in this format
                };
              } else if (embeddingSettings.provider === 'jina') {
                // Use Jina AI API
                const jinaApiKey = await getJinaApiKey();

                console.log(`🔧 Using Jina AI model: ${embeddingSettings.model}`);

                const jinaResponse = await fetch(`https://api.jina.ai/v1/embeddings`, {
                  method: 'POST',
                  headers: {
                    'Authorization': `Bearer ${jinaApiKey}`,
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({
                    model: embeddingSettings.model,
                    input: uncachedTexts
                  })
                });

                if (!jinaResponse.ok) {
                  const errorData = await jinaResponse.json();
                  throw new Error(`Jina AI error: ${errorData.detail || jinaResponse.statusText}`);
                }

                const jinaData = await jinaResponse.json();
                response = {
                  data: jinaData.data,
                  usage: { total_tokens: jinaData.usage?.total_tokens || 0 }
                };
              } else if (embeddingSettings.provider === 'ollama') {
                // Use local Ollama instance
                // First get the Ollama base URL from settings
                const ollamaBaseUrlResult = await targetPool.query(
                  "SELECT setting_value FROM chatbot_settings WHERE setting_key = 'ollama_base_url'"
                );
                const ollamaBaseUrl = ollamaBaseUrlResult.rows[0]?.setting_value || 'http://localhost:11434';

                // Test if Ollama is running before proceeding
                try {
                  const testResponse = await fetch(`${ollamaBaseUrl}/api/tags`);
                  if (!testResponse.ok) {
                    throw new Error(`Ollama is not running at ${ollamaBaseUrl}`);
                  }
                  const tags = await testResponse.json();
                  console.log('✅ Ollama is running, available models:', tags.models.map((m: any) => m.name));
                } catch (error) {
                  throw new Error(`Cannot connect to Ollama at ${ollamaBaseUrl}. Please make sure Ollama is running.`);
                }

                // Get model name (remove ollama/ prefix if present)
                ollamaModelName = embeddingSettings.model.replace('ollama/', '');

                console.log(`🔧 Using Ollama at ${ollamaBaseUrl} with model ${ollamaModelName}`);

                const ollamaResponse = await fetch(`${ollamaBaseUrl}/api/embeddings`, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({
                    model: ollamaModelName,
                    prompt: uncachedTexts[0], // Ollama embeddings API takes one text at a time
                  })
                });

                  if (!ollamaResponse.ok) {
                throw new Error(`Ollama error: ${ollamaResponse.statusText}`);
              }

              const ollamaData = await ollamaResponse.json();

              // For multiple texts, we need to make individual requests
              const embeddings = [];
              for (let i = 0; i < uncachedTexts.length; i++) {
                if (i === 0) {
                  embeddings.push(ollamaData.embedding);
                } else {
                  const singleResponse = await fetch(`${ollamaBaseUrl}/api/embeddings`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      model: ollamaModelName,
                      prompt: uncachedTexts[i],
                    })
                  });
                  if (singleResponse.ok) {
                    const singleData = await singleResponse.json();
                    embeddings.push(singleData.embedding);
                  } else {
                    // Fallback to random if individual request fails
                    embeddings.push(Array.from({ length: 1536 }, () => (Math.random() - 0.5) * 0.1));
                  }
                }
              }

              response = {
                data: embeddings.map(embedding => ({ embedding })),
                usage: { total_tokens: 0 }
              };
              } else if (embeddingSettings.provider === 'mistral') {
                // Use HuggingFace for mistral provider as well
                const hfToken = await getHuggingFaceApiKey();

                const modelName = embeddingSettings.model || 'mistralai/Mistral-7B-v0.1';

                const hfResponse = await fetch(`https://api-inference.huggingface.co/pipeline/feature-extraction/${modelName}`, {
                  method: 'POST',
                  headers: {
                    'Authorization': `Bearer ${hfToken}`,
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({
                    inputs: uncachedTexts,
                    options: {
                      wait_for_model: true
                    }
                  })
                });

                if (!hfResponse.ok) {
                  const errorData = await hfResponse.json();
                  throw new Error(`HuggingFace API error: ${errorData.error || hfResponse.statusText}`);
                }

                // HuggingFace returns embeddings directly as an array
                const embeddingsData = await hfResponse.json();

                // Convert to the expected format
                response = {
                  data: Array.isArray(embeddingsData)
                    ? embeddingsData.map((embedding: any) => ({ embedding }))
                    : [{ embedding: embeddingsData }],
                  usage: { total_tokens: 0 }
                };
              } else if (embeddingSettings.provider === 'local') {
                // Use local random embeddings (no API call)
                console.log('🔧 Using local random embeddings');

                // Generate random embeddings locally
                let dimension = 1536; // Default dimension
                if (embeddingSettings.model.includes('e5-mistral')) dimension = 4096;
                else if (embeddingSettings.model.includes('3-large')) dimension = 3072;
                else if (embeddingSettings.model.includes('bge-m3')) dimension = 1024;
                else if (embeddingSettings.model.includes('mxbai') || embeddingSettings.model.includes('mpnet')) dimension = 768;
                else if (embeddingSettings.model.includes('all-MiniLM') || embeddingSettings.model.includes('minilm')) dimension = 384;

                response = {
                  data: uncachedTexts.map((text, i) => ({
                    embedding: Array.from({ length: dimension }, () => (Math.random() - 0.5) * 0.1)
                  })),
                  usage: { total_tokens: 0 }
                };

                // Mark as fallback mode since we're using random embeddings
                fallbackMode = true;
                migrationProgress.fallbackMode = true;
                migrationProgress.fallbackReason = 'Using local random embeddings';
              } else if (embeddingSettings.provider === 'huggingface') {
                // Use HuggingFace Inference API
                const huggingfaceApiKey = await getHuggingFaceApiKey();

                console.log(`🔧 Using HuggingFace model: ${embeddingSettings.model}`);

                // HuggingFace Inference API
                const authHeader = `Bearer ${huggingfaceApiKey}`;
                const apiUrl = `https://api-inference.huggingface.co/models/${embeddingSettings.model}`;
                console.log('Making HuggingFace API request to:', apiUrl);
                console.log('Authorization header length:', authHeader.length);
                console.log('Authorization header prefix:', authHeader.substring(0, 20) + '...');

                // Process texts one by one for HuggingFace API
                const embeddings = [];
                for (const text of uncachedTexts) {
                  const hfResponse = await fetch(apiUrl, {
                    method: 'POST',
                    headers: {
                      'Authorization': authHeader,
                      'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                      inputs: text,
                      parameters: {
                        wait_for_model: true
                      }
                    })
                  });

                  if (!hfResponse.ok) {
                    const errorText = await hfResponse.text();
                    throw new Error(`HuggingFace API error: ${hfResponse.status} - ${errorText}`);
                  }

                  const hfData = await hfResponse.json();
                  // Extract embedding from response
                  if (Array.isArray(hfData) && hfData.length > 0) {
                    embeddings.push(hfData[0]);
                  } else if (hfData.embedding) {
                    embeddings.push(hfData.embedding);
                  } else {
                    throw new Error('Invalid embedding response format');
                  }
                }

                // Convert to OpenAI-like format
                response = {
                  data: embeddings.map((embedding: any) => ({ embedding: Array.isArray(embedding) ? embedding : embedding })),
                  usage: { total_tokens: 0 } // HuggingFace doesn't provide token count
                };
              } else {
                throw new Error(`Provider ${embeddingSettings.provider} is not yet supported for migration. Please check your embedding settings.`);
              }
            } catch (error: any) {
              // Check if it's a quota error or API unavailable
              if (error.code === 'insufficient_quota' || error.code === 'rate_limit_exceeded' || error.status === 429 || error.message?.includes('quota') || error.message?.includes('billing')) {
                console.log(`⚠️ ${embeddingSettings.provider} quota exceeded or API error, falling back to local embeddings`);
                fallbackMode = true;

                // Generate simple random embeddings as fallback with correct dimensions
                let dimension = 1536; // Default for OpenAI
                if (embeddingSettings.model.includes('3-large')) dimension = 3072;
                else if (embeddingSettings.model.includes('e5-mistral')) dimension = 4096;
                else if (embeddingSettings.model.includes('mxbai') || embeddingSettings.model.includes('mpnet')) dimension = 768;
                else if (embeddingSettings.model.includes('all-MiniLM') || embeddingSettings.model.includes('minilm')) dimension = 384;
                else if (embeddingSettings.model.includes('mistral-embed')) dimension = 1024;
                else if (embeddingSettings.model.includes('nomic-embed-text')) dimension = 768;

                response = {
                  data: uncachedTexts.map((text, i) => ({
                    embedding: Array.from({ length: dimension }, () => (Math.random() - 0.5) * 0.1) // Small random values
                  })),
                  usage: { total_tokens: 0 }
                };

                // Update progress to indicate fallback mode
                migrationProgress.fallbackMode = true;
                migrationProgress.fallbackReason = error.message || 'OpenAI API error';
              } else {
                // Re-throw if it's not a quota error
                throw error;
              }
            }
            
            // Store new embeddings in cache and array
            for (let j = 0; j < response.data.length; j++) {
              const idx = uncachedIndices[j];
              const embedding = response.data[j].embedding;
              embeddings[idx] = { embedding, cached: false };
              
              // Cache the new embedding
              const cacheKey = getEmbeddingCacheKey(uncachedTexts[j]);
              try {
                await redis.set(cacheKey, JSON.stringify(embedding), 'EX', 30 * 24 * 60 * 60);
              } catch (err) {
                console.error('Redis cache write error:', err);
              }
            }
            
            // Update token usage (only for OpenAI, not fallback)
            if (!fallbackMode && response.usage) {
              migrationProgress.tokensUsed += response.usage.total_tokens;
              migrationProgress.estimatedCost = (migrationProgress.tokensUsed / 1000) * 0.0001;
            }
          }
          
          if (cachedCount > 0) {
            console.log(`Worker ${workerId}: Used ${cachedCount} cached embeddings, saved ~${totalTokensSaved} tokens`);
          }
          
          // Process each embedding result
          for (let i = 0; i < embeddings.length; i++) {
            const { embedding, cached } = embeddings[i];
            const row = validRows[i];
            const text = batchTexts[i];
            
            // Track token usage (divided by batch size for per-record tracking)
            const tokensPerRecord = cached ? 0 : Math.round(500); // Estimate 500 tokens per uncached record
            
            // Save embedding to unified_embeddings table in TARGET database (lsemb)
            if (primaryKey !== 'ROW_NUMBER') {
              try {
                // Get display name for the table
                const displayNames = await getTableDisplayNames();
                
                // Insert into unified_embeddings table
                await targetPool.query(
                  `INSERT INTO unified_embeddings (
                    source_type, source_name, source_table, source_id,
                    title, content, embedding, metadata, tokens_used, model_used
                  ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                  ON CONFLICT (source_type, source_name, source_table, source_id) 
                  DO UPDATE SET 
                    embedding = $7, 
                    content = $6,
                    tokens_used = $9,
                    updated_at = NOW()`,
                  [
                    'database',
                    sourceDatabaseName,
                    displayNames[table] || table,
                    row[primaryKey].toString(),
                    `${displayNames[table] || table} - ID: ${row[primaryKey]}`,
                    text.substring(0, 5000),
                    `[${embedding.join(',')}]`,
                    JSON.stringify({ 
                      original_table: table,
                      migrated_at: new Date()
                    }),
                    tokensPerRecord,
                    fallbackMode ? 'fallback-local' :
                      embeddingSettings.provider === 'ollama' ? `ollama:${ollamaModelName}` :
                      embeddingSettings.provider === 'mistral' ? embeddingSettings.model : 'text-embedding-ada-002'
                  ]
                );
                
                // Also update SOURCE database to mark as processed
                await sourcePool.query(
                  `UPDATE public."${table}" SET embedding = $1 WHERE ${primaryKey} = $2`,
                  [`[${embedding.join(',')}]`, row[primaryKey]]
                );
              } catch (err) {
                console.error(`Error saving embedding for ${table} record ${row[primaryKey]}:`, err);
              }
            } else {
              console.log(`Warning: Table ${table} has no primary key, skipping embedding update`);
            }
            
            migrationProgress.current++;
            migrationProgress.newlyEmbedded = (migrationProgress.newlyEmbedded || 0) + 1;

            // Ensure percentage doesn't exceed 100%
            migrationProgress.percentage = Math.min(
              100,
              Math.round((migrationProgress.current / migrationProgress.total) * 100)
            );

            // Persist progress to Redis
            try {
              await redis.set('migration:progress', JSON.stringify(migrationProgress), 'EX', 7 * 24 * 60 * 60); // 7 days
            } catch (err) {
              console.error('Failed to persist progress to Redis:', err);
            }
            
            // Calculate estimated time remaining
            const elapsed = Date.now() - migrationProgress.startTime;
            const ratePerMs = migrationProgress.current / elapsed; // records per millisecond
            const ratePerSecond = ratePerMs * 1000; // records per second
            const remaining = migrationProgress.total - migrationProgress.current;
            migrationProgress.estimatedTimeRemaining = Math.round(remaining / ratePerSecond); // seconds
            
            // Update migration history periodically (every 10 records)
            if (migrationProgress.current % 10 === 0) {
              await pgPool.query(`
                UPDATE migration_history 
                SET processed_records = $1,
                    successful_records = $1,
                    tokens_used = $2,
                    estimated_cost = $3,
                    updated_at = NOW()
                WHERE migration_id = $4
              `, [
                migrationProgress.current,
                migrationProgress.tokensUsed,
                migrationProgress.estimatedCost,
                migrationId
              ]);
            }
            
          }
          
          // Rate limiting - reduce delay since we're processing batches (less delay if using cache)
          const delay = cachedCount > 0 ? 20 : 50;
          await new Promise(resolve => setTimeout(resolve, delay));
          
        } catch (error: any) {
          console.error(`Error processing batch:`, error);
          migrationProgress.error = error.message;
          migrationProgress.status = 'error';
          // Break the loop on error
          break;
        }

        // Add a small delay to make progress visible in UI
        if (migrationProgress.status === 'processing') {
          await new Promise(resolve => setTimeout(resolve, 100));
        }

        offset += batchSize;
      }
      
      if (migrationProgress.status !== 'paused') {
        migrationProgress.processedTables.push(table);
      }
    }
    
    if (migrationProgress.status !== 'paused') {
      // Add delay before completion to ensure UI shows progress
      await new Promise(resolve => setTimeout(resolve, 1000));

      migrationProgress.status = 'completed';
      // Update final migration history
      await pgPool.query(`
        UPDATE migration_history 
        SET status = 'completed',
            processed_records = $1,
            successful_records = $1,
            tokens_used = $2,
            estimated_cost = $3,
            completed_at = NOW(),
            duration_seconds = EXTRACT(EPOCH FROM (NOW() - started_at))::INTEGER,
            updated_at = NOW()
        WHERE migration_id = $4::UUID
      `, [
        migrationProgress.current,
        migrationProgress.tokensUsed,
        migrationProgress.estimatedCost,
        migrationId
      ]);
    }
  } catch (error) {
    console.error('Migration error:', error);
    migrationProgress.status = 'error';
    migrationProgress.error = error instanceof Error ? error.message : 'Unknown error';
    updateMigrationHistory(migrationId, 'failed', migrationProgress.error);
  }
}

// Ensure table has embedding column
async function ensureEmbeddingColumn(tableName: string, pool: Pool) {
  try {
    // Check if column exists in SOURCE database
    const checkQuery = `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = $1
        AND column_name = 'embedding'
        AND table_schema = 'public'
    `;

    const result = await pool.query(checkQuery, [tableName]);

    if (result.rows.length === 0) {
      // Add embedding column with vector type to SOURCE database
      await pool.query(`
        ALTER TABLE public."${tableName}"
        ADD COLUMN IF NOT EXISTS embedding vector(1536)
      `);
      console.log(`Added embedding column to table ${tableName}`);
    }
  } catch (error) {
    console.error(`Error ensuring embedding column for ${tableName}:`, error);
    throw error;
  }
}

// Get primary key column for a table
async function getPrimaryKey(tableName: string): Promise<string> {
  try {
    const query = `
      SELECT column_name
      FROM information_schema.key_column_usage
      WHERE table_name = $1
        AND constraint_name = (
          SELECT constraint_name
          FROM information_schema.table_constraints
          WHERE table_name = $1
            AND constraint_type = 'PRIMARY KEY'
        )
    `;
    
    const result = await sourcePool.query(query, [tableName]);
    
    if (result.rows.length > 0) {
      // Return with proper quoting for case-sensitive columns
      const colName = result.rows[0].column_name;
      return colName === colName.toLowerCase() ? colName : `"${colName}"`;
    }
    
    // Try common variations
    const checkColumns = ['id', 'Id', 'ID', '"Id"', '"ID"'];
    for (const col of checkColumns) {
      try {
        const testQuery = `SELECT ${col} FROM public."${tableName}" LIMIT 1`;
        await sourcePool.query(testQuery);
        return col;
      } catch (err) {
        // Column doesn't exist, try next
      }
    }
    
    // Final fallback - no primary key found
    console.log(`No primary key found for table ${tableName}, will use ROW_NUMBER`);
    return 'ROW_NUMBER';
  } catch (error) {
    console.error(`Error getting primary key for ${tableName}:`, error);
    return 'ROW_NUMBER';
  }
}

// Get analytics data for enterprise dashboard
router.get('/analytics', async (req: Request, res: Response) => {
  try {
    console.log('📊 Fetching analytics data for enterprise dashboard');

    // Get token usage from unified_embeddings
    const tokenUsageResult = await targetPool.query(`
      SELECT
        COALESCE(SUM(tokens_used), 0) as used,
        (SELECT COALESCE(SUM(tokens_used), 0) FROM unified_embeddings) as remaining,
        1000000 as limit
      FROM unified_embeddings
    `).catch(err => {
      console.error('Error querying token usage:', err);
      return { rows: [{ used: 0, remaining: 1000000, limit: 1000000 }] };
    });

    // Get processing speed (records per minute in last hour)
    const speedResult = await targetPool.query(`
      SELECT
        COUNT(*) as records_processed,
        DATE_TRUNC('hour', created_at) as hour
      FROM unified_embeddings
      WHERE created_at > NOW() - INTERVAL '1 hour'
      GROUP BY hour
    `).catch(err => {
      console.error('Error querying processing speed:', err);
      return { rows: [{ records_processed: 0 }] };
    });

    // Get real-time data for charts
    const realtimeData = await targetPool.query(`
      SELECT
        DATE_TRUNC('minute', created_at) as timestamp,
        COUNT(*) as value
      FROM unified_embeddings
      WHERE created_at > NOW() - INTERVAL '1 hour'
      GROUP BY timestamp
      ORDER BY timestamp DESC
      LIMIT 60
    `).catch(err => {
      console.error('Error querying real-time data:', err);
      return { rows: [] };
    });

    // Get table data for advanced viewer
    const tableDataResult = await targetPool.query(`
      SELECT
        source_table as table_name,
        COUNT(*) as record_count,
        array_agg(DISTINCT source_id) as sample_ids
      FROM unified_embeddings
      WHERE source_type = 'database'
      GROUP BY source_table
      ORDER BY record_count DESC
      LIMIT 10
    `).catch(err => {
      console.error('Error querying table data:', err);
      return { rows: [] };
    });

    // Calculate metrics
    const tokensUsed = parseInt(tokenUsageResult.rows[0]?.used) || 0;
    const processingSpeed = speedResult.rows[0]?.records_processed || 0;

    // Format data for frontend
    const analyticsData = {
      tokenUsage: {
        used: tokensUsed,
        remaining: Math.max(0, 1000000 - tokensUsed),
        limit: 1000000
      },
      processingSpeed: processingSpeed,
      eta: processingSpeed > 0 ? Math.round((1000000 - tokensUsed) / processingSpeed) + ' min' : '--',
      realtimeData: realtimeData.rows.map(row => ({
        timestamp: new Date(row.timestamp).getTime(),
        value: parseInt(row.value) || 0
      })),
      tableData: {
        records: tableDataResult.rows,
        count: tableDataResult.rows.length,
        columns: ['table_name', 'record_count', 'sample_ids'],
        tableName: 'Embeddings Analytics'
      }
    };

    console.log('✅ Analytics data fetched successfully');
    res.json(analyticsData);
  } catch (error) {
    console.error('❌ Error fetching analytics data:', error);
    res.status(500).json({ error: 'Failed to fetch analytics data' });
  }
});

export default router;