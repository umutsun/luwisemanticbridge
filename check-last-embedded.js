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

async function checkLastEmbedded() {
  console.log('=== CHECKING LAST EMBEDDED RECORDS ===\n');

  // Get latest embedded records for each table
  const result = await asembPool.query(`
    WITH latest_records AS (
      SELECT DISTINCT ON (metadata->>'table') *
      FROM unified_embeddings
      WHERE metadata->>'table' IS NOT NULL
      ORDER BY metadata->>'table', created_at DESC
    )
    SELECT
      metadata->>'table' as table_name,
      source_id,
      created_at,
      model_used
    FROM latest_records
    ORDER BY created_at DESC
  `);

  console.log('Last embedded records by table:');
  console.log('Table Name | Source ID | Created At | Model Used');
  console.log('-----------|-----------|------------|-----------');

  result.rows.forEach(row => {
    console.log(`${row.table_name.padEnd(10)} | ${row.source_id.toString().padEnd(9)} | ${row.created_at} | ${row.model_used}`);
  });

  // Also check where we left off for each table
  console.log('\n=== EMBEDDING PROGRESS BY TABLE ===');
  const progressResult = await asembPool.query(`
    SELECT
      metadata->>'table' as table_name,
      COUNT(*) as total_embedded,
      MAX(source_id) as max_source_id,
      MIN(created_at) as first_embedded,
      MAX(created_at) as last_embedded
    FROM unified_embeddings
    WHERE metadata->>'table' IS NOT NULL
    GROUP BY metadata->>'table'
    ORDER BY last_embedded DESC
  `);

  progressResult.rows.forEach(row => {
    console.log(`\n${row.table_name}:`);
    console.log(`  Total embedded: ${row.total_embedded}`);
    console.log(`  Last source ID: ${row.max_source_id}`);
    console.log(`  Last embedded: ${row.last_embedded}`);
  });

  await asembPool.end();
}

checkLastEmbedded().catch(console.error);