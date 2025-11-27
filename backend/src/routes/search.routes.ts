import { Router, Request, Response } from 'express';
import { semanticSearch } from '../services/semantic-search.service';

const router = Router();

/**
 * Semantic search endpoint
 */
router.post('/api/v2/search/semantic', async (req: Request, res: Response) => {
  try {
    const { query, limit = 10 } = req.body;
    
    if (!query) {
      return res.status(400).json({ error: 'Query is required' });
    }

    const results = await semanticSearch.semanticSearch(query, limit);
    
    res.json({
      query,
      results,
      count: results.length,
      type: 'semantic'
    });
  } catch (error) {
    console.error('Semantic search error:', error);
    res.status(500).json({ error: 'Search failed' });
  }
});

/**
 * Hybrid search endpoint (keyword + semantic)
 */
router.post('/api/v2/search/hybrid', async (req: Request, res: Response) => {
  try {
    const { query, limit = 10 } = req.body;
    
    if (!query) {
      return res.status(400).json({ error: 'Query is required' });
    }

    const results = await semanticSearch.hybridSearch(query, limit);
    
    res.json({
      query,
      results,
      count: results.length,
      type: 'hybrid'
    });
  } catch (error) {
    console.error('Hybrid search error:', error);
    res.status(500).json({ error: 'Search failed' });
  }
});

/**
 * Find similar documents
 */
router.get('/api/v2/search/similar/:documentId', async (req: Request, res: Response) => {
  try {
    const { documentId } = req.params;
    const { limit = 5 } = req.query;
    
    const results = await semanticSearch.findSimilarDocuments(
      documentId, 
      parseInt(limit as string)
    );
    
    res.json({
      documentId,
      similar: results,
      count: results.length
    });
  } catch (error) {
    console.error('Similar documents error:', error);
    res.status(500).json({ error: 'Search failed' });
  }
});

/**
 * Search by source table
 */
router.post('/api/v2/search/source', async (req: Request, res: Response) => {
  try {
    const { sourceTable, query, limit = 10 } = req.body;
    
    if (!sourceTable || !query) {
      return res.status(400).json({ error: 'Source table and query are required' });
    }

    const results = await semanticSearch.searchBySource(sourceTable, query, limit);
    
    res.json({
      sourceTable,
      query,
      results,
      count: results.length
    });
  } catch (error) {
    console.error('Search by source error:', error);
    res.status(500).json({ error: 'Search failed' });
  }
});

/**
 * Get search statistics
 */
router.get('/api/v2/search/stats', async (req: Request, res: Response) => {
  try {
    const stats = await semanticSearch.getStats();
    
    res.json(stats);
  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({ error: 'Failed to get stats' });
  }
});

/**
 * Get sample documents for testing
 */
router.get('/api/v2/search/samples', async (req: Request, res: Response) => {
  try {
    const { limit = 5 } = req.query;
    const samples = await semanticSearch.getSampleDocuments(parseInt(limit as string));

    res.json({
      samples,
      count: samples.length
    });
  } catch (error) {
    console.error('Get samples error:', error);
    res.status(500).json({ error: 'Failed to get samples' });
  }
});

/**
 * Get all source tables with embedding counts (DYNAMIC - no hardcoded table names)
 * Checks multiple metadata fields: 'table', 'source_table', 'tableName'
 */
router.get('/api/v2/search/source-tables', async (req: Request, res: Response) => {
  try {
    // Use the semantic search service which has the correct pool and query
    const recordTypes = await semanticSearch.getUnifiedRecordTypes();

    // Get embedding counts for each type from the working query in semantic search
    const { lsembPool } = require('../config/database.config');

    // Simple count query that matches the working loadUnifiedRecordTypes query
    const countResult = await lsembPool.query(`
      SELECT
        COALESCE(
          metadata->>'table',
          metadata->>'_sourceTable',
          metadata->>'source_table',
          source_table
        ) as source_table,
        COUNT(*) as embedding_count
      FROM unified_embeddings
      WHERE (
        metadata->>'table' IS NOT NULL OR
        metadata->>'_sourceTable' IS NOT NULL OR
        metadata->>'source_table' IS NOT NULL OR
        source_table IS NOT NULL
      )
      GROUP BY COALESCE(
        metadata->>'table',
        metadata->>'_sourceTable',
        metadata->>'source_table',
        source_table
      )
    `);

    // Build source tables with counts
    const countMap = new Map(countResult.rows.map(row => [row.source_table, parseInt(row.embedding_count, 10)]));

    res.json({
      sourceTables: recordTypes.map(name => ({
        name,
        embeddingCount: countMap.get(name) || 0
      }))
    });
  } catch (error) {
    console.error('Get source tables error:', error);
    res.status(500).json({ error: 'Failed to get source tables' });
  }
});

/**
 * Get source table weights for search prioritization
 */
router.get('/api/v2/search/source-table-weights', async (req: Request, res: Response) => {
  try {
    const { lsembPool } = require('../config/database.config');

    // Fetch weights from settings table
    const result = await lsembPool.query(
      `SELECT value FROM settings WHERE key = $1`,
      ['search.sourceTableWeights']
    );

    let weights = {};
    if (result.rows.length > 0) {
      try {
        weights = JSON.parse(result.rows[0].value);
      } catch (parseError) {
        console.error('Failed to parse source table weights:', parseError);
      }
    }

    res.json({ weights });
  } catch (error) {
    console.error('Get source table weights error:', error);
    res.status(500).json({ error: 'Failed to get source table weights' });
  }
});

/**
 * Update source table weights for search prioritization
 */
router.put('/api/v2/search/source-table-weights', async (req: Request, res: Response) => {
  try {
    const { weights } = req.body;

    if (!weights || typeof weights !== 'object') {
      return res.status(400).json({ error: 'Invalid weights object' });
    }

    // Validate all weights are numbers between 0 and 1
    for (const [table, weight] of Object.entries(weights)) {
      if (typeof weight !== 'number' || weight < 0 || weight > 1) {
        return res.status(400).json({
          error: `Invalid weight for table "${table}": ${weight}. Must be a number between 0 and 1.`
        });
      }
    }

    const { lsembPool } = require('../config/database.config');

    // Save weights to settings table
    await lsembPool.query(
      `INSERT INTO settings (key, value, category)
       VALUES ($1, $2, $3)
       ON CONFLICT (key)
       DO UPDATE SET value = $2, updated_at = CURRENT_TIMESTAMP`,
      ['search.sourceTableWeights', JSON.stringify(weights), 'search']
    );

    res.json({
      success: true,
      message: 'Source table weights updated successfully',
      weights
    });
  } catch (error) {
    console.error('Update source table weights error:', error);
    res.status(500).json({ error: 'Failed to update source table weights' });
  }
});

export default router;
