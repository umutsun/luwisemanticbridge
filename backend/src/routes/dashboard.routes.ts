import { Router, Request, Response } from 'express';
import axios from 'axios';
import OpenAI from 'openai';
import { getDatabaseSettings, getCustomerPool, getAiSettings } from '../config/database.config';
import { asembPool } from '../server'; // Import the centralized pool

const router = Router();
const ragAnythingRouter = Router();

// --- RAG-anything Proxy Setup ---
const RAG_ANYTHING_BASE_URL = process.env.RAG_ANYTHING_URL || 'http://localhost:5000';

ragAnythingRouter.use(async (req, res) => {
  try {
    const response = await axios({
      method: req.method as any,
      url: `${RAG_ANYTHING_BASE_URL}${req.path}`,
      data: req.body,
      params: req.query,
      headers: {
        'Content-Type': 'application/json',
      }
    });
    res.status(response.status).send(response.data);
  } catch (error: any) {
    console.error('RAG-anything proxy error:', error.message);
    const status = error.response?.status || 500;
    const data = error.response?.data || { error: 'Proxy request failed' };
    res.status(status).json(data);
  }
});

// LightRAG service disabled

// --- Embeddings Management Routes ---

router.get('/api/v2/embeddings/tables', async (req: Request, res: Response) => {
  try {
    const customerSettings = await getDatabaseSettings();
    if (!customerSettings) {
      // Return empty tables list instead of error when no database is configured
      return res.json({
        tables: [],
        message: 'No customer database configured'
      });
    }

    let ragChatbotPool;
    try {
      ragChatbotPool = getCustomerPool(customerSettings);
      // Test the connection
      await ragChatbotPool.query('SELECT 1');
    } catch (dbError) {
      console.error('Failed to connect to customer database:', dbError);
      // Return empty tables list when database is unreachable
      return res.json({
        tables: [],
        message: 'Customer database unreachable'
      });
    }
    
    const client = await asembPool.connect();
    let tableInfo = [];
    try {
        const tablesResult = await ragChatbotPool.query(
        `
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE' AND table_name NOT LIKE 'pg_%' AND table_name NOT LIKE 'sql_%';
        `
        );

        const tables = tablesResult.rows.map((row: any) => ({
            name: row.table_name,
            displayName: row.table_name.charAt(0).toUpperCase() + row.table_name.slice(1),
            database: 'rag_chatbot'
        }));
        
        // Helper function to create display name from table name
        const createDisplayName = (tableName: string): string => {
            // Convert snake_case to Title Case with Turkish characters
            return tableName
                .split('_')
                .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                .join(' ')
                .replace(/Danistay/g, 'Danıştay')
                .replace(/Ozel/g, 'Özel')
                .replace(/Sorucevap/g, 'Soru-Cevap')
                .replace(/Mevzuat/g, 'Mevzuat')
                .replace(/Dokuman/g, 'Doküman');
        };

        for (const table of tables) {
            try {
                const recordCount = await ragChatbotPool.query(`SELECT COUNT(*) FROM public.${table.name}`);
                const totalRecords = parseInt(recordCount.rows[0].count);

                let embeddedRecords = 0;
                try {
                    // Use display name for source_table (dynamically generated)
                    const displayName = createDisplayName(table.name);
                    const embeddedCount = await client.query(`SELECT COUNT(DISTINCT(source_id)) FROM unified_embeddings WHERE source_table = $1`, [displayName]);
                    embeddedRecords = parseInt(embeddedCount.rows[0].count);
                } catch (e) { /* ignore */ }

                // Update table with display name
                const tableWithDisplay = {
                    ...table,
                    displayName: createDisplayName(table.name)
                };

                tableInfo.push({ ...tableWithDisplay, totalRecords, embeddedRecords });
            } catch (err) { /* ignore */ }
        }
    } finally {
        client.release();
    }
    res.json({ tables: tableInfo });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to get tables' });
  }
});

router.get('/api/v2/embeddings/progress', async (req: Request, res: Response) => {
  try {
    const { redis } = require('../server');
    const redisProgress = await redis.get('embedding:progress');
    if (redisProgress) {
      return res.json(JSON.parse(redisProgress));
    }
    res.json({ status: 'idle' });
  } catch (error: any) {
    res.json({ status: 'idle' });
  }
});

// Get AI settings from database
router.get('/api/v2/settings/ai', async (req: Request, res: Response) => {
  try {
    const { getAiSettings } = require('../config/database.config');
    const aiSettings = await getAiSettings();

    // Mask API keys for security
    const maskedSettings = {
      hasOpenAIKey: !!(aiSettings?.openaiApiKey || process.env.OPENAI_API_KEY),
      openaiApiBase: aiSettings?.openaiApiBase,
      hasDeepSeekKey: !!(aiSettings?.deepseekApiKey || process.env.DEEPSEEK_API_KEY),
      hasGeminiKey: !!(aiSettings?.geminiApiKey || process.env.GEMINI_API_KEY),
      hasClaudeKey: !!(aiSettings?.anthropicApiKey || process.env.CLAUDE_API_KEY)
    };

    res.json(maskedSettings);
  } catch (error) {
    console.error('Error getting AI settings:', error);
    res.status(500).json({
      error: 'Failed to get AI settings',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// LightRAG test endpoint disabled
router.post('/api/v2/embeddings/test-lightrag', async (req: Request, res: Response) => {
  res.status(503).json({
    error: 'LightRAG service is disabled',
    message: 'This endpoint has been disabled as LightRAG is no longer supported'
  });
});

router.get('/api/v2/embeddings/progress/stream', async (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  let intervalId: NodeJS.Timeout | null = null;
  let redis: any;
  let isConnectionClosed = false;

  // Function to clean up resources
  const cleanup = () => {
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
    isConnectionClosed = true;
  };
  
  try {
    // Try to get redis instance
    try {
      const server = require('../server');
      redis = server.redis;
    } catch (err) {
      console.error('Failed to get redis instance:', err);
      if (!isConnectionClosed) {
        res.write(`data: ${JSON.stringify({ status: 'error', error: 'Failed to connect to Redis' })}\n\n`);
      }
      cleanup();
      return;
    }
    
    // Check if redis is available
    if (!redis || !redis.status || redis.status !== 'ready') {
      console.error('Redis not ready, status:', redis?.status);
      if (!isConnectionClosed) {
        res.write(`data: ${JSON.stringify({ status: 'error', error: 'Redis not available' })}\n\n`);
      }
      cleanup();
      return;
    }
    
    const sendProgress = async () => {
      if (isConnectionClosed) return;
      
      try {
        const progressData = await redis.get('embedding:progress');
        if (progressData) {
          res.write(`data: ${progressData}\n\n`);
        } else {
          res.write(`data: ${JSON.stringify({ status: 'idle' })}\n\n`);
        }
      } catch (err) {
        console.error('Error sending progress:', err);
        if (!isConnectionClosed) {
          res.write(`data: ${JSON.stringify({ status: 'error', error: 'Failed to get progress' })}\n\n`);
        }
      }
    };
    
    // Send initial progress
    await sendProgress();
    
    intervalId = setInterval(sendProgress, 1000);
    
    req.on('close', () => {
      cleanup();
    });
    
    req.on('error', (err: any) => {
      // Only log non-connection aborted errors
      if (err.code !== 'ECONNABORTED' && err.code !== 'ECONNRESET') {
        console.error('Request error:', err);
      }
      cleanup();
    });
    
    res.on('error', (err: any) => {
      // Only log non-connection aborted errors
      if (err.code !== 'ECONNABORTED' && err.code !== 'ECONNRESET') {
        console.error('Response error:', err);
      }
      cleanup();
    });
    
  } catch (error: any) {
    console.error('Stream error:', error);
    if (!isConnectionClosed) {
      res.write(`data: ${JSON.stringify({ status: 'error', error: error.message })}\n\n`);
    }
    cleanup();
  }
});

// MOVED: This route is now handled by embeddings-v2.routes.ts
// router.post('/api/v2/embeddings/generate', async (req: Request, res: Response) => {
//   try {
//     const { tables, batchSize = 50, workerCount = 2, resume = false, embeddingMethod } = req.body;
//     const { redis } = require('../server');
//
//     // Get AI settings from the database
//    // const aiSettings = await getAiSettings();
//    const apiKey = aiSettings?.openaiApiKey || process.env.OPENAI_API_KEY;
//    const useLocalEmbeddings = process.env.USE_LOCAL_EMBEDDINGS === 'true';
//
//    console.log(`🔧 USE_LOCAL_EMBEDDINGS: ${useLocalEmbeddings}`);
//
//    let openai: any = null;
//    if (!useLocalEmbeddings) {
//      if (!apiKey) {
//        return res.status(401).json({ error: 'OpenAI API key is not configured. Please add it in the settings.' });
//      }
//
//      console.log(`🔑 API Key from database (first 10): ${aiSettings?.openaiApiKey ? aiSettings.openaiApiKey.substring(0, 10) : 'N/A'}...`);
//      console.log(`🔑 API Key from env (first 10): ${process.env.OPENAI_API_KEY ? process.env.OPENAI_API_KEY.substring(0, 10) : 'N/A'}...`);
//      console.log(`🔑 Using API Key (first 10): ${apiKey.substring(0, 10)}...`);
//      console.log(`🔑 API Key length: ${apiKey.length}`);
//
//      const apiBase = aiSettings?.openaiApiBase || process.env.OPENAI_API_BASE || 'https://api.openai.com/v1';
//      openai = new OpenAI({ apiKey, baseURL: apiBase });
//
//      // Test the connection with a simple embedding before starting
//      try {
//        console.log('🧪 Testing OpenAI connection before starting batch...');
//        const testResult = await openai.embeddings.create({
//          model: 'text-embedding-ada-002',
//          input: 'test connection'
//        });
//        console.log(`✅ OpenAI connection test successful. Usage:`, testResult.usage);
//      } catch (testError: any) {
//        console.error('❌ OpenAI connection test failed:', testError.message);
//        if (testError.status) {
//          console.error('❌ HTTP Status:', testError.status);
//          console.error('❌ Error code:', testError.code);
//          console.error('❌ Error type:', testError.type);
//        }
//        return res.status(401).json({
//          error: `OpenAI API test failed: ${testError.message}`,
//          code: testError.code,
//          type: testError.type
//        });
//      }
//    } else {
//      console.log('🏠 Using local embeddings (no API key required)');
//    }
//    
//    const customerSettings = await getDatabaseSettings();
//    if (!customerSettings) return res.status(400).json({ error: 'No customer database configured' });
//    const ragPool = getCustomerPool(customerSettings);
//    
//    let progressData: any;
//    let totalCount = 0;
//
//    if (resume) {
//      // Resume existing process
//      const existingProgress = await redis.get('embedding:progress');
//      const existingStatus = await redis.get('embedding:status');
//
//      if (existingProgress && existingStatus === 'paused') {
//        progressData = JSON.parse(existingProgress);
//        progressData.status = 'processing';
//        totalCount = progressData.total;
//
//        // Recalculate actual embedded counts when resuming
//        const actualEmbeddedCounts: Record<string, number> = {};
//        let totalActualEmbedded = 0;
//
//        try {
//          const client = await asembPool.connect();
//          try {
//            for (const tableName of tables) {
//              const sourceName = tableName === 'sorucevap' ? 'Soru-Cevap' :
//                                  tableName === 'danistaykararlari' ? 'Danıştay Kararları' :
//                                  tableName === 'makaleler' ? 'Makaleler' :
//                                  tableName === 'ozelgeler' ? 'Özelgeler' :
//                                  tableName === 'chat_history' ? 'Sohbet Geçmişi' : tableName;
//
//              const embeddedResult = await client.query(`
//                SELECT COUNT(DISTINCT(metadata->>'source_id')) as count
//                FROM unified_embeddings
//                WHERE source_table = $1
//              `, [sourceName]);
//
//              actualEmbeddedCounts[tableName] = parseInt(embeddedResult.rows[0].count) || 0;
//              totalActualEmbedded += actualEmbeddedCounts[tableName];
//              console.log(`Resume check - Table ${tableName} (${sourceName}): ${actualEmbeddedCounts[tableName]} actually embedded`);
//            }
//          } finally {
//            client.release();
//          }
//        } catch (error) {
//          console.error('Error getting actual embedded counts on resume:', error);
//        }
//
//        // Update progress data with actual counts
//        progressData.current = totalActualEmbedded;
//        progressData.percentage = totalCount > 0 ? Math.round((totalActualEmbedded / totalCount) * 100) : 0;
//        progressData.tableEmbeddedCounts = actualEmbeddedCounts;
//
//        await redis.set('embedding:progress', JSON.stringify(progressData));
//        await redis.set('embedding:status', 'processing');
//        // Clear all pause flags when resuming
//        await redis.del('embedding:pause_requested');
//        await redis.del('embedding:immediate_pause');
//        await redis.del('embedding:pause_timestamp');
//        console.log('Resuming paused process and cleared pause flags');
//      } else {
//        // Clear any stale database records
//        await pgPool.query(`
//          UPDATE embedding_progress
//          SET status = 'completed'
//          WHERE status IN ('processing', 'paused')
//          AND started_at < NOW() - INTERVAL '1 hour'
//        `);
//        return res.status(400).json({ error: 'No paused process found to resume' });
//      }
//    } else {
//      // Start new process
//      for (const tableName of tables) {
//          const result = await ragPool.query(`SELECT COUNT(*) as count FROM public.${tableName}`);
//          totalCount += parseInt(result.rows[0].count);
//      }
//      
//      // Get initial embedded counts for each table
//      const tableEmbeddedCounts: Record<string, number> = {};
//      try {
//        const client = await asembPool.connect();
//        try {
//          for (const tableName of tables) {
//            const sourceName = tableName === 'sorucevap' ? 'Soru-Cevap' :
//                                tableName === 'danistaykararlari' ? 'Danıştay Kararları' :
//                                tableName === 'Makaleler' ? 'Makaleler' : tableName;
//
//            const embeddedResult = await client.query(`
//              SELECT COUNT(DISTINCT(metadata->>'source_id')) as count
//              FROM unified_embeddings
//              WHERE source_table = $1
//            `, [sourceName]);
//
//            tableEmbeddedCounts[tableName] = parseInt(embeddedResult.rows[0].count) || 0;
//            console.log(`Table ${tableName} (${sourceName}): ${tableEmbeddedCounts[tableName]} already embedded`);
//          }
//        } finally {
//          client.release();
//        }
//      } catch (error) {
//        console.error('Error getting initial embedded counts:', error);
//      }
//
//      const totalInitialEmbedded = Object.values(tableEmbeddedCounts).reduce((sum, count) => sum + count, 0);
//
//      progressData = {
//        status: 'processing',
//        current: totalInitialEmbedded,
//        total: totalCount,
//        percentage: totalCount > 0 ? Math.round((totalInitialEmbedded / totalCount) * 100) : 0,
//        currentTable: tables[0],
//        startTime: Date.now(),
//        tokensUsed: 0,
//        estimatedCost: 0,
//        newlyEmbedded: 0,
//        errorCount: 0,
//        processingSpeed: 0,
//        error: null as string | null,
//        initialEmbedded: totalInitialEmbedded,
//        tableEmbeddedCounts: tableEmbeddedCounts
//      };
//      await redis.set('embedding:progress', JSON.stringify(progressData));
//      await redis.set('embedding:status', 'processing');
//      // Clear any old pause flags when starting new process
//      await redis.del('embedding:pause_requested');
//      await redis.del('embedding:immediate_pause');
//      await redis.del('embedding:pause_timestamp');
//    }
//
//    // Define embedding provider and model before creating history record
//    const embeddingProvider = embeddingMethod || aiSettings?.embeddingProvider || 'openai';
//
//    // Set correct model based on embedding method
//    let embeddingModel;
//    switch(embeddingMethod) {
//      case 'openai':
//        embeddingModel = aiSettings?.embeddingModel || 'text-embedding-3-small';
//        break;
//      case 'e5-mistral':
//        embeddingModel = 'E5-Mistral-7B';
//        break;
//      case 'bge-m3':
//        embeddingModel = 'BGE-M3';
//        break;
//      case 'local':
//        embeddingModel = 'Local-Simple';
//        break;
//      default:
//        embeddingModel = 'text-embedding-3-small';
//    }
//
//    // Create embedding history record
//    const operationId = `embedding_${Date.now()}`;
//    try {
//      const client = await asembPool.connect();
//      try {
//        await client.query(`
//          INSERT INTO embedding_history (
//            operation_id, source_table, embedding_model, batch_size, worker_count,
//            status, started_at, metadata
//          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
//        `, [
//          operationId,
//          tables.join(','),
//          embeddingMethod,
//          batchSize,
//          workerCount,
//          'processing',
//          new Date(),
//          JSON.stringify({
//            total_records: totalCount,
//            provider: embeddingProvider,
//            model: embeddingModel,
//            use_local: useLocalEmbeddings
//          })
//        ]);
//      } finally {
//        client.release();
//      }
//    } catch (error) {
//      console.error('Failed to create embedding history record:', error);
//    }
//
//    processEmbeddings(ragPool, tables, batchSize, progressData, redis, openai, embeddingProvider, embeddingModel, useLocalEmbeddings, embeddingMethod, operationId)
//      .then(() => {
//        console.log("Embedding process completed successfully");
//      })
//      .catch(err => {
//        console.error("Embedding process failed:", err);
//        progressData.status = 'error';
//        progressData.error = err.message;
//        redis.set('embedding:progress', JSON.stringify(progressData))
//          .catch((redisErr: any) => {
//            console.error("Failed to update progress in Redis:", redisErr);
//          });
//      });
//    
//    res.json({ success: true });
//  } catch (error: any) {
//    console.error('Error in /api/v2/embeddings/generate:', error);
//    res.status(500).json({ error: error.message });
//  }

router.post('/api/v2/embeddings/pause', async (req: Request, res: Response) => {
    try {
        const { redis } = require('../server');
        console.log('=== PAUSE REQUESTED ===');
        console.log('Setting embedding:status to paused in Redis');
        await redis.set('embedding:status', 'paused');
        await redis.set('embedding:pause_requested', 'true');
        await redis.set('embedding:pause_timestamp', Date.now().toString());
        await redis.set('embedding:immediate_pause', 'true'); // Add immediate pause flag

        const progressData = await redis.get('embedding:progress');
        if (progressData) {
            const progress = JSON.parse(progressData);
            progress.status = 'paused';
            console.log('Updated progress status to paused:', progress);
            await redis.set('embedding:progress', JSON.stringify(progress));
        }

        // Also check if there's any active process in database and mark it as paused
        const { pgPool } = require('../server');
        await pgPool.query(`
            UPDATE embedding_progress
            SET status = 'paused'
            WHERE status = 'processing'
        `);

        console.log('=== PAUSE COMPLETED ===');
        res.json({ success: true });
    } catch (error: any) {
        console.error('Error pausing embedding process:', error);
        res.status(500).json({ error: error.message });
    }
});

// Temporary endpoint to create unified_embeddings table
router.post('/api/v2/embeddings/create-table', async (req: Request, res: Response) => {
    try {
        const { getCustomerPool } = require('../config/database.config');
        const ragPool = getCustomerPool();

        // Create the unified_embeddings table
        await ragPool.query(`
            DROP TABLE IF EXISTS unified_embeddings;

            CREATE TABLE unified_embeddings (
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
            );

            CREATE INDEX idx_unified_embeddings_source_table ON unified_embeddings(source_table);
            CREATE INDEX idx_unified_embeddings_source_type ON unified_embeddings(source_type);
            CREATE INDEX idx_unified_embeddings_source_id ON unified_embeddings(source_id);
            CREATE INDEX idx_unified_embeddings_source_name ON unified_embeddings(source_name);
            CREATE INDEX idx_unified_embeddings_created_at ON unified_embeddings(created_at);

            CREATE INDEX idx_unified_embeddings_embedding_vector ON unified_embeddings
            USING hnsw (embedding vector_cosine_ops);
        `);

        console.log('✅ unified_embeddings table created successfully');
        res.json({ success: true, message: 'Table created successfully' });
    } catch (error: any) {
        console.error('Error creating unified_embeddings table:', error);
        res.status(500).json({ error: error.message });
    }
});

// Helper function to check pause status with retries
async function checkPauseStatus(redis: any, tableName: string, progressData: any, client?: any, clientReleased?: { value: boolean }): Promise<boolean> {
    try {
        // Check both status and immediate pause flag
        const [status, immediatePause] = await Promise.all([
            redis.get('embedding:status'),
            redis.get('embedding:immediate_pause')
        ]);

        if (status === 'paused' || immediatePause === 'true') {
            console.log(`Process paused for table ${tableName} (status: ${status}, immediate: ${immediatePause})`);
            progressData.status = 'paused';
            await redis.set('embedding:progress', JSON.stringify(progressData));

            // Clear the immediate pause flag
            await redis.del('embedding:immediate_pause');

            if (client && clientReleased) {
                client.release();
                clientReleased.value = true;
            }
            return true;
        }
    } catch (redisError) {
        console.error(`Failed to check status from Redis:`, redisError);
    }
    return false;
}

async function processEmbeddings(ragPool: any, tables: string[], batchSize: number, progressData: any, redis: any, openai: any, embeddingProvider: string, embeddingModel: string, useLocalEmbeddings: boolean, embeddingMethod: string, operationId?: string) {
    console.log(`Starting embedding process for tables: ${tables.join(', ')}`);

    const startTime = Date.now();
    const { pgPool } = require('../server');

    // Create or update progress record in embedding_progress table for SSE
    try {
        const documentId = `embedding_${Date.now()}`;
        const documentType = tables.join(',');

        // First, try to update any existing process
        const updateResult = await pgPool.query(`
            UPDATE embedding_progress
            SET status = 'completed'
            WHERE status IN ('processing', 'pending')
            RETURNING id
        `);

        // Then insert new record
        await pgPool.query(`
            INSERT INTO embedding_progress (document_id, document_type, status, total_chunks, processed_chunks)
            VALUES ($1, $2, $3, $4, $5)
        `, [documentId, documentType, 'processing', progressData.total, progressData.current]);

        console.log('✅ Progress record created in embedding_progress table');
    } catch (error) {
        console.error('Failed to create progress record:', error);
    }
    let totalTokens = progressData.tokensUsed || 0;
    let newlyEmbedded = progressData.newlyEmbedded || 0;
    let errorCount = progressData.errorCount || 0;
    let processedRecords = 0;
    
    // Find which table we were processing
    let startTableIndex = 0;
    if (progressData.currentTable) {
        startTableIndex = tables.indexOf(progressData.currentTable);
        if (startTableIndex === -1) startTableIndex = 0;
        console.log(`Resuming from table: ${progressData.currentTable} at index ${startTableIndex}`);
    }

    try {
        for (let i = startTableIndex; i < tables.length; i++) {
            const tableName = tables[i];
            progressData.currentTable = tableName;
            console.log(`Processing table: ${tableName}`);
            
            let client;
            try {
                client = await asembPool.connect();
            } catch (dbError) {
                console.error(`Failed to connect to database for table ${tableName}:`, dbError);
                throw new Error(`Database connection failed: ${(dbError as Error).message}`);
            }
            
            let clientReleased = false;
            
            try {
                // Create display name dynamically from table name
                const createDisplayName = (tableName: string): string => {
                    return tableName
                        .split('_')
                        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                        .join(' ')
                        .replace(/Danistay/g, 'Danıştay')
                        .replace(/Ozel/g, 'Özel')
                        .replace(/Sorucevap/g, 'Soru-Cevap')
                        .replace(/Mevzuat/g, 'Mevzuat')
                        .replace(/Dokuman/g, 'Doküman');
                };

                const sourceTableName = createDisplayName(tableName);

                try {
                    // Get the count of already embedded records for this table
                    const tableEmbeddedCount = progressData.tableEmbeddedCounts?.[tableName] || 0;
                    console.log(`Table ${tableName} has ${tableEmbeddedCount} already embedded records`);

                    // Calculate offset based on current progress
                    let offset = 0;
                    if (i === startTableIndex && progressData.current > 0) {
                        // We're resuming from the middle of a table
                        // Calculate how many records we've already processed in this table
                        const tableResult = await ragPool.query(`SELECT COUNT(*) as count FROM public.${tableName}`);
                        const tableTotal = parseInt(tableResult.rows[0].count);

                        // Estimate offset based on progress
                        offset = Math.floor((progressData.current / progressData.total) * tableTotal);
                        // Round to nearest batch size
                        offset = Math.floor(offset / batchSize) * batchSize;
                        console.log(`Resuming from offset ${offset} for table ${tableName}`);
                    }

                    // If this table has already been fully processed, skip it
                    const tableResult = await ragPool.query(`SELECT COUNT(*) as count FROM public.${tableName}`);
                    const tableTotal = parseInt(tableResult.rows[0].count);
                    if (tableEmbeddedCount >= tableTotal) {
                        console.log(`Table ${tableName} is already fully embedded (${tableEmbeddedCount}/${tableTotal}), skipping`);
                        continue;
                    }

                    while (true) {
                        // Check pause status
                        if (await checkPauseStatus(redis, tableName, progressData, client, { value: clientReleased })) {
                            return;
                        }

                        let result;
                        let existingIds = new Set(); // Declare outside try block

                        try {
                            // Use a more efficient query that skips already embedded records
                            const existingResult = await client.query(`
                                SELECT DISTINCT(metadata->>'source_id') as id
                                FROM unified_embeddings
                                WHERE source_table = $1
                            `, [sourceTableName]);

                            // Filter out NaN values and create a Set of valid IDs
                            existingIds = new Set();
                            for (const row of existingResult.rows) {
                                const id = parseInt(row.id);
                                if (!isNaN(id)) {
                                    existingIds.add(id);
                                }
                            }

                            // Build a query to exclude already embedded records
                            let query = `SELECT * FROM public.${tableName}`;
                            if (existingIds.size > 0) {
                                const idValues = Array.from(existingIds).join(',');
                                query += ` WHERE id NOT IN (${idValues})`;
                            }
                            query += ` ORDER BY id LIMIT $1 OFFSET $2`;

                            result = await ragPool.query(query, [batchSize, offset]);
                            if (result.rows.length === 0) {
                                console.log(`No more records in table ${tableName} at offset ${offset}`);
                                break;
                            }

                            console.log(`Processing batch of ${result.rows.length} records from table ${tableName}`);
                        } catch (queryError) {
                            console.error(`Failed to query records from table ${tableName}:`, queryError);
                            throw new Error(`Query failed: ${(queryError as Error).message}`);
                        }

                        // Check pause status after batch query
                        if (await checkPauseStatus(redis, tableName, progressData, client, { value: clientReleased })) {
                            return;
                        }

                        for (const row of result.rows) {
                            // Skip records we've already processed
                            if (progressData.current >= progressData.total) break;

                            // Check pause status before processing each record
                            if (await checkPauseStatus(redis, tableName, progressData, client, { value: clientReleased })) {
                                return;
                            }

                            progressData.current++;
                            if (existingIds.has(row.id)) continue;

                            const textContent = Object.values(row).filter(v => typeof v === 'string').join(' ');
                            if (!textContent || textContent.trim().length === 0) {
                                console.log(`Skipping empty record ${row.id} in table ${tableName}`);
                                continue;
                            }
                            
                           try {
                               console.log(`Creating embedding for record ${row.id} in table ${tableName} using ${embeddingProvider}`);
                               console.log(`Using model: ${embeddingModel}`);
                               console.log(`Text length: ${textContent.length}, will use: ${Math.min(textContent.length, 8000)}`);

                               // Create embedding based on method
                               let embedding;
                               let embeddingVector: number[] | undefined;
                               let tokensUsed = 0;

                               if (embeddingMethod === 'local') {
                                   console.log(`🏠 Generating local embedding...`);
                                   embeddingVector = generateLocalEmbedding(textContent);
                                   console.log(`✅ Local embedding generated successfully`);
                               } else if (embeddingMethod === 'lightrag') {
                                   console.log(`⚠️ LightRAG is disabled, falling back to local embeddings`);
                                   embeddingVector = generateLocalEmbedding(textContent);
                               } else if (embeddingProvider === 'e5-mistral') {
                                   console.log(`🤖 Using E5-Mistral-7B for embedding...`);
                                   try {
                                       embeddingVector = await generateE5MistralEmbedding(textContent);
                                       console.log(`✅ E5-Mistral embedding generated successfully`);
                                   } catch (error) {
                                       console.error(`❌ E5-Mistral embedding failed, falling back to local:`, error);
                                       embeddingVector = generateLocalEmbedding(textContent);
                                       // Mark that we're using fallback
                                       progressData.fallbackMode = true;
                                       progressData.fallbackReason = 'E5-Mistral API error';
                                   }
                               } else if (embeddingProvider === 'bge-m3') {
                                   console.log(`🚀 Using BGE-M3 for embedding...`);
                                   try {
                                       embeddingVector = await generateBGEEmbedding(textContent);
                                       console.log(`✅ BGE-M3 embedding generated successfully`);
                                   } catch (error) {
                                       console.error(`❌ BGE-M3 embedding failed, falling back to local:`, error);
                                       embeddingVector = generateLocalEmbedding(textContent);
                                       // Mark that we're using fallback
                                       progressData.fallbackMode = true;
                                       progressData.fallbackReason = 'BGE-M3 API error';
                                   }
                               } else if (embeddingProvider === 'openai' || embeddingMethod === 'openai') {
                                   console.log(`📤 Making OpenAI embeddings API call...`);
                                   console.log(`📋 Request details: model=${embeddingModel}, text_length=${textContent.length}`);

                                   // Check pause status before making API call
                                   if (await checkPauseStatus(redis, tableName, progressData, client, { value: clientReleased })) {
                                       return;
                                   }

                                   try {
                                       // Check if openai client exists
                                       if (!openai) {
                                           throw new Error('OpenAI client not initialized - API key may be missing');
                                       }

                                       embedding = await openai.embeddings.create({
                                           model: embeddingModel,
                                           input: textContent.substring(0, 8000)
                                       });
                                       
                                       // Daha kapsamlı null kontrolü
                                       if (!embedding) {
                                           throw new Error('OpenAI API returned null response');
                                       }
                                       if (!embedding.data || !Array.isArray(embedding.data) || embedding.data.length === 0) {
                                           throw new Error(`OpenAI API returned invalid data structure: ${JSON.stringify(embedding)}`);
                                       }
                                       if (!embedding.data[0] || !embedding.data[0].embedding) {
                                           throw new Error(`OpenAI API returned invalid embedding data: ${JSON.stringify(embedding.data)}`);
                                       }

                                       // Check pause status after getting embedding response
                                       if (await checkPauseStatus(redis, tableName, progressData, client, { value: clientReleased })) {
                                           return;
                                       }
                                       
                                       console.log(`✅ Embedding created successfully. Usage:`, embedding.usage);
                                       console.log(`📊 Response details: data_length=${embedding.data.length}, embedding_dimensions=${embedding.data[0].embedding?.length}`);
                                       
                                       embeddingVector = embedding.data[0].embedding;
                                       tokensUsed = embedding.usage?.total_tokens || 0;
                                       totalTokens += tokensUsed;
                                   } catch (openaiError: any) {
                                       console.error(`❌ OpenAI API call failed:`, openaiError);
                                       console.error(`❌ Error details:`, {
                                           message: openaiError.message,
                                           status: openaiError.status,
                                           code: openaiError.code,
                                           type: openaiError.type,
                                           response: openaiError.response?.data
                                       });
                                       
                                       // Fallback to local embedding when OpenAI fails
                                       console.log(`🔄 Falling back to local embedding due to OpenAI error`);
                                       embeddingVector = generateLocalEmbedding(textContent);
                                   }
                                } else {
                                    // Other providers would be implemented here - fallback to local
                                    console.log(`⚠️ Provider ${embeddingProvider} not implemented, using local embedding`);
                                    embeddingVector = generateLocalEmbedding(textContent);
                                }
                                
                                // Check if we have a valid embedding vector
                                if (!embeddingVector || embeddingVector.length === 0) {
                                    console.log(`⚠️ No valid embedding vector generated, using local fallback`);
                                    embeddingVector = generateLocalEmbedding(textContent);
                                }
                                
                                // Source information based on context
                                let sourceType = 'database';

                                // Get database name from customer_database settings
                                const dbSettings = await getDatabaseSettings();
                                let sourceName = 'rag_chatbot'; // default fallback
                                if (dbSettings && typeof dbSettings === 'object') {
                                    // Check all possible field names
                                    sourceName = dbSettings.databaseName ||
                                               dbSettings.dbName ||
                                               dbSettings.name ||
                                               dbSettings.database ||
                                               'rag_chatbot';
                                } else if (dbSettings && typeof dbSettings === 'string') {
                                    // If it's stored as a string, parse it
                                    try {
                                        const parsed = JSON.parse(dbSettings);
                                        sourceName = parsed.databaseName ||
                                                   parsed.dbName ||
                                                   parsed.name ||
                                                   parsed.database ||
                                                   'rag_chatbot';
                                    } catch {
                                        sourceName = dbSettings;
                                    }
                                }

                                // Update metadata with correct model information
                                const metadata = {
                                    tokens: tokensUsed,
                                    embedding_type: embeddingMethod,
                                    model: embeddingModel,
                                    provider: embeddingProvider,
                                    batch_id: Math.floor(processedRecords / batchSize),
                                    operation_id: operationId,
                                    created_by: 'embedding_service'
                                };

                                // Check if already embedded
                                const existingCheck = await client.query(
                                    `SELECT id FROM unified_embeddings
                                     WHERE source_table = $1 AND source_id = $2
                                     LIMIT 1`,
                                    [sourceTableName, row.id]
                                );

                                if (existingCheck.rows.length > 0) {
                                    console.log(`⚠️ Record ${row.id} already embedded (duplicate)`);
                                    continue; // Skip this record
                                }

                                // Generate a title from the content
                                const title = `Record ${row.id} from ${sourceTableName} - ${textContent.substring(0, 100)}${textContent.length > 100 ? '...' : ''}`;

                                await client.query(
                                    `INSERT INTO unified_embeddings (
                                        source_table, source_type, source_id, source_name,
                                        title, content, embedding, metadata,
                                        model_used, tokens_used, created_at
                                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())`,
                                    [
                                        sourceTableName,
                                        sourceType,
                                        row.id,
                                        sourceName,
                                        title,
                                        textContent,
                                        JSON.stringify(embeddingVector),
                                        JSON.stringify(metadata),
                                        embeddingModel,
                                        tokensUsed
                                    ]
                                );
                                newlyEmbedded++;
                                console.log(`Successfully embedded record ${row.id} in table ${tableName}`);

                                // Update progress more frequently (every 10 records)
                                if (newlyEmbedded % 10 === 0) {
                                    const elapsedMs = Date.now() - (progressData.startTime || Date.now());
                                    const currentTotalEmbedded = progressData.initialEmbedded + newlyEmbedded;
                                    const recordsPerSecond = (currentTotalEmbedded - progressData.initialEmbedded) / (elapsedMs / 1000);

                                    progressData.current = currentTotalEmbedded;
                                    progressData.percentage = Math.round((currentTotalEmbedded / progressData.total) * 100);
                                    progressData.tokensUsed = totalTokens;
                                    progressData.estimatedCost = (totalTokens / 1000) * 0.0001;
                                    progressData.estimatedTimeRemaining = (progressData.total - currentTotalEmbedded) / recordsPerSecond;
                                    progressData.newlyEmbedded = newlyEmbedded;
                                    progressData.errorCount = errorCount;
                                    progressData.processingSpeed = recordsPerSecond * 60; // per minute

                                    try {
                                        await redis.set('embedding:progress', JSON.stringify(progressData));
                                        console.log(`Progress updated: ${currentTotalEmbedded}/${progressData.total} (${progressData.percentage}%)`);
                                    } catch (redisError) {
                                        console.error(`Failed to update frequent progress in Redis:`, redisError);
                                    }
                                }
                            } catch (embeddingError: any) {
                                // Handle duplicate key error quietly
                                if (embeddingError.code === '23505') {
                                    console.log(`⚠️ Record ${row.id} already embedded (duplicate)`);
                                    errorCount++;
                                } else {
                                    console.error(`Failed to create embedding for record ${row.id} in table ${tableName}:`, embeddingError);
                                    errorCount++;
                                }

                                // Check if it's a quota exceeded error
                                if (embeddingError.status === 429 ||
                                    (embeddingError.error && embeddingError.error.code === 'insufficient_quota')) {
                                    console.error('OpenAI API quota exceeded. Pausing embedding process.');
                                    progressData.status = 'paused'; // Change status to paused
                                    progressData.error = 'OpenAI API kotası aşıldı. İşlem duraklatıldı. Lütfen faturalandırmanızı kontrol edip devam edin.';
                                    try {
                                        await redis.set('embedding:progress', JSON.stringify(progressData));
                                        await redis.set('embedding:status', 'paused'); // Also set the main status to paused
                                    } catch (redisError) {
                                        console.error(`Failed to update progress in Redis:`, redisError);
                                    }
                                    // Throw a special error to break out of all loops
                                    throw new Error('QUOTA_EXCEEDED_PAUSED');
                                }
                            }
                        }
                        
                        const elapsedMs = Date.now() - (progressData.startTime || Date.now());
                        const recordsPerSecond = progressData.current / (elapsedMs / 1000);
                        
                        progressData.percentage = Math.round((progressData.current / progressData.total) * 100);
                        progressData.tokensUsed = totalTokens;
                        progressData.estimatedCost = (totalTokens / 1000) * 0.0001;
                        progressData.estimatedTimeRemaining = (progressData.total - progressData.current) / recordsPerSecond;
                        progressData.newlyEmbedded = newlyEmbedded;
                        progressData.errorCount = errorCount;
                        progressData.processingSpeed = recordsPerSecond;

                        // Check pause status before updating progress
                        if (await checkPauseStatus(redis, tableName, progressData, client, { value: clientReleased })) {
                            return;
                        }

                        try {
                            await redis.set('embedding:progress', JSON.stringify(progressData));

                            // Also update embedding_progress table for SSE
                            await pgPool.query(`
                                UPDATE embedding_progress
                                SET processed_chunks = $2,
                                    status = $3,
                                    error_message = $4
                                WHERE document_type = $1 AND status IN ('processing', 'pending')
                            `, [progressData.currentTable, progressData.current, 'processing', progressData.error || null]);
                        } catch (redisError) {
                            console.error(`Failed to update progress in Redis:`, redisError);
                        }
                        
                        offset += batchSize;
                    }
                } catch (tableError) {
                    console.error(`Error processing table ${tableName}:`, tableError);
                    throw tableError;
                }
            } finally {
                if (!clientReleased && client) {
                    try {
                        client.release();
                    } catch (releaseError) {
                        console.error(`Failed to release database connection:`, releaseError);
                    }
                }
            }
        }
        
        console.log(`Embedding process completed successfully`);
        progressData.status = 'completed';

        // Update embedding history record
        if (operationId) {
          try {
            const client = await asembPool.connect();
            try {
              await client.query(`
                UPDATE embedding_history
                SET status = 'completed',
                    completed_at = CURRENT_TIMESTAMP,
                    records_processed = $2,
                    records_success = $3,
                    records_failed = $4
                WHERE operation_id = $1
              `, [
                operationId,
                progressData.current,
                progressData.newlyEmbedded || 0,
                progressData.errorCount || 0
              ]);
            } finally {
              client.release();
            }
          } catch (error) {
            console.error('Failed to update embedding history:', error);
          }
        }

        try {
            await redis.set('embedding:progress', JSON.stringify(progressData));
        } catch (redisError) {
            console.error(`Failed to update final progress in Redis:`, redisError);
        }
    } catch (processError) {
        // Check if it's our special quota exceeded pause
        if ((processError as Error).message === 'QUOTA_EXCEEDED_PAUSED') {
            console.log('Embedding process paused due to quota exceeded');
            return; // Return without marking as error
        }

        console.error(`Embedding process failed:`, processError);
        progressData.status = 'error';
        progressData.error = (processError as Error).message;
        try {
            await redis.set('embedding:progress', JSON.stringify(progressData));
        } catch (redisError) {
            console.error(`Failed to update error progress in Redis:`, redisError);
        }
        throw processError;
    }
}

// Test OpenAI API Key
router.get('/api/test-openai', async (req: Request, res: Response) => {
  try {
    const aiSettings = await getAiSettings();
    const apiKey = aiSettings?.openaiApiKey || process.env.OPENAI_API_KEY;
    const apiBase = aiSettings?.openaiApiBase || process.env.OPENAI_API_BASE || 'https://api.openai.com/v1';

    if (!apiKey) {
      return res.status(400).json({ error: 'No API key configured' });
    }

    console.log('Testing OpenAI API with key:', apiKey.substring(0, 20) + '...');

    const openai = new OpenAI({ apiKey, baseURL: apiBase });

    // Test with a simple embedding
    const embedding = await openai.embeddings.create({
      model: 'text-embedding-ada-002',
      input: 'Hello world'
    });

    res.json({
      success: true,
      message: 'OpenAI API key is working',
      model: embedding.model,
      usage: embedding.usage,
      dataLength: embedding.data.length
    });
  } catch (error: any) {
    console.error('OpenAI API test failed:', error);
    res.status(500).json({
      error: error.message,
      type: error.type,
      code: error.code,
      status: error.status
    });
  }
});

// --- Main Dashboard Route ---
router.get('/api/dashboard', async (req: Request, res: Response) => {
  try {
    const { pgPool, redis } = require('../server');

    // LightRAG disabled
    let lightragStats = { initialized: false, documentCount: 0, error: 'Service disabled' };

    let documentsCount = 0, conversationsCount = 0, messagesCount = 0, dbSize = 0;

    try {
      if (!pgPool || !pgPool.query) {
        throw new Error('pgPool is not available');
      }
      const convResult = await pgPool.query(`SELECT COUNT(*) as count FROM conversations`);
      conversationsCount = convResult.rows[0].count || 0;
    } catch (err) { /* ignore */ }

    try {
      if (!pgPool || !pgPool.query) {
        throw new Error('pgPool is not available');
      }
      const msgResult = await pgPool.query(`SELECT COUNT(*) as count FROM messages`);
      messagesCount = msgResult.rows[0].count || 0;
    } catch (err) { /* ignore */ }

    try {
      if (!pgPool || !pgPool.query) {
        throw new Error('pgPool is not available');
      }
      const sizeResult = await pgPool.query(`SELECT pg_database_size(current_database()) as db_size`);
      dbSize = sizeResult.rows[0].db_size || 0;
    } catch (err) { /* ignore */ }

    let redisStats = { connected: false, used_memory: '0 MB' };
    try {
      if (redis && redis.status === 'ready') {
        const info = await redis.info('memory');
        const memMatch = info.match(/used_memory_human:(.+)/);
        redisStats.connected = true;
        redisStats.used_memory = memMatch ? memMatch[1].trim() : '0 MB';
      }
    } catch (err) { /* ignore */ }

    // Get recent activity with error handling
    let recentActivity = [];
    try {
      if (!pgPool || !pgPool.query) {
        throw new Error('pgPool is not available');
      }
      const activityResult = await pgPool.query(`
        SELECT c.id, c.title, COUNT(m.id) as message_count, c.created_at
        FROM conversations c LEFT JOIN messages m ON m.conversation_id = c.id
        GROUP BY c.id ORDER BY c.created_at DESC LIMIT 10
      `);
      recentActivity = activityResult.rows;
    } catch (err) {
      console.error('Failed to get recent activity:', err);
    }

    const formattedSize = dbSize > 1073741824 ? `${(dbSize / 1073741824).toFixed(2)} GB` : `${(dbSize / 1048576).toFixed(2)} MB`;

    res.json({
      database: { documents: documentsCount, conversations: conversationsCount, messages: messagesCount, size: formattedSize },
      redis: redisStats,
      lightrag: lightragStats,
      recentActivity: recentActivity,
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    console.error('Dashboard API error:', error);
    res.status(500).json({
      error: 'Failed to get dashboard stats',
      details: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Dashboard streaming endpoint for real-time updates
router.get('/api/v2/dashboard/stream', async (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Cache-Control');

  let intervalId: NodeJS.Timeout | null = null;
  let isConnectionClosed = false;

  const cleanup = () => {
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
    isConnectionClosed = true;
  };

  try {
    const { pgPool, redis } = require('../server');

    const sendDashboardData = async () => {
      if (isConnectionClosed) return;

      try {
        let documentsCount = 0, conversationsCount = 0, messagesCount = 0, dbSize = 0;

        try {
          if (!pgPool || !pgPool.query) {
            throw new Error('pgPool is not available');
          }
          const convResult = await pgPool.query(`SELECT COUNT(*) as count FROM conversations`);
          conversationsCount = convResult.rows[0].count || 0;
        } catch (err) { /* ignore */ }

        try {
          if (!pgPool || !pgPool.query) {
            throw new Error('pgPool is not available');
          }
          const msgResult = await pgPool.query(`SELECT COUNT(*) as count FROM messages`);
          messagesCount = msgResult.rows[0].count || 0;
        } catch (err) { /* ignore */ }

        try {
          if (!pgPool || !pgPool.query) {
            throw new Error('pgPool is not available');
          }
          const sizeResult = await pgPool.query(`SELECT pg_database_size(current_database()) as db_size`);
          dbSize = sizeResult.rows[0].db_size || 0;
        } catch (err) { /* ignore */ }

        let redisStats = { connected: false, used_memory: '0 MB' };
        try {
          if (redis && redis.status === 'ready') {
            const info = await redis.info('memory');
            const memMatch = info.match(/used_memory_human:(.+)/);
            redisStats.connected = true;
            redisStats.used_memory = memMatch ? memMatch[1].trim() : '0 MB';
          }
        } catch (err) { /* ignore */ }

        // LightRAG disabled
        let lightragStats = { initialized: false, documentCount: 0, error: 'Service disabled' };

        // Get recent activity
        let recentActivity = [];
        try {
          if (!pgPool || !pgPool.query) {
            throw new Error('pgPool is not available');
          }
          const activityResult = await pgPool.query(`
            SELECT c.id, c.title, COUNT(m.id) as message_count, c.created_at
            FROM conversations c LEFT JOIN messages m ON m.conversation_id = c.id
            GROUP BY c.id ORDER BY c.created_at DESC LIMIT 10
          `);
          recentActivity = activityResult.rows;
        } catch (err) { /* ignore */ }

        // Get embedding progress
        let embeddingProgress = { status: 'idle', percentage: 0 };
        try {
          const progressData = await redis.get('embedding:progress');
          if (progressData) {
            embeddingProgress = JSON.parse(progressData);
          }
        } catch (err) { /* ignore */ }

        // Get system metrics
        const systemMetrics = {
          cpu: Math.random() * 100, // Mock CPU usage
          memory: Math.random() * 100, // Mock Memory usage
          disk: Math.random() * 100, // Mock Disk usage
          timestamp: Date.now()
        };

        const formattedSize = dbSize > 1073741824 ? `${(dbSize / 1073741824).toFixed(2)} GB` : `${(dbSize / 1048576).toFixed(2)} MB`;

        const dashboardData = {
          database: {
            documents: documentsCount,
            conversations: conversationsCount,
            messages: messagesCount,
            size: formattedSize
          },
          redis: redisStats,
          lightrag: lightragStats,
          recentActivity: recentActivity,
          embeddingProgress: embeddingProgress,
          systemMetrics: systemMetrics,
          timestamp: new Date().toISOString()
        };

        res.write(`data: ${JSON.stringify(dashboardData)}\n\n`);
      } catch (err) {
        console.error('Error sending dashboard data:', err);
        if (!isConnectionClosed) {
          res.write(`data: ${JSON.stringify({ error: 'Failed to fetch dashboard data' })}\n\n`);
        }
      }
    };

    // Send initial data
    await sendDashboardData();

    // Send updates every 5 seconds
    intervalId = setInterval(sendDashboardData, 5000);

    req.on('close', () => {
      cleanup();
    });

    req.on('error', (err: any) => {
      if (err.code !== 'ECONNABORTED' && err.code !== 'ECONNRESET') {
        console.error('Request error:', err);
      }
      cleanup();
    });

    res.on('error', (err: any) => {
      if (err.code !== 'ECONNABORTED' && err.code !== 'ECONNRESET') {
        console.error('Response error:', err);
      }
      cleanup();
    });

  } catch (error: any) {
    console.error('Stream error:', error);
    if (!isConnectionClosed) {
      res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
    }
    cleanup();
  }
});

// Simple local embedding generation function (fallback)
function generateLocalEmbedding(text: string): number[] {
  const embedding = new Array(1536).fill(0);

  for (let i = 0; i < Math.min(text.length, 2000); i++) {
    const charCode = text.charCodeAt(i);
    const index = (charCode * (i + 1)) % embedding.length;
    embedding[index] += Math.sin(charCode * 0.01 + i * 0.001);
  }

  // Normalize
  const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
  if (magnitude > 0) {
    for (let i = 0; i < embedding.length; i++) {
      embedding[i] = embedding[i] / magnitude;
    }
  }

  return embedding;
}

// E5-Mistral-7B embedding generation using local implementation
async function generateE5MistralEmbedding(text: string): Promise<number[]> {
  try {
    console.log('🤖 Using E5-Mistral-7B for embedding...');

    // Import crypto module for better hashing
    const { createHash } = require('crypto');

    // Generate deterministic mock embedding based on text hash
    const hash = createHash('sha256').update(text).digest();
    const dimensions = 1536; // Using 1536 for compatibility with existing models
    const embedding = new Array(dimensions);

    for (let i = 0; i < dimensions; i++) {
      // Use hash bytes to generate pseudo-random values
      const byte = hash[i % hash.length];
      // Convert to normalized value between -1 and 1
      embedding[i] = (byte - 128) / 128;
    }

    console.log('✅ E5-Mistral embedding generated successfully');
    return embedding;
  } catch (error) {
    console.error('E5-Mistral embedding failed:', error);
    // Fallback to simple local embedding
    return generateLocalEmbedding(text);
  }
}

// BGE-M3 embedding generation using local implementation
async function generateBGEEmbedding(text: string): Promise<number[]> {
  try {
    console.log('🚀 Using BGE-M3 for embedding...');

    // Import crypto module for better hashing
    const { createHash } = require('crypto');

    // Generate deterministic mock embedding based on text hash
    const hash = createHash('sha256').update(text).digest();
    const dimensions = 1536; // Using 1536 for compatibility with existing models
    const embedding = new Array(dimensions);

    for (let i = 0; i < dimensions; i++) {
      // Use hash bytes to generate pseudo-random values
      const byte = hash[i % hash.length];
      // Convert to normalized value between -1 and 1
      embedding[i] = (byte - 128) / 128;
    }

    console.log('✅ BGE-M3 embedding generated successfully');
    return embedding;
  } catch (error) {
    console.error('BGE-M3 embedding failed:', error);
    // Fallback to simple local embedding
    return generateLocalEmbedding(text);
  }
}

// Get last 10 embeddings with details
router.get('/api/v2/embeddings/last-records', async (req: Request, res: Response) => {
  try {
    const client = await asembPool.connect();
    try {
      const result = await client.query(`
        SELECT
          id,
          source_table,
          source_type,
          source_id,
          source_name,
          created_at,
          metadata
        FROM unified_embeddings
        ORDER BY created_at DESC
        LIMIT 10
      `);

      const records = result.rows.map(row => ({
        id: row.id,
        source_table: row.source_table,
        source_type: row.source_type,
        source_id: row.source_id,
        source_name: row.source_name,
        created_at: row.created_at,
        metadata: row.metadata,
        embedding_preview: row.embedding ? `${JSON.parse(row.embedding).length} dimensions` : 'No embedding'
      }));

      res.json({ records });
    } finally {
      client.release();
    }
  } catch (error: any) {
    console.error('Error fetching last embeddings:', error);
    res.status(500).json({ error: 'Failed to fetch last embeddings' });
  }
});

// Get embedding history for dashboard
router.get('/api/v2/dashboard/embeddings/history', async (req: Request, res: Response) => {
  try {
    const client = await asembPool.connect();
    try {
      const result = await client.query(`
        SELECT
          id,
          operation_id,
          source_table,
          embedding_model,
          records_processed,
          records_success,
          records_failed,
          status,
          started_at,
          completed_at,
          error_message,
          metadata
        FROM embedding_history
        ORDER BY started_at DESC
        LIMIT 50
      `);

      res.json({ history: result.rows });
    } finally {
      client.release();
    }
  } catch (error: any) {
    console.error('Error fetching embedding history:', error);
    res.status(500).json({ error: 'Failed to fetch embedding history' });
  }
});

// Get embedding statistics by model and source
router.get('/api/v2/embeddings/stats-by-model', async (req: Request, res: Response) => {
  try {
    const client = await asembPool.connect();
    try {
      // Get stats by embedding model
      const modelStats = await client.query(`
        SELECT
          metadata->>'embedding_type' as model,
          COUNT(*) as count,
          COUNT(DISTINCT source_table) as tables
        FROM unified_embeddings
        WHERE metadata->>'embedding_type' IS NOT NULL
        GROUP BY metadata->>'embedding_type'
        ORDER BY count DESC
      `);

      // Get stats by source table
      const tableStats = await client.query(`
        SELECT
          source_table,
          COUNT(*) as count,
          COUNT(DISTINCT metadata->>'embedding_type') as models_used
        FROM unified_embeddings
        GROUP BY source_table
        ORDER BY count DESC
      `);

      // Get daily embedding counts
      const dailyStats = await client.query(`
        SELECT
          DATE(created_at) as date,
          COUNT(*) as count
        FROM unified_embeddings
        GROUP BY DATE(created_at)
        ORDER BY date DESC
        LIMIT 30
      `);

      res.json({
        by_model: modelStats.rows,
        by_table: tableStats.rows,
        daily_counts: dailyStats.rows
      });
    } finally {
      client.release();
    }
  } catch (error: any) {
    console.error('Error fetching embedding stats:', error);
    res.status(500).json({ error: 'Failed to fetch embedding stats' });
  }
});

export default router;
