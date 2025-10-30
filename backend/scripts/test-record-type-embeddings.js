const { Pool } = require('pg');
require('dotenv').config({ path: '../.env.lsemb' });

const pool = new Pool({
  host: process.env.POSTGRES_HOST || '91.99.229.96',
  port: parseInt(process.env.POSTGRES_PORT || '5432'),
  database: process.env.POSTGRES_DB || 'lsemb',
  user: process.env.POSTGRES_USER || 'postgres',
  password: process.env.POSTGRES_PASSWORD || '12Kemal1221'
});

async function testRecordTypeEmbeddings() {
  try {
    console.log('🔍 Checking record types with embeddings...\n');

    // Get count by record type with embedding status
    const result = await pool.query(`
      SELECT
        metadata->>'table' as record_type,
        COUNT(*) as total_count,
        COUNT(CASE WHEN embedding IS NOT NULL THEN 1 END) as has_embedding,
        COUNT(CASE WHEN embedding IS NULL THEN 1 END) as no_embedding
      FROM unified_embeddings
      WHERE metadata->>'table' IS NOT NULL
      GROUP BY metadata->>'table'
      ORDER BY total_count DESC
    `);

    console.log('📊 Record Types and Embedding Status:');
    console.log('─'.repeat(80));
    result.rows.forEach(row => {
      const percentage = (row.has_embedding / row.total_count * 100).toFixed(1);
      console.log(`${row.record_type.padEnd(25)} | Total: ${String(row.total_count).padStart(6)} | With Embedding: ${String(row.has_embedding).padStart(6)} (${percentage}%) | Without: ${row.no_embedding}`);
    });

    // Test a search query
    console.log('\n🔎 Testing search with "vergi" query...\n');

    const searchQuery = `
      SELECT
        metadata->>'table' as record_type,
        COUNT(*) as matching_count
      FROM unified_embeddings
      WHERE embedding IS NOT NULL
        AND metadata->>'table' IS NOT NULL
        AND content ILIKE '%vergi%'
      GROUP BY metadata->>'table'
      ORDER BY matching_count DESC
    `;

    const searchResult = await pool.query(searchQuery);
    console.log('📝 Records matching "vergi" by type:');
    searchResult.rows.forEach(row => {
      console.log(`  - ${row.record_type}: ${row.count} matches`);
    });

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await pool.end();
  }
}

testRecordTypeEmbeddings();
