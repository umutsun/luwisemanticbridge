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
    const ragChatbotPool = getCustomerPool(customerSettings);

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
      // Get all unique source_table names from unified_embeddings
      const embeddingSourcesResult = await asembClient.query(`
        SELECT DISTINCT source_table, COUNT(DISTINCT source_id) as embedded_count
        FROM unified_embeddings
        GROUP BY source_table
        ORDER BY source_table
      `);

      // Create a map of source_table to embedded count
      const embeddingMap = new Map();
      embeddingSourcesResult.rows.forEach(row => {
        embeddingMap.set(row.source_table, parseInt(row.embedded_count));
      });

      // Process tables from RAG_CHATBOT
      const tables = [];

      for (const row of ragTablesResult.rows) {
        const tableName = row.table_name;
        const displayName = tableName
          .split('_')
          .map(word => word.charAt(0).toUpperCase() + word.slice(1))
          .join(' ')
          .replace(/Danistay/g, 'Danıştay')
          .replace(/Ozel/g, 'Özel')
          .replace(/Sorucevap/g, 'Soru-Cevap')
          .replace(/Mevzuat/g, 'Mevzuat')
          .replace(/Dokuman/g, 'Doküman');

        // Get record count from RAG_CHATBOT
        const recordCount = await ragChatbotPool.query(
          `SELECT COUNT(*) FROM public.${tableName}`
        );
        const totalRecords = parseInt(recordCount.rows[0].count);

        // Check if this table has embeddings in ASEMB
        // Check both the original table name and the display name
        const embeddedCount = embeddingMap.get(tableName) || embeddingMap.get(displayName) || 0;

        tables.push({
          name: tableName,
          displayName: displayName,
          database: 'rag_chatbot',
          totalRecords,
          embeddedRecords: embeddedCount,
          embeddingSource: embeddingMap.has(tableName) ? tableName :
                           embeddingMap.has(displayName) ? displayName : null
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

export default router;