const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:Semsiye!22@91.99.229.96:5432/lsemb'
});

async function testKeywordSearch() {
  try {
    console.log('=== Testing Keyword Search for "KDV iade" ===\n');

    const result = await pool.query(`
      SELECT
        metadata->>'title' as title,
        metadata->>'table' as source,
        LEFT(content, 150) as preview
      FROM unified_embeddings
      WHERE (
        content ILIKE '%KDV%iade%'
        OR content ILIKE '%iade%KDV%'
        OR metadata->>'title' ILIKE '%KDV%iade%'
        OR metadata->>'title' ILIKE '%iade%KDV%'
      )
      LIMIT 20
    `);

    console.log(`Found ${result.rows.length} results:`);
    result.rows.forEach((r, i) => {
      console.log(`\n${i + 1}. ${r.title || 'No title'}`);
      console.log(`   Source: ${r.source}`);
      console.log(`   Preview: ${r.preview}...`);
    });

    if (result.rows.length === 0) {
      console.log('\n❌ NO RESULTS! Checking if ANY KDV content exists...\n');

      const kdvCheck = await pool.query(`
        SELECT COUNT(*) as count
        FROM unified_embeddings
        WHERE content ILIKE '%KDV%'
      `);

      console.log(`Total records with "KDV": ${kdvCheck.rows[0].count}`);
    } else {
      console.log(`\n✅ Found ${result.rows.length} records about KDV iade`);
    }

    await pool.end();
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
}

testKeywordSearch();
