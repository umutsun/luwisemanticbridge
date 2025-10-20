const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://lsemb:lsemb_password@91.99.229.96:5432/lsemb',
  ssl: { rejectUnauthorized: false }
});

async function fixAdminSubscription() {
  try {
    console.log('🔧 Admin subscription fix started...');

    // Get admin user ID
    const adminUser = await pool.query(
      'SELECT id FROM users WHERE email = $1 AND role = $2',
      ['admin@asb.com', 'admin']
    );

    if (adminUser.rows.length === 0) {
      console.log('❌ Admin user not found');
      return;
    }

    const adminId = adminUser.rows[0].id;
    console.log(`✅ Found admin user: ${adminId}`);

    // Create a default admin subscription plan if it doesn't exist
    const planCheck = await pool.query(
      'SELECT id FROM subscription_plans WHERE name = $1',
      ['Admin Free Plan']
    );

    if (planCheck.rows.length === 0) {
      // Create admin subscription plan
      await pool.query(`
        INSERT INTO subscription_plans (id, name, price, features, max_queries_per_month, max_documents, max_tokens_per_month, priority_support, is_active, duration_days, created_at, updated_at)
        VALUES (
          'admin-free-plan',
          'Admin Free Plan',
          0,
          '{"features": [" unlimited_access", "admin_panel", "api_testing", "user_management", "analytics", "advanced_settings"]}'::jsonb,
          -1,  -- unlimited queries
          -1,  -- unlimited documents
          -1,  -- unlimited tokens
          true,
          true,
          365,  -- 1 year
          NOW(),
          NOW()
        )
      `);
      console.log('✅ Created Admin Free Plan');
    }

    // Check if admin has active subscription
    const currentSub = await pool.query(
      `SELECT us.* FROM user_subscriptions us
       JOIN subscription_plans sp ON us.plan_id = sp.id
       WHERE us.user_id = $1 AND us.status = 'active' AND us.end_date > NOW()
       ORDER BY us.created_at DESC
       LIMIT 1`,
      [adminId]
    );

    if (currentSub.rows.length === 0) {
      // Create admin subscription
      const startDate = new Date();
      const endDate = new Date();
      endDate.setFullYear(endDate.getFullYear() + 1); // 1 year

      await pool.query(`
        INSERT INTO user_subscriptions (id, user_id, plan_id, start_date, end_date, status, auto_renew, created_at, updated_at)
        VALUES (
          uuid_generate_v4(),
          $1,
          'admin-free-plan',
          $2,
          $3,
          'active',
          true,
          NOW(),
          NOW()
        )
      `, [adminId, startDate, endDate]);

      console.log('✅ Created admin subscription (1 year, unlimited access)');
    } else {
      console.log('✅ Admin already has active subscription');
    }

    // Update user_profiles to include admin stats
    await pool.query(`
      INSERT INTO user_profiles (user_id, usage_stats, preferences, created_at, updated_at)
      VALUES ($1, '{"total_queries": 0, "total_documents": 0, "total_tokens": 0}'::jsonb, '{}'::jsonb, NOW(), NOW())
      ON CONFLICT (user_id) DO NOTHING
    `, [adminId]);

    console.log('🎉 Admin subscription fix completed successfully!');
    console.log('📋 Admin user now has:');
    console.log('   - Unlimited API queries');
    console.log('   - Admin dashboard access');
    console.log('   - Full system management');
    console.log('   - 1-year subscription period');

  } catch (error) {
    console.error('❌ Error fixing admin subscription:', error);
  } finally {
    await pool.end();
  }
}

fixAdminSubscription();