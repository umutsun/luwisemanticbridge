#!/usr/bin/env node
/**
 * Multi-Tenant Database Status Checker
 *
 * Purpose: Check the status and integrity of multi-tenant databases
 * - Verify user_sessions table structure
 * - Check settings count and key app settings
 * - Verify admin users exist
 * - Check database connectivity
 *
 * Usage:
 *   node scripts/check-tenant-databases.js [database_name]
 *
 * Examples:
 *   node scripts/check-tenant-databases.js emlakai_lsemb
 *   node scripts/check-tenant-databases.js bookie_lsemb
 *   node scripts/check-tenant-databases.js  # Check all tenants
 */

const { Pool } = require('pg');
require('dotenv').config();

// Database configuration
const dbConfig = {
  host: process.env.POSTGRES_HOST || '91.99.229.96',
  port: parseInt(process.env.POSTGRES_PORT || '5432'),
  user: process.env.POSTGRES_USER || 'postgres',
  password: process.env.POSTGRES_PASSWORD || 'Semsiye!22'
};

// Tenant databases
const TENANTS = {
  'lsemb': {
    database: 'lsemb',
    displayName: 'LSEMB (Main)',
    expectedAppName: 'Mali Müşavir Asistanı'
  },
  'emlakai_lsemb': {
    database: 'emlakai_lsemb',
    displayName: 'EmlakAI',
    expectedAppName: 'EmlakAI'
  },
  'bookie_lsemb': {
    database: 'bookie_lsemb',
    displayName: 'Bookie',
    expectedAppName: 'Bookie AI'
  }
};

// Required columns in user_sessions table
const REQUIRED_USER_SESSION_COLUMNS = [
  'id', 'user_id', 'token', 'refresh_token', 'expires_at',
  'ip_address', 'user_agent', 'created_at', 'session_token',
  'last_accessed', 'updated_at'
];

/**
 * Check user_sessions table structure
 */
async function checkUserSessionsTable(pool, tenantName) {
  try {
    const result = await pool.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'user_sessions'
      ORDER BY ordinal_position;
    `);

    const columns = result.rows.map(r => r.column_name);
    const missingColumns = REQUIRED_USER_SESSION_COLUMNS.filter(
      col => !columns.includes(col)
    );

    if (missingColumns.length === 0) {
      console.log('  ✅ user_sessions: All required columns present');
      return true;
    } else {
      console.log(`  ❌ user_sessions: Missing columns: ${missingColumns.join(', ')}`);
      return false;
    }
  } catch (err) {
    console.log(`  ❌ user_sessions: Error checking - ${err.message}`);
    return false;
  }
}

/**
 * Check settings table
 */
async function checkSettingsTable(pool, expectedAppName) {
  try {
    // Count total settings
    const countResult = await pool.query('SELECT COUNT(*) FROM settings;');
    const settingsCount = parseInt(countResult.rows[0].count);

    // Get app name
    const appNameResult = await pool.query(`
      SELECT value FROM settings WHERE key = 'app.name' LIMIT 1;
    `);
    const appName = appNameResult.rows[0]?.value || 'NOT FOUND';

    console.log(`  Settings count: ${settingsCount}`);

    if (settingsCount === 0) {
      console.log('  ❌ Settings: Table is empty');
      return false;
    } else if (settingsCount < 100) {
      console.log('  ⚠️  Settings: Low count (expected 500+)');
    }

    if (appName === expectedAppName) {
      console.log(`  ✅ App name: "${appName}" (correct)`);
      return true;
    } else {
      console.log(`  ❌ App name: "${appName}" (expected: "${expectedAppName}")`);
      return false;
    }
  } catch (err) {
    console.log(`  ❌ Settings: Error checking - ${err.message}`);
    return false;
  }
}

/**
 * Check admin users
 */
async function checkAdminUsers(pool) {
  try {
    const result = await pool.query(`
      SELECT username, email, role, status, email_verified
      FROM users
      WHERE role = 'admin'
      ORDER BY created_at;
    `);

    if (result.rows.length === 0) {
      console.log('  ❌ Admin users: None found');
      return false;
    }

    console.log(`  ✅ Admin users: ${result.rows.length} found`);
    result.rows.forEach(user => {
      const verified = user.email_verified ? '✓' : '✗';
      console.log(`     - ${user.username} (${user.email}) [${verified}]`);
    });

    return true;
  } catch (err) {
    console.log(`  ❌ Admin users: Error checking - ${err.message}`);
    return false;
  }
}

/**
 * Check a single tenant database
 */
async function checkTenantDatabase(tenantName) {
  const tenantConfig = TENANTS[tenantName];

  if (!tenantConfig) {
    console.log(`❌ Unknown tenant: ${tenantName}`);
    return false;
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`${tenantConfig.displayName} (${tenantConfig.database})`);
  console.log(`${'='.repeat(60)}`);

  const pool = new Pool({ ...dbConfig, database: tenantConfig.database });

  try {
    // Test connection
    await pool.query('SELECT NOW();');
    console.log('  ✅ Database: Connected');

    // Check components
    const userSessionsOK = await checkUserSessionsTable(pool, tenantName);
    const settingsOK = await checkSettingsTable(pool, tenantConfig.expectedAppName);
    const adminUsersOK = await checkAdminUsers(pool);

    // Overall status
    const allOK = userSessionsOK && settingsOK && adminUsersOK;
    console.log(`\nOverall Status: ${allOK ? '✅ HEALTHY' : '❌ NEEDS ATTENTION'}`);

    return allOK;

  } catch (err) {
    console.log(`  ❌ Database: Connection failed - ${err.message}`);
    return false;
  } finally {
    await pool.end();
  }
}

/**
 * Main execution
 */
async function main() {
  const targetTenant = process.argv[2];

  console.log('Multi-Tenant Database Status Checker');
  console.log(`Checking: ${dbConfig.host}:${dbConfig.port}\n`);

  const results = {};

  if (targetTenant) {
    // Check specific tenant
    results[targetTenant] = await checkTenantDatabase(targetTenant);
  } else {
    // Check all tenants
    for (const tenantName of Object.keys(TENANTS)) {
      results[tenantName] = await checkTenantDatabase(tenantName);
    }
  }

  // Summary
  console.log(`\n${'='.repeat(60)}`);
  console.log('SUMMARY');
  console.log(`${'='.repeat(60)}`);

  const healthyCount = Object.values(results).filter(Boolean).length;
  const totalCount = Object.keys(results).length;

  Object.entries(results).forEach(([tenant, healthy]) => {
    const status = healthy ? '✅ HEALTHY' : '❌ NEEDS FIX';
    console.log(`  ${TENANTS[tenant].displayName}: ${status}`);
  });

  console.log(`\nHealthy: ${healthyCount}/${totalCount}`);

  if (healthyCount < totalCount) {
    console.log('\n⚠️  Some databases need attention!');
    console.log('Run: node scripts/fix-multitenant-databases.js [tenant_name]');
  }
}

// Run if called directly
if (require.main === module) {
  main().catch(err => {
    console.error('❌ Fatal error:', err);
    process.exit(1);
  });
}

module.exports = { checkTenantDatabase };
