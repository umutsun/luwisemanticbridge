const { asembPool } = require('../config/database.config');

async function checkData() {
  try {
    console.log('🔍 Checking database for scraped data...\n');

    // Check all tables
    console.log('=== Available Tables ===');
    let result = await asembPool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      AND (table_name LIKE '%scraped%' OR table_name LIKE '%scrape%' OR table_name LIKE '%embed%')
      ORDER BY table_name
    `);
    console.log('Tables:', result.rows.map(r => r.table_name).join(', '));

    // Check old advanced_scraped_content
    console.log('\n=== Old Tables (advanced_*) ===');
    try {
      result = await asembPool.query('SELECT COUNT(*) as count FROM advanced_scraped_content');
      console.log(`❌ advanced_scraped_content: ${result.rows[0].count} records`);

      // Show sample
      result = await asembPool.query('SELECT url, title, created_at FROM advanced_scraped_content LIMIT 3');
      console.log('Sample data:', result.rows);
    } catch (e) {
      console.log('✅ advanced_scraped_content: Not found (already cleaned)');
    }

    // Check new scraped_content
    console.log('\n=== New Tables ===');
    try {
      result = await asembPool.query('SELECT COUNT(*) as count FROM scraped_content');
      console.log(`✅ scraped_content: ${result.rows[0].count} records`);
    } catch (e) {
      console.log('❌ scraped_content: Not found');
    }

    // Check scrape_embeddings
    try {
      result = await asembPool.query('SELECT COUNT(*) as count FROM scrape_embeddings');
      console.log(`✅ scrape_embeddings: ${result.rows[0].count} records`);
    } catch (e) {
      console.log('❌ scrape_embeddings: Not found');
    }

    // Check unified_embeddings (migrated data)
    console.log('\n=== Migrated Data ===');
    try {
      result = await asembPool.query('SELECT COUNT(*) as count FROM unified_embeddings');
      console.log(`📦 unified_embeddings: ${result.rows[0].count} records`);

      // Show data by source
      result = await asembPool.query(`
        SELECT source, COUNT(*) as cnt
        FROM unified_embeddings
        GROUP BY source
        ORDER BY cnt DESC
      `);
      console.log('Data by source:');
      result.rows.forEach(row => {
        console.log(`  - ${row.source}: ${row.cnt} records`);
      });
    } catch (e) {
      console.log('❌ unified_embeddings: Not found');
    }

    // Migration status
    console.log('\n=== Migration Status ===');
    try {
      result = await asembPool.query('SELECT * FROM migration_status ORDER BY created_at DESC LIMIT 5');
      if (result.rowCount > 0) {
        console.log('Recent migrations:');
        result.rows.forEach(row => {
          console.log(`  - ${row.table_name}: ${row.status} at ${row.created_at}`);
        });
      } else {
        console.log('No migration records found');
      }
    } catch (e) {
      console.log('Migration status not available');
    }

    console.log('\n✅ Check complete!');
    await asembPool.end();

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

checkData();