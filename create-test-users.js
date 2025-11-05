/**
 * Create test users for all tenants
 * This script creates admin users for testing login functionality
 */

const { Pool } = require('pg');
const bcrypt = require('bcrypt');

// Database configurations for each tenant
const tenants = {
  lsemb: {
    name: 'LSEMB',
    database: 'lsemb',
    email: 'admin@lsemb.com',
    username: 'admin-lsemb'
  },
  emlakai: {
    name: 'EmlakAI',
    database: 'emlakai_lsemb',
    email: 'admin@emlakai.com',
    username: 'admin-emlakai'
  },
  bookie: {
    name: 'Bookie',
    database: 'bookie_lsemb',
    email: 'admin@bookie.com',
    username: 'admin-bookie'
  }
};

async function createTestUser(tenantId, config) {
  // Create database connection
  const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: 5432,
    user: 'postgres',
    password: process.env.DB_PASSWORD || '12Kemal1221',
    database: config.database
  });

  try {
    // Hash the password
    const password = 'admin123';
    const hashedPassword = await bcrypt.hash(password, 12);

    // Check if user already exists
    const checkResult = await pool.query(
      'SELECT id FROM users WHERE email = $1',
      [config.email]
    );

    if (checkResult.rows.length > 0) {
      console.log(`[${tenantId}] User already exists: ${config.email}`);

      // Update the password for existing user
      await pool.query(
        'UPDATE users SET password = $1 WHERE email = $2',
        [hashedPassword, config.email]
      );
      console.log(`[${tenantId}] Password updated for: ${config.email}`);
    } else {
      // Create new user
      await pool.query(
        `INSERT INTO users (username, email, password, name, role, status, email_verified, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())`,
        [
          config.username,
          config.email,
          hashedPassword,
          `${config.name} Admin`,
          'admin',
          'active',
          true
        ]
      );
      console.log(`[${tenantId}] Created test user: ${config.email}`);
    }

    console.log(`[${tenantId}] Login credentials:`);
    console.log(`  Email: ${config.email}`);
    console.log(`  Password: admin123`);

  } catch (error) {
    console.error(`[${tenantId}] Error:`, error.message);
  } finally {
    await pool.end();
  }
}

async function main() {
  console.log('==================================================');
  console.log('     CREATING TEST USERS FOR ALL TENANTS');
  console.log('==================================================');
  console.log('');

  // Process command line argument for environment
  const args = process.argv.slice(2);
  const environment = args[0] || 'local';

  if (environment === 'remote') {
    // For remote deployment, use production database
    process.env.DB_HOST = '91.99.229.96';
    process.env.DB_PASSWORD = 'Semsiye!22';
    console.log('Using REMOTE database configuration');
  } else {
    console.log('Using LOCAL database configuration');
  }

  console.log('');

  // Create test users for each tenant
  for (const [tenantId, config] of Object.entries(tenants)) {
    console.log(`\nProcessing ${config.name} (${tenantId})...`);

    try {
      await createTestUser(tenantId, config);
    } catch (error) {
      console.error(`Failed to process ${tenantId}:`, error.message);
    }
  }

  console.log('\n==================================================');
  console.log('Test user creation complete!');
  console.log('');
  console.log('You can now test login with:');
  console.log('  Email: admin@[tenant].com');
  console.log('  Password: admin123');
  console.log('==================================================');
}

// Run the script
main().catch(console.error);