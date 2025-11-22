import { Router, Request, Response } from 'express';
import { lsembPool } from '../config/database.config';
import { logger } from '../utils/logger';

const router = Router();

/**
 * GET /api/v2/ai-services/cache/stats
 * Get embedding cache statistics
 */
router.get('/cache/stats', async (req: Request, res: Response) => {
  try {
    const stats = await lsembPool.query(`
      SELECT
        COUNT(*) as total_cached,
        COUNT(DISTINCT model) as unique_models,
        SUM(tokens_used) as total_tokens,
        SUM(cost_usd) as total_cost,
        AVG(tokens_used) as avg_tokens,
        MIN(created_at) as oldest_cache,
        MAX(created_at) as newest_cache,
        (SELECT COUNT(*) FROM ai.embedding_cache WHERE created_at > NOW() - INTERVAL '24 hours') as cached_24h,
        (SELECT COUNT(*) FROM ai.embedding_cache WHERE created_at > NOW() - INTERVAL '7 days') as cached_7d
      FROM ai.embedding_cache
    `);

    const modelBreakdown = await lsembPool.query(`
      SELECT
        model,
        COUNT(*) as count,
        SUM(tokens_used) as tokens,
        SUM(cost_usd) as cost,
        MIN(created_at) as first_used,
        MAX(created_at) as last_used
      FROM ai.embedding_cache
      GROUP BY model
      ORDER BY cost DESC
    `);

    res.json({
      success: true,
      data: {
        overall: stats.rows[0],
        by_model: modelBreakdown.rows
      }
    });
  } catch (error: any) {
    logger.error('Error getting cache stats:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/v2/ai-services/cache/efficiency
 * Get cache hit rate and efficiency metrics
 */
router.get('/cache/efficiency', async (req: Request, res: Response) => {
  try {
    // Compare cache vs total embeddings
    const efficiency = await lsembPool.query(`
      SELECT
        (SELECT COUNT(*) FROM ai.embedding_cache) as cached_count,
        (SELECT COUNT(*) FROM unified_embeddings) as total_embeddings,
        (SELECT SUM(tokens_used) FROM ai.embedding_cache) as cached_tokens,
        (SELECT SUM(tokens_used) FROM unified_embeddings) as total_tokens,
        ROUND(
          (SELECT COUNT(*)::numeric FROM ai.embedding_cache) /
          NULLIF((SELECT COUNT(*)::numeric FROM unified_embeddings), 0) * 100,
          2
        ) as cache_ratio_percent
    `);

    // Get recent cache hits
    const recentHits = await lsembPool.query(`
      SELECT
        content_hash,
        model,
        tokens_used,
        cost_usd,
        created_at
      FROM ai.embedding_cache
      ORDER BY created_at DESC
      LIMIT 10
    `);

    res.json({
      success: true,
      data: {
        efficiency: efficiency.rows[0],
        recent_hits: recentHits.rows
      }
    });
  } catch (error: any) {
    logger.error('Error getting cache efficiency:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/v2/ai-services/cache/clear
 * Clear old cache entries
 */
router.post('/cache/clear', async (req: Request, res: Response) => {
  try {
    const { older_than_days = 30, model } = req.body;

    let query = `
      DELETE FROM ai.embedding_cache
      WHERE created_at < NOW() - INTERVAL '${older_than_days} days'
    `;

    if (model) {
      query += ` AND model = '${model}'`;
    }

    query += ` RETURNING id`;

    const result = await lsembPool.query(query);

    logger.info(`Cleared ${result.rowCount} cache entries older than ${older_than_days} days`);

    res.json({
      success: true,
      data: {
        deleted_count: result.rowCount,
        message: `Cleared ${result.rowCount} cache entries`
      }
    });
  } catch (error: any) {
    logger.error('Error clearing cache:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/v2/ai-services/queue/stats
 * Get embedding queue statistics
 */
router.get('/queue/stats', async (req: Request, res: Response) => {
  try {
    const stats = await lsembPool.query(`
      SELECT
        COUNT(*) as total_queued,
        COUNT(*) FILTER (WHERE status = 'pending') as pending,
        COUNT(*) FILTER (WHERE status = 'processing') as processing,
        COUNT(*) FILTER (WHERE status = 'completed') as completed,
        COUNT(*) FILTER (WHERE status = 'failed') as failed,
        MIN(created_at) FILTER (WHERE status = 'pending') as oldest_pending,
        AVG(EXTRACT(EPOCH FROM (completed_at - created_at))) FILTER (WHERE status = 'completed') as avg_processing_time_seconds
      FROM ai.embedding_queue
    `);

    res.json({
      success: true,
      data: stats.rows[0]
    });
  } catch (error: any) {
    logger.error('Error getting queue stats:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/v2/ai-services/cost/summary
 * Get cost summary and breakdown
 */
router.get('/cost/summary', async (req: Request, res: Response) => {
  try {
    const { days = 30 } = req.query;

    // Overall cost from cache
    const cacheCost = await lsembPool.query(`
      SELECT
        SUM(cost_usd) as total_cost,
        SUM(tokens_used) as total_tokens,
        COUNT(*) as total_requests
      FROM ai.embedding_cache
      WHERE created_at > NOW() - INTERVAL '${days} days'
    `);

    // Daily breakdown
    const dailyBreakdown = await lsembPool.query(`
      SELECT
        DATE(created_at) as date,
        COUNT(*) as requests,
        SUM(tokens_used) as tokens,
        SUM(cost_usd) as cost
      FROM ai.embedding_cache
      WHERE created_at > NOW() - INTERVAL '${days} days'
      GROUP BY DATE(created_at)
      ORDER BY date DESC
    `);

    // Model breakdown
    const modelBreakdown = await lsembPool.query(`
      SELECT
        model,
        COUNT(*) as requests,
        SUM(tokens_used) as tokens,
        SUM(cost_usd) as cost,
        AVG(cost_usd) as avg_cost_per_request
      FROM ai.embedding_cache
      WHERE created_at > NOW() - INTERVAL '${days} days'
      GROUP BY model
      ORDER BY cost DESC
    `);

    // Estimate total cost including unified_embeddings
    const totalEstimate = await lsembPool.query(`
      SELECT
        SUM(tokens_used) as total_tokens,
        COUNT(*) as total_embeddings,
        -- Estimate cost based on text-embedding-3-large pricing ($0.13/1M tokens)
        ROUND((SUM(tokens_used)::numeric / 1000000) * 0.13, 4) as estimated_total_cost
      FROM unified_embeddings
    `);

    res.json({
      success: true,
      data: {
        cache: cacheCost.rows[0],
        daily: dailyBreakdown.rows,
        by_model: modelBreakdown.rows,
        total_estimate: totalEstimate.rows[0],
        period_days: parseInt(days as string)
      }
    });
  } catch (error: any) {
    logger.error('Error getting cost summary:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/v2/ai-services/vectorizers
 * List configured vectorizers
 */
router.get('/vectorizers', async (req: Request, res: Response) => {
  try {
    const vectorizers = await lsembPool.query(`
      SELECT
        id,
        name,
        source_schema,
        source_table,
        config,
        disabled,
        queue_schema,
        queue_table
      FROM ai.vectorizer
      ORDER BY id
    `);

    res.json({
      success: true,
      data: vectorizers.rows
    });
  } catch (error: any) {
    logger.error('Error getting vectorizers:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/v2/ai-services/health
 * Check AI services health
 */
router.get('/health', async (req: Request, res: Response) => {
  try {
    // Check if ai schema exists
    const schemaCheck = await lsembPool.query(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.schemata WHERE schema_name = 'ai'
      ) as schema_exists
    `);

    // Check trigger
    const triggerCheck = await lsembPool.query(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.triggers
        WHERE trigger_name = 'auto_queue_embedding'
          AND event_object_table = 'unified_embeddings'
      ) as trigger_exists
    `);

    // Check extensions
    const extensionsCheck = await lsembPool.query(`
      SELECT
        extname,
        extversion
      FROM pg_extension
      WHERE extname IN ('vector', 'vectorscale')
    `);

    // Get queue function status
    const functionCheck = await lsembPool.query(`
      SELECT EXISTS (
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'ai'
          AND p.proname = 'queue_embedding'
      ) as function_exists
    `);

    res.json({
      success: true,
      data: {
        schema: schemaCheck.rows[0].schema_exists,
        trigger: triggerCheck.rows[0].trigger_exists,
        queue_function: functionCheck.rows[0].function_exists,
        extensions: extensionsCheck.rows,
        status: schemaCheck.rows[0].schema_exists && triggerCheck.rows[0].trigger_exists
          ? 'healthy'
          : 'degraded'
      }
    });
  } catch (error: any) {
    logger.error('Error checking AI services health:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
