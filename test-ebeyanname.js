const { Pool } = require('pg');

const pool = new Pool({
  connectionString: 'postgresql://postgres:Semsiye!22@91.99.229.96:5432/lsemb'
});

async function testEbeyanname() {
  try {
    console.log('=== Testing "E-beyanname" Query ===\n');

    // 1. Keyword search for e-beyanname
    const keywordSearch = await pool.query(`
      SELECT
        metadata->>'title' as title,
        metadata->>'table' as source,
        LEFT(content, 150) as preview
      FROM unified_embeddings
      WHERE (
        content ILIKE '%e-beyanname%'
        OR content ILIKE '%ebeyanname%'
        OR content ILIKE '%elektronik beyanname%'
        OR metadata->>'title' ILIKE '%e-beyanname%'
        OR metadata->>'title' ILIKE '%ebeyanname%'
      )
      LIMIT 20
    `);

    console.log(`📊 Found ${keywordSearch.rows.length} results with keyword search:`);

    if (keywordSearch.rows.length === 0) {
      console.log('❌ NO RESULTS FOUND!');

      // Check if ANY beyanname content exists
      const beyanCheck = await pool.query(`
        SELECT COUNT(*) as count
        FROM unified_embeddings
        WHERE content ILIKE '%beyanname%'
      `);

      console.log(`\nTotal records with "beyanname": ${beyanCheck.rows[0].count}`);
    } else {
      keywordSearch.rows.forEach((r, i) => {
        console.log(`\n${i + 1}. ${r.title || 'No title'}`);
        console.log(`   Source: ${r.source}`);
        console.log(`   Preview: ${r.preview}...`);
      });
    }

    await pool.end();
  } catch (err) {
    console.error('❌ Error:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
}

testEbeyanname();
