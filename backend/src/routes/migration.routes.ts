import { Router, Request, Response } from 'express';
import { Pool } from 'pg';
import OpenAI from 'openai';
import { EventEmitter } from 'events';

const router = Router();

// Database connections will be initialized from settings
let sourcePool: Pool | null = null;
let targetPool: Pool | null = null;

// Initialize database pools from settings
async function initializePools() {
  if (sourcePool && targetPool) {
    return { sourcePool, targetPool };
  }

  try {
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
    const sourceConnectionString = `postgresql://${username}:${dbSettings.password}@${dbSettings.host}:${dbSettings.port}/${database}`;

    // Target is same as main database (lsemb)
    const targetConnectionString = process.env.DATABASE_URL || sourceConnectionString;

    sourcePool = new Pool({ connectionString: sourceConnectionString });
    targetPool = new Pool({ connectionString: targetConnectionString });

    console.log('📊 Migration pools initialized from settings');
    return { sourcePool, targetPool };
  } catch (error) {
    console.error('Failed to initialize migration pools:', error);
    throw error;
  }
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
    this.pausedMigrations.delete(id);
    const current = this.progress.get(id);
    if (current) {
      this.updateProgress(id, { ...current, status: 'stopped' });
      this.addToHistory({ ...current, id, status: 'stopped', stoppedAt: new Date().toISOString() });
    }
  }

  isPaused(id: string): boolean {
    return this.pausedMigrations.has(id);
  }

  isStopped(id: string): boolean {
    return this.stoppedMigrations.has(id);
  }

  addToHistory(data: any) {
    this.history.unshift(data);
    if (this.history.length > 100) {
      this.history = this.history.slice(0, 100);
    }
  }

  getHistory() {
    return this.history;
  }

  completeMigration(id: string) {
    const current = this.progress.get(id);
    if (current) {
      this.addToHistory({ ...current, id, completedAt: new Date().toISOString() });
    }
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
    // Initialize pools from settings
    const pools = await initializePools();

    // Get embedding provider and model from settings
    const { pool: lsembPool } = await import('../config/database');
    const settingsResult = await lsembPool.query(`
      SELECT key, value FROM settings
      WHERE key IN ('embedding.activeProvider', 'embedding.activeModel')
    `);

    let embeddingProvider = 'openai';
    let embeddingModel = 'text-embedding-ada-002';

    settingsResult.rows.forEach(row => {
      if (row.key === 'embedding.activeProvider') {
        embeddingProvider = row.value;
      } else if (row.key === 'embedding.activeModel') {
        embeddingModel = row.value;
      }
    });

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

    const stats = {
      totalRecords: 0,
      embeddedRecords: 0,
      pendingRecords: 0,
      tables: [] as any[],
      tokenUsage: {
        total_tokens: totalTokensUsed,
        estimated_cost: estimatedCost
      },
      embeddingProvider,
      embeddingModel
    };

    for (const table of tables) {
      try {
        const countResult = await pools.sourcePool.query(
          `SELECT COUNT(*) FROM public.${table}`
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
        
        stats.tables.push({
          name: table,
          count: count,
          embedded: embedded
        });
        
        stats.totalRecords += count;
        stats.embeddedRecords += embedded;
      } catch (error) {
        console.error(`Error checking table ${table}:`, error);
      }
    }
    
    stats.pendingRecords = stats.totalRecords - stats.embeddedRecords;
    
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

// Generate embeddings
router.post('/generate', async (req: Request, res: Response) => {
  const { batchSize = 50, sourceTable = null } = req.body;

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  });

  try {
    const pools = await initializePools();

    // Get embedding settings
    const { pool: lsembPool } = await import('../config/database');
    const settingsResult = await lsembPool.query(`
      SELECT key, value FROM settings
      WHERE key IN ('embedding.activeProvider', 'embedding.activeModel')
    `);

    let embeddingProvider = 'openai';
    let embeddingModel = 'text-embedding-ada-002';

    settingsResult.rows.forEach(row => {
      if (row.key === 'embedding.activeProvider') {
        embeddingProvider = row.value;
      } else if (row.key === 'embedding.activeModel') {
        embeddingModel = row.value;
      }
    });

    // Build query - get records from source that don't have embeddings yet
    let sourceQuery = '';
    const tables = sourceTable ? [sourceTable] : ['DANISTAYKARARLARI', 'SORUCEVAP', 'MAKALELER', 'OZELGELER'];

    const allPending: any[] = [];
    for (const table of tables) {
      try {
        // Get records from source table that aren't in unified_embeddings yet
        const checkQuery = `
          SELECT s.id, s.*
          FROM public."${table}" s
          LEFT JOIN unified_embeddings u ON u.source_table = $1 AND u.source_id = s.id
          WHERE u.id IS NULL
          LIMIT $2
        `;

        const result = await pools.sourcePool.query(checkQuery, [table, Math.floor(batchSize / tables.length)]);
        result.rows.forEach(row => allPending.push({ ...row, _sourceTable: table }));
      } catch (err) {
        console.error(`Error checking table ${table}:`, err);
      }
    }

    const total = allPending.length;
    let processed = 0;

    if (total === 0) {
      res.write(`data: ${JSON.stringify({
        current: 0,
        total: 0,
        percentage: 100,
        status: 'completed',
        message: 'No pending records to process',
        tokenUsage: globalTokenUsage
      })}\n\n`);
      res.end();
      return;
    }

    for (const row of allPending) {
      try {
        const table = row._sourceTable;

        // Extract content based on table
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

        if (!content || content.trim().length === 0) {
          processed++;
          continue;
        }

        // Generate embedding
        const embedding = await generateEmbedding(content);

        if (embedding.length === 0) {
          processed++;
          continue;
        }

        // Prepare metadata
        const metadata: any = {
          embeddingProvider,
          embeddingModel,
          tokens_used: Math.ceil(content.length / 4)
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

        // Insert into unified_embeddings
        await pools.targetPool.query(`
          INSERT INTO unified_embeddings
          (source_table, source_type, source_id, source_name, content, embedding, metadata)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          ON CONFLICT (source_table, source_id) DO UPDATE
          SET content = EXCLUDED.content,
              embedding = EXCLUDED.embedding,
              metadata = EXCLUDED.metadata,
              updated_at = CURRENT_TIMESTAMP
        `, [
          table,
          sourceType,
          row.id,
          title,
          content,
          `[${embedding.join(',')}]`,
          JSON.stringify(metadata)
        ]);

        processed++;

        // Send progress
        const progress = {
          current: processed,
          total: total,
          percentage: Math.round((processed / total) * 100),
          status: 'processing',
          currentRecord: title,
          currentTable: table,
          tokenUsage: globalTokenUsage
        };

        res.write(`data: ${JSON.stringify(progress)}\n\n`);
      } catch (error) {
        console.error('Embedding error:', error);
        processed++;
      }
    }

    res.write(`data: ${JSON.stringify({
      current: processed,
      total: total,
      percentage: 100,
      status: 'completed',
      tokenUsage: globalTokenUsage
    })}\n\n`);

    res.end();
  } catch (error) {
    console.error('Generate embeddings error:', error);
    res.write(`data: ${JSON.stringify({ status: 'failed', error: (error as Error).message })}\n\n`);
    res.end();
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

// Helper: Generate embedding
async function generateEmbedding(text: string): Promise<number[]> {
  try {
    const openaiClient = await getOpenAIClient();

    if (!openaiClient) {
      console.warn('OpenAI client not available. Skipping embedding generation.');
      // Return empty array or fallback embedding
      return [];
    }

    const response = await openaiClient.embeddings.create({
      model: 'text-embedding-ada-002',
      input: text.substring(0, 8000) // Truncate to limit
    });

    // Track token usage (estimate)
    const estimatedTokens = Math.ceil(text.length / 4);
    globalTokenUsage.prompt_tokens += estimatedTokens;
    globalTokenUsage.total_tokens += estimatedTokens;
    globalTokenUsage.estimated_cost += (estimatedTokens / 1000) * 0.0001; // Ada-002 pricing

    return response.data[0].embedding;
  } catch (error) {
    console.error('OpenAI embedding error:', error);
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
    
    const tables = sourceTable === 'all' 
      ? ['DANISTAYKARARLARI', 'SORUCEVAP', 'MAKALELER', 'OZELGELER']
      : [sourceTable];
    
    let totalProcessed = 0;
    let totalRecords = 0;
    
    // Get total count
    for (const table of tables) {
      const countResult = await pools.sourcePool.query(`SELECT COUNT(*) FROM public."${table}"`);
      totalRecords += parseInt(countResult.rows[0].count);
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

            // Prepare metadata
            const metadata: any = {
              embeddingProvider: 'openai',
              embeddingModel: 'text-embedding-ada-002',
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

            // Insert into unified_embeddings
            await pools.targetPool.query(`
              INSERT INTO unified_embeddings
              (source_table, source_type, source_id, source_name, content, embedding, metadata)
              VALUES ($1, $2, $3, $4, $5, $6, $7)
              ON CONFLICT (source_table, source_id) DO UPDATE
              SET content = EXCLUDED.content,
                  embedding = EXCLUDED.embedding,
                  metadata = EXCLUDED.metadata,
                  updated_at = CURRENT_TIMESTAMP
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