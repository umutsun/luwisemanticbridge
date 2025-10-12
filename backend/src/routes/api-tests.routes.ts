import { Router, Request, Response } from 'express';
import { pool } from '../config/database';

const router = Router();

// Save API test result
router.post('/save', async (req: Request, res: Response) => {
  try {
    const { provider, model, apiKey, testResult, tokens } = req.body;

    const client = await pool.connect();

    // Create table if not exists
    const createTableQuery = `
      CREATE TABLE IF NOT EXISTS api_test_results (
        id SERIAL PRIMARY KEY,
        provider VARCHAR(50) NOT NULL,
        model VARCHAR(255) NOT NULL,
        api_key_hash VARCHAR(255),
        success BOOLEAN NOT NULL,
        message TEXT,
        input_tokens INTEGER DEFAULT 0,
        output_tokens INTEGER DEFAULT 0,
        total_tokens INTEGER DEFAULT 0,
        test_duration_ms INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `;
    await client.query(createTableQuery);

    // Insert test result
    const insertQuery = `
      INSERT INTO api_test_results (
        provider, model, api_key_hash, success, message,
        input_tokens, output_tokens, total_tokens, test_duration_ms
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING id, created_at
    `;

    const values = [
      provider,
      model,
      apiKey ? Buffer.from(apiKey).toString('base64').substring(0, 50) : null,
      testResult.success,
      testResult.message,
      tokens?.input || 0,
      tokens?.output || 0,
      tokens?.total || tokens?.input + tokens?.output || 0,
      req.body.testDuration || null
    ];

    const result = await client.query(insertQuery, values);
    client.release();

    res.json({
      success: true,
      message: 'API test result saved successfully',
      testId: result.rows[0].id,
      timestamp: result.rows[0].created_at
    });
  } catch (error: any) {
    console.error('API test save error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get API test history
router.get('/history', async (req: Request, res: Response) => {
  try {
    const { provider, limit = 50, offset = 0 } = req.query;

    const client = await pool.connect();

    let whereClause = '';
    const params: any[] = [];

    if (provider) {
      whereClause = 'WHERE provider = $1';
      params.push(provider);
      params.push(limit, offset);
    } else {
      params.push(limit, offset);
    }

    const query = `
      SELECT
        id, provider, model, success, message,
        input_tokens, output_tokens, total_tokens,
        test_duration_ms, created_at
      FROM api_test_results
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `;

    const result = await client.query(query, params);

    // Get success stats
    const statsQuery = `
      SELECT
        provider,
        COUNT(*) as total_tests,
        COUNT(CASE WHEN success = true THEN 1 END) as successful_tests,
        AVG(total_tokens) as avg_tokens
      FROM api_test_results
      GROUP BY provider
      ORDER BY provider
    `;

    const statsResult = await client.query(statsQuery);
    client.release();

    res.json({
      success: true,
      tests: result.rows,
      stats: statsResult.rows,
      pagination: {
        limit: parseInt(limit as string),
        offset: parseInt(offset as string),
        hasMore: result.rows.length === parseInt(limit as string)
      }
    });
  } catch (error: any) {
    console.error('API test history error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get token usage statistics
router.get('/token-stats', async (req: Request, res: Response) => {
  try {
    const { provider, period = '7d' } = req.query;

    const client = await pool.connect();

    let whereClause = '';
    let dateFilter = '';

    switch (period) {
      case '1d':
        dateFilter = "AND created_at >= CURRENT_DATE - INTERVAL '1 day'";
        break;
      case '7d':
        dateFilter = "AND created_at >= CURRENT_DATE - INTERVAL '7 days'";
        break;
      case '30d':
        dateFilter = "AND created_at >= CURRENT_DATE - INTERVAL '30 days'";
        break;
    }

    if (provider) {
      whereClause = `WHERE provider = '${provider}' ${dateFilter}`;
    } else {
      whereClause = `WHERE 1=1 ${dateFilter}`;
    }

    const query = `
      SELECT
        DATE(created_at) as date,
        provider,
        model,
        COUNT(*) as test_count,
        SUM(total_tokens) as total_tokens,
        AVG(total_tokens) as avg_tokens,
        MAX(input_tokens) as max_input_tokens,
        MAX(output_tokens) as max_output_tokens
      FROM api_test_results
      ${whereClause}
      GROUP BY DATE(created_at), provider, model
      ORDER BY date DESC, provider, model
    `;

    const result = await client.query(query);

    // Aggregate totals
    const totalQuery = `
      SELECT
        provider,
        COUNT(*) as total_tests,
        SUM(total_tokens) as total_tokens,
        AVG(total_tokens) as avg_tokens
      FROM api_test_results
      ${whereClause}
      GROUP BY provider
    `;

    const totalResult = await client.query(totalQuery);
    client.release();

    res.json({
      success: true,
      dailyStats: result.rows,
      totals: totalResult.rows,
      period
    });
  } catch (error: any) {
    console.error('Token stats error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router;