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

        // Create a display name from table name
        let displayName = tableName
          .replace(/_/g, ' ')  // Replace underscores with spaces
          .replace(/\b\w/g, l => l.toUpperCase()); // Capitalize first letter of each word

        // Get record count from source database
        const recordCount = await ragChatbotPool.query(
          `SELECT COUNT(*) FROM public.${tableName}`
        );
        const totalRecords = parseInt(recordCount.rows[0].count);

        // Initialize embedded count to 0 (will be updated if embeddings table exists)
        let embeddedCount = 0;

        // Check if there's an embeddings table for this source table
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