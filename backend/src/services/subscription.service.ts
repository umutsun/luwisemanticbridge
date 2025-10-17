import { Pool } from 'pg';

export interface SubscriptionPlan {
  id: string;
  name: string;
  price: number;
  features: any;
  max_queries_per_month?: number;
  max_documents?: number;
  max_tokens_per_month?: number;
  priority_support: boolean;
}

export interface UserSubscription {
  id: string;
  user_id: string;
  plan_id: string;
  start_date: Date;
  end_date: Date;
  status: 'active' | 'cancelled' | 'expired' | 'suspended';
  auto_renew: boolean;
  // Properties joined from subscription_plans
  plan_name?: string;
  features?: any;
  max_queries_per_month?: number;
  max_documents?: number;
  max_tokens_per_month?: number;
  priority_support?: boolean;
}

export class SubscriptionService {
  private pool: Pool;

  constructor() {
    this.pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
    });
  }

  async getUserSubscription(userId: string): Promise<UserSubscription | null> {
    const result = await this.pool.query(
      `SELECT us.*, sp.name as plan_name, sp.features, sp.max_queries_per_month,
              sp.max_documents, sp.max_tokens_per_month, sp.priority_support
       FROM user_subscriptions us
       JOIN subscription_plans sp ON us.plan_id = sp.id
       WHERE us.user_id = $1 AND us.status = 'active' AND us.end_date > NOW()
       ORDER BY us.created_at DESC
       LIMIT 1`,
      [userId]
    );

    return result.rows[0] || null;
  }

  async checkUserAccess(userId: string, feature: string): Promise<boolean> {
    // Admin users have full access
    const userResult = await this.pool.query(
      'SELECT role FROM users WHERE id = $1',
      [userId]
    );

    if (userResult.rows.length === 0) {
      return false;
    }

    const user = userResult.rows[0];
    if (user.role === 'admin') {
      return true;
    }

    // Check subscription
    const subscription = await this.getUserSubscription(userId);
    if (!subscription) {
      return false;
    }

    // Check feature access based on plan
    const features = subscription.features;
    if (features && typeof features === 'object') {
      return (features as any).features && (features as any).features.includes(feature);
    }

    return false;
  }

  async getQueryLimit(userId: string): Promise<number> {
    const subscription = await this.getUserSubscription(userId);
    if (!subscription) {
      return 0;
    }

    return subscription.max_queries_per_month || 0;
  }

  async getDocumentLimit(userId: string): Promise<number> {
    const subscription = await this.getUserSubscription(userId);
    if (!subscription) {
      return 0;
    }

    return subscription.max_documents || 0;
  }

  async trackUserUsage(userId: string, action: string, details: any = {}): Promise<void> {
    await this.pool.query(
      `INSERT INTO user_activity_logs (user_id, action, details, ip_address, user_agent, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW())`,
      [userId, action, JSON.stringify(details), details.ip_address, details.user_agent]
    );

    // Update usage stats in user profile
    const statsResult = await this.pool.query(
      'SELECT usage_stats FROM user_profiles WHERE user_id = $1',
      [userId]
    );

    if (statsResult.rows.length > 0) {
      let stats = statsResult.rows[0].usage_stats || {
        total_queries: 0,
        total_documents: 0,
        total_tokens: 0
      };

      // Update stats based on action
      switch (action) {
        case 'chat_query':
          stats.total_queries += 1;
          break;
        case 'document_upload':
          stats.total_documents += 1;
          break;
        case 'token_usage':
          stats.total_tokens += details.tokens || 0;
          break;
      }

      await this.pool.query(
        'UPDATE user_profiles SET usage_stats = $1, updated_at = NOW() WHERE user_id = $2',
        [JSON.stringify(stats), userId]
      );
    }
  }

  async canUserMakeQuery(userId: string): Promise<{ canQuery: boolean; reason: string; remaining: number }> {
    const subscription = await this.getUserSubscription(userId);

    if (!subscription) {
      return { canQuery: false, reason: 'No active subscription', remaining: 0 };
    }

    const limit = subscription.max_queries_per_month || 0;

    if (limit === -1) {
      // Unlimited queries
      return { canQuery: true, reason: 'Unlimited', remaining: -1 };
    }

    if (limit === 0) {
      return { canQuery: false, reason: 'Query limit not allowed', remaining: 0 };
    }

    // Count queries this month
    const countResult = await this.pool.query(
      `SELECT COUNT(*) as count
       FROM user_activity_logs
       WHERE user_id = $1 AND action = 'chat_query'
       AND created_at >= DATE_TRUNC('month', NOW())`,
      [userId]
    );

    const currentCount = parseInt(countResult.rows[0].count) || 0;
    const remaining = Math.max(0, limit - currentCount);

    return {
      canQuery: remaining > 0,
      reason: remaining > 0 ? 'Within limit' : 'Monthly query limit exceeded',
      remaining
    };
  }

  async upgradeUserPlan(userId: string, planId: string): Promise<boolean> {
    try {
      // Get plan details
      const planResult = await this.pool.query(
        'SELECT * FROM subscription_plans WHERE id = $1 AND is_active = true',
        [planId]
      );

      if (planResult.rows.length === 0) {
        return false;
      }

      const plan = planResult.rows[0];

      // End current subscription
      await this.pool.query(
        'UPDATE user_subscriptions SET status = $1, end_date = NOW() WHERE user_id = $2 AND status = $3',
        ['cancelled', userId, 'active']
      );

      // Create new subscription
      const startDate = new Date();
      const endDate = new Date();
      endDate.setDate(endDate.getDate() + plan.duration_days);

      await this.pool.query(
        `INSERT INTO user_subscriptions (user_id, plan_id, start_date, end_date, status, auto_renew)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [userId, planId, startDate, endDate, 'active', true]
      );

      return true;
    } catch (error) {
      console.error('Error upgrading user plan:', error);
      return false;
    }
  }

  async getAvailablePlans(): Promise<SubscriptionPlan[]> {
    const result = await this.pool.query(
      'SELECT * FROM subscription_plans WHERE is_active = true ORDER BY price'
    );

    return result.rows;
  }

  async isAdmin(userId: string): Promise<boolean> {
    const result = await this.pool.query(
      'SELECT role FROM users WHERE id = $1',
      [userId]
    );

    return result.rows.length > 0 && result.rows[0].role === 'admin';
  }
}