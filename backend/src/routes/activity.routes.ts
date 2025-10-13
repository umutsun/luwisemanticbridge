import { Router, Request, Response } from 'express';

const router = Router();

// Get activity logs
router.get('/', async (req: Request, res: Response) => {
  try {
    const { pgPool } = require('../server');
    
    // Get query parameters for pagination and filtering
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = (page - 1) * limit;
    const userId = req.query.user_id as string;
    const activityType = req.query.type as string;
    const startDate = req.query.start_date as string;
    const endDate = req.query.end_date as string;
    
    // Build WHERE clause dynamically
    let whereClause = '';
    const params: any[] = [];
    let paramIndex = 1;
    
    if (userId) {
      whereClause += `AND user_id = $${paramIndex} `;
      params.push(userId);
      paramIndex++;
    }
    
    if (activityType) {
      whereClause += `AND activity_type = $${paramIndex} `;
      params.push(activityType);
      paramIndex++;
    }
    
    if (startDate) {
      whereClause += `AND created_at >= $${paramIndex} `;
      params.push(startDate);
      paramIndex++;
    }
    
    if (endDate) {
      whereClause += `AND created_at <= $${paramIndex} `;
      params.push(endDate);
      paramIndex++;
    }
    
    // Get activities with pagination
    const query = `
      SELECT 
        id,
        user_id,
        activity_type,
        description,
        metadata,
        created_at,
        ip_address,
        user_agent
      FROM activities 
      WHERE 1=1 ${whereClause}
      ORDER BY created_at DESC 
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;
    
    params.push(limit, offset);
    
    const result = await pgPool.query(query, params);
    
    // Get total count for pagination
    const countQuery = `
      SELECT COUNT(*) as total 
      FROM activities 
      WHERE 1=1 ${whereClause}
    `;
    
    const countParams = params.slice(0, -2); // Remove limit and offset params
    const countResult = await pgPool.query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].total);
    
    res.json({
      activities: result.rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error: any) {
    console.error('Failed to get activities:', error);
    res.status(500).json({ error: 'Failed to get activities' });
  }
});

// Get activity by ID
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { pgPool } = require('../server');
    const { id } = req.params;
    
    const result = await pgPool.query(`
      SELECT 
        id,
        user_id,
        activity_type,
        description,
        metadata,
        created_at,
        ip_address,
        user_agent
      FROM activities 
      WHERE id = $1
    `, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Activity not found' });
    }
    
    res.json({ activity: result.rows[0] });
  } catch (error: any) {
    console.error('Failed to get activity:', error);
    res.status(500).json({ error: 'Failed to get activity' });
  }
});

// Create new activity log
router.post('/', async (req: Request, res: Response) => {
  try {
    const { pgPool } = require('../server');
    const { user_id, activity_type, description, metadata, ip_address, user_agent } = req.body;
    
    if (!activity_type || !description) {
      return res.status(400).json({ error: 'Activity type and description are required' });
    }
    
    const result = await pgPool.query(`
      INSERT INTO activities (user_id, activity_type, description, metadata, ip_address, user_agent)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, user_id, activity_type, description, metadata, created_at, ip_address, user_agent
    `, [user_id, activity_type, description, metadata, ip_address, user_agent]);
    
    res.status(201).json({
      success: true,
      activity: result.rows[0]
    });
  } catch (error: any) {
    console.error('Failed to create activity:', error);
    res.status(500).json({ error: 'Failed to create activity' });
  }
});

// Get user activities
router.get('/user/:userId', async (req: Request, res: Response) => {
  try {
    const { pgPool } = require('../server');
    const { userId } = req.params;
    
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = (page - 1) * limit;
    
    const result = await pgPool.query(`
      SELECT 
        id,
        user_id,
        activity_type,
        description,
        metadata,
        created_at,
        ip_address,
        user_agent
      FROM activities 
      WHERE user_id = $1
      ORDER BY created_at DESC 
      LIMIT $2 OFFSET $3
    `, [userId, limit, offset]);
    
    // Get total count
    const countResult = await pgPool.query(`
      SELECT COUNT(*) as total 
      FROM activities 
      WHERE user_id = $1
    `, [userId]);
    
    const total = parseInt(countResult.rows[0].total);
    
    res.json({
      activities: result.rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error: any) {
    console.error('Failed to get user activities:', error);
    res.status(500).json({ error: 'Failed to get user activities' });
  }
});

// Get activity statistics
router.get('/stats/overview', async (req: Request, res: Response) => {
  try {
    const { pgPool } = require('../server');
    
    // Get activity counts by type
    const typeStats = await pgPool.query(`
      SELECT 
        activity_type,
        COUNT(*) as count
      FROM activities 
      WHERE created_at >= NOW() - INTERVAL '30 days'
      GROUP BY activity_type
      ORDER BY count DESC
    `);
    
    // Get daily activity counts for the last 7 days
    const dailyStats = await pgPool.query(`
      SELECT 
        DATE(created_at) as date,
        COUNT(*) as count
      FROM activities 
      WHERE created_at >= NOW() - INTERVAL '7 days'
      GROUP BY DATE(created_at)
      ORDER BY date DESC
    `);
    
    // Get most active users
    const userStats = await pgPool.query(`
      SELECT 
        user_id,
        COUNT(*) as activity_count
      FROM activities 
      WHERE created_at >= NOW() - INTERVAL '30 days'
        AND user_id IS NOT NULL
      GROUP BY user_id
      ORDER BY activity_count DESC
      LIMIT 10
    `);
    
    res.json({
      typeStats: typeStats.rows,
      dailyStats: dailyStats.rows,
      userStats: userStats.rows
    });
  } catch (error: any) {
    console.error('Failed to get activity stats:', error);
    res.status(500).json({ error: 'Failed to get activity stats' });
  }
});

// Delete activity (admin only)
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { pgPool } = require('../server');
    const { id } = req.params;
    
    const result = await pgPool.query(`
      DELETE FROM activities 
      WHERE id = $1
      RETURNING id
    `, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Activity not found' });
    }
    
    res.json({
      success: true,
      message: 'Activity deleted successfully'
    });
  } catch (error: any) {
    console.error('Failed to delete activity:', error);
    res.status(500).json({ error: 'Failed to delete activity' });
  }
});

export default router;