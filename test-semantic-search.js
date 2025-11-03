const { Pool } = require('pg');

// Use environment variable or default
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:Semsiye!22@91.99.229.96:5432/lsemb'
});

async function testSemanticSearch() {
  try {
    console.log('=== Testing Semantic Search ===\n');

    // Check unified_embeddings count
    const countResult = await pool.query(`
      SELECT
        metadata->>'table' as source_table,
        COUNT(*) as count
      FROM unified_embeddings
      GROUP BY metadata->>'table'
      ORDER BY count DESC
    `);

    console.log('Unified Embeddings Count by Source:');
    countResult.rows.forEach(r => {
      console.log(`  ${r.source_table}: ${r.count} records`);
    });

    // Test a simple search query with low threshold
    console.log('\n=== Testing Search: "KDV iade işlemleri" ===');

    const searchResult = await pool.query(`
      SELECT
        metadata->>'title' as title,
        metadata->>'table' as source,
        LEFT(content, 100) as preview,
        1 - (embedding <=> '[0.1,0.2,0.3]'::vector) as similarity
      FROM unified_embeddings
      WHERE metadata->>'table' IN ('sorucevap', 'makaleler', 'ozelgeler', 'danistaykararlari')
        AND (
          content ILIKE '%KDV%'
          OR content ILIKE '%iade%'
          OR metadata->>'title' ILIKE '%KDV%'
          OR metadata->>'title' ILIKE '%iade%'
        )
      ORDER BY similarity DESC
      LIMIT 10
    `);

    console.log(`Found ${searchResult.rows.length} results with keyword match:`);
    searchResult.rows.forEach((r, i) => {
      console.log(`\n${i + 1}. ${r.title || 'No title'}`);
      console.log(`   Source: ${r.source}`);
      console.log(`   Preview: ${r.preview}...`);
      console.log(`   Similarity: ${(r.similarity * 100).toFixed(2)}%`);
    });

    if (searchResult.rows.length === 0) {
      console.log('\n❌ NO RESULTS FOUND!');
      console.log('This means there might be no data in unified_embeddings for KDV queries.');
    }

    await pool.end();
  } catch (err) {
    console.error('❌ Error:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
}

testSemanticSearch();
