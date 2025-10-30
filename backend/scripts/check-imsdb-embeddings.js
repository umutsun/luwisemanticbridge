const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env.lsemb') });

const targetPool = new Pool({
  host: '91.99.229.96',
  port: 5432,
  user: 'postgres',
  password: '12Kemal1221',
  database: 'lsemb',
  ssl: false
});

const sourcePool = new Pool({
  host: '91.99.229.96',
  port: 5432,
  user: 'postgres',
  password: '12Kemal1221',
  database: 'rag_chatbot',
  ssl: false
});

async function checkImsdbData() {
  try {
    console.log('\n🔍 Checking imsdb_data table embeddings...\n');

    // Check if imsdb_data table exists in source
    const tableCheck = await sourcePool.query(`
      SELECT COUNT(*) as count FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'imsdb_data'
    `);

    if (tableCheck.rows[0].count === '0') {
      console.log('❌ imsdb_data table does NOT exist in source database');
      return;
    }

    // Get total records in imsdb_data
    const totalResult = await sourcePool.query('SELECT COUNT(*) as count FROM imsdb_data');
    const totalRecords = parseInt(totalResult.rows[0].count);
    console.log(`📊 Total records in imsdb_data: ${totalRecords}`);

    // Check unified_embeddings for imsdb_data
    const embeddedResult = await targetPool.query(`
      SELECT COUNT(*) as count, source_table
      FROM unified_embeddings
      WHERE source_table LIKE '%imsdb%'
      GROUP BY source_table
    `);

    console.log('\n📦 Embeddings in unified_embeddings:');
    if (embeddedResult.rows.length === 0) {
      console.log('   ❌ NO embeddings found for imsdb_data');
    } else {
      embeddedResult.rows.forEach(row => {
        console.log(`   ✅ source_table: "${row.source_table}" → ${row.count} embeddings`);
      });
    }

    // Check what source_table values exist
    console.log('\n🔍 All source_table values in unified_embeddings:');
    const allSourceTables = await targetPool.query(`
      SELECT DISTINCT source_table
      FROM unified_embeddings
      ORDER BY source_table
    `);
    allSourceTables.rows.forEach(row => {
      console.log(`   - "${row.source_table}"`);
    });

    // Check if there are any embeddings with normalized name
    console.log('\n🔍 Checking for normalized names:');
    const variations = [
      'imsdb_data',
      'Imsdb_Data',
      'IMSDB_DATA',
      'imsdb data',
      'imsdbdata'
    ];

    for (const variation of variations) {
      const result = await targetPool.query(
        'SELECT COUNT(*) as count FROM unified_embeddings WHERE source_table = $1',
        [variation]
      );
      if (parseInt(result.rows[0].count) > 0) {
        console.log(`   ✅ Found ${result.rows[0].count} embeddings with source_table = "${variation}"`);
      }
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('Stack:', error.stack);
  } finally {
    try {
      await sourcePool.end();
      await targetPool.end();
    } catch (e) {
      // Ignore close errors
    }
  }
}

checkImsdbData().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
