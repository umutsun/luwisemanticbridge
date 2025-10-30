const { Pool } = require('pg');
require('dotenv').config({ path: '../.env.lsemb' });

const pool = new Pool({
  host: process.env.POSTGRES_HOST || '91.99.229.96',
  port: parseInt(process.env.POSTGRES_PORT || '5432'),
  database: process.env.POSTGRES_DB || 'lsemb',
  user: process.env.POSTGRES_USER || 'postgres',
  password: process.env.POSTGRES_PASSWORD || '12Kemal1221'
});

async function fixPriorityType() {
  try {
    console.log('🔧 Fixing unifiedEmbeddingsPriority type...\n');

    // Check current value
    const current = await pool.query(`
      SELECT key, value, pg_typeof(value) as type
      FROM settings
      WHERE key = 'ragSettings.unifiedEmbeddingsPriority'
    `);

    console.log('Current value:', current.rows[0]);

    // Update to proper integer string
    await pool.query(`
      UPDATE settings
      SET value = '5'
      WHERE key = 'ragSettings.unifiedEmbeddingsPriority'
    `);

    console.log('✅ Updated unifiedEmbeddingsPriority to 5 (higher priority)');

    // Verify
    const updated = await pool.query(`
      SELECT key, value
      FROM settings
      WHERE key = 'ragSettings.unifiedEmbeddingsPriority'
    `);

    console.log('New value:', updated.rows[0]);

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await pool.end();
  }
}

fixPriorityType();
