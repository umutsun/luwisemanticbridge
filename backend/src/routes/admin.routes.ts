import { Router, Request, Response } from 'express';
import { Pool } from 'pg';
import { authenticateToken, requireRole } from '../middleware/auth.middleware';
import bcrypt from 'bcryptjs';

const router = Router();

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:Semsiye!22@91.99.229.96:5432/asemb'
});

// Get all users (Admin only)
router.get('/users', authenticateToken, requireRole(['admin']), async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const search = req.query.search as string || '';
    const role = req.query.role as string || '';
    const status = req.query.status as string || '';

    const offset = (page - 1) * limit;

    let whereClause = 'WHERE 1=1';
    const params: any[] = [];
    let paramIndex = 1;

    if (search) {
      whereClause += ` AND (username ILIKE $${paramIndex} OR email ILIKE $${paramIndex} OR first_name ILIKE $${paramIndex} OR last_name ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    if (role) {
      whereClause += ` AND role = $${paramIndex}`;
      params.push(role);
      paramIndex++;
    }

    if (status === 'active') {
      whereClause += ` AND is_active = true`;
    } else if (status === 'inactive') {
      whereClause += ` AND is_active = false`;
    }

    // Get users
    const usersQuery = `
      SELECT id, username, email, first_name, last_name, role, is_active, email_verified, created_at, updated_at
      FROM users
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;
    params.push(limit, offset);

    const usersResult = await pool.query(usersQuery, params);

    // Get total count
    const countQuery = `
      SELECT COUNT(*) as total
      FROM users
      ${whereClause}
    `;
    const countResult = await pool.query(countQuery, params.slice(0, -2));

    const total = parseInt(countResult.rows[0].total);
    const totalPages = Math.ceil(total / limit);

    res.json({
      users: usersResult.rows,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1
      }
    });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// Get user by ID (Admin only)
router.get('/users/:id', authenticateToken, requireRole(['admin']), async (req: Request, res: Response) => {
  try {
    const userId = parseInt(req.params.id);

    const result = await pool.query(
      `SELECT id, username, email, first_name, last_name, role, is_active, email_verified, created_at, updated_at
       FROM users WHERE id = $1`,
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Get user sessions
    const sessionsResult = await pool.query(
      `SELECT id, created_at, last_accessed, expires_at, ip_address, user_agent
       FROM user_sessions
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 10`,
      [userId]
    );

    res.json({
      user: result.rows[0],
      sessions: sessionsResult.rows
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

// Update user (Admin only)
router.put('/users/:id', authenticateToken, requireRole(['admin']), async (req: Request, res: Response) => {
  try {
    const userId = parseInt(req.params.id);
    const { username, email, first_name, last_name, role, is_active } = req.body;

    // Check if user exists
    const existingUser = await pool.query('SELECT id FROM users WHERE id = $1', [userId]);
    if (existingUser.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check if email/username is taken by another user
    const duplicateCheck = await pool.query(
      'SELECT id FROM users WHERE (email = $1 OR username = $2) AND id != $3',
      [email, username, userId]
    );

    if (duplicateCheck.rows.length > 0) {
      return res.status(400).json({ error: 'Email or username already exists' });
    }

    // Update user
    const result = await pool.query(
      `UPDATE users
       SET username = $1, email = $2, first_name = $3, last_name = $4, role = $5, is_active = $6, updated_at = NOW()
       WHERE id = $7
       RETURNING id, username, email, first_name, last_name, role, is_active, email_verified, created_at, updated_at`,
      [username, email, first_name, last_name, role, is_active, userId]
    );

    res.json({
      message: 'User updated successfully',
      user: result.rows[0]
    });
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

// Create user (Admin only)
router.post('/users', authenticateToken, requireRole(['admin']), async (req: Request, res: Response) => {
  try {
    const { username, email, password, first_name, last_name, role = 'user' } = req.body;

    // Validation
    if (!username || !email || !password) {
      return res.status(400).json({ error: 'Username, email, and password are required' });
    }

    // Check if user already exists
    const existingUser = await pool.query(
      'SELECT id FROM users WHERE email = $1 OR username = $2',
      [email, username]
    );

    if (existingUser.rows.length > 0) {
      return res.status(400).json({ error: 'User with this email or username already exists' });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 12);

    // Create user
    const result = await pool.query(
      `INSERT INTO users (username, email, password_hash, first_name, last_name, role)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, username, email, first_name, last_name, role, is_active, email_verified, created_at, updated_at`,
      [username, email, passwordHash, first_name, last_name, role]
    );

    res.status(201).json({
      message: 'User created successfully',
      user: result.rows[0]
    });
  } catch (error) {
    console.error('Create user error:', error);
    res.status(500).json({ error: 'Failed to create user' });
  }
});

// Delete user (Admin only)
router.delete('/users/:id', authenticateToken, requireRole(['admin']), async (req: Request, res: Response) => {
  try {
    const userId = parseInt(req.params.id);

    // Prevent self-deletion
    if (userId === req.user?.userId) {
      return res.status(400).json({ error: 'Cannot delete your own account' });
    }

    // Delete user's sessions first
    await pool.query('DELETE FROM user_sessions WHERE user_id = $1', [userId]);

    // Delete user
    const result = await pool.query('DELETE FROM users WHERE id = $1', [userId]);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

// Reset user password (Admin only)
router.post('/users/:id/reset-password', authenticateToken, requireRole(['admin']), async (req: Request, res: Response) => {
  try {
    const userId = parseInt(req.params.id);
    const { newPassword } = req.body;

    if (!newPassword || newPassword.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters long' });
    }

    // Hash new password
    const passwordHash = await bcrypt.hash(newPassword, 12);

    // Update password
    await pool.query(
      'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2',
      [passwordHash, userId]
    );

    // Delete all user sessions (force logout)
    await pool.query('DELETE FROM user_sessions WHERE user_id = $1', [userId]);

    res.json({ message: 'Password reset successfully' });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

// Toggle user active status (Admin only)
router.patch('/users/:id/toggle-status', authenticateToken, requireRole(['admin']), async (req: Request, res: Response) => {
  try {
    const userId = parseInt(req.params.id);

    // Prevent self-deactivation
    if (userId === req.user?.userId) {
      return res.status(400).json({ error: 'Cannot deactivate your own account' });
    }

    const result = await pool.query(
      `UPDATE users
       SET is_active = NOT is_active, updated_at = NOW()
       WHERE id = $1
       RETURNING id, username, email, is_active`,
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    // If deactivating, delete user sessions
    if (!result.rows[0].is_active) {
      await pool.query('DELETE FROM user_sessions WHERE user_id = $1', [userId]);
    }

    res.json({
      message: `User ${result.rows[0].is_active ? 'activated' : 'deactivated'} successfully`,
      user: result.rows[0]
    });
  } catch (error) {
    console.error('Toggle status error:', error);
    res.status(500).json({ error: 'Failed to toggle user status' });
  }
});

// Get system stats (Admin only)
router.get('/stats', authenticateToken, requireRole(['admin']), async (req: Request, res: Response) => {
  try {
    // Get user counts
    const userCounts = await pool.query(`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE is_active = true) as active,
        COUNT(*) FILTER (WHERE role = 'admin') as admins,
        COUNT(*) FILTER (WHERE role = 'user') as users,
        COUNT(*) FILTER (WHERE email_verified = true) as verified
      FROM users
    `);

    // Get recent registrations
    const recentUsers = await pool.query(`
      SELECT username, email, created_at
      FROM users
      ORDER BY created_at DESC
      LIMIT 5
    `);

    // Get active sessions
    const activeSessions = await pool.query(`
      SELECT COUNT(DISTINCT user_id) as unique_users, COUNT(*) as total_sessions
      FROM user_sessions
      WHERE expires_at > NOW()
    `);

    res.json({
      counts: userCounts.rows[0],
      recentUsers: recentUsers.rows,
      activeSessions: activeSessions.rows[0]
    });
  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

export default router;