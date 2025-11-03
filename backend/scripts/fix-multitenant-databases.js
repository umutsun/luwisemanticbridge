#!/usr/bin/env node
/**
 * Multi-Tenant Database Fix Script
 *
 * Purpose: Fix common database issues in multi-tenant setup (emlakai_lsemb, bookie_lsemb)
 * - Adds missing columns to user_sessions table
 * - Copies settings from LSEMB to tenant databases
 * - Updates app-specific branding (app.name, app_title, etc.)
 *
 * Usage:
 *   node scripts/fix-multitenant-databases.js [database_name]
 *
 * Examples:
 *   node scripts/fix-multitenant-databases.js emlakai_lsemb
 *   node scripts/fix-multitenant-databases.js bookie_lsemb
 *   node scripts/fix-multitenant-databases.js  # Fix both
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

// Tenant configurations
const TENANTS = {
  'emlakai_lsemb': {
    database: 'emlakai_lsemb',
    appName: 'EmlakAI',
    appTitle: 'EmlakAI - Real Estate Intelligence',
    appDescription: 'AI-powered real estate analysis and insights'
  },
  'bookie_lsemb': {
    database: 'bookie_lsemb',
    appName: 'Bookie AI',
    appTitle: 'Bookie - AI Book Assistant',
    appDescription: 'AI-powered book discovery and analysis platform'
  }
};

/**
 * Add missing columns to user_sessions table
 */
async function fixUserSessionsTable(pool, tenantName) {
  console.log(`\n=== Fixing user_sessions table for ${tenantName} ===`);

  try {
    await pool.query('ALTER TABLE user_sessions ADD COLUMN IF NOT EXISTS refresh_token TEXT;');
    await pool.query('ALTER TABLE user_sessions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();');
    await pool.query('ALTER TABLE user_sessions ADD COLUMN IF NOT EXISTS last_accessed TIMESTAMP WITH TIME ZONE DEFAULT NOW();');
    await pool.query('ALTER TABLE user_sessions ADD COLUMN IF NOT EXISTS session_token VARCHAR(255);');
    await pool.query('ALTER TABLE user_sessions ADD COLUMN IF NOT EXISTS ip_address VARCHAR(45);');
    await pool.query('ALTER TABLE user_sessions ADD COLUMN IF NOT EXISTS user_agent TEXT;');

    console.log('✅ Added missing columns to user_sessions');
  } catch (err) {
    console.log('❌ Error fixing user_sessions:', err.message);
    throw err;
  }
}

/**
 * Copy all settings from LSEMB to tenant database
 */
async function copySettingsFromLSEMB(tenantPool, tenantConfig) {
  console.log(`\n=== Copying settings from LSEMB to ${tenantConfig.database} ===`);

  // Connect to LSEMB database
  const lsembPool = new Pool({ ...dbConfig, database: 'lsemb' });

  try {
    // Get all settings from LSEMB
    const allSettings = await lsembPool.query('SELECT category, key, value, description FROM settings;');
    console.log(`Found ${allSettings.rows.length} settings in LSEMB`);

    // Clear existing settings in tenant database
    await tenantPool.query('TRUNCATE TABLE settings CASCADE;');
    console.log('Cleared tenant settings');

    // Copy settings with tenant-specific modifications
    for (const setting of allSettings.rows) {
      let value = setting.value;

      // Modify app-specific values
      if (setting.key === 'app.name') {
        value = tenantConfig.appName;
      } else if (setting.key === 'app_name') {
        value = tenantConfig.appName;
      } else if (setting.key === 'app_title') {
        value = tenantConfig.appTitle;
      } else if (setting.key === 'app_description') {
        value = tenantConfig.appDescription;
      }

      await tenantPool.query(
        'INSERT INTO settings (category, key, value, description) VALUES ($1, $2, $3, $4);',
        [setting.category, setting.key, value, setting.description]
      );
    }

    console.log(`✅ Copied ${allSettings.rows.length} settings to ${tenantConfig.database}`);

    // Verify
    const count = await tenantPool.query('SELECT COUNT(*) FROM settings;');
    console.log(`${tenantConfig.database} now has ${count.rows[0].count} settings`);

  } catch (err) {
    console.log('❌ Error copying settings:', err.message);
    throw err;
  } finally {
    await lsembPool.end();
  }
}

/**
 * Main function to fix a tenant database
 */
async function fixTenantDatabase(tenantName) {
  const tenantConfig = TENANTS[tenantName];

  if (!tenantConfig) {
    console.log(`❌ Unknown tenant: ${tenantName}`);
    console.log(`Available tenants: ${Object.keys(TENANTS).join(', ')}`);
    return false;
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`Fixing database: ${tenantConfig.database}`);
  console.log(`App Name: ${tenantConfig.appName}`);
  console.log(`${'='.repeat(60)}`);

  const pool = new Pool({ ...dbConfig, database: tenantConfig.database });

  try {
    // Fix user_sessions table
    await fixUserSessionsTable(pool, tenantName);

    // Copy settings from LSEMB
    await copySettingsFromLSEMB(pool, tenantConfig);

    console.log(`\n✅ Successfully fixed ${tenantConfig.database}!`);
    return true;

  } catch (err) {
    console.log(`\n❌ Failed to fix ${tenantConfig.database}:`, err.message);
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

  if (targetTenant) {
    // Fix specific tenant
    await fixTenantDatabase(targetTenant);
  } else {
    // Fix all tenants
    console.log('No tenant specified, fixing all tenants...\n');

    for (const tenantName of Object.keys(TENANTS)) {
      await fixTenantDatabase(tenantName);
    }
  }

  console.log('\n✅ All operations completed!');
}

// Run if called directly
if (require.main === module) {
  main().catch(err => {
    console.error('❌ Fatal error:', err);
    process.exit(1);
  });
}

module.exports = { fixTenantDatabase, fixUserSessionsTable, copySettingsFromLSEMB };
