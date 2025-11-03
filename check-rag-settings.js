const { Pool } = require('pg');

const pool = new Pool({
  host: '91.99.229.96',
  port: 5432,
  database: 'lsemb',
  user: 'postgres',
  password: '12Kemal1221'
});

async function checkSettings() {
  try {
    console.log('=== Checking RAG Settings in Production ===\n');

    const result = await pool.query(`
      SELECT key, value
      FROM settings
      WHERE key LIKE '%ragSettings%'
         OR key LIKE '%similarityThreshold%'
         OR key LIKE '%activeChatModel%'
         OR key LIKE '%maxResults%'
         OR key LIKE '%minResults%'
      ORDER BY key
    `);

    console.log('Current RAG Settings:');
    result.rows.forEach(r => {
      console.log(`  ${r.key}: ${r.value}`);
    });

    // Check for problematic values
    console.log('\n=== Analysis ===');
    const threshold = result.rows.find(r => r.key.includes('similarityThreshold'));
    if (threshold) {
      const val = parseFloat(threshold.value);
      if (val < 0.15) {
        console.log(`⚠️  WARNING: Similarity threshold is ${val} (${val * 100}%) - TOO LOW!`);
        console.log(`   Recommended: 0.25 (25%)`);
      } else if (val > 0.4) {
        console.log(`⚠️  WARNING: Similarity threshold is ${val} (${val * 100}%) - TOO HIGH!`);
        console.log(`   Recommended: 0.25 (25%)`);
      } else {
        console.log(`✅ Similarity threshold is ${val} (${val * 100}%) - GOOD`);
      }
    }

    await pool.end();
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
}

checkSettings();
