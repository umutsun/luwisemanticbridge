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

async function checkTableStructure() {
  console.log('=== UNIFIED_EMBEDDINGS TABLE STRUCTURE ===\n');

  const result = await asembPool.query(`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_name = 'unified_embeddings'
    ORDER BY ordinal_position
  `);

  console.log('Columns:');
  result.rows.forEach(row => {
    console.log(`  ${row.column_name}: ${row.data_type}`);
  });

  // Check a sample record
  console.log('\n=== SAMPLE RECORD ===');
  const sample = await asembPool.query(`
    SELECT * FROM unified_embeddings LIMIT 1
  `);

  if (sample.rows.length > 0) {
    console.log('Sample record fields:');
    Object.keys(sample.rows[0]).forEach(key => {
      console.log(`  ${key}: ${sample.rows[0][key]}`);
    });
  }

  await asembPool.end();
}

checkTableStructure().catch(console.error);