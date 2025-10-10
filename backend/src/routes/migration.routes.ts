import { Router, Request, Response } from 'express';
import { Pool } from 'pg';
import OpenAI from 'openai';
import { EventEmitter } from 'events';

const router = Router();

// Database connections
const sourcePool = new Pool({
  connectionString: process.env.SOURCE_DB || 'postgresql://postgres:Semsiye!22@91.99.229.96:5432/rag_chatbot'
});

const targetPool = new Pool({
  connectionString: process.env.TARGET_DB || 'postgresql://postgres:Semsiye!22@91.99.229.96:5432/asemb'
});

// OpenAI client (lazy loading)
let openai: OpenAI | null = null;

async function getOpenAIClient(): Promise<OpenAI | null> {
  if (openai) {
    return openai;
  }

  try {
    // Get API key from settings table
    const { asembPool } = await import('../config/database');
    const result = await asembPool.query(
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
  
  updateProgress(id: string, data: any) {
    this.progress.set(id, {
      ...data,
      timestamp: new Date().toISOString()
    });
    this.emit('progress', { id, ...data });
  }
  
  getProgress(id: string) {
    return this.progress.get(id);
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
    // Get source table counts
    const tables = ['DANISTAYKARARLARI', 'SORUCEVAP', 'MAKALELER', 'OZELGELER'];
    const stats = {
      totalRecords: 0,
      embeddedRecords: 0,
      pendingRecords: 0,
      tables: [] as any[],
      tokenUsage: globalTokenUsage
    };
    
    for (const table of tables) {
      try {
        const countResult = await sourcePool.query(
          `SELECT COUNT(*) FROM public."${table}"`
        );
        const count = parseInt(countResult.rows[0].count);
        
        // Check embedded count in target
        const embeddedResult = await targetPool.query(
          `SELECT COUNT(*) FROM rag_data.documents WHERE source_table = $1`,
          [table]
        );
        const embedded = parseInt(embeddedResult.rows[0]?.count || 0);
        
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
      res.json({ status: 'no_active_migration' });
    }
  }
});

// Generate embeddings
router.post('/generate', async (req: Request, res: Response) => {
  const { batchSize = 50, useOpenAI = true, useLightRAG = false } = req.body;
  
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  });
  
  try {
    // Get pending records
    const pendingResult = await targetPool.query(`
      SELECT id, title, content, metadata
      FROM rag_data.documents
      WHERE embedding IS NULL
      LIMIT $1
    `, [batchSize]);
    
    const total = pendingResult.rows.length;
    let processed = 0;
    
    for (const row of pendingResult.rows) {
      try {
        // Generate embedding
        const embedding = await generateEmbedding(row.content);
        
        // Update record
        await targetPool.query(`
          UPDATE rag_data.documents
          SET embedding = $1, indexed_at = NOW()
          WHERE id = $2
        `, [`[${embedding.join(',')}]`, row.id]);
        
        processed++;
        
        // Send progress
        const progress = {
          current: processed,
          total: total,
          percentage: Math.round((processed / total) * 100),
          status: 'processing',
          currentRecord: row.title,
          tokenUsage: globalTokenUsage
        };
        
        res.write(`data: ${JSON.stringify(progress)}\n\n`);
      } catch (error) {
        console.error('Embedding error:', error);
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
    await targetPool.query(
      'DELETE FROM rag_data.documents WHERE source_table = $1',
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
    // Setup target schema
    await targetPool.query('CREATE EXTENSION IF NOT EXISTS vector');
    await targetPool.query('CREATE SCHEMA IF NOT EXISTS rag_data');
    await targetPool.query(`
      CREATE TABLE IF NOT EXISTS rag_data.documents (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        source_table VARCHAR(50),
        source_id TEXT,
        title TEXT,
        content TEXT,
        metadata JSONB,
        embedding vector(1536),
        chunk_index INTEGER DEFAULT 0,
        total_chunks INTEGER DEFAULT 1,
        created_at TIMESTAMP DEFAULT NOW(),
        indexed_at TIMESTAMP
      )
    `);
    
    // Create indexes
    await targetPool.query(`
      CREATE INDEX IF NOT EXISTS idx_rag_embedding 
      ON rag_data.documents USING ivfflat (embedding vector_cosine_ops) 
      WITH (lists = 100)
    `);
    
    const tables = sourceTable === 'all' 
      ? ['DANISTAYKARARLARI', 'SORUCEVAP', 'MAKALELER', 'OZELGELER']
      : [sourceTable];
    
    let totalProcessed = 0;
    let totalRecords = 0;
    
    // Get total count
    for (const table of tables) {
      const countResult = await sourcePool.query(`SELECT COUNT(*) FROM public."${table}"`);
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
        const result = await sourcePool.query(
          `SELECT * FROM public."${table}" ORDER BY id LIMIT $1 OFFSET $2`,
          [batchSize, offset]
        );
        
        if (result.rows.length === 0) {
          hasMore = false;
          break;
        }
        
        for (const row of result.rows) {
          try {
            // Extract content
            let content = '';
            if (table === 'SORUCEVAP') {
              content = `Soru: ${row.soru}\n\nCevap: ${row.cevap}`;
            } else if (table === 'DANISTAYKARARLARI') {
              content = row.metin || '';
            } else if (table === 'MAKALELER') {
              content = row.icerik || '';
            } else if (table === 'OZELGELER') {
              content = row.metin || '';
            }
            
            if (!content) continue;
            
            // Chunk content
            const chunks = chunkText(content, chunkSize, overlapSize);
            
            for (let i = 0; i < chunks.length; i++) {
              const chunk = chunks[i];
              
              // Generate embedding
              const embedding = await generateEmbedding(chunk);
              
              // Prepare metadata
              const metadata: any = {};
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
              
              // Insert into target
              await targetPool.query(`
                INSERT INTO rag_data.documents 
                (source_table, source_id, title, content, metadata, embedding, chunk_index, total_chunks, indexed_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
              `, [
                table,
                row.id.toString(),
                getTitle(table, row),
                chunk,
                JSON.stringify(metadata),
                `[${embedding.join(',')}]`,
                i,
                chunks.length
              ]);
            }
            
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
    
  } catch (error) {
    console.error('Migration error:', error);
    migrationProgress.updateProgress(migrationId, {
      status: 'failed',
      error: (error as Error).message
    });
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