import { Router, Request, Response } from 'express';
import { Pool } from 'pg';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { authenticateToken, AuthenticatedRequest, requireAdmin } from '../middleware/auth.middleware';

const router = Router();

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:Semsiye!22@91.99.229.96:5432/lsemb'
});

const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-this-in-production';

// Ensure uploads directory exists
const uploadsDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Multer configuration for profile image uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'profile-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter: function (req, file, cb) {
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('Only image files are allowed'));
    }
    cb(null, true);
  }
});

// Middleware to verify JWT and admin role
const verifyAdmin = (req: Request, res: Response, next: Function) => {
  const token = req.headers.authorization?.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    
    if (decoded.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    (req as any).user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }
};

// Get all users (admin only)
router.get('/', verifyAdmin, async (req: Request, res: Response) => {
  try {
    const result = await pool.query(`
      SELECT 
        u.id,
        u.email,
        u.name,
        u.role,
        u.status,
        u.last_login,
        u.created_at,
        p.company_name,
        p.phone,
        p.bio,
        s.plan_id,
        sp.name as plan_name,
        s.end_date as subscription_end_date
      FROM users u
      LEFT JOIN user_profiles p ON u.id = p.user_id
      LEFT JOIN user_subscriptions s ON u.id = s.user_id AND s.status = 'active'
      LEFT JOIN subscription_plans sp ON s.plan_id = sp.id
      ORDER BY u.created_at DESC
    `);
    
    const users = result.rows.map(row => ({
      id: row.id,
      name: row.name,
      email: row.email,
      role: row.role,
      status: row.status,
      last_login: row.last_login,
      created_at: row.created_at,
      profile: row.company_name ? {
        company_name: row.company_name,
        phone: row.phone,
        bio: row.bio
      } : null,
      subscription: row.plan_id ? {
        plan_name: row.plan_name,
        end_date: row.subscription_end_date
      } : null
    }));
    
    res.json({ users });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// Get single user (admin only)
router.get('/:id', verifyAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(`
      SELECT 
        u.*,
        p.*,
        s.plan_id,
        sp.name as plan_name,
        sp.features as plan_features,
        s.end_date as subscription_end_date
      FROM users u
      LEFT JOIN user_profiles p ON u.id = p.user_id
      LEFT JOIN user_subscriptions s ON u.id = s.user_id AND s.status = 'active'
      LEFT JOIN subscription_plans sp ON s.plan_id = sp.id
      WHERE u.id = $1
    `, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const user = result.rows[0];
    delete user.password; // Never send password
    
    res.json({ user });
  } catch (error) {
    console.error('Error fetching user:', error);
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

// Create new user (admin only)
router.post('/', verifyAdmin, async (req: Request, res: Response) => {
  try {
    const { email, password, name, role = 'user', company } = req.body;
    
    // Check if user exists
    const existing = await pool.query(
      'SELECT id FROM users WHERE email = $1',
      [email]
    );
    
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'User already exists' });
    }
    
    // Hash password
    const hashedPassword = await bcrypt.hash(password || 'defaultPassword123', 10);
    
    // Create user
    const newUser = await pool.query(
      `INSERT INTO users (email, password, name, role, status, email_verified) 
       VALUES ($1, $2, $3, $4, $5, $6) 
       RETURNING id, email, name, role`,
      [email, hashedPassword, name, role, 'active', false]
    );
    
    const userId = newUser.rows[0].id;
    
    // Create profile
    await pool.query(
      `INSERT INTO user_profiles (user_id, company_name) 
       VALUES ($1, $2)`,
      [userId, company || null]
    );
    
    // Assign free plan
    const freePlan = await pool.query(
      'SELECT id FROM subscription_plans WHERE name = $1',
      ['Free']
    );
    
    if (freePlan.rows.length > 0) {
      await pool.query(
        `INSERT INTO user_subscriptions (user_id, plan_id, start_date, end_date, status) 
         VALUES ($1, $2, NOW(), NOW() + INTERVAL '30 days', 'active')`,
        [userId, freePlan.rows[0].id]
      );
    }
    
    res.json({ 
      message: 'User created successfully',
      user: newUser.rows[0]
    });
  } catch (error) {
    console.error('Error creating user:', error);
    res.status(500).json({ error: 'Failed to create user' });
  }
});

// Update user status (admin only)
router.put('/:id/status', verifyAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    
    if (!['active', 'suspended', 'inactive'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    
    await pool.query(
      'UPDATE users SET status = $1 WHERE id = $2',
      [status, id]
    );
    
    res.json({ message: 'Status updated successfully' });
  } catch (error) {
    console.error('Error updating status:', error);
    res.status(500).json({ error: 'Failed to update status' });
  }
});

// Update user role (admin only)
router.put('/:id/role', verifyAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { role } = req.body;
    
    if (!['admin', 'user', 'premium'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }
    
    await pool.query(
      'UPDATE users SET role = $1 WHERE id = $2',
      [role, id]
    );
    
    res.json({ message: 'Role updated successfully' });
  } catch (error) {
    console.error('Error updating role:', error);
    res.status(500).json({ error: 'Failed to update role' });
  }
});

// Delete user (admin only)
router.delete('/:id', verifyAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    // Don't allow deleting the requesting admin
    if ((req as any).user.userId === id) {
      return res.status(400).json({ error: 'Cannot delete your own account' });
    }
    
    // Delete user sessions first
    await pool.query('DELETE FROM user_sessions WHERE user_id = $1', [id]);
    
    // Delete user activity logs
    await pool.query('DELETE FROM user_activity_logs WHERE user_id = $1', [id]);
    
    // Delete user subscriptions
    await pool.query('DELETE FROM user_subscriptions WHERE user_id = $1', [id]);
    
    // Delete user profile
    await pool.query('DELETE FROM user_profiles WHERE user_id = $1', [id]);
    
    // Finally delete the user
    await pool.query('DELETE FROM users WHERE id = $1', [id]);
    
    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

// Update user profile (authenticated user)
router.put('/profile', async (req: Request, res: Response) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];

    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const decoded = jwt.verify(token, JWT_SECRET) as any;
    const { name, email } = req.body;

    if (!name && !email) {
      return res.status(400).json({ error: 'Name or email is required' });
    }

    let query = 'UPDATE users SET updated_at = NOW()';
    const values: any[] = [];
    let paramIndex = 1;

    if (name) {
      query += `, name = $${paramIndex++}`;
      values.push(name);
    }

    if (email) {
      // Check if email is already taken by another user
      const emailCheck = await pool.query('SELECT id FROM users WHERE email = $1 AND id != $2', [email, decoded.userId]);
      if (emailCheck.rows.length > 0) {
        return res.status(400).json({ error: 'Email already exists' });
      }
      query += `, email = $${paramIndex++}`;
      values.push(email);
    }

    query += ' WHERE id = $' + paramIndex++ + ' RETURNING id, name, email, role, status, email_verified, created_at, updated_at, profile_image';
    values.push(decoded.userId);

    const result = await pool.query(query, values);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ user: result.rows[0] });
  } catch (error) {
    console.error('Error updating profile:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// Change password (authenticated user)
router.post('/change-password', async (req: Request, res: Response) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];

    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const decoded = jwt.verify(token, JWT_SECRET) as any;
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current password and new password are required' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters long' });
    }

    // Get current user
    const userResult = await pool.query('SELECT password FROM users WHERE id = $1', [decoded.userId]);
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Verify current password
    const isValidPassword = await bcrypt.compare(currentPassword, userResult.rows[0].password);
    if (!isValidPassword) {
      return res.status(400).json({ error: 'Current password is incorrect' });
    }

    // Hash new password
    const hashedNewPassword = await bcrypt.hash(newPassword, 10);

    // Update password
    await pool.query('UPDATE users SET password = $1, updated_at = NOW() WHERE id = $2', [hashedNewPassword, decoded.userId]);

    res.json({ message: 'Password changed successfully' });
  } catch (error) {
    console.error('Error changing password:', error);
    res.status(500).json({ error: 'Failed to change password' });
  }
});

// Upload profile image (authenticated user)
router.post('/upload-profile-image', upload.single('profileImage'), async (req: Request, res: Response) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];

    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No image file provided' });
    }

    const decoded = jwt.verify(token, JWT_SECRET) as any;
    const userId = decoded.userId;
    const filename = req.file.filename;

    // Get current user to check if they have an existing profile image
    const currentUser = await pool.query('SELECT profile_image FROM users WHERE id = $1', [userId]);

    if (currentUser.rows.length > 0 && currentUser.rows[0].profile_image) {
      // Delete old profile image if it exists
      const oldImagePath = path.join(uploadsDir, currentUser.rows[0].profile_image);
      if (fs.existsSync(oldImagePath)) {
        fs.unlinkSync(oldImagePath);
      }
    }

    // Update user profile with new image filename
    await pool.query(
      'UPDATE users SET profile_image = $1, updated_at = NOW() WHERE id = $2',
      [filename, userId]
    );

    res.json({
      message: 'Profile image uploaded successfully',
      profileImage: filename
    });
  } catch (error) {
    console.error('Error uploading profile image:', error);

    // Clean up uploaded file if there was an error
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }

    if (error instanceof jwt.JsonWebTokenError) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    res.status(500).json({ error: 'Failed to upload profile image' });
  }
});

// Get user statistics (admin only)
router.get('/stats/overview', verifyAdmin, async (req: Request, res: Response) => {
  try {
    const stats = await pool.query(`
      SELECT 
        COUNT(*) as total_users,
        COUNT(CASE WHEN status = 'active' THEN 1 END) as active_users,
        COUNT(CASE WHEN role = 'admin' THEN 1 END) as admin_users,
        COUNT(CASE WHEN role = 'premium' THEN 1 END) as premium_users,
        COUNT(CASE WHEN created_at >= NOW() - INTERVAL '7 days' THEN 1 END) as new_users_week,
        COUNT(CASE WHEN last_login >= NOW() - INTERVAL '24 hours' THEN 1 END) as active_today
      FROM users
    `);
    
    res.json({ stats: stats.rows[0] });
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ error: 'Failed to fetch statistics' });
  }
});

// Update user subscription (admin only)
router.put('/:userId/subscription', authenticateToken, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const { planId } = req.body;

    if (!planId) {
      return res.status(400).json({ error: 'Plan ID is required' });
    }

    // Get the plan details
    const planResult = await pool.query(
      'SELECT * FROM subscription_plans WHERE id = $1',
      [planId]
    );

    if (planResult.rows.length === 0) {
      return res.status(404).json({ error: 'Plan not found' });
    }

    const plan = planResult.rows[0];

    // Update user subscription
    await pool.query(`
      INSERT INTO user_subscriptions (user_id, plan_id, start_date, end_date, status, monthly_limit)
      VALUES ($1, $2, NOW(), NOW() + INTERVAL '1 month', 'active', $3)
      ON CONFLICT (user_id)
      DO UPDATE SET
        plan_id = EXCLUDED.plan_id,
        start_date = EXCLUDED.start_date,
        end_date = EXCLUDED.end_date,
        status = 'active',
        monthly_limit = EXCLUDED.monthly_limit
    `, [userId, planId, plan.monthly_tokens]);

    res.json({
      message: 'Subscription updated successfully',
      plan: plan
    });
  } catch (error) {
    console.error('Error updating subscription:', error);
    res.status(500).json({ error: 'Failed to update subscription' });
  }
});

// Get user token usage (admin only)
router.get('/:userId/token-usage', authenticateToken, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;

    // Get user and subscription details
    const userResult = await pool.query(`
      SELECT
        u.id,
        u.name,
        u.email,
        s.plan_id,
        s.monthly_limit,
        sp.name as plan_name,
        s.start_date as subscription_start,
        s.end_date as subscription_end
      FROM users u
      LEFT JOIN user_subscriptions s ON u.id = s.user_id AND s.status = 'active'
      LEFT JOIN subscription_plans sp ON s.plan_id = sp.id
      WHERE u.id = $1
    `, [userId]);

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = userResult.rows[0];

    // Calculate token usage from user activity logs
    const usageResult = await pool.query(`
      SELECT
        COUNT(*) as total_queries,
        COALESCE(SUM(input_tokens), 0) as total_input_tokens,
        COALESCE(SUM(output_tokens), 0) as total_output_tokens,
        COALESCE(SUM(input_tokens + output_tokens), 0) as total_tokens,
        DATE_TRUNC('month', created_at) as month
      FROM user_activity_logs
      WHERE user_id = $1 AND created_at >= DATE_TRUNC('month', CURRENT_DATE)
      GROUP BY DATE_TRUNC('month', created_at)
      ORDER BY month DESC
      LIMIT 1
    `, [userId]);

    const currentMonthUsage = usageResult.rows[0] || {
      total_queries: 0,
      total_input_tokens: 0,
      total_output_tokens: 0,
      total_tokens: 0,
      month: new Date().toISOString()
    };

    // Calculate remaining tokens
    const monthlyLimit = user.monthly_limit || 10000; // Default for free users
    const usedTokens = currentMonthUsage.total_tokens;
    const remainingTokens = Math.max(0, monthlyLimit - usedTokens);
    const usagePercentage = (usedTokens / monthlyLimit) * 100;

    res.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        subscription: user.plan_name ? {
          plan_id: user.plan_id,
          name: user.plan_name,
          start_date: user.subscription_start,
          end_date: user.subscription_end,
          monthly_limit: user.monthly_limit
        } : null
      },
      token_usage: {
        total_tokens: usedTokens,
        input_tokens: currentMonthUsage.total_input_tokens,
        output_tokens: currentMonthUsage.total_output_tokens,
        monthly_limit: monthlyLimit,
        remaining_tokens: remainingTokens,
        usage_percentage: Math.round(usagePercentage * 100) / 100,
        current_month: currentMonthUsage.month,
        total_queries: currentMonthUsage.total_queries
      }
    });
  } catch (error) {
    console.error('Error fetching token usage:', error);
    res.status(500).json({ error: 'Failed to fetch token usage' });
  }
});

// Get all users with token usage (admin only)
router.get('/with-usage', authenticateToken, requireAdmin, async (req: Request, res: Response) => {
  try {
    const result = await pool.query(`
      SELECT
        u.id,
        u.email,
        u.name,
        u.role,
        u.status,
        u.last_login,
        u.created_at,
        s.plan_id,
        s.monthly_limit,
        sp.name as plan_name,
        s.end_date as subscription_end_date,
        s.status as subscription_status,
        -- Calculate current month token usage
        COALESCE(monthly_usage.total_tokens, 0) as current_month_tokens,
        COALESCE(monthly_usage.input_tokens, 0) as current_month_input_tokens,
        COALESCE(monthly_usage.output_tokens, 0) as current_month_output_tokens,
        COALESCE(monthly_usage.total_queries, 0) as current_month_queries,
        -- Message statistics
        COALESCE(message_stats.total_messages, 0) as total_messages,
        COALESCE(message_stats.total_sessions, 0) as message_sessions,
        COALESCE(message_stats.avg_messages_per_session, 0) as avg_messages_per_session,
        COALESCE(message_stats.total_question_tokens, 0) as total_question_tokens,
        COALESCE(message_stats.total_answer_tokens, 0) as total_answer_tokens,
        COALESCE(message_stats.last_activity, null) as last_message_activity
      FROM users u
      LEFT JOIN user_subscriptions s ON u.id = s.user_id AND s.status = 'active'
      LEFT JOIN subscription_plans sp ON s.plan_id = sp.id
      LEFT JOIN (
        SELECT
          user_id,
          COALESCE(SUM(input_tokens + output_tokens), 0) as total_tokens,
          COALESCE(SUM(input_tokens), 0) as input_tokens,
          COALESCE(SUM(output_tokens), 0) as output_tokens,
          COUNT(*) as total_queries
        FROM user_activity_logs
        WHERE created_at >= DATE_TRUNC('month', CURRENT_DATE)
        GROUP BY user_id
      ) monthly_usage ON u.id = monthly_usage.user_id
      LEFT JOIN (
        SELECT
          user_id,
          COUNT(*) as total_messages,
          COUNT(DISTINCT session_id) as total_sessions,
          COUNT(*)::float / COUNT(DISTINCT session_id) as avg_messages_per_session,
          SUM(CASE WHEN message_type = 'question' THEN metadata->>'tokens'::integer ELSE 0 END) as total_question_tokens,
          SUM(CASE WHEN message_type = 'answer' THEN metadata->>'tokens'::integer ELSE 0 END) as total_answer_tokens,
          MAX(created_at) as last_activity
        FROM message_embeddings
        WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'
        GROUP BY user_id
      ) message_stats ON u.id = message_stats.user_id
      ORDER BY u.created_at DESC
    `);

    const usersWithUsage = result.rows.map(row => {
      const monthlyLimit = row.monthly_limit || 10000;
      const usedTokens = row.current_month_tokens || 0;

      return {
        id: row.id,
        email: row.email,
        name: row.name,
        role: row.role,
        status: row.status,
        last_login: row.last_login,
        created_at: row.created_at,
        subscription: row.plan_id ? {
          plan_id: row.plan_id,
          name: row.plan_name,
          status: row.subscription_status,
          start_date: null, // Would need to add to schema
          end_date: row.subscription_end_date,
          monthly_limit: row.monthly_limit
        } : null,
        token_usage: {
          total_tokens: usedTokens,
          input_tokens: row.current_month_input_tokens || 0,
          output_tokens: row.current_month_output_tokens || 0,
          monthly_limit: monthlyLimit,
          remaining_tokens: Math.max(0, monthlyLimit - usedTokens),
          usage_percentage: Math.round((usedTokens / monthlyLimit) * 10000) / 100,
          current_month_queries: row.current_month_queries || 0
        },
        message_stats: {
          total_messages: row.total_messages || 0,
          total_sessions: row.message_sessions || 0,
          avg_messages_per_session: Math.round(row.avg_messages_per_session * 100) / 100,
          total_question_tokens: row.total_question_tokens || 0,
          total_answer_tokens: row.total_answer_tokens || 0,
          last_activity: row.last_message_activity
        }
      };
    });

    res.json({ users: usersWithUsage });
  } catch (error) {
    console.error('Error fetching users with usage:', error);
    res.status(500).json({ error: 'Failed to fetch users with usage data' });
  }
});

export default router;