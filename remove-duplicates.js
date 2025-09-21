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

async function removeDuplicates() {
  console.log('=== REMOVING DUPLICATE EMBEDDINGS ===\n');

  // First, let's see what we're going to delete
  const checkResult = await asembPool.query(`
    SELECT
      source_table,
      COUNT(*) as count,
      MIN(CAST(source_id AS INTEGER)) as min_id,
      MAX(CAST(source_id AS INTEGER)) as max_id
    FROM unified_embeddings
    WHERE source_table = 'Ozelgeler'
    GROUP BY source_table
  `);

  if (checkResult.rows.length > 0) {
    const toDelete = checkResult.rows[0];
    console.log(`Found ${toDelete.count} records with source_table = 'Ozelgeler' (ASCII version)`);
    console.log(`ID range: ${toDelete.min_id} - ${toDelete.max_id}`);

    // Ask for confirmation
    console.log('\n⚠️  WARNING: This will permanently delete these records!');
    console.log('These are the incorrectly embedded ASCII version records.');
    console.log('The Turkish version "Özelgeler" (765 records) will be kept.\n');

    // Delete the records
    const deleteResult = await asembPool.query(`
      DELETE FROM unified_embeddings
      WHERE source_table = 'Ozelgeler'
      RETURNING id
    `);

    console.log(`✅ Successfully deleted ${deleteResult.rowCount} records`);

    // Verify the deletion
    const verifyResult = await asembPool.query(`
      SELECT
        source_table,
        COUNT(*) as count
      FROM unified_embeddings
      WHERE source_table IN ('Ozelgeler', 'Özelgeler')
      GROUP BY source_table
      ORDER BY source_table
    `);

    console.log('\nAfter deletion:');
    verifyResult.rows.forEach(row => {
      console.log(`  ${row.source_table}: ${row.count} records`);
    });
  } else {
    console.log('No ASCII version records found to delete');
  }

  await asembPool.end();
}

removeDuplicates().catch(console.error);