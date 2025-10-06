const { asembPool } = require('./src/config/database.config');
const pool = require('./src/config/database').default;

async function checkTables() {
  try {
    console.log('=== Checking unified_embeddings table ===');
    const unifiedCheck = await asembPool.query('SELECT COUNT(*) as total FROM unified_embeddings');
    console.log('Total unified_embeddings records:', unifiedCheck.rows[0].total);
    
    const sourceTables = await asembPool.query('SELECT source_table, COUNT(*) as count FROM unified_embeddings GROUP BY source_table');
    console.log('\nBy source table:');
    if (sourceTables.rows.length === 0) {
      console.log('- No records found in unified_embeddings');
    } else {
      sourceTables.rows.forEach(row => console.log(`- ${row.source_table}: ${row.count}`));
    }
    
    console.log('\n=== Checking customer database tables ===');
    const tables = ['Soru-Cevap', 'Özelgeler', 'Makaleler', 'Danıştay Kararları'];
    for (const table of tables) {
      try {
        const result = await pool.query(`SELECT COUNT(*) as count FROM "${table}"`);
        console.log(`- ${table}: ${result.rows[0].count} records`);
      } catch (err) {
        console.log(`- ${table}: Error - ${err.message}`);
      }
    }
    
    // Check if unified_embeddings has actual embeddings
    const embeddingCheck = await asembPool.query('SELECT COUNT(*) as count FROM unified_embeddings WHERE embedding IS NOT NULL');
    console.log(`\nRecords with embeddings: ${embeddingCheck.rows[0].count}`);
    
    // Get sample records
    if (unifiedCheck.rows[0].total > 0) {
      const sampleResults = await asembPool.query('SELECT source_table, source_id, LEFT(content, 100) as content_preview FROM unified_embeddings LIMIT 5');
      console.log('\n=== Sample records ===');
      sampleResults.rows.forEach(row => console.log(`- ${row.source_table} (ID: ${row.source_id}): ${row.content_preview}`));
    }
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkTables();