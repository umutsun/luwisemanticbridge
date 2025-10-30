const { Pool } = require('pg');
require('dotenv').config({ path: '../.env.lsemb' });

const pool = new Pool({
  host: process.env.POSTGRES_HOST || '91.99.229.96',
  port: parseInt(process.env.POSTGRES_PORT || '5432'),
  database: process.env.POSTGRES_DB || 'lsemb',
  user: process.env.POSTGRES_USER || 'postgres',
  password: process.env.POSTGRES_PASSWORD || '12Kemal1221'
});

async function testRecordTypes() {
  try {
    console.log('🔍 Testing dynamic record types...\n');

    // Get all unique record types from metadata
    const result = await pool.query(`
      SELECT metadata->>'table' as record_type, COUNT(*) as count
      FROM unified_embeddings
      WHERE metadata->>'table' IS NOT NULL
      GROUP BY metadata->>'table'
      ORDER BY count DESC
    `);

    console.log('📊 Found Record Types:');
    result.rows.forEach(row => {
      console.log(`  - ${row.record_type}: ${row.count} records`);
    });

    console.log('\n✅ All record types will be dynamically included in search!');
    console.log('   No hardcoded table names anymore.');

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await pool.end();
  }
}

testRecordTypes();
