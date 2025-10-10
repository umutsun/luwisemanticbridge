import { Router } from 'express';
import { asembPool } from '../config/database.config';
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

    const asembClient = await asembPool.connect();

    try {

      // Process tables from RAG_CHATBOT
      const tables = [];

      for (const row of ragTablesResult.rows) {
        const tableName = row.table_name;
        // Get display name from unified_embeddings table dynamically
      let displayName = tableName; // Default to table name

      // Try to get display name from unified_embeddings source_table with proper encoding
      const sourceTableResult = await asembClient.query({
        text: `
          SELECT DISTINCT source_table
          FROM unified_embeddings
          WHERE LOWER(source_table) = LOWER($1) OR LOWER(source_table) = LOWER($2)
          LIMIT 1
        `,
        values: [tableName, tableName.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())]
      });

      if (sourceTableResult.rows.length > 0) {
        displayName = sourceTableResult.rows[0].source_table;
      }

        // Get record count from RAG_CHATBOT
        const recordCount = await ragChatbotPool.query(
          `SELECT COUNT(*) FROM public.${tableName}`
        );
        const totalRecords = parseInt(recordCount.rows[0].count);

        // Get embedded record count from unified_embeddings table in ASEMb
        let embeddedCount = 0;
        try {
          // Create a dynamic mapping based on actual data from unified_embeddings
          // First, get all unique source_table names from unified_embeddings
          const allSourceTablesResult = await asembClient.query(`
            SELECT DISTINCT source_table, COUNT(DISTINCT source_id) as record_count
            FROM unified_embeddings
            GROUP BY source_table
            ORDER BY source_table
          `);

          // Create dynamic mapping by comparing table names with source_table names
          const possibleSourceNames = [];

          // Add exact table name match
          possibleSourceNames.push(tableName);

          // Add formatted display name match
          possibleSourceNames.push(displayName);

          // Add matches from actual unified_embeddings data
          for (const sourceRow of allSourceTablesResult.rows) {
            const sourceTable = sourceRow.source_table;

            // Check if source_table name matches our table name (case insensitive)
            if (sourceTable.toLowerCase() === tableName.toLowerCase()) {
              possibleSourceNames.push(sourceTable);
            }

            // Check if source_table name contains our table name (case insensitive)
            if (sourceTable.toLowerCase().includes(tableName.toLowerCase()) ||
                tableName.toLowerCase().includes(sourceTable.toLowerCase())) {
              possibleSourceNames.push(sourceTable);
            }

            // Check for partial matches with common variations
            const tableVariations = [
              tableName.replace(/_/g, '').toLowerCase(),
              tableName.replace(/geler$/, 'ler').toLowerCase(), // Handle pluralization
              tableName.replace(/lar$/, '').toLowerCase(), // Handle pluralization
              tableName.replace(/kararlari/, 'karar').toLowerCase(),
              tableName.replace(/cevap/, 'soru-cevap').toLowerCase()
            ];

            const sourceVariations = [
              sourceTable.replace(/[^a-zA-Z0-9]/g, '').toLowerCase(),
              sourceTable.replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ş/g, 's')
                .replace(/ı/g, 'i').replace(/ö/g, 'o').replace(/ç/g, 'c').toLowerCase()
            ];

            for (const tableVar of tableVariations) {
              for (const sourceVar of sourceVariations) {
                if (sourceVar.includes(tableVar) || tableVar.includes(sourceVar)) {
                  if (!possibleSourceNames.includes(sourceTable)) {
                    possibleSourceNames.push(sourceTable);
                  }
                }
              }
            }
          }

          // Remove duplicates while preserving order
          const uniqueSourceNames = [...new Set(possibleSourceNames)];

          // Query unified_embeddings table for all possible source names
          if (uniqueSourceNames.length > 0) {
            const placeholders = uniqueSourceNames.map((_, index) => `$${index + 1}`).join(', ');
            const embeddingCountResult = await asembClient.query(`
              SELECT COUNT(DISTINCT source_id) as count
              FROM unified_embeddings
              WHERE source_table IN (${placeholders})
            `, uniqueSourceNames);

            embeddedCount = parseInt(embeddingCountResult.rows[0]?.count || '0');
          }

        } catch (error) {
          console.log(`Could not get embedding count for ${tableName}:`, error.message);
          embeddedCount = 0;
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
      asembClient.release();
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
    const client = await asembPool.connect();

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
    const asembClient = await asembPool.connect();

    try {
      const tokenResult = await asembClient.query(`
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
      asembClient.release();
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

export default router;