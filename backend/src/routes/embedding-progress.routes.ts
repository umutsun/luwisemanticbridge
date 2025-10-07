import { Router, Request, Response } from 'express';
import { pgPool, redis } from '../server';
import { getDatabaseSettings, getSettingsBasedPool } from '../config/database.config';

const router = Router();

// Get embedding progress
router.get('/progress', async (req: Request, res: Response) => {
  try {
    // Check if table exists
    await pgPool.query(`
      CREATE TABLE IF NOT EXISTS embedding_progress (
        id SERIAL PRIMARY KEY,
        document_id TEXT,
        document_type TEXT,
        status TEXT DEFAULT 'pending',
        progress INTEGER DEFAULT 0,
        total_chunks INTEGER DEFAULT 0,
        processed_chunks INTEGER DEFAULT 0,
        error_message TEXT,
        started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        completed_at TIMESTAMP
      )
    `);

    const result = await pgPool.query(`
      SELECT *
      FROM embedding_progress
      WHERE status IN ('pending', 'processing', 'paused')
      ORDER BY
        CASE
          WHEN status = 'processing' THEN 1
          WHEN status = 'paused' THEN 2
          WHEN status = 'pending' THEN 3
          ELSE 4
        END,
        started_at DESC
      LIMIT 1
    `);

    // If there's an active process, return its progress
    if (result.rows.length > 0) {
      const progress = result.rows[0];

      // Calculate actual embedded records from the database for better accuracy
      let actualEmbeddedCount = 0;
      try {
        const embeddedResult = await pgPool.query(`
          SELECT COUNT(DISTINCT(metadata->>'source_id')) as count
          FROM unified_embeddings
          WHERE source_table = $1
        `, [progress.document_type]);
        actualEmbeddedCount = parseInt(embeddedResult.rows[0]?.count || '0');
      } catch (error) {
        console.error('Error getting actual embedded count:', error);
      }

      // Get total records for the current table
      let totalRecords = 0;

      // First try to get table mapping from Redis
      const redisKey = `embedding:table_mapping:${progress.document_type}`;
      let actualTableName = null;

      try {
        actualTableName = await redis.get(redisKey);
      } catch (redisError) {
        console.error('Redis error:', redisError);
      }

      // If not in Redis, try to get from database configuration
      if (!actualTableName) {
        try {
          const configResult = await pgPool.query(`
            SELECT table_name FROM table_mappings
            WHERE display_name = $1
          `, [progress.document_type]);

          if (configResult.rows.length > 0) {
            actualTableName = configResult.rows[0].table_name;
            // Cache in Redis for future use
            await redis.set(redisKey, actualTableName, 'EX', 3600); // Cache for 1 hour
          }
        } catch (configError) {
          console.error('Error getting table mapping:', configError);
        }
      }

      // If still not found, use the document_type as table name
      actualTableName = actualTableName || progress.document_type;

      try {
        const totalResult = await pgPool.query(`SELECT COUNT(*) as count FROM ${actualTableName}`);
        totalRecords = parseInt(totalResult.rows[0]?.count || '0');
      } catch (error) {
        console.error('Error getting total records:', error);
        // If table doesn't exist, use the chunks count as fallback
        totalRecords = progress.total_chunks;
      }

      // Calculate percentage based on actual records
      const percentage = totalRecords > 0
        ? Math.round((actualEmbeddedCount / totalRecords) * 100)
        : 0;
      
      // Calculate estimated time remaining
      let estimatedTimeRemaining = 0;
      if (progress.status === 'processing' && actualEmbeddedCount > 0) {
        const elapsed = Date.now() - new Date(progress.started_at).getTime();
        const rate = actualEmbeddedCount / (elapsed / 1000); // records per second
        const remaining = totalRecords - actualEmbeddedCount;
        estimatedTimeRemaining = remaining > 0 ? Math.round(remaining / rate * 1000) : 0;
      }
      
      // Calculate newly embedded records (this session)
      const newlyEmbedded = actualEmbeddedCount - (progress.already_embedded || 0);

      // Calculate processing speed (records per minute)
      let processingSpeed = 0;
      if (progress.status === 'processing' && actualEmbeddedCount > 0) {
        const elapsedMinutes = (Date.now() - new Date(progress.started_at).getTime()) / (1000 * 60);
        processingSpeed = elapsedMinutes > 0 ? Math.round(actualEmbeddedCount / elapsedMinutes) : 0;
      }

      const progressData = {
        status: progress.status,
        current: actualEmbeddedCount,
        total: totalRecords,
        percentage,
        currentTable: progress.document_type,
        error: progress.error_message,
        tokensUsed: actualEmbeddedCount * 500, // Estimate based on actual records
        estimatedCost: (actualEmbeddedCount * 500) / 1000 * 0.0001,
        startTime: new Date(progress.started_at).getTime(),
        estimatedTimeRemaining,
        processedTables: progress.document_type ? [progress.document_type] : [],
        alreadyEmbedded: actualEmbeddedCount,
        pendingCount: totalRecords - actualEmbeddedCount,
        successCount: actualEmbeddedCount,
        errorCount: progress.error_message ? 1 : 0,
        newlyEmbedded: Math.max(0, newlyEmbedded),
        currentBatch: Math.ceil(actualEmbeddedCount / 50) || 1, // Assuming 50 records per batch
        totalBatches: Math.ceil(totalRecords / 50) || 1,
        processingSpeed
      };
      
      res.json(progressData);
    } else {
      // No active process
      res.json({
        status: 'idle',
        current: 0,
        total: 0,
        percentage: 0,
        currentTable: null,
        error: null,
        tokensUsed: 0,
        estimatedCost: 0,
        startTime: Date.now(),
        estimatedTimeRemaining: 0,
        processedTables: [],
        alreadyEmbedded: 0,
        pendingCount: 0,
        successCount: 0,
        errorCount: 0,
        newlyEmbedded: 0
      });
    }
  } catch (error: any) {
    console.error('Error fetching embedding progress:', error);
    res.status(500).json({
      error: 'Failed to fetch embedding progress',
      message: error.message
    });
  }
});

// Get embedding progress from Redis (real-time data)
router.get('/', async (req: Request, res: Response) => {
  try {
    // Try to get progress from Redis first (check both keys for compatibility)
    let redisProgress = await redis.get('embedding:progress');

    // If not found in embedding:progress, try migration:progress for backward compatibility
    if (!redisProgress) {
      redisProgress = await redis.get('migration:progress');
      if (redisProgress) {
        console.log('Found progress in migration:progress key, converting to embedding:progress format');
        const migrationData = JSON.parse(redisProgress);
        // Convert migration progress format to embedding progress format
        const convertedProgress = {
          status: migrationData.status,
          current: migrationData.current || 0,
          total: migrationData.total || 0,
          percentage: migrationData.percentage || 0,
          currentTable: migrationData.currentTable || null,
          error: migrationData.error || null,
          tokensUsed: migrationData.tokensUsed || (migrationData.current || 0) * 500,
          estimatedCost: migrationData.estimatedCost || ((migrationData.current || 0) * 500) / 1000 * 0.0001,
          startTime: migrationData.startTime || Date.now(),
          estimatedTimeRemaining: migrationData.estimatedTimeRemaining || 0,
          processedTables: migrationData.tables || [],
          alreadyEmbedded: migrationData.current || 0,
          pendingCount: (migrationData.total || 0) - (migrationData.current || 0),
          successCount: migrationData.current || 0,
          errorCount: migrationData.error ? 1 : 0,
          newlyEmbedded: migrationData.newlyEmbedded || 0
        };
        redisProgress = JSON.stringify(convertedProgress);

        // Update the embedding:progress key for future requests
        await redis.set('embedding:progress', redisProgress, 'EX', 7 * 24 * 60 * 60);
        console.log('✅ Converted and saved progress to embedding:progress key');
      }
    }

    if (redisProgress) {
      const progressData = JSON.parse(redisProgress);

      // If status is processing or paused, also check database for table stats
      if (progressData.status === 'processing' || progressData.status === 'paused') {
        try {
          // Get actual counts from unified_embeddings table
          const embeddedResult = await pgPool.query(`
            SELECT source_table, COUNT(DISTINCT(metadata->>'source_id')) as count
            FROM unified_embeddings
            WHERE source_table IN ('Soru-Cevap', 'Makaleler', 'Danıştay Kararları')
            GROUP BY source_table
          `);

          let totalEmbedded = 0;
          embeddedResult.rows.forEach(row => {
            totalEmbedded += parseInt(row.count);
          });

          // Update real-time metrics from Redis progress data
          const elapsedMs = Date.now() - (progressData.startTime || Date.now());
          const recordsPerSecond = totalEmbedded / (elapsedMs / 1000);

          // Calculate processing speed (records per minute)
          progressData.processingSpeed = recordsPerSecond * 60;

          // Calculate estimated time remaining
          if (recordsPerSecond > 0) {
            progressData.estimatedTimeRemaining = (progressData.total - totalEmbedded) / recordsPerSecond;
          }

          // Update newly embedded count (this session)
          if (!progressData.initialEmbedded) {
            progressData.initialEmbedded = totalEmbedded - progressData.current;
          }
          progressData.newlyEmbedded = totalEmbedded - progressData.initialEmbedded;

          // Update already embedded count
          progressData.alreadyEmbedded = totalEmbedded;
          progressData.current = totalEmbedded;

          // Update pending count
          progressData.pendingCount = progressData.total - totalEmbedded;

          // Ensure tokens and cost are calculated
          if (progressData.tokensUsed === undefined) {
            progressData.tokensUsed = progressData.current * 500; // Estimate 500 tokens per record
          }
          if (progressData.estimatedCost === undefined) {
            progressData.estimatedCost = (progressData.tokensUsed / 1000) * 0.0001;
          }

        } catch (dbError) {
          console.error('Error fetching database stats:', dbError);
        }
      }

      res.json(progressData);
    } else {
      // No progress in Redis, check database for idle status
      const result = await pgPool.query(`
        SELECT *
        FROM embedding_progress
        WHERE status IN ('processing', 'paused', 'completed')
          AND (status != 'completed' OR
               (status = 'completed' AND started_at > NOW() - INTERVAL '5 minutes'))
        ORDER BY
          CASE
            WHEN status = 'processing' THEN 1
            WHEN status = 'paused' THEN 2
            WHEN status = 'completed' THEN 3
            ELSE 4
          END,
          started_at DESC
        LIMIT 1
      `);

      if (result.rows.length > 0) {
        const progress = result.rows[0];
        const startTime = new Date(progress.started_at).getTime();
        const oneHourAgo = Date.now() - (60 * 60 * 1000);

        // Check if the record is stale (older than 1 hour)
        if (startTime < oneHourAgo) {
          console.log('Found stale progress record, marking as completed');
          await pgPool.query(`
            UPDATE embedding_progress
            SET status = 'completed', completed_at = CURRENT_TIMESTAMP
            WHERE id = $1
          `, [progress.id]);

          // Return idle status for stale records
          res.json({
            status: 'idle',
            current: 0,
            total: 0,
            percentage: 0,
            currentTable: null,
            error: null,
            tokensUsed: 0,
            estimatedCost: 0,
            startTime: Date.now(),
            estimatedTimeRemaining: 0,
            processedTables: [],
            alreadyEmbedded: progress.already_embedded || 0,
            pendingCount: progress.pending_count || 0,
            successCount: 0,
            errorCount: 0,
            newlyEmbedded: 0
          });
          return;
        }

        const percentage = progress.total_chunks > 0
          ? Math.round((progress.processed_chunks / progress.total_chunks) * 100)
          : 0;

        // Return database data with default values for Redis fields
        res.json({
          status: progress.status,
          current: progress.processed_chunks,
          total: progress.total_chunks,
          percentage,
          currentTable: progress.document_type,
          error: progress.error_message,
          tokensUsed: progress.processed_chunks * 500, // Fallback estimate
          estimatedCost: (progress.processed_chunks * 500) / 1000 * 0.0001,
          startTime: startTime,
          estimatedTimeRemaining: 0,
          processedTables: progress.document_type ? [progress.document_type] : [],
          alreadyEmbedded: progress.already_embedded || 0,
          pendingCount: progress.pending_count || 0,
          successCount: progress.processed_chunks,
          errorCount: progress.error_message ? 1 : 0,
          newlyEmbedded: 0
        });
      } else {
        // No active process
        res.json({
          status: 'idle',
          current: 0,
          total: 0,
          percentage: 0,
          currentTable: null,
          error: null,
          tokensUsed: 0,
          estimatedCost: 0,
          startTime: Date.now(),
          estimatedTimeRemaining: 0,
          processedTables: [],
          alreadyEmbedded: 0,
          pendingCount: 0,
          successCount: 0,
          errorCount: 0,
          newlyEmbedded: 0
        });
      }
    }
  } catch (error: any) {
    console.error('Error fetching embedding progress from Redis:', error);
    res.status(500).json({
      error: 'Failed to fetch embedding progress',
      message: error.message
    });
  }
});

// Start embedding process
router.post('/api/v2/embeddings/start', async (req: Request, res: Response) => {
  try {
    const { document_id, document_type, total_chunks } = req.body;

    const result = await pgPool.query(`
      INSERT INTO embedding_progress (document_id, document_type, status, total_chunks)
      VALUES ($1, $2, 'processing', $3)
      RETURNING *
    `, [document_id, document_type, total_chunks || 0]);

    res.json({
      success: true,
      progress: result.rows[0]
    });
  } catch (error: any) {
    console.error('Error starting embedding process:', error);
    res.status(500).json({
      error: 'Failed to start embedding process',
      message: error.message
    });
  }
});

// Update embedding progress
router.put('/api/v2/embeddings/progress/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { processed_chunks, status, error_message } = req.body;

    let query = `
      UPDATE embedding_progress 
      SET processed_chunks = $2, 
          progress = CASE WHEN total_chunks > 0 THEN (processed_chunks * 100 / total_chunks) ELSE 0 END
    `;
    const params: any[] = [id, processed_chunks];

    if (status) {
      query += `, status = $${params.length + 1}`;
      params.push(status);
      
      if (status === 'completed' || status === 'failed') {
        query += `, completed_at = CURRENT_TIMESTAMP`;
      }
    }

    if (error_message) {
      query += `, error_message = $${params.length + 1}`;
      params.push(error_message);
    }

    query += ` WHERE id = $1 RETURNING *`;

    const result = await pgPool.query(query, params);

    res.json({
      success: true,
      progress: result.rows[0]
    });
  } catch (error: any) {
    console.error('Error updating embedding progress:', error);
    res.status(500).json({
      error: 'Failed to update embedding progress',
      message: error.message
    });
  }
});

// Generate embeddings (frontend compatible)
router.post('/api/embeddings/generate', async (req: Request, res: Response) => {
  try {
    const { tables, batchSize, workerCount, resume, startOffset } = req.body;
    
    console.log('Starting embedding generation for tables:', tables);
    console.log('Batch size:', batchSize, 'Workers:', workerCount);
    console.log('Resume:', resume, 'Start offset:', startOffset);
    
    // Check if table exists
    await pgPool.query(`
      CREATE TABLE IF NOT EXISTS embedding_progress (
        id SERIAL PRIMARY KEY,
        document_id TEXT,
        document_type TEXT,
        status TEXT DEFAULT 'pending',
        progress INTEGER DEFAULT 0,
        total_chunks INTEGER DEFAULT 0,
        processed_chunks INTEGER DEFAULT 0,
        error_message TEXT,
        started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        completed_at TIMESTAMP
      )
    `);
    
    // Get total records count for the selected tables
    let totalRecords = 0;
    for (const table of tables) {
      try {
        const result = await pgPool.query(`SELECT COUNT(*) as count FROM ${table}`);
        totalRecords += parseInt(result.rows[0].count);
      } catch (error) {
        console.error(`Error getting count for table ${table}:`, error);
      }
    }
    
    // If resuming, get existing progress
    let existingProgress = null;
    if (resume) {
      const result = await pgPool.query(`
        SELECT * FROM embedding_progress
        WHERE status = 'paused'
        ORDER BY started_at DESC
        LIMIT 1
      `);
      
      if (result.rows.length > 0) {
        existingProgress = result.rows[0];
      }
    }
    
    // Create or update progress record
    let progress;
    if (existingProgress) {
      // Resume existing process
      const updateResult = await pgPool.query(`
        UPDATE embedding_progress
        SET status = 'processing', started_at = CURRENT_TIMESTAMP
        WHERE id = $1
        RETURNING *
      `, [existingProgress.id]);
      
      progress = updateResult.rows[0];
    } else {
      // Create new process
      const documentId = `embedding_${Date.now()}`;
      const documentType = tables.join(',');
      
      const insertResult = await pgPool.query(`
        INSERT INTO embedding_progress (document_id, document_type, status, total_chunks, processed_chunks)
        VALUES ($1, $2, 'processing', $3, $4)
        RETURNING *
      `, [documentId, documentType, totalRecords, startOffset || 0]);
      
      progress = insertResult.rows[0];
    }
    
    // Calculate percentage
    const percentage = progress.total_chunks > 0
      ? Math.round((progress.processed_chunks / progress.total_chunks) * 100)
      : 0;
    
    // Calculate tokens and cost (assuming 500 tokens per record)
    const tokensUsed = progress.processed_chunks * 500;
    const estimatedCost = (tokensUsed / 1000) * 0.0001;
    
    // Calculate batch information (using default batch size of 50)
    const defaultBatchSize = 50;
    const currentBatch = Math.ceil(progress.processed_chunks / defaultBatchSize) || 1;
    const totalBatches = Math.ceil(progress.total_chunks / defaultBatchSize) || 1;
    
    // Calculate newly embedded records
    const newlyEmbedded = progress.processed_chunks - (progress.already_embedded || 0);
    
    // Calculate processing speed (records per minute)
    let processingSpeed = 0;
    if (progress.status === 'processing' && progress.processed_chunks > 0) {
      const elapsedMinutes = (Date.now() - new Date(progress.started_at).getTime()) / (1000 * 60);
      processingSpeed = elapsedMinutes > 0 ? Math.round(progress.processed_chunks / elapsedMinutes) : 0;
    }
    
    const progressData = {
      status: progress.status,
      current: progress.processed_chunks,
      total: progress.total_chunks,
      percentage,
      currentTable: progress.document_type.split(',')[0],
      error: progress.error_message,
      tokensUsed,
      estimatedCost,
      startTime: new Date(progress.started_at).getTime(),
      estimatedTimeRemaining: 0,
      processedTables: progress.document_type.split(','),
      alreadyEmbedded: progress.already_embedded || 0,
      pendingCount: progress.pending_count || (progress.total_chunks - progress.processed_chunks),
      successCount: progress.processed_chunks,
      errorCount: progress.error_message ? 1 : 0,
      newlyEmbedded: Math.max(0, newlyEmbedded),
      currentBatch,
      totalBatches,
      processingSpeed
    };
    
    res.json({
      success: true,
      message: resume ? 'Embedding generation resumed' : 'Embedding generation started',
      progress: progressData
    });
  } catch (error: any) {
    console.error('Error starting embedding generation:', error);
    res.status(500).json({
      error: 'Failed to start embedding generation',
      message: error.message
    });
  }
});

// Get embedding tables
router.get('/api/embeddings/tables', async (req: Request, res: Response) => {
  try {
    // Get real data from database
    const tables = [];

    // Get unified_embeddings stats first
    const embeddingStats = await pgPool.query(`
      SELECT source_table, COUNT(*) as embedded_count
      FROM unified_embeddings
      GROUP BY source_table
    `);

    // Create a map for quick lookup
    const statsMap = new Map();
    embeddingStats.rows.forEach((row: any) => {
      statsMap.set(row.source_table, parseInt(row.embedded_count));
    });

    // Get tables from settings/database dynamically
    let tableMappings = [];
    try {
      // Try to get source database connection from settings
      const sourcePool = await getSettingsBasedPool();
      const tablesResult = await sourcePool.query(`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
        ORDER BY table_name
      `);

      tableMappings = tablesResult.rows.map(row => ({
        name: row.table_name,
        sourceName: row.table_name.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
        textColumns: 1 // Default value
      }));
    } catch (error) {
      console.error('Error getting dynamic tables:', error);
      // Fallback to empty array if can't get tables
      tableMappings = [];
    }

    // Get stats for each table (only if we have tables)
    for (const table of tableMappings) {
      try {
        // Use source pool for counting records
        const sourcePool = await getSettingsBasedPool();
        const result = await sourcePool.query(`SELECT COUNT(*) as total FROM ${table.name}`);
        const totalRecords = parseInt(result.rows[0].total) || 0;
        const embeddedRecords = statsMap.get(table.sourceName) || 0;

        tables.push({
          name: table.name,
          displayName: table.sourceName,
          database: 'rag_chatbot',
          totalRecords,
          embeddedRecords,
          textColumns: table.textColumns,
          pendingRecords: Math.max(0, totalRecords - embeddedRecords)
        });

        console.log(`${table.sourceName}: ${embeddedRecords}/${totalRecords} embedded`);
      } catch (error) {
        console.error(`Error getting stats for ${table.name}:`, error);
      }
    }

    res.json({
      success: true,
      tables
    });
  } catch (error: any) {
    console.error('Error fetching tables:', error);
    res.status(500).json({
      error: 'Failed to fetch tables',
      message: error.message
    });
  }
});

// Get embedding stats
router.get('/api/embeddings/stats', async (req: Request, res: Response) => {
  try {
    // Calculate real stats from database
    let totalRecords = 0;
    let totalEmbedded = 0;
    const tables = [];

    // Get stats for each table dynamically
    let tableStats = [];
    try {
      // Try to get source database connection from settings
      const sourcePool = await getSettingsBasedPool();
      const tablesResult = await sourcePool.query(`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
        ORDER BY table_name
      `);

      tableStats = tablesResult.rows.map(row => ({
        name: row.table_name,
        sourceName: row.table_name.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
      }));
    } catch (error) {
      console.error('Error getting dynamic tables for stats:', error);
      // Fallback to empty array if can't get tables
      tableStats = [];
    }

    for (const table of tableStats) {
      try {
        const countResult = await pgPool.query(`SELECT COUNT(*) as count FROM ${table.name}`);
        const embeddedResult = await pgPool.query(`SELECT COUNT(*) as embedded FROM unified_embeddings WHERE source_table = '${table.sourceName}'`);

        const count = parseInt(countResult.rows[0].count) || 0;
        const embedded = parseInt(embeddedResult.rows[0].embedded) || 0;
        const pending = count - embedded;

        totalRecords += count;
        totalEmbedded += embedded;

        tables.push({
          name: table.name,
          count,
          embedded,
          pending
        });
      } catch (error) {
        console.error(`Error getting stats for ${table.name}:`, error);
      }
    }

    const stats = {
      database: 'rag_chatbot',
      totalRecords,
      embeddedRecords: totalEmbedded,
      pendingRecords: totalRecords - totalEmbedded,
      tables
    };
    
    res.json(stats);
  } catch (error: any) {
    console.error('Error fetching stats:', error);
    res.status(500).json({
      error: 'Failed to fetch stats',
      message: error.message
    });
  }
});

// Progress stream for SSE
router.get('/progress/stream', async (req: Request, res: Response) => {
  try {
    // Set headers for SSE
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Cache-Control'
    });

    // Send initial connection confirmation
    res.write(`data: ${JSON.stringify({ status: 'connected', message: 'SSE connection established' })}\n\n`);

    let isClientConnected = true;
    req.on('close', () => {
      isClientConnected = false;
      console.log('SSE client disconnected from backend');
    });
    
    // Get actual progress from database and Redis
    const getActualProgress = async () => {
      try {
        // First check Redis for migration progress (check both keys for compatibility)
        let redisProgress = await redis.get('embedding:progress');

        // If not found in embedding:progress, try migration:progress for backward compatibility
        if (!redisProgress) {
          redisProgress = await redis.get('migration:progress');
          if (redisProgress) {
            console.log('SSE: Found progress in migration:progress key, converting to embedding:progress format');
            const migrationData = JSON.parse(redisProgress);
            // Convert migration progress format to embedding progress format
            const convertedProgress = {
              status: migrationData.status,
              current: migrationData.current || 0,
              total: migrationData.total || 0,
              percentage: migrationData.percentage || 0,
              currentTable: migrationData.currentTable || null,
              error: migrationData.error || null,
              tokensUsed: migrationData.tokensUsed || (migrationData.current || 0) * 500,
              estimatedCost: migrationData.estimatedCost || ((migrationData.current || 0) * 500) / 1000 * 0.0001,
              startTime: migrationData.startTime || Date.now(),
              estimatedTimeRemaining: migrationData.estimatedTimeRemaining || 0,
              processedTables: migrationData.tables || [],
              alreadyEmbedded: migrationData.current || 0,
              pendingCount: (migrationData.total || 0) - (migrationData.current || 0),
              successCount: migrationData.current || 0,
              errorCount: migrationData.error ? 1 : 0,
              newlyEmbedded: migrationData.newlyEmbedded || 0
            };
            redisProgress = JSON.stringify(convertedProgress);

            // Update the embedding:progress key for future requests
            await redis.set('embedding:progress', redisProgress, 'EX', 7 * 24 * 60 * 60);
            console.log('SSE: ✅ Converted and saved progress to embedding:progress key');
          }
        }

        if (redisProgress) {
          const progressData = JSON.parse(redisProgress);

          // If this is active migration progress, use it
          if (progressData.status === 'processing' || progressData.status === 'paused') {
            // Get actual embedded counts from database
            let totalEmbedded = 0;
            try {
              const embeddedResult = await pgPool.query(`
                SELECT source_table, COUNT(DISTINCT(metadata->>'source_id')) as count
                FROM unified_embeddings
                WHERE source_table IN ('Soru-Cevap', 'Makaleler', 'Danıştay Kararları', 'Özelgeler')
                GROUP BY source_table
              `);

              embeddedResult.rows.forEach(row => {
                totalEmbedded += parseInt(row.count);
              });
            } catch (dbError) {
              console.error('Error fetching embedded counts:', dbError);
            }

            // Calculate processing speed
            const elapsedMs = Date.now() - (progressData.startTime || Date.now());
            const recordsPerSecond = totalEmbedded / (elapsedMs / 1000);
            const processingSpeed = recordsPerSecond * 60;

            // Calculate estimated time remaining
            let estimatedTimeRemaining = null;
            if (recordsPerSecond > 0 && progressData.total > totalEmbedded) {
              estimatedTimeRemaining = (progressData.total - totalEmbedded) / recordsPerSecond;
            }

            return {
              status: progressData.status,
              current: totalEmbedded,
              total: progressData.total || 0,
              percentage: progressData.total > 0 ? Math.round((totalEmbedded / progressData.total) * 100) : 0,
              currentTable: progressData.currentTable || null,
              error: progressData.error || null,
              tokensUsed: totalEmbedded * 500,
              estimatedCost: (totalEmbedded * 500) / 1000 * 0.0001,
              startTime: progressData.startTime || Date.now(),
              estimatedTimeRemaining,
              processedTables: progressData.processedTables || [],
              alreadyEmbedded: totalEmbedded,
              pendingCount: Math.max(0, (progressData.total || 0) - totalEmbedded),
              successCount: totalEmbedded,
              errorCount: progressData.errorCount || 0,
              newlyEmbedded: progressData.newlyEmbedded || 0,
              currentBatch: progressData.currentBatch || 0,
              totalBatches: progressData.totalBatches || 0,
              processingSpeed
            };
          }
        }

        // Fall back to embedding_progress table
        const result = await pgPool.query(`
          SELECT *
          FROM embedding_progress
          WHERE status IN ('processing', 'paused', 'completed')
            AND (status != 'completed' OR
                 (status = 'completed' AND started_at > NOW() - INTERVAL '5 minutes'))
          ORDER BY
            CASE
              WHEN status = 'processing' THEN 1
              WHEN status = 'paused' THEN 2
              WHEN status = 'completed' THEN 3
              ELSE 4
            END,
            started_at DESC
          LIMIT 1
        `);
        
        if (result.rows.length === 0) {
          return null;
        }
        
        const progress = result.rows[0];

        // Calculate actual embedded records from the database for better accuracy
        let actualEmbeddedCount = 0;
        try {
          const embeddedResult = await pgPool.query(`
            SELECT COUNT(DISTINCT(metadata->>'source_id')) as count
            FROM unified_embeddings
            WHERE source_table = $1
          `, [progress.document_type]);
          actualEmbeddedCount = parseInt(embeddedResult.rows[0]?.count || '0');
        } catch (error) {
          console.error('Error getting actual embedded count:', error);
        }

        // Get total records for the current table
        let totalRecords = 0;

        // First try to get table mapping from Redis
        const redisKey = `embedding:table_mapping:${progress.document_type}`;
        let actualTableName = null;

        try {
          actualTableName = await redis.get(redisKey);
        } catch (redisError) {
          console.error('Redis error:', redisError);
        }

        // If not in Redis, try to get from database configuration
        if (!actualTableName) {
          try {
            const configResult = await pgPool.query(`
              SELECT table_name FROM table_mappings
              WHERE display_name = $1
            `, [progress.document_type]);

            if (configResult.rows.length > 0) {
              actualTableName = configResult.rows[0].table_name;
              // Cache in Redis for future use
              await redis.set(redisKey, actualTableName, 'EX', 3600); // Cache for 1 hour
            }
          } catch (configError) {
            console.error('Error getting table mapping:', configError);
          }
        }

        // If still not found, use the document_type as table name
        actualTableName = actualTableName || progress.document_type;

        try {
          const totalResult = await pgPool.query(`SELECT COUNT(*) as count FROM ${actualTableName}`);
          totalRecords = parseInt(totalResult.rows[0]?.count || '0');
        } catch (error) {
          console.error('Error getting total records:', error);
          totalRecords = progress.total_chunks;
        }

        // Calculate percentage based on actual records
        const percentage = totalRecords > 0
          ? Math.round((actualEmbeddedCount / totalRecords) * 100)
          : 0;

        // Calculate estimated time remaining
        let estimatedTimeRemaining = 0;
        if (progress.status === 'processing' && actualEmbeddedCount > 0) {
          const elapsed = Date.now() - new Date(progress.started_at).getTime();
          const rate = actualEmbeddedCount / (elapsed / 1000); // records per second
          const remaining = totalRecords - actualEmbeddedCount;
          estimatedTimeRemaining = remaining > 0 ? Math.round(remaining / rate * 1000) : 0;
        }

        // Calculate newly embedded records (this session)
        const newlyEmbedded = actualEmbeddedCount - (progress.already_embedded || 0);

        // Calculate processing speed (records per minute)
        let processingSpeed = 0;
        if (progress.status === 'processing' && actualEmbeddedCount > 0) {
          const elapsedMinutes = (Date.now() - new Date(progress.started_at).getTime()) / (1000 * 60);
          processingSpeed = elapsedMinutes > 0 ? Math.round(actualEmbeddedCount / elapsedMinutes) : 0;
        }
        
        return {
          status: progress.status,
          current: actualEmbeddedCount,
          total: totalRecords,
          percentage,
          currentTable: progress.document_type,
          error: progress.error_message,
          tokensUsed: actualEmbeddedCount * 500, // Estimate based on actual records
          estimatedCost: (actualEmbeddedCount * 500) / 1000 * 0.0001,
          startTime: new Date(progress.started_at).getTime(),
          estimatedTimeRemaining,
          processedTables: progress.document_type ? [progress.document_type] : [],
          alreadyEmbedded: actualEmbeddedCount,
          pendingCount: totalRecords - actualEmbeddedCount,
          successCount: actualEmbeddedCount,
          errorCount: progress.error_message ? 1 : 0,
          newlyEmbedded: Math.max(0, newlyEmbedded),
          currentBatch: Math.ceil(actualEmbeddedCount / 50) || 1, // Assuming 50 records per batch
          totalBatches: Math.ceil(totalRecords / 50) || 1,
          processingSpeed
        };
      } catch (error) {
        console.error('Error getting actual progress:', error);
        return null;
      }
    };
    
    // Send initial progress
    const initialProgress = await getActualProgress();

    if (!initialProgress) {
      // No active process, send idle status
      const idleProgress = {
        status: 'idle',
        current: 0,
        total: 0,
        percentage: 0,
        currentTable: null,
        error: null,
        tokensUsed: 0,
        estimatedCost: 0,
        startTime: Date.now(),
        estimatedTimeRemaining: 0,
        processedTables: [],
        alreadyEmbedded: 0,
        pendingCount: 0,
        successCount: 0,
        errorCount: 0,
        newlyEmbedded: 0
      };

      res.write(`data: ${JSON.stringify(idleProgress)}\n\n`);
      res.end();
      return;
    }

    res.write(`data: ${JSON.stringify(initialProgress)}\n\n`);

    // Poll for actual progress updates
    const interval = setInterval(async () => {
      if (!isClientConnected) {
        clearInterval(interval);
        clearInterval(keepAliveInterval);
        return;
      }

      try {
        const progress = await getActualProgress();

        if (!progress) {
          // Process completed or failed
          clearInterval(interval);
          clearInterval(keepAliveInterval);
          const completedProgress = {
            ...initialProgress,
            status: 'completed',
            percentage: 100
          };
          res.write(`data: ${JSON.stringify(completedProgress)}\n\n`);
          res.end();
          return;
        }

        res.write(`data: ${JSON.stringify(progress)}\n\n`);

        // Stop when process is completed or failed
        if (progress.status === 'completed' || progress.status === 'failed') {
          clearInterval(interval);
          clearInterval(keepAliveInterval);
          res.write(`data: ${JSON.stringify(progress)}\n\n`);
          res.end();
        }
      } catch (error) {
        console.error('Error getting progress in SSE stream:', error);
        // Send error message but keep connection alive
        res.write(`data: ${JSON.stringify({
          status: 'error',
          error: 'Failed to fetch progress data',
          fallback: true
        })}\n\n`);
      }
    }, 1000);

    // Send keep-alive comment every 10 seconds to prevent timeout
    const keepAliveInterval = setInterval(() => {
      if (isClientConnected) {
        res.write(':keepalive\n\n');
      }
    }, 10000);
    
  } catch (error: any) {
    console.error('Error in progress stream:', error);
    res.status(500).json({
      error: 'Failed to stream progress',
      message: error.message
    });
  }
});

// Pause embedding process
router.post('/api/v2/embeddings/pause', async (req: Request, res: Response) => {
  try {
    console.log('Pausing embedding process...');
    
    // Update the status of the active embedding process to 'paused'
    const result = await pgPool.query(`
      UPDATE embedding_progress
      SET status = 'paused'
      WHERE status = 'processing'
      RETURNING *
    `);
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'No active embedding process found',
        message: 'There is no active embedding process to pause'
      });
    }
    
    const progress = result.rows[0];
    
    // Calculate percentage
    const percentage = progress.total_chunks > 0
      ? Math.round((progress.processed_chunks / progress.total_chunks) * 100)
      : 0;
    
    // Calculate estimated time remaining
    let estimatedTimeRemaining = 0;
    if (progress.processed_chunks > 0) {
      const elapsed = Date.now() - new Date(progress.started_at).getTime();
      const rate = progress.processed_chunks / (elapsed / 1000); // chunks per second
      const remaining = progress.total_chunks - progress.processed_chunks;
      estimatedTimeRemaining = remaining > 0 ? Math.round(remaining / rate * 1000) : 0;
    }
    
    // Calculate tokens and cost (assuming 500 tokens per record)
    const tokensUsed = progress.processed_chunks * 500;
    const estimatedCost = (tokensUsed / 1000) * 0.0001;
    
    // Calculate batch information (using default batch size of 50)
    const defaultBatchSize = 50;
    const currentBatch = Math.ceil(progress.processed_chunks / defaultBatchSize) || 1;
    const totalBatches = Math.ceil(progress.total_chunks / defaultBatchSize) || 1;
    
    // Calculate newly embedded records
    const newlyEmbedded = progress.processed_chunks - (progress.already_embedded || 0);
    
    // Calculate processing speed (records per minute)
    let processingSpeed = 0;
    if (progress.status === 'processing' && progress.processed_chunks > 0) {
      const elapsedMinutes = (Date.now() - new Date(progress.started_at).getTime()) / (1000 * 60);
      processingSpeed = elapsedMinutes > 0 ? Math.round(progress.processed_chunks / elapsedMinutes) : 0;
    }
    
    const progressData = {
      status: progress.status,
      current: progress.processed_chunks,
      total: progress.total_chunks,
      percentage,
      currentTable: progress.document_type,
      error: progress.error_message,
      tokensUsed,
      estimatedCost,
      startTime: new Date(progress.started_at).getTime(),
      estimatedTimeRemaining,
      processedTables: progress.document_type ? [progress.document_type] : [],
      alreadyEmbedded: progress.already_embedded || 0,
      pendingCount: progress.pending_count || (progress.total_chunks - progress.processed_chunks),
      successCount: progress.processed_chunks,
      errorCount: progress.error_message ? 1 : 0,
      newlyEmbedded: Math.max(0, newlyEmbedded),
      currentBatch,
      totalBatches,
      processingSpeed
    };
    
    res.json({
      success: true,
      message: 'Embedding process paused',
      progress: progressData
    });
  } catch (error: any) {
    console.error('Error pausing embedding process:', error);
    res.status(500).json({
      error: 'Failed to pause embedding process',
      message: error.message
    });
  }
});

// Pause embedding process (non-v2 endpoint for compatibility)
router.post('/api/embeddings/pause', async (req: Request, res: Response) => {
  try {
    console.log('Pausing embedding process...');

    // Update the status of the active embedding process to 'paused'
    const result = await pgPool.query(`
      UPDATE embedding_progress
      SET status = 'paused'
      WHERE status = 'processing'
      RETURNING *
    `);

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'No active embedding process found',
        message: 'There is no active embedding process to pause'
      });
    }

    const progress = result.rows[0];

    // Calculate percentage
    const percentage = progress.total_chunks > 0
      ? Math.round((progress.processed_chunks / progress.total_chunks) * 100)
      : 0;

    // Calculate tokens and cost (assuming 500 tokens per record)
    const tokensUsed = progress.processed_chunks * 500;
    const estimatedCost = (tokensUsed / 1000) * 0.0001;

    // Calculate batch information (using default batch size of 50)
    const defaultBatchSize = 50;
    const currentBatch = Math.ceil(progress.processed_chunks / defaultBatchSize) || 1;
    const totalBatches = Math.ceil(progress.total_chunks / defaultBatchSize) || 1;

    // Calculate newly embedded records
    const newlyEmbedded = progress.processed_chunks - (progress.already_embedded || 0);

    // Calculate processing speed (records per minute)
    let processingSpeed = 0;
    if (progress.status === 'processing' && progress.processed_chunks > 0) {
      const elapsedMinutes = (Date.now() - new Date(progress.started_at).getTime()) / (1000 * 60);
      processingSpeed = elapsedMinutes > 0 ? Math.round(progress.processed_chunks / elapsedMinutes) : 0;
    }

    const progressData = {
      status: progress.status,
      current: progress.processed_chunks,
      total: progress.total_chunks,
      percentage,
      currentTable: progress.document_type,
      error: progress.error_message,
      tokensUsed,
      estimatedCost,
      startTime: new Date(progress.started_at).getTime(),
      estimatedTimeRemaining: null,
      processedTables: progress.document_type ? [progress.document_type] : [],
      alreadyEmbedded: progress.already_embedded || 0,
      pendingCount: progress.pending_count || (progress.total_chunks - progress.processed_chunks),
      successCount: progress.processed_chunks,
      errorCount: progress.error_message ? 1 : 0,
      newlyEmbedded: Math.max(0, newlyEmbedded),
      currentBatch,
      totalBatches,
      processingSpeed
    };

    res.json({
      success: true,
      message: 'Embedding process paused',
      progress: progressData
    });
  } catch (error: any) {
    console.error('Error pausing embedding process:', error);
    res.status(500).json({
      error: 'Failed to pause embedding process',
      message: error.message
    });
  }
});

// Search embeddings
router.post('/api/v2/embeddings/search', async (req: Request, res: Response) => {
  try {
    const { query, tables, limit } = req.body;
    
    console.log('Searching embeddings for:', query);
    
    // Mock results for now
    const results = [
      {
        tableName: 'sorucevap',
        similarity: 0.95,
        content: 'KDV oranları hakkında bilgi...'
      },
      {
        tableName: 'danistaykararlari',
        similarity: 0.87,
        content: 'Danıştay kararı regarding KDV...'
      }
    ];
    
    res.json({
      success: true,
      results: results.slice(0, limit || 5)
    });
  } catch (error: any) {
    console.error('Error searching embeddings:', error);
    res.status(500).json({
      error: 'Failed to search embeddings',
      message: error.message
    });
  }
});

// Stop embedding process
router.post('/api/embeddings/stop', async (req: Request, res: Response) => {
  try {
    const { redis } = require('../server');

    console.log('=== STOP REQUESTED ===');

    // Update Redis status
    await redis.set('embedding:status', 'stopped');

    // Get current progress before stopping
    const currentProgress = await redis.get('embedding:progress');
    let progressData = null;
    if (currentProgress) {
      progressData = JSON.parse(currentProgress);
      progressData.status = 'stopped';
      await redis.set('embedding:progress', JSON.stringify(progressData));
    }

    // Also update database
    await pgPool.query(`
      UPDATE embedding_progress
      SET status = 'completed', completed_at = CURRENT_TIMESTAMP
      WHERE status IN ('processing', 'paused')
    `);

    console.log('✅ Embedding process stopped successfully');
    res.json({ success: true, message: 'Embedding process stopped' });
  } catch (error: any) {
    console.error('Error stopping embedding process:', error);
    res.status(500).json({ error: error.message });
  }
});

// Reset embedding process (clear all progress)
router.post('/api/embeddings/reset', async (req: Request, res: Response) => {
  try {
    const { redis } = require('../server');

    console.log('=== RESET REQUESTED ===');

    // Clear Redis
    await redis.set('embedding:status', 'idle');
    await redis.del('embedding:progress');

    // Clear database progress
    await pgPool.query(`
      TRUNCATE embedding_progress RESTART IDENTITY
    `);

    console.log('✅ Embedding process reset successfully');
    res.json({ success: true, message: 'Embedding process reset' });
  } catch (error: any) {
    console.error('Error resetting embedding process:', error);
    res.status(500).json({ error: error.message });
  }
});

// Clear embeddings
router.delete('/api/v2/embeddings/clear', async (req: Request, res: Response) => {
  try {
    const { tables } = req.body;
    console.log('Clearing embeddings for tables:', tables);

    // If no tables specified, clear all embeddings
    if (!tables || tables.length === 0) {
      await pgPool.query('TRUNCATE unified_embeddings RESTART IDENTITY');
      console.log('✅ All embeddings cleared');
    } else {
      // Clear embeddings for specific tables
      for (const table of tables) {
        await pgPool.query(`
          DELETE FROM unified_embeddings
          WHERE source_table = $1
        `, [table]);
        console.log(`✅ Embeddings cleared for table: ${table}`);
      }
    }

    res.json({
      success: true,
      message: tables ? `Embeddings cleared for ${tables.length} table(s)` : 'All embeddings cleared'
    });
  } catch (error: any) {
    console.error('Error clearing embeddings:', error);
    res.status(500).json({
      error: 'Failed to clear embeddings',
      message: error.message
    });
  }
});

router.post('/api/v2/embeddings/clear', async (req: Request, res: Response) => {
  try {
    const { tables } = req.body;
    console.log('Clearing embeddings for tables:', tables);

    // If no tables specified, clear all embeddings
    if (!tables || tables.length === 0) {
      await pgPool.query('TRUNCATE unified_embeddings RESTART IDENTITY');
      console.log('✅ All embeddings cleared');
    } else {
      // Clear embeddings for specific tables
      for (const table of tables) {
        await pgPool.query(`
          DELETE FROM unified_embeddings
          WHERE source_table = $1
        `, [table]);
        console.log(`✅ Embeddings cleared for table: ${table}`);
      }
    }

    res.json({
      success: true,
      message: tables ? `Embeddings cleared for ${tables.length} table(s)` : 'All embeddings cleared'
    });
  } catch (error: any) {
    console.error('Error clearing embeddings:', error);
    res.status(500).json({
      error: 'Failed to clear embeddings',
      message: error.message
    });
  }
});

// Complete embedding process (for testing)
router.post('/api/v2/embeddings/complete', async (req: Request, res: Response) => {
  try {
    console.log('Marking embedding process as completed...');

    // Update the most recent paused or processing process to completed
    const result = await pgPool.query(`
      UPDATE embedding_progress
      SET status = 'completed', completed_at = CURRENT_TIMESTAMP
      WHERE status IN ('processing', 'paused')
      ORDER BY started_at DESC
      LIMIT 1
      RETURNING *
    `);

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'No active embedding process found',
        message: 'There is no active embedding process to complete'
      });
    }

    const progress = result.rows[0];
    console.log(`✅ Process ${progress.id} marked as completed`);

    // Also update Redis if it exists
    try {
      const redisProgress = await redis.get('embedding:progress');
      if (redisProgress) {
        const progressData = JSON.parse(redisProgress);
        progressData.status = 'completed';
        progressData.percentage = 100;
        await redis.set('embedding:progress', JSON.stringify(progressData), 'EX', 30);
        console.log('✅ Redis progress updated with completed status');
      }
    } catch (redisError) {
      console.error('Error updating Redis:', redisError);
    }

    res.json({
      success: true,
      message: 'Embedding process marked as completed',
      process: progress
    });
  } catch (error: any) {
    console.error('Error completing embedding process:', error);
    res.status(500).json({
      error: 'Failed to complete embedding process',
      message: error.message
    });
  }
});

// Get embedding statistics by model
router.get('/stats-by-model', async (req: Request, res: Response) => {
  try {
    const { pgPool } = require('../server');

    const result = await pgPool.query(`
      SELECT
        model_used,
        COUNT(*) as total_embeddings,
        COALESCE(SUM(tokens_used), 0) as total_tokens,
        COALESCE(AVG(tokens_used), 0) as avg_tokens,
        MIN(created_at) as first_used,
        MAX(created_at) as last_used
      FROM unified_embeddings
      WHERE model_used IS NOT NULL
      GROUP BY model_used
      ORDER BY total_embeddings DESC
    `);

    // Also get overall statistics
    const totalResult = await pgPool.query(`
      SELECT
        COUNT(*) as total_embeddings,
        COALESCE(SUM(tokens_used), 0) as total_tokens,
        COUNT(DISTINCT source_table) as tables_processed,
        COUNT(DISTINCT source_name) as sources_processed
      FROM unified_embeddings
    `);

    res.json({
      byModel: result.rows,
      overall: totalResult.rows[0] || {
        total_embeddings: 0,
        total_tokens: 0,
        tables_processed: 0,
        sources_processed: 0
      }
    });
  } catch (error) {
    console.error('Error fetching model statistics:', error);
    res.status(500).json({ error: 'Failed to fetch model statistics' });
  }
});

export default router;