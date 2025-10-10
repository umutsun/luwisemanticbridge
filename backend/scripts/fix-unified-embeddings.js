const { Pool } = require('pg');

// ASEM database connection
const asembPool = new Pool({
  host: '91.99.229.96',
  port: 5432,
  database: 'asemb',
  user: 'postgres',
  password: 'Sems!ye!22',
  ssl: false
});

async function fixUnifiedEmbeddings() {
  const client = await asembPool.connect();
  try {
    console.log('🔧 Fixing unified_embeddings source_table names...');

    // First, let's see the current state
    console.log('\n📊 Current unified_embeddings data:');
    const currentData = await client.query(`
      SELECT source_table, COUNT(DISTINCT source_id) as record_count
      FROM unified_embeddings
      GROUP BY source_table
      ORDER BY record_count DESC
    `);

    currentData.rows.forEach(row => {
      console.log(`  ${row.source_table}: ${row.record_count} records`);
    });

    // Fix "Danıştay Kararları" to "danistaykararlari"
    const result1 = await client.query(`
      UPDATE unified_embeddings
      SET source_table = 'danistaykararlari'
      WHERE source_table = 'Danıştay Kararları'
    `);
    console.log(`\n✅ Updated ${result1.rowCount} records: "Danıştay Kararları" → "danistaykararlari"`);

    // Fix "Sorucevap" to "sorucevap" (if needed)
    const result2 = await client.query(`
      UPDATE unified_embeddings
      SET source_table = 'sorucevap'
      WHERE source_table = 'Sorucevap'
    `);
    if (result2.rowCount > 0) {
      console.log(`✅ Updated ${result2.rowCount} records: "Sorucevap" → "sorucevap"`);
    }

    // Fix "Makaleler" to "makaleler" (if needed)
    const result3 = await client.query(`
      UPDATE unified_embeddings
      SET source_table = 'makaleler'
      WHERE source_table = 'Makaleler'
    `);
    if (result3.rowCount > 0) {
      console.log(`✅ Updated ${result3.rowCount} records: "Makaleler" → "makaleler"`);
    }

    // Fix "Özelgeler" to "ozelgeler" (if needed)
    const result4 = await client.query(`
      UPDATE unified_embeddings
      SET source_table = 'ozelgeler'
      WHERE source_table = 'Özelgeler' OR source_table = 'Ozelgeler'
    `);
    if (result4.rowCount > 0) {
      console.log(`✅ Updated ${result4.rowCount} records: "Özelgeler" → "ozelgeler"`);
    }

    // Show the results after fixing
    console.log('\n📊 Updated unified_embeddings data:');
    const updatedData = await client.query(`
      SELECT source_table, COUNT(DISTINCT source_id) as record_count
      FROM unified_embeddings
      GROUP BY source_table
      ORDER BY record_count DESC
    `);

    updatedData.rows.forEach(row => {
      console.log(`  ${row.source_table}: ${row.record_count} records`);
    });

    console.log('\n🎉 unified_embeddings table has been fixed!');

  } catch (error) {
    console.error('❌ Error fixing unified_embeddings:', error);
  } finally {
    client.release();
    await asembPool.end();
  }
}

fixUnifiedEmbeddings();