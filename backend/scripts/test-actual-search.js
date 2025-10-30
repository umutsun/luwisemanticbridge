const { Pool } = require('pg');
require('dotenv').config({ path: '../.env.lsemb' });

const pool = new Pool({
  host: process.env.POSTGRES_HOST || '91.99.229.96',
  port: parseInt(process.env.POSTGRES_PORT || '5432'),
  database: process.env.POSTGRES_DB || 'lsemb',
  user: process.env.POSTGRES_USER || 'postgres',
  password: process.env.POSTGRES_PASSWORD || '12Kemal1221'
});

async function testActualSearch() {
  try {
    console.log('🔍 Testing actual search behavior...\n');

    // Get similarity threshold
    const thresholdResult = await pool.query(`
      SELECT value FROM settings WHERE key = 'ragSettings.similarityThreshold'
    `);
    const threshold = parseFloat(thresholdResult.rows[0]?.value || '0.001');
    console.log(`📊 Current similarity threshold: ${threshold}\n`);

    // Test: Get a sample embedding from each record type
    const sampleQuery = `
      SELECT
        metadata->>'table' as record_type,
        COUNT(*) as total,
        COUNT(CASE WHEN embedding IS NOT NULL THEN 1 END) as with_embedding
      FROM unified_embeddings
      WHERE metadata->>'table' IN ('sorucevap', 'makaleler', 'ozelgeler', 'danistaykararlari')
      GROUP BY metadata->>'table'
      ORDER BY total DESC
    `;

    const sampleResult = await pool.query(sampleQuery);
    console.log('📦 Records by type:');
    sampleResult.rows.forEach(row => {
      console.log(`  ${row.record_type.padEnd(20)}: ${row.total} total, ${row.with_embedding} with embeddings`);
    });

    // Test with a simple keyword search first
    console.log('\n🔎 Testing keyword search (no embedding):');
    const keywordQuery = `
      SELECT
        metadata->>'table' as record_type,
        COUNT(*) as matches
      FROM unified_embeddings
      WHERE content ILIKE '%vergi%'
        AND metadata->>'table' IS NOT NULL
      GROUP BY metadata->>'table'
      ORDER BY matches DESC
    `;

    const keywordResult = await pool.query(keywordQuery);
    console.log('  Matches by type:');
    keywordResult.rows.forEach(row => {
      console.log(`    ${row.record_type.padEnd(20)}: ${row.matches} matches`);
    });

    // Check if there's a sample from ozelgeler
    console.log('\n📝 Sample from ozelgeler:');
    const ozelgeResult = await pool.query(`
      SELECT
        id,
        metadata->>'title' as title,
        LEFT(content, 200) as content_preview
      FROM unified_embeddings
      WHERE metadata->>'table' = 'ozelgeler'
      LIMIT 1
    `);

    if (ozelgeResult.rows.length > 0) {
      const sample = ozelgeResult.rows[0];
      console.log(`  ID: ${sample.id}`);
      console.log(`  Title: ${sample.title || 'N/A'}`);
      console.log(`  Content: ${sample.content_preview}...`);
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  } finally {
    await pool.end();
  }
}

testActualSearch();
