const { Pool } = require('pg');

// ASEMB database connection
const asembPool = new Pool({
  host: '91.99.229.96',
  port: 5432,
  database: 'asemb',
  user: 'postgres',
  password: 'Semsiye!22',
  ssl: false
});

async function checkSourceTables() {
  console.log('=== SOURCE_TABLE VALUES IN UNIFIED_EMBEDDINGS ===\n');

  // Get all unique source_table values
  const result = await asembPool.query(`
    SELECT
      source_table,
      COUNT(*) as count,
      MIN(CAST(source_id AS INTEGER)) as min_id,
      MAX(CAST(source_id AS INTEGER)) as max_id
    FROM unified_embeddings
    GROUP BY source_table
    ORDER BY source_table
  `);

  console.log('All source_table values:');
  result.rows.forEach(row => {
    console.log(`"${row.source_table}": ${row.count} records (IDs: ${row.min_id} - ${row.max_id})`);
  });

  // Check if both Ozelgeler and Özelgeler exist
  console.log('\n=== CHECKING FOR DUPLICATE TABLES ===');
  const ozelgelerCount = result.rows.find(r => r.source_table === 'Ozelgeler')?.count || 0;
  const ozelgelerTurkishCount = result.rows.find(r => r.source_table === 'Özelgeler')?.count || 0;

  console.log(`Ozelgeler (ASCII): ${ozelgelerCount} records`);
  console.log(`Özelgeler (Turkish): ${ozelgelerTurkishCount} records`);
  console.log(`Total for ozelgeler table: ${ozelgelerCount + ozelgelerTurkishCount} records`);

  await asembPool.end();
}

checkSourceTables().catch(console.error);