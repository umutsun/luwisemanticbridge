import { Router, Request, Response } from 'express';
import { lsembPool } from '../config/database.config';
import { logger } from '../utils/logger';
import { cacheReliabilityService } from '../services/cache-reliability.service';

const router = Router();

/**
 * GET /api/v2/ai-services/cache/stats
 * Get REAL cache statistics from Redis cache service
 */
router.get('/cache/stats', async (req: Request, res: Response) => {
  try {
    // Get REAL metrics from Redis cache service
    const redisMetrics = cacheReliabilityService?.getCacheMetrics() || {
      totalOperations: 0,
      cacheHits: 0,
      cacheMisses: 0,
      successRate: 0,
      hitRate: 0,
      avgResponseTime: 0,
      memoryUsage: '0',
      keyCount: 0
    };

    // Also get PostgreSQL cache table stats for comparison
    const dbStats = await lsembPool.query(`
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
    `).catch(err => {
      logger.error('Error fetching DB cache stats:', err);
      return { rows: [{}] };
    });

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
    `).catch(err => {
      logger.error('Error fetching model breakdown:', err);
      return { rows: [] };
    });

    res.json({
      success: true,
      data: {
        // Real Redis cache metrics
        redis: {
          totalOperations: redisMetrics.totalOperations,
          cacheHits: redisMetrics.cacheHits,
          cacheMisses: redisMetrics.cacheMisses,
          hitRate: redisMetrics.hitRate || 0,
          successRate: redisMetrics.successRate || 0,
          avgResponseTime: redisMetrics.avgResponseTime || 0,
          memoryUsage: redisMetrics.memoryUsage || '0',
          keyCount: redisMetrics.keyCount || 0
        },
        // PostgreSQL cache table stats
        database: dbStats.rows[0] || {},
        modelBreakdown: modelBreakdown.rows || []
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
    // Get real Redis metrics
    const redisMetrics = cacheReliabilityService?.getCacheMetrics() || {};

    // Calculate real hit rate
    const totalOps = redisMetrics.totalOperations || 0;
    const hits = redisMetrics.cacheHits || 0;
    const misses = redisMetrics.cacheMisses || 0;
    const hitRate = totalOps > 0 ? (hits / totalOps) * 100 : 0;

    // Calculate cost savings based on cache hits
    const avgCostPerRequest = 0.002; // Average embedding cost
    const costSavings = hits * avgCostPerRequest;

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
    `).catch(err => {
      logger.error('Error fetching efficiency stats:', err);
      return { rows: [{}] };
    });

    // Get recent cache hits (if available)
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
    `).catch(err => {
      logger.error('Error fetching recent hits:', err);
      return { rows: [] };
    });

    res.json({
      success: true,
      data: {
        hitRate: hitRate.toFixed(2),
        missRate: (100 - hitRate).toFixed(2),
        totalOperations: totalOps,
        cacheHits: hits,
        cacheMisses: misses,
        costSavings: costSavings.toFixed(2),
        avgResponseTime: redisMetrics.avgResponseTime || 0,
        efficiency: efficiency.rows[0] || {},
        recent_hits: recentHits.rows || []
      }
    });
  } catch (error: any) {
    logger.error('Error getting cache efficiency:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/v2/ai-services/queue/stats
 * Get AI processing queue statistics
 */
router.get('/queue/stats', async (req: Request, res: Response) => {
  try {
    // Get queue stats from database
    const queueStats = await lsembPool.query(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'pending') as pending,
        COUNT(*) FILTER (WHERE status = 'processing') as processing,
        COUNT(*) FILTER (WHERE status = 'completed') as completed,
        COUNT(*) FILTER (WHERE status = 'failed') as failed,
        COUNT(*) as total,
        AVG(CASE
          WHEN completed_at IS NOT NULL AND started_at IS NOT NULL
          THEN EXTRACT(EPOCH FROM (completed_at - started_at)) * 1000
          ELSE NULL
        END) as avg_processing_time,
        MIN(created_at) as oldest_job,
        MAX(created_at) as newest_job
      FROM ai.embedding_queue
    `).catch(err => {
      // Table might not exist, return zeros
      logger.warn('Queue table not found, returning empty stats');
      return { rows: [{
        pending: 0,
        processing: 0,
        completed: 0,
        failed: 0,
        total: 0,
        avg_processing_time: 0,
        oldest_job: null,
        newest_job: null
      }] };
    });

    const stats = queueStats.rows[0] || {};

    // Calculate queue depth (pending + processing)
    const queueDepth = (parseInt(stats.pending) || 0) + (parseInt(stats.processing) || 0);

    // Calculate oldest job age in seconds
    const oldestJobAge = stats.oldest_job
      ? Math.floor((Date.now() - new Date(stats.oldest_job).getTime()) / 1000)
      : 0;

    res.json({
      success: true,
      data: {
        depth: queueDepth,
        pending: parseInt(stats.pending) || 0,
        processing: parseInt(stats.processing) || 0,
        completed: parseInt(stats.completed) || 0,
        failed: parseInt(stats.failed) || 0,
        total: parseInt(stats.total) || 0,
        avgProcessingTime: Math.round(stats.avg_processing_time) || 0,
        oldestJobAge: oldestJobAge
      }
    });
  } catch (error: any) {
    logger.error('Error getting queue stats:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/v2/ai-services/cost/summary
 * Get AI service cost summary
 */
router.get('/cost/summary', async (req: Request, res: Response) => {
  try {
    // Get real cache metrics for cost calculation
    const redisMetrics = cacheReliabilityService?.getCacheMetrics() || {};
    const cacheHits = redisMetrics.cacheHits || 0;
    const avgCostPerRequest = 0.002;
    const cacheSavings = cacheHits * avgCostPerRequest;

    // Get cost breakdown from database
    const costBreakdown = await lsembPool.query(`
      SELECT
        provider,
        model,
        SUM(tokens_used) as total_tokens,
        SUM(cost_usd) as total_cost,
        COUNT(*) as request_count,
        AVG(cost_usd) as avg_cost_per_request
      FROM ai.cost_tracking
      WHERE created_at > NOW() - INTERVAL '30 days'
      GROUP BY provider, model
      ORDER BY total_cost DESC
    `).catch(err => {
      logger.warn('Cost tracking table not found');
      return { rows: [] };
    });

    // Get total costs
    const totalCosts = await lsembPool.query(`
      SELECT
        SUM(cost_usd) FILTER (WHERE operation_type = 'embedding') as embedding_cost,
        SUM(cost_usd) FILTER (WHERE operation_type = 'llm') as llm_cost,
        SUM(cost_usd) as total_cost
      FROM ai.cost_tracking
      WHERE created_at > NOW() - INTERVAL '30 days'
    `).catch(err => {
      return { rows: [{ embedding_cost: 0, llm_cost: 0, total_cost: 0 }] };
    });

    const costs = totalCosts.rows[0] || {};

    res.json({
      success: true,
      data: {
        totalCost: parseFloat(costs.total_cost) || 0,
        embeddingCost: parseFloat(costs.embedding_cost) || 0,
        llmCost: parseFloat(costs.llm_cost) || 0,
        cacheSavings: cacheSavings,
        breakdown: costBreakdown.rows.map(row => ({
          provider: row.provider,
          model: row.model,
          cost: parseFloat(row.total_cost),
          requests: parseInt(row.request_count),
          avgCost: parseFloat(row.avg_cost_per_request)
        }))
      }
    });
  } catch (error: any) {
    logger.error('Error getting cost summary:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/v2/ai-services/monitoring/alerts
 * Get active monitoring alerts
 */
router.get('/monitoring/alerts', async (req: Request, res: Response) => {
  try {
    // Check cache health
    const redisMetrics = cacheReliabilityService?.getCacheMetrics() || {};
    const hitRate = redisMetrics.hitRate || 0;

    const alerts = [];

    // Alert if cache hit rate is too low
    if (hitRate < 10) {
      alerts.push({
        id: 'cache-hit-rate-low',
        type: 'warning',
        message: `Cache hit rate is ${hitRate.toFixed(1)}%`,
        timestamp: new Date().toISOString(),
        resolved: false
      });
    }

    // Get system alerts from database
    const dbAlerts = await lsembPool.query(`
      SELECT
        id,
        alert_type as type,
        message,
        created_at as timestamp,
        resolved
      FROM ai.system_alerts
      WHERE resolved = false
      ORDER BY created_at DESC
      LIMIT 10
    `).catch(err => {
      return { rows: [] };
    });

    alerts.push(...dbAlerts.rows);

    res.json({
      success: true,
      data: alerts
    });
  } catch (error: any) {
    logger.error('Error getting alerts:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/v2/ai-services/monitoring/snapshots
 * Get performance snapshots
 */
router.get('/monitoring/snapshots', async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 20;

    // Get real-time metrics
    const redisMetrics = cacheReliabilityService?.getCacheMetrics() || {};

    // Create current snapshot
    const currentSnapshot = {
      timestamp: new Date().toISOString(),
      cacheHitRate: redisMetrics.hitRate || 0,
      queueDepth: 0, // Would need to get from queue service
      avgResponseTime: redisMetrics.avgResponseTime || 0,
      memoryUsage: 0, // Would need to calculate
      cpuUsage: 0 // Would need system metrics
    };

    // Get historical snapshots from database
    const historicalSnapshots = await lsembPool.query(`
      SELECT
        created_at as timestamp,
        cache_hit_rate as "cacheHitRate",
        queue_depth as "queueDepth",
        avg_response_time as "avgResponseTime",
        memory_usage as "memoryUsage",
        cpu_usage as "cpuUsage"
      FROM ai.performance_snapshots
      ORDER BY created_at DESC
      LIMIT $1
    `, [limit - 1]).catch(err => {
      return { rows: [] };
    });

    const snapshots = [currentSnapshot, ...historicalSnapshots.rows];

    res.json({
      success: true,
      data: snapshots
    });
  } catch (error: any) {
    logger.error('Error getting snapshots:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;