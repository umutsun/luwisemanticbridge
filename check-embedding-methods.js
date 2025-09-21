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

async function checkEmbeddingMethods() {
  console.log('=== CHECKING EMBEDDING METHODS ===\n');

  const result = await asembPool.query(`
    SELECT
      source_table,
      model_used,
      COUNT(*) as count,
      MIN(created_at) as first_created,
      MAX(created_at) as last_created
    FROM unified_embeddings
    GROUP BY source_table, model_used
    ORDER BY source_table, count DESC
  `);

  console.log('Embedding methods by table:');
  let currentTable = '';
  result.rows.forEach(row => {
    if (row.source_table !== currentTable) {
      console.log(`\n${row.source_table}:`);
      currentTable = row.source_table;
    }
    console.log(`  ${row.model_used}: ${row.count} records`);
    console.log(`    First: ${row.first_created}`);
    console.log(`    Last: ${row.last_created}`);
  });

  // Check the most recent method for each table
  console.log('\n=== MOST RECENT EMBEDDING METHOD PER TABLE ===');
  const recentMethods = await asembPool.query(`
    WITH latest_embeddings AS (
      SELECT DISTINCT ON (source_table) *
      FROM unified_embeddings
      ORDER BY source_table, created_at DESC
    )
    SELECT
      source_table,
      model_used,
      created_at
    FROM latest_embeddings
    ORDER BY source_table
  `);

  recentMethods.rows.forEach(row => {
    console.log(`${row.source_table}: ${row.model_used} (at ${row.created_at})`);
  });

  await asembPool.end();
}

checkEmbeddingMethods().catch(console.error);