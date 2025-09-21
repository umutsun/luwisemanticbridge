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

async function checkOzelgelerDuplicates() {
  console.log('=== CHECKING OZELGELERS DUPLICATES ===\n');

  // Check all records for ozelgeler table
  const result = await asembPool.query(`
    SELECT
      source_id,
      COUNT(*) as count,
      MIN(created_at) as first_created,
      MAX(created_at) as last_created
    FROM unified_embeddings
    WHERE metadata->>'table' = 'ozelgeler'
    GROUP BY source_id
    HAVING COUNT(*) > 1
    ORDER BY count DESC
    LIMIT 10
  `);

  console.log('Duplicate records in ozelgeler:');
  console.log('Source ID | Count | First Created | Last Created');
  console.log('----------|-------|---------------|-------------');

  result.rows.forEach(row => {
    console.log(`${row.source_id.toString().padStart(9)} | ${row.count.toString().padStart(5)} | ${row.first_created} | ${row.last_created}`);
  });

  // Total counts
  const totalResult = await asembPool.query(`
    SELECT
      COUNT(DISTINCT source_id) as unique_records,
      COUNT(*) as total_records
    FROM unified_embeddings
    WHERE metadata->>'table' = 'ozelgeler'
  `);

  console.log('\n=== SUMMARY ===');
  console.log(`Unique source IDs: ${totalResult.rows[0].unique_records}`);
  console.log(`Total records: ${totalResult.rows[0].total_records}`);
  console.log(`Duplicates: ${totalResult.rows[0].total_records - totalResult.rows[0].unique_records}`);

  await asembPool.end();
}

checkOzelgelerDuplicates().catch(console.error);