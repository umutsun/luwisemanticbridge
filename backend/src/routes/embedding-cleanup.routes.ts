import { Router, Request, Response } from 'express';
import { Redis } from 'ioredis';
import pool from '../config/database';
import dotenv from 'dotenv';

dotenv.config();

const router = Router();

// Redis connection for cleanup operations
const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  db: parseInt(process.env.REDIS_DB || '2'),
  maxRetriesPerRequest: 3
});

/**
 * Check embedding system consistency
 * This should be called before starting any embedding operation
 */
router.get('/check-consistency', async (req: Request, res: Response) => {
  try {
    console.log('[Embedding Cleanup] Checking system consistency...');

    const issues = [];
    const recommendations = [];

    // Check 1: Redis progress vs actual embeddings
    const redisProgress = await redis.get('embedding:progress');
    let hasRedisProgress = false;

    if (redisProgress) {
      try {
        const progress = JSON.parse(redisProgress);
        hasRedisProgress = progress.status === 'processing' || progress.status === 'completed';

        if (hasRedisProgress) {
          issues.push({
            type: 'WARNING',
            message: 'Redis contains active progress data',
            details: progress
          });
          recommendations.push('Consider running cleanup before starting new embedding process');
        }
      } catch (e) {
        // Invalid JSON in redis
      }
    }

    // Check 2: Database progress table (if it exists)
    let progressResult = { rows: [] };
    try {
      progressResult = await pool.query(`
        SELECT
          table_name,
          status,
          processed,
          total,
          created_at,
          updated_at,
          NOW() - updated_at as age
        FROM embedding_progress
        WHERE status IN ('processing', 'completed')
        ORDER BY updated_at DESC
      `);
    } catch (error) {
      // Table doesn't exist, that's okay - silently skip
    }

    const staleThreshold = new Date(Date.now() - 60 * 60 * 1000); // 1 hour
    let hasStaleProgress = false;

    for (const record of progressResult.rows as any[]) {
      if (record.status === 'processing' && new Date(record.updated_at) < staleThreshold) {
        hasStaleProgress = true;
        issues.push({
          type: 'CRITICAL',
          message: `Stale progress found for table: ${record.table_name}`,
          details: {
            table: record.table_name,
            status: record.status,
            age: record.age
          }
        });
      }
    }

    if (hasStaleProgress) {
      recommendations.push('Run cleanup to remove stale progress records');
    }

    // Check 3: Actual embedding count
    const embeddingResult = await pool.query(`
      SELECT COUNT(*) as total FROM unified_embeddings
    `);

    const actualEmbeddings = parseInt(embeddingResult.rows[0]?.total || '0');

    // Check 4: Progress vs actual count mismatch
    for (const record of progressResult.rows as any[]) {
      if (record.status === 'completed') {
        const tableResult = await pool.query(`
          SELECT COUNT(*) as count
          FROM unified_embeddings
          WHERE source_table = $1
        `, [record.table_name]);

        const actualCount = parseInt(tableResult.rows[0]?.count || '0');
        const reportedCount = parseInt(record.processed || '0');

        if (Math.abs(actualCount - reportedCount) > 10) {
          issues.push({
            type: 'WARNING',
            message: `Count mismatch for ${record.table_name}`,
            details: {
              table: record.table_name,
              reported: reportedCount,
              actual: actualCount
            }
          });
        }
      }
    }

    // Determine if cleanup is needed
    const needsCleanup = issues.some(i => i.type === 'CRITICAL') ||
                         (hasRedisProgress && actualEmbeddings === 0) ||
                         hasStaleProgress;

    const response = {
      status: needsCleanup ? 'needs_cleanup' : 'healthy',
      issues,
      recommendations,
      metrics: {
        hasRedisProgress,
        hasStaleProgress,
        actualEmbeddings,
        progressRecords: progressResult.rows.length
      },
      timestamp: new Date().toISOString()
    };

    console.log('[Embedding Cleanup] Consistency check completed:', response.status);
    res.json(response);

  } catch (error: any) {
    console.error('[Embedding Cleanup] Consistency check error:', error);
    res.status(500).json({
      error: 'Failed to check consistency',
      details: error.message
    });
  }
});

/**
 * Run embedding system cleanup
 */
router.post('/cleanup', async (req: Request, res: Response) => {
  try {
    console.log('[Embedding Cleanup] Starting cleanup process...');

    const results = {
      redisKeys: 0,
      dbRecords: 0,
      staleResets: 0,
      timestamp: new Date().toISOString()
    };

    // Step 1: Clean Redis
    const redisKeys = [
      'embedding:progress',
      'embedding:status',
      'embedding:stats'
    ];

    for (const key of redisKeys) {
      const deleted = await redis.del(key);
      if (deleted > 0) {
        results.redisKeys += deleted;
        console.log(`[Embedding Cleanup] Deleted Redis key: ${key}`);
      }
    }

    // Clean pattern-based keys
    const patterns = ['embedding:current:*', 'embedding:batch:*'];
    for (const pattern of patterns) {
      const keys = await redis.keys(pattern);
      if (keys.length > 0) {
        const deleted = await redis.del(...keys);
        results.redisKeys += deleted;
        console.log(`[Embedding Cleanup] Deleted ${deleted} keys for pattern: ${pattern}`);
      }
    }

    // Step 2: Clean database progress table (if it exists)
    let deleteResult: { rowCount: number | null } = { rowCount: 0 };
    try {
      deleteResult = await pool.query(`
        DELETE FROM embedding_progress
        WHERE status IN ('completed', 'failed', 'cancelled')
        OR created_at < NOW() - INTERVAL '24 hours'
        RETURNING id
      `);
    } catch (error) {
      // Table doesn't exist, that's okay - silently skip
    }

    results.dbRecords = deleteResult.rowCount || 0;
    console.log(`[Embedding Cleanup] Deleted ${results.dbRecords} old progress records`);

    // Step 3: Reset stale progress records (if table exists)
    let resetResult: { rowCount: number | null } = { rowCount: 0 };
    try {
      resetResult = await pool.query(`
        UPDATE embedding_progress
        SET status = 'pending',
            processed = 0,
            updated_at = NOW()
        WHERE status = 'processing'
        AND updated_at < NOW() - INTERVAL '1 hour'
        RETURNING id
      `);
    } catch (error) {
      // Table doesn't exist, that's okay - silently skip
    }

    results.staleResets = resetResult.rowCount || 0;
    console.log(`[Embedding Cleanup] Reset ${results.staleResets} stale progress records`);

    // Step 4: Log cleanup to history (if table exists)
    try {
      await pool.query(`
        INSERT INTO embedding_history (event_type, details, created_at)
        VALUES ('cleanup', $1, NOW())
      `, [JSON.stringify(results)]);
    } catch (error) {
      // Table doesn't exist, that's okay - silently skip
    }

    console.log('[Embedding Cleanup] Cleanup completed successfully');

    res.json({
      success: true,
      message: 'Embedding system cleanup completed',
      results
    });

  } catch (error: any) {
    console.error('[Embedding Cleanup] Cleanup error:', error);
    res.status(500).json({
      error: 'Failed to run cleanup',
      details: error.message
    });
  }
});

/**
 * Get embedding system health status
 */
router.get('/health', async (req: Request, res: Response) => {
  try {
    // Check Redis connection
    const redisHealthy = await redis.ping().then(() => true).catch(() => false);

    // Check database connection
    const dbResult = await pool.query('SELECT NOW()').then(() => true).catch(() => false);

    // Get system metrics
    const [embeddingCount, progressCount, recentActivity] = await Promise.all([
      pool.query('SELECT COUNT(*) FROM unified_embeddings').then(r => parseInt(r.rows[0].count)),
      pool.query('SELECT COUNT(*) FROM embedding_progress WHERE status = \'processing\'').then(r => parseInt(r.rows[0].count)),
      pool.query(`
        SELECT COUNT(*)
        FROM embedding_history
        WHERE created_at > NOW() - INTERVAL '1 hour'
      `).then(r => parseInt(r.rows[0].count))
    ]);

    res.json({
      status: (redisHealthy && dbResult) ? 'healthy' : 'degraded',
      components: {
        redis: { healthy: redisHealthy },
        database: { healthy: dbResult }
      },
      metrics: {
        totalEmbeddings: embeddingCount,
        activeProcesses: progressCount,
        recentActivity: recentActivity
      },
      timestamp: new Date().toISOString()
    });

  } catch (error: any) {
    res.status(500).json({
      error: 'Failed to get health status',
      details: error.message
    });
  }
});

export default router;