const { Pool } = require('pg');
require('dotenv').config({ path: '../.env.lsemb' });

const pool = new Pool({
  host: process.env.POSTGRES_HOST || '91.99.229.96',
  port: parseInt(process.env.POSTGRES_PORT || '5432'),
  database: process.env.POSTGRES_DB || 'lsemb',
  user: process.env.POSTGRES_USER || 'postgres',
  password: process.env.POSTGRES_PASSWORD || '12Kemal1221'
});

async function fixSimilarityThreshold() {
  try {
    console.log('🔧 Fixing similarity threshold...\n');

    // Check current value
    const current = await pool.query(`
      SELECT key, value
      FROM settings
      WHERE key = 'ragSettings.similarityThreshold'
    `);

    console.log('❌ Current threshold:', current.rows[0]?.value || 'NOT SET');
    console.log('   (0.11 is too high - only exact matches will return)\n');

    // Update to optimal value
    await pool.query(`
      INSERT INTO settings (key, value, category, description)
      VALUES ('ragSettings.similarityThreshold', '0.02', 'rag', 'Minimum similarity score for search results (lower = more results)')
      ON CONFLICT (key)
      DO UPDATE SET value = '0.02', updated_at = NOW()
    `);

    console.log('✅ Updated similarityThreshold to 0.02 (optimal value)');
    console.log('   This will allow more diverse results from all tables!\n');

    // Verify
    const updated = await pool.query(`
      SELECT key, value
      FROM settings
      WHERE key = 'ragSettings.similarityThreshold'
    `);

    console.log('✅ New threshold:', updated.rows[0].value);
    console.log('\n📌 Recommendation:');
    console.log('   - 0.001-0.01: Very permissive (many results, some less relevant)');
    console.log('   - 0.02-0.05: Balanced (good mix of quantity and quality)');
    console.log('   - 0.06-0.10: Strict (fewer but more relevant results)');
    console.log('   - 0.11+: Very strict (only exact matches)\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await pool.end();
  }
}

fixSimilarityThreshold();
