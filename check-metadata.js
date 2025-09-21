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

async function checkMetadata() {
  console.log('=== CHECKING METADATA FIELD ===\n');

  // Check metadata structure for ozelgeler records
  const result = await asembPool.query(`
    SELECT
      source_table,
      metadata->>'table' as actual_table,
      COUNT(*) as count
    FROM unified_embeddings
    WHERE source_table IN ('Ozelgeler', 'Özelgeler')
    GROUP BY source_table, metadata->>'table'
    ORDER BY source_table, actual_table
  `);

  console.log('Metadata for ozelgeler variations:');
  result.rows.forEach(row => {
    console.log(`source_table: "${row.source_table}", actual_table: "${row.actual_table}", count: ${row.count}`);
  });

  await asembPool.end();
}

checkMetadata().catch(console.error);