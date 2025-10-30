const { Pool } = require('pg');
require('dotenv').config({ path: '../.env.lsemb' });

const pool = new Pool({
  host: process.env.POSTGRES_HOST || '91.99.229.96',
  port: parseInt(process.env.POSTGRES_PORT || '5432'),
  database: process.env.POSTGRES_DB || 'lsemb',
  user: process.env.POSTGRES_USER || 'postgres',
  password: process.env.POSTGRES_PASSWORD || '12Kemal1221'
});

async function checkRAGToggles() {
  try {
    console.log('🔍 Checking RAG toggle settings...\n');

    const result = await pool.query(`
      SELECT key, value, description
      FROM settings
      WHERE key LIKE 'ragSettings.enable%' OR key LIKE 'ragSettings.%Priority'
      ORDER BY key
    `);

    console.log('📊 Current RAG Toggle Settings:');
    console.log('─'.repeat(80));
    result.rows.forEach(row => {
      const status = row.value === 'true' ? '✅ ENABLED' : '❌ DISABLED';
      console.log(`${status.padEnd(12)} | ${row.key.padEnd(40)} | Value: ${row.value}`);
      if (row.description) {
        console.log(`${''.padEnd(14)}└─ ${row.description}`);
      }
    });

    console.log('\n⚠️  If enableUnifiedEmbeddings is false, ozelgeler and danistaykararlari won\'t appear!');

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await pool.end();
  }
}

checkRAGToggles();
