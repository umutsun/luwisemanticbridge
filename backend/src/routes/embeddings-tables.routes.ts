import { Router } from 'express';
import { lsembPool } from '../config/database.config';
import { getDatabaseSettings, getCustomerPool } from '../config/database.config';

const router = Router();

// Get all tables with their embedding status
router.get('/all', async (req, res) => {
  try {
    const customerSettings = await getDatabaseSettings();
    if (!customerSettings) {
      return res.json({
        tables: [],
        message: 'No customer database configured'
      });
    }

    // Get connection to RAG_CHATBOT database
    // customerSettings contains {database: {...}} format, extract database config
    console.log('DEBUG: customerSettings:', JSON.stringify(customerSettings, null, 2));
    console.log('DEBUG: customerSettings.database:', JSON.stringify(customerSettings.database, null, 2));

    const ragChatbotPool = getCustomerPool(customerSettings.database);

    // Test connection to make sure we're connecting to the right database
    const testResult = await ragChatbotPool.query('SELECT current_database() as db_name');
    console.log('DEBUG: Connected to database:', testResult.rows[0].db_name);

    // Get the actual database name instead of hardcoding 'rag_chatbot'
    const actualDatabaseName = testResult.rows[0].db_name;

    // Get tables from RAG_CHATBOT database
    const ragTablesResult = await ragChatbotPool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      AND table_name NOT LIKE 'pg_%' AND table_name NOT LIKE 'sql_%'
      ORDER BY table_name
    `);

    const lsembClient = await lsembPool.connect();

    try {

      // Process tables from RAG_CHATBOT
      const tables = [];

      for (const row of ragTablesResult.rows) {
        const tableName = row.table_name;

        // Create a display name from table name
        let displayName = tableName
          .replace(/_/g, ' ')  // Replace underscores with spaces
          .replace(/\b\w/g, l => l.toUpperCase()); // Capitalize first letter of each word

        // Get record count from source database
        const recordCount = await ragChatbotPool.query(
          `SELECT COUNT(*) FROM public.${tableName}`
        );
        const totalRecords = parseInt(recordCount.rows[0].count);

        // Initialize embedded count to 0 (will be updated if embeddings exist)
        let embeddedCount = 0;

        // Check unified_embeddings table using exact table names from database
        try {
          // Get all unique source_table values and their counts
          const allSourcesResult = await lsembClient.query(`
            SELECT source_table, COUNT(DISTINCT source_id) as count
            FROM unified_embeddings
            GROUP BY source_table
          `);

          // Group embeddings by normalized table name (case-insensitive and Turkish character insensitive)
          const tableGroups = {};

          // First, group all similar table names together
          for (const source of allSourcesResult.rows) {
            const normalizedSource = source.source_table
              .toLowerCase()
              .replace(/ö/g, 'o')
              .replace(/ü/g, 'u')
              .replace(/ı/g, 'i')
              .replace(/ğ/g, 'g')
              .replace(/ş/g, 's')
              .replace(/ç/g, 'c');

            const normalizedTableName = tableName
              .toLowerCase()
              .replace(/ö/g, 'o')
              .replace(/ü/g, 'u')
              .replace(/ı/g, 'i')
              .replace(/ğ/g, 'g')
              .replace(/ş/g, 's')
              .replace(/ç/g, 'c');

            // If this source matches our table (after normalization), add to group
            if (normalizedSource === normalizedTableName ||
                normalizedSource === normalizedTableName.replace(/_/g, '') ||
                normalizedSource.replace(/_/g, '') === normalizedTableName) {
              if (!tableGroups[normalizedTableName]) {
                tableGroups[normalizedTableName] = {
                  total: 0,
                  sources: []
                };
              }
              tableGroups[normalizedTableName].total += parseInt(source.count) || 0;
              tableGroups[normalizedTableName].sources.push({
                name: source.source_table,
                count: parseInt(source.count) || 0
              });
            }
          }

          // Get the total for this table
          const normalizedTableName = tableName
            .toLowerCase()
            .replace(/ö/g, 'o')
            .replace(/ü/g, 'u')
            .replace(/ı/g, 'i')
            .replace(/ğ/g, 'g')
            .replace(/ş/g, 's')
            .replace(/ç/g, 'c');

          if (tableGroups[normalizedTableName]) {
            embeddedCount = tableGroups[normalizedTableName].total;
            console.log(`Found ${embeddedCount} total embeddings for table ${tableName} from:`,
              tableGroups[normalizedTableName].sources.map(s => `${s.name}(${s.count})`).join(', '));
          }
        } catch (error) {
          // Silently handle error - don't show "relation does not exist" error
          if (error.message.includes('does not exist')) {
            console.log(`unified_embeddings table does not exist, checking individual embedding tables`);
          } else {
            console.log(`Could not get unified embedding count for ${tableName}:`, error.message);
          }
        }

        // If no records in unified_embeddings, check for separate embeddings table
        if (embeddedCount === 0) {
          try {
            // Check for embeddings table with pattern: embeddings_<table_name>
            const embeddingTableName = `embeddings_${tableName.toLowerCase()}`;
            const embeddingTableCheck = await ragChatbotPool.query(`
              SELECT EXISTS (
                SELECT FROM information_schema.tables
                WHERE table_schema = 'public'
                AND table_name = $1
              );
            `, [embeddingTableName]);

            if (embeddingTableCheck.rows[0].exists) {
              // Count embeddings in the embeddings table
              const embeddingCountResult = await ragChatbotPool.query(`
                SELECT COUNT(*) as count
                FROM public.${embeddingTableName}
              `);
              embeddedCount = parseInt(embeddingCountResult.rows[0].count);
            }
          } catch (error) {
            console.log(`Could not get embedding count for ${tableName}:`, error.message);
            embeddedCount = 0;
          }
        }

        tables.push({
          name: tableName,
          displayName: displayName,
          database: actualDatabaseName,
          totalRecords,
          embeddedRecords: embeddedCount,
          embeddingSource: embeddedCount > 0 ? tableName : null
        });
      }

      res.json({
        success: true,
        tables
      });
    } finally {
      lsembClient.release();
    }
  } catch (error: any) {
    console.error('Failed to get tables:', error);
    res.status(500).json({
      error: 'Failed to get tables',
      details: error.message
    });
  }
});

// Get embedding sources from ASEMB database
router.get('/sources', async (req, res) => {
  try {
    const client = await lsembPool.connect();

    try {
      const result = await client.query(`
        SELECT
          source_table,
          COUNT(DISTINCT source_id) as unique_records,
          COUNT(*) as total_embeddings,
          MIN(created_at) as first_embedding,
          MAX(created_at) as last_embedding
        FROM unified_embeddings
        GROUP BY source_table
        ORDER BY source_table
      `);

      res.json({
        success: true,
        sources: result.rows
      });
    } finally {
      client.release();
    }
  } catch (error: any) {
    console.error('Failed to get embedding sources:', error);
    res.status(500).json({
      error: 'Failed to get embedding sources',
      details: error.message
    });
  }
});

// Get token usage statistics
router.get('/token-stats', async (req, res) => {
  try {
    const lsembClient = await lsembPool.connect();

    try {
      const tokenResult = await lsembClient.query(`
        SELECT
          SUM(tokens_used) as total_tokens_used,
          COUNT(*) as total_embedded_records,
          COUNT(DISTINCT source_table) as unique_tables
        FROM unified_embeddings
        WHERE tokens_used IS NOT NULL
      `);

      const stats = tokenResult.rows[0];

      // Calculate cost based on different provider pricing
      const totalTokens = parseInt(stats.total_tokens_used) || 0;

      // OpenAI text-embedding-3-large pricing: $0.00013 per 1K tokens
      const openAICost = (totalTokens / 1000) * 0.00013;

      // Google text-embedding-004 pricing: ~$0.0001 per 1K tokens
      const googleCost = (totalTokens / 1000) * 0.0001;

      // HuggingFace (free) - only infrastructure costs
      const huggingFaceCost = 0;

      res.json({
        success: true,
        totalTokensUsed: totalTokens,
        embeddedRecords: parseInt(stats.total_embedded_records) || 0,
        uniqueTables: parseInt(stats.unique_tables) || 0,
        estimatedCosts: {
          openai: openAICost,
          google: googleCost,
          huggingface: huggingFaceCost
        },
        // Default to Google pricing for display
        displayCost: googleCost
      });

    } finally {
      lsembClient.release();
    }
  } catch (error) {
    console.error('Error fetching token stats:', error);
    console.error('Error details:', {
      message: error.message,
      stack: error.stack,
      code: error.code,
      severity: error.severity,
      detail: error.detail,
      hint: error.hint,
      position: error.position
    });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch token statistics',
      details: error.message
    });
  }
});

// Get table preview with pagination
router.get('/:tableName/preview', async (req, res) => {
  try {
    const { tableName } = req.params;
    const limit = parseInt(req.query.limit as string) || 100;
    const offset = parseInt(req.query.offset as string) || 0;

    const customerSettings = await getDatabaseSettings();
    if (!customerSettings) {
      return res.json({
        records: [],
        count: 0,
        columns: [],
        message: 'No customer database configured'
      });
    }

    const ragChatbotPool = getCustomerPool(customerSettings.database);

    // Get column information
    const columnsResult = await ragChatbotPool.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1
      ORDER BY ordinal_position
    `, [tableName]);

    const columns = columnsResult.rows.map(row => row.column_name);

    // Get sample records
    const recordsResult = await ragChatbotPool.query(`
      SELECT * FROM public.${tableName}
      LIMIT $1 OFFSET $2
    `, [limit, offset]);

    // Get total record count
    const countResult = await ragChatbotPool.query(`
      SELECT COUNT(*) as count FROM public.${tableName}
    `, []);

    res.json({
      records: recordsResult.rows,
      count: parseInt(countResult.rows[0].count),
      columns,
      tableName
    });
  } catch (error: any) {
    console.error('Failed to get table preview:', error);
    res.status(500).json({
      error: 'Failed to get table preview',
      details: error.message
    });
  }
});

// Get table statistics
router.get('/:tableName/stats', async (req, res) => {
  try {
    const { tableName } = req.params;

    const customerSettings = await getDatabaseSettings();
    if (!customerSettings) {
      return res.json({
        error: 'No customer database configured'
      });
    }

    const ragChatbotPool = getCustomerPool(customerSettings.database);
    const lsembClient = await lsembPool.connect();

    try {
      // Get table size
      const sizeResult = await ragChatbotPool.query(`
        SELECT
          pg_size_pretty(pg_total_relation_size('${tableName}')) as table_size,
          pg_total_relation_size('${tableName}') as size_bytes
      `);

      // Get average text length for token estimation
      const textColumnsResult = await ragChatbotPool.query(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = $1
        AND data_type IN ('text', 'varchar', 'character varying')
      `, [tableName]);

      let avgTokens = 0;
      if (textColumnsResult.rows.length > 0) {
        const textColumn = textColumnsResult.rows[0].column_name;
        const avgLengthResult = await ragChatbotPool.query(`
          SELECT AVG(LENGTH(${textColumn})) as avg_length
          FROM public.${tableName}
          WHERE ${textColumn} IS NOT NULL
        `);
        const avgLength = parseFloat(avgLengthResult.rows[0].avg_length) || 0;
        avgTokens = Math.ceil(avgLength / 4); // Rough token estimation
      }

      // Get embedding count
      let embeddedCount = 0;
      try {
        const embeddingResult = await lsembClient.query(`
          SELECT COUNT(DISTINCT source_id) as count
          FROM unified_embeddings
          WHERE source_table ILIKE $1
        `, [`%${tableName}%`]);
        embeddedCount = parseInt(embeddingResult.rows[0].count) || 0;
      } catch (error) {
        // Table might not exist, ignore
      }

      res.json({
        tableName,
        size: sizeResult.rows[0].size_bytes,
        tableSize: sizeResult.rows[0].table_size,
        avgTokens,
        embeddedRecords: embeddedCount,
        textColumns: textColumnsResult.rows.length
      });
    } finally {
      lsembClient.release();
    }
  } catch (error: any) {
    console.error('Failed to get table stats:', error);
    res.status(500).json({
      error: 'Failed to get table statistics',
      details: error.message
    });
  }
});

export default router;