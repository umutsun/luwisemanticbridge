const { Pool } = require('pg');
require('dotenv').config({ path: require('path').join(__dirname, '../../.env.lsemb') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:12Kemal1221@91.99.229.96:5432/lsemb'
});

async function checkActualTokenUsage() {
  try {
    console.log('Checking token usage across different tables...\n');

    // Check unified_embeddings table
    const unifiedResult = await pool.query(`
      SELECT
        COUNT(*) as count,
        COALESCE(SUM(tokens_used), 0) as total_tokens
      FROM unified_embeddings
      WHERE tokens_used IS NOT NULL
    `);

    console.log('1. Unified Embeddings Table:');
    console.log('============================');
    console.log('Total Records with tokens:', unifiedResult.rows[0].count);
    console.log('Total Tokens Used:', parseInt(unifiedResult.rows[0].total_tokens).toLocaleString());

    // Check documents table
    const docsResult = await pool.query(`
      SELECT
        COUNT(*) as count,
        COALESCE(SUM(tokens_used), 0) as total_tokens,
        COALESCE(SUM(cost_usd), 0) as total_cost
      FROM documents
      WHERE tokens_used IS NOT NULL
    `);

    console.log('\n2. Documents Table:');
    console.log('===================');
    console.log('Total Records with tokens:', docsResult.rows[0].count);
    console.log('Total Tokens Used:', parseInt(docsResult.rows[0].total_tokens).toLocaleString());
    console.log('Total Cost: $', parseFloat(docsResult.rows[0].total_cost).toFixed(4));

    // Check embedding_stats table
    const statsResult = await pool.query(`
      SELECT
        total_tokens_used,
        estimated_cost,
        created_at
      FROM embedding_stats
      ORDER BY created_at DESC
      LIMIT 1
    `);

    if (statsResult.rows.length > 0) {
      console.log('\n3. Latest Embedding Stats:');
      console.log('==========================');
      console.log('Total Tokens Used:', parseInt(statsResult.rows[0].total_tokens_used || 0).toLocaleString());
      console.log('Estimated Cost: $', parseFloat(statsResult.rows[0].estimated_cost || 0).toFixed(4));
      console.log('Last Updated:', statsResult.rows[0].created_at);
    }

    // Check migration_statistics table
    const migrationResult = await pool.query(`
      SELECT
        total_tokens_used,
        total_cost
      FROM migration_statistics
      ORDER BY created_at DESC
      LIMIT 1
    `);

    if (migrationResult.rows.length > 0) {
      console.log('\n4. Migration Statistics:');
      console.log('========================');
      console.log('Total Tokens Used:', parseInt(migrationResult.rows[0].total_tokens_used || 0).toLocaleString());
      console.log('Total Cost: $', parseFloat(migrationResult.rows[0].total_cost || 0).toFixed(4));
    }

    // Calculate grand total
    const grandTotal = await pool.query(`
      WITH token_summary AS (
        SELECT COALESCE(SUM(tokens_used), 0) as tokens FROM unified_embeddings WHERE tokens_used IS NOT NULL
        UNION ALL
        SELECT COALESCE(SUM(tokens_used), 0) as tokens FROM documents WHERE tokens_used IS NOT NULL
      )
      SELECT SUM(tokens) as grand_total FROM token_summary
    `);

    console.log('\n5. GRAND TOTAL:');
    console.log('===============');
    console.log('All Tokens Combined:', parseInt(grandTotal.rows[0].grand_total).toLocaleString());

    await pool.end();
  } catch (error) {
    console.error('Error:', error.message);
    await pool.end();
  }
}

checkActualTokenUsage();