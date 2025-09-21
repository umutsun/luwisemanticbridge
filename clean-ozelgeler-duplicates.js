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

async function cleanOzelgelerDuplicates() {
  console.log('=== CLEANING OZELGELERS DUPLICATES ===\n');

  // Find duplicates (keep the newest record for each source_id)
  const duplicatesToDelete = await asembPool.query(`
    WITH duplicates AS (
      SELECT
        id,
        source_id,
        created_at,
        ROW_NUMBER() OVER (PARTITION BY source_id ORDER BY created_at DESC) as rn
      FROM unified_embeddings
      WHERE metadata->>'table' = 'ozelgeler'
    )
    SELECT id
    FROM duplicates
    WHERE rn > 1
  `);

  console.log(`Found ${duplicatesToDelete.rows.length} duplicate records to delete`);

  if (duplicatesToDelete.rows.length === 0) {
    console.log('No duplicates to clean');
    await asembPool.end();
    return;
  }

  // Show some examples
  console.log('\nFirst 10 duplicate IDs to delete:');
  duplicatesToDelete.rows.slice(0, 10).forEach((row, i) => {
    console.log(`  ${i + 1}. ID: ${row.id}`);
  });

  // Delete duplicates
  console.log('\nDeleting duplicates...');
  const deleteResult = await asembPool.query(`
    DELETE FROM unified_embeddings
    WHERE id IN (
      SELECT id
      FROM (
        SELECT
          id,
          ROW_NUMBER() OVER (PARTITION BY source_id ORDER BY created_at DESC) as rn
        FROM unified_embeddings
        WHERE metadata->>'table' = 'ozelgeler'
      ) duplicates
      WHERE rn > 1
    )
    RETURNING id
  `);

  console.log(`✅ Successfully deleted ${deleteResult.rowCount} duplicate records`);

  // Verify the cleanup
  const verifyResult = await asembPool.query(`
    SELECT
      COUNT(DISTINCT source_id) as unique_records,
      COUNT(*) as total_records
    FROM unified_embeddings
    WHERE metadata->>'table' = 'ozelgeler'
  `);

  console.log('\n=== AFTER CLEANUP ===');
  console.log(`Unique source IDs: ${verifyResult.rows[0].unique_records}`);
  console.log(`Total records: ${verifyResult.rows[0].total_records}`);
  console.log(`Duplicates remaining: ${verifyResult.rows[0].total_records - verifyResult.rows[0].unique_records}`);

  await asembPool.end();
}

cleanOzelgelerDuplicates().catch(console.error);