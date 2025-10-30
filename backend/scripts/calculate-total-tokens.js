const { Pool } = require('pg');
require('dotenv').config({ path: require('path').join(__dirname, '../../.env.lsemb') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:12Kemal1221@91.99.229.96:5432/lsemb'
});

async function calculateTotalTokens() {
  try {
    // This is the exact query used in dashboard.routes.ts
    const result = await pool.query(`
      WITH token_summary AS (
        -- Get tokens from unified_embeddings
        SELECT
          COALESCE(SUM(tokens_used), 0) as total_tokens,
          0 as total_cost,
          0 as unique_sessions
        FROM unified_embeddings
        WHERE tokens_used IS NOT NULL

        UNION ALL

        -- Get tokens and cost from documents
        SELECT
          COALESCE(SUM(tokens_used), 0) as total_tokens,
          COALESCE(SUM(cost_usd), 0) as total_cost,
          0 as unique_sessions
        FROM documents
        WHERE tokens_used IS NOT NULL
      )
      SELECT
        SUM(total_tokens) as total_tokens,
        SUM(total_cost) as total_cost,
        0 as unique_sessions
      FROM token_summary
    `);

    console.log('========================================');
    console.log('TOKEN USAGE DATA FOR DASHBOARD');
    console.log('========================================');
    console.log('Total Tokens:', parseInt(result.rows[0].total_tokens).toLocaleString());
    console.log('Total Cost: $' + parseFloat(result.rows[0].total_cost).toFixed(4));
    console.log('\nThis data should appear in the dashboard\'s');
    console.log('top-right "Token Kullanımı" card.');
    console.log('========================================');

    // Also check for other related statistics
    const [convResult, msgResult, embResult, docResult] = await Promise.all([
      pool.query('SELECT COUNT(*) as count FROM conversations'),
      pool.query('SELECT COUNT(*) as count FROM messages'),
      pool.query('SELECT COUNT(*) as count FROM embeddings'),
      pool.query('SELECT COUNT(*) as count FROM documents')
    ]);

    console.log('\nOther Dashboard Statistics:');
    console.log('============================');
    console.log('Total Conversations:', convResult.rows[0].count);
    console.log('Total Messages:', msgResult.rows[0].count);
    console.log('Total Embeddings:', embResult.rows[0].count);
    console.log('Total Documents:', docResult.rows[0].count);

    await pool.end();
  } catch (error) {
    console.error('Error:', error.message);
    await pool.end();
  }
}

calculateTotalTokens();