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

async function checkActualCounts() {
  console.log('=== ACTUAL EMBEDDED COUNTS ===\n');

  // Get all embeddings grouped by display name
  const result = await asembPool.query(`
    SELECT
      source_table,
      COUNT(*) as count,
      MIN(CAST(source_id AS INTEGER)) as min_id,
      MAX(CAST(source_id AS INTEGER)) as max_id
    FROM unified_embeddings
    GROUP BY source_table
    ORDER BY count DESC
  `);

  console.log('Current embeddings in database:');
  result.rows.forEach(row => {
    console.log(`${row.source_table}: ${row.count} records (ID range: ${row.min_id} - ${row.max_id})`);
  });

  // Also check for the actual table names
  console.log('\nChecking for actual table names:');
  const actualNames = await asembPool.query(`
    SELECT DISTINCT metadata->>'table' as actual_table, source_table as display_name
    FROM unified_embeddings
    WHERE metadata->>'table' IS NOT NULL
  `);

  actualNames.rows.forEach(row => {
    console.log(`Actual: ${row.actual_table} -> Display: ${row.display_name}`);
  });

  await asembPool.end();
}

checkActualCounts().catch(console.error);