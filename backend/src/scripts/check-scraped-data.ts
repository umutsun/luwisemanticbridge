import pool from '../config/database';

async function checkScrapedData() {
  try {
    console.log('Checking scraped_data table structure...\n');

    // Check scraped_data structure
    const structureResult = await pool.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'scraped_data'
      AND table_schema = 'public'
      ORDER BY ordinal_position
    `);

    if (structureResult.rows.length === 0) {
      console.log('❌ scraped_data table not found');
      return;
    }

    console.log('scraped_data table structure:');
    structureResult.rows.forEach(col => {
      console.log(`  - ${col.column_name}: ${col.data_type} ${col.is_nullable === 'YES' ? '(nullable)' : '(required)'}`);
    });

    // Check record count
    const countResult = await pool.query(`
      SELECT COUNT(*) as total_count
      FROM scraped_data
    `);

    console.log(`\nTotal records in scraped_data: ${countResult.rows[0].total_count}`);

    // Check sample records
    if (countResult.rows[0].total_count > 0) {
      const samplesResult = await pool.query(`
        SELECT id, source, url, LEFT(title, 100) as title_preview, LEFT(content, 200) as content_preview
        FROM scraped_data
        LIMIT 3
      `);

      console.log('\nSample records:');
      samplesResult.rows.forEach(row => {
        console.log(`  ID: ${row.id}`);
        console.log(`  Source: ${row.source}`);
        console.log(`  URL: ${row.url}`);
        console.log(`  Title: ${row.title_preview}`);
        console.log(`  Content: ${row.content_preview}...`);
        console.log('---');
      });

      // Check for legal/vrg related content
      const legalResult = await pool.query(`
        SELECT COUNT(*) as legal_count
        FROM scraped_data
        WHERE content ILIKE '%vergi%' OR content ILIKE '%mücbir%' OR content ILIKE '%özelge%'
      `);

      console.log(`\nLegal related records: ${legalResult.rows[0].legal_count}`);
    }

  } catch (error) {
    console.error('Error checking scraped_data:', error);
  } finally {
    await pool.end();
  }
}

checkScrapedData();