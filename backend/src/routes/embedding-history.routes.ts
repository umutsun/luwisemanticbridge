import { Router, Request, Response } from 'express';
import { Pool } from 'pg';

const router = Router();

// Use the main database connection
const pgPool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:Semsiye!22@91.99.229.96:5432/lsemb'
});

// Get all embedding history
router.get('/', async (req: Request, res: Response) => {
  try {
    const { page = 1, limit = 20, status, table } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    let whereClause = '';
    const params: any[] = [];

    if (status) {
      whereClause += 'WHERE status = $1';
      params.push(status);
    }

    if (table) {
      whereClause += whereClause ? ' AND source_table = $' + (params.length + 1) : 'WHERE source_table = $' + (params.length + 1);
      params.push(table);
    }

    // Get history records
    const result = await pgPool.query(`
      SELECT
        id,
        operation_id,
        source_table,
        source_type,
        records_processed,
        records_success,
        records_failed,
        embedding_model,
        batch_size,
        worker_count,
        status,
        started_at,
        completed_at,
        error_message,
        metadata,
        created_at
      FROM embedding_history
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `, [...params, Number(limit), offset]);

    // Get total count
    const countResult = await pgPool.query(`
      SELECT COUNT(*) as total
      FROM embedding_history
      ${whereClause}
    `, params);

    res.json({
      history: result.rows,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total: parseInt(countResult.rows[0].total),
        pages: Math.ceil(parseInt(countResult.rows[0].total) / Number(limit))
      }
    });
  } catch (error) {
    console.error('Error fetching embedding history:', error);
    res.status(500).json({ error: 'Failed to fetch embedding history' });
  }
});

// Get embedding statistics
router.get('/stats', async (req: Request, res: Response) => {
  try {
    // Get overall stats
    const overallStats = await pgPool.query(`
      SELECT
        COUNT(*) as total_operations,
        SUM(records_processed) as total_records,
        SUM(records_success) as total_success,
        SUM(records_failed) as total_failed,
        AVG(CASE WHEN completed_at IS NOT NULL AND started_at IS NOT NULL
          THEN EXTRACT(EPOCH FROM (completed_at - started_at))
          ELSE NULL END) as avg_duration_seconds
      FROM embedding_history
    `);

    // Get stats by status
    const statusStats = await pgPool.query(`
      SELECT
        status,
        COUNT(*) as count,
        SUM(records_processed) as records_processed
      FROM embedding_history
      GROUP BY status
      ORDER BY count DESC
    `);

    // Get recent operations (last 7 days)
    const recentStats = await pgPool.query(`
      SELECT
        DATE(created_at) as date,
        COUNT(*) as operations,
        SUM(records_processed) as records_processed,
        SUM(records_success) as records_success,
        SUM(records_failed) as records_failed
      FROM embedding_history
      WHERE created_at >= NOW() - INTERVAL '7 days'
      GROUP BY DATE(created_at)
      ORDER BY date DESC
    `);

    res.json({
      overall: overallStats.rows[0],
      byStatus: statusStats.rows,
      recent: recentStats.rows
    });
  } catch (error) {
    console.error('Error fetching embedding stats:', error);
    res.status(500).json({ error: 'Failed to fetch embedding stats' });
  }
});

// Get single operation details
router.get('/:operationId', async (req: Request, res: Response) => {
  try {
    const { operationId } = req.params;

    const result = await pgPool.query(`
      SELECT
        id,
        operation_id,
        source_table,
        source_type,
        records_processed,
        records_success,
        records_failed,
        embedding_model,
        batch_size,
        worker_count,
        status,
        started_at,
        completed_at,
        error_message,
        metadata,
        created_at
      FROM embedding_history
      WHERE operation_id = $1
    `, [operationId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Operation not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching operation details:', error);
    res.status(500).json({ error: 'Failed to fetch operation details' });
  }
});

// Delete old history (older than 30 days)
router.delete('/cleanup', async (req: Request, res: Response) => {
  try {
    const { days = 30 } = req.query;

    const result = await pgPool.query(`
      DELETE FROM embedding_history
      WHERE created_at < NOW() - INTERVAL '${days} days'
      RETURNING *
    `);

    res.json({
      message: `Deleted ${result.rowCount} old records`,
      deletedCount: result.rowCount
    });
  } catch (error) {
    console.error('Error cleaning up history:', error);
    res.status(500).json({ error: 'Failed to cleanup history' });
  }
});

export default router;