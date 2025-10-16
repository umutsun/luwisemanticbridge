import { Router, Request, Response } from 'express';
import { lsembPool } from '../config/database.config';

const router = Router();

// Database health check
router.get('/health', async (req: Request, res: Response) => {
  try {
    const startTime = Date.now();
    const client = await lsembPool.connect();

    // Test basic connectivity
    await client.query('SELECT 1');

    // Get connection pool stats
    const poolStats = {
      totalCount: lsembPool.totalCount,
      idleCount: lsembPool.idleCount,
      waitingCount: lsembPool.waitingCount
    };

    client.release();

    const responseTime = Date.now() - startTime;

    res.json({
      status: 'healthy',
      database: 'PostgreSQL',
      connectionTime: `${responseTime}ms`,
      pool: poolStats,
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    res.status(500).json({
      status: 'unhealthy',
      database: 'PostgreSQL',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Get database tables (simplified version)
router.get('/tables', async (req: Request, res: Response) => {
  try {
    const client = await lsembPool.connect();

    const tablesQuery = `
      SELECT table_name, table_type
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `;
    const result = await client.query(tablesQuery);

    // Get row counts for each table
    const tables = [];
    for (const table of result.rows) {
      const countQuery = `SELECT COUNT(*) as count FROM "${table.table_name}"`;
      const countResult = await client.query(countQuery);
      tables.push({
        name: table.table_name,
        type: table.table_type,
        rowCount: parseInt(countResult.rows[0].count)
      });
    }

    client.release();

    res.json({
      success: true,
      database: 'PostgreSQL',
      totalTables: tables.length,
      tables
    });
  } catch (error: any) {
    console.error('Database tables error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get database schema information
router.get('/schema', async (req: Request, res: Response) => {
  try {
    const client = await lsembPool.connect();

    // Get all tables
    const tablesQuery = `
      SELECT table_name, table_type
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `;
    const tablesResult = await client.query(tablesQuery);

    // Get column info for each table
    const tables = [];
    for (const table of tablesResult.rows) {
      const columnsQuery = `
        SELECT
          column_name,
          data_type,
          is_nullable,
          column_default,
          character_maximum_length
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = $1
        ORDER BY ordinal_position
      `;
      const columnsResult = await client.query(columnsQuery, [table.table_name]);

      // Get row count
      const countQuery = `SELECT COUNT(*) as count FROM "${table.table_name}"`;
      const countResult = await client.query(countQuery);

      tables.push({
        name: table.table_name,
        type: table.table_type,
        columns: columnsResult.rows,
        rowCount: parseInt(countResult.rows[0].count)
      });
    }

    client.release();

    res.json({
      success: true,
      database: 'PostgreSQL',
      totalTables: tables.length,
      tables
    });
  } catch (error: any) {
    console.error('Database schema error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get table statistics
router.get('/stats', async (req: Request, res: Response) => {
  try {
    const client = await lsembPool.connect();

    // Get database size
    const sizeQuery = `
      SELECT pg_size_pretty(pg_database_size('lsemb')) as database_size
    `;
    const sizeResult = await client.query(sizeQuery);

    // Get total records
    const recordsQuery = `
      SELECT
        schemaname,
        relname as tablename,
        n_tup_ins as inserts,
        n_tup_upd as updates,
        n_tup_del as deletes,
        n_live_tup as live_tuples,
        n_dead_tup as dead_tuples
      FROM pg_stat_user_tables
      ORDER BY n_live_tup DESC
    `;
    const recordsResult = await client.query(recordsQuery);

    // Get index stats
    const indexQuery = `
      SELECT
        schemaname,
        relname as tablename,
        indexrelname as indexname,
        idx_scan as scans,
        idx_tup_read as tuples_read,
        idx_tup_fetch as tuples_fetched
      FROM pg_stat_user_indexes
      ORDER BY idx_scan DESC
      LIMIT 10
    `;
    const indexResult = await client.query(indexQuery);

    client.release();

    res.json({
      success: true,
      databaseSize: sizeResult.rows[0].database_size,
      tableStats: recordsResult.rows,
      topIndexes: indexResult.rows
    });
  } catch (error: any) {
    console.error('Database stats error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router;