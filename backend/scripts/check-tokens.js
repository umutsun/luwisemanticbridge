const { Pool } = require('pg');
require('dotenv').config({ path: require('path').join(__dirname, '../../.env.lsemb') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:12Kemal1221@91.99.229.96:5432/lsemb'
});

async function checkTokenUsage() {
  try {
    // Check if token_usage table exists and has data
    const result = await pool.query(`
      SELECT
        COUNT(*) as count,
        COALESCE(SUM(prompt_tokens + completion_tokens), 0) as total_tokens,
        COALESCE(SUM(cost_usd), 0) as total_cost
      FROM token_usage
    `);

    console.log('Token Usage Table Stats:');
    console.log('========================');
    console.log('Total Records:', result.rows[0].count);
    console.log('Total Tokens Used:', parseInt(result.rows[0].total_tokens).toLocaleString());
    console.log('Total Cost: $', parseFloat(result.rows[0].total_cost).toFixed(4));

    // Get recent records
    const recent = await pool.query(`
      SELECT model, prompt_tokens, completion_tokens, cost_usd, created_at
      FROM token_usage
      ORDER BY created_at DESC
      LIMIT 5
    `);

    if (recent.rows.length > 0) {
      console.log('\nLast 5 Token Usage Records:');
      console.log('===========================');
      recent.rows.forEach(row => {
        const totalTokens = (row.prompt_tokens || 0) + (row.completion_tokens || 0);
        const cost = row.cost_usd ? row.cost_usd.toFixed(4) : '0.0000';
        console.log(`- ${row.model}: ${totalTokens} tokens ($${cost})`);
      });
    } else {
      console.log('\nNo token usage records found in the database.');
    }

    await pool.end();
  } catch (error) {
    console.error('Error:', error.message);
    await pool.end();
  }
}

checkTokenUsage();