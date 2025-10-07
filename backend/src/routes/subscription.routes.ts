import { Router, Response } from 'express';
import { authenticateToken, AuthenticatedRequest, requireAdmin } from '../middleware/auth.middleware';
import { SubscriptionService } from '../services/subscription.service';

const router = Router();
const subscriptionService = new SubscriptionService();

// Get current user's subscription
router.get('/my', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const subscription = await subscriptionService.getUserSubscription(req.user.userId);
    const queryCheck = await subscriptionService.canUserMakeQuery(req.user.userId);

    res.json({
      subscription,
      queryLimits: {
        canQuery: queryCheck.canQuery,
        reason: queryCheck.reason,
        remaining: queryCheck.remaining
      }
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get available subscription plans
router.get('/plans', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const plans = await subscriptionService.getAvailablePlans();
    res.json({ plans });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Upgrade/Change subscription plan
router.post('/upgrade', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { planId } = req.body;

    if (!planId) {
      return res.status(400).json({ error: 'Plan ID is required' });
    }

    const success = await subscriptionService.upgradeUserPlan(req.user.userId, planId);

    if (success) {
      const subscription = await subscriptionService.getUserSubscription(req.user.userId);
      res.json({
        message: 'Subscription upgraded successfully',
        subscription
      });
    } else {
      res.status(400).json({ error: 'Failed to upgrade subscription' });
    }
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get user's usage statistics
router.get('/usage', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // This would typically query user activity logs and profiles
    // For now, return basic info
    const subscription = await subscriptionService.getUserSubscription(req.user.userId);

    res.json({
      userId: req.user.userId,
      subscription: subscription?.plan_name || 'Free',
      // You can expand this with actual usage data from user_activity_logs
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Admin only routes
router.get('/admin/users', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    // Get all users with their subscription status
    const pool = require('pg').Pool;
    const pool_instance = new Pool({
      connectionString: process.env.DATABASE_URL,
    });

    const result = await pool_instance.query(`
      SELECT
        u.id,
        u.email,
        u.name,
        u.role,
        u.status,
        u.created_at,
        u.last_login,
        sp.name as plan_name,
        us.end_date as subscription_end_date,
        us.status as subscription_status
      FROM users u
      LEFT JOIN user_subscriptions us ON u.id = us.user_id AND us.status = 'active'
      LEFT JOIN subscription_plans sp ON us.plan_id = sp.id
      ORDER BY u.created_at DESC
    `);

    res.json({ users: result.rows });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Admin: Update user subscription
router.post('/admin/users/:userId/subscription', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { userId } = req.params;
    const { planId } = req.body;

    if (!planId) {
      return res.status(400).json({ error: 'Plan ID is required' });
    }

    const success = await subscriptionService.upgradeUserPlan(userId, planId);

    if (success) {
      const subscription = await subscriptionService.getUserSubscription(userId);
      res.json({
        message: 'User subscription updated successfully',
        subscription
      });
    } else {
      res.status(400).json({ error: 'Failed to update user subscription' });
    }
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;