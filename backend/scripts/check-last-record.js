const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env.lsemb') });

const pool = new Pool({
  host: process.env.POSTGRES_HOST || '91.99.229.96',
  port: parseInt(process.env.POSTGRES_PORT || '5432'),
  user: process.env.POSTGRES_USER || 'postgres',
  password: process.env.POSTGRES_PASSWORD,
  database: process.env.POSTGRES_DB || 'lsemb',
  ssl: false
});

async function checkLastRecord() {
  try {
    console.log('\n🔍 Checking imsdb_data migration status...\n');

    // Check source database for imsdb_data table
    const sourcePool = new Pool({
      host: process.env.POSTGRES_HOST || '91.99.229.96',
      port: parseInt(process.env.POSTGRES_PORT || '5432'),
      user: process.env.POSTGRES_USER || 'postgres',
      password: process.env.POSTGRES_PASSWORD,
      database: 'rag_chatbot', // Source database
      ssl: false
    });

    // Get total records in source
    const totalResult = await sourcePool.query('SELECT COUNT(*) as count FROM imsdb_data');
    const totalRecords = parseInt(totalResult.rows[0].count);
    console.log(`📊 Total records in imsdb_data (source): ${totalRecords}`);

    // Get embedded records count
    const embeddedResult = await pool.query(`
      SELECT COUNT(*) as count
      FROM unified_embeddings
      WHERE source_table = 'imsdb_data'
      AND embedding IS NOT NULL
    `);
    const embeddedCount = parseInt(embeddedResult.rows[0].count);
    console.log(`✅ Embedded records: ${embeddedCount}`);
    console.log(`❌ Missing records: ${totalRecords - embeddedCount}`);

    // Get records without embeddings
    const missingResult = await pool.query(`
      SELECT id, source_id, LEFT(content, 100) as preview
      FROM unified_embeddings
      WHERE source_table = 'imsdb_data'
      AND embedding IS NULL
      ORDER BY id
      LIMIT 5
    `);

    console.log('\n📋 Records without embeddings:');
    if (missingResult.rows.length === 0) {
      console.log('   ✅ No records found without embeddings in unified_embeddings');

      // Check if there are records in source not in unified_embeddings
      console.log('\n🔍 Checking for records in source but not in unified_embeddings...');

      // First get all source_ids from unified_embeddings (from lsemb database)
      const embeddedIdsResult = await pool.query(`
        SELECT source_id
        FROM unified_embeddings
        WHERE source_table = 'imsdb_data'
      `);

      const embeddedIds = embeddedIdsResult.rows.map(row => parseInt(row.source_id));
      console.log(`   Found ${embeddedIds.length} records in unified_embeddings`);

      // Now check source for records not in that list
      const notMigratedResult = await sourcePool.query(`
        SELECT id, title, LEFT(script_text, 100) as preview
        FROM imsdb_data
        WHERE id NOT IN (${embeddedIds.length > 0 ? embeddedIds.join(',') : '-1'})
        ORDER BY id
        LIMIT 5
      `);

      if (notMigratedResult.rows.length > 0) {
        console.log(`   ❌ Found ${notMigratedResult.rows.length} records not yet in unified_embeddings:`);
        notMigratedResult.rows.forEach(row => {
          console.log(`      - ID: ${row.id}, Title: ${row.title}`);
          console.log(`        Preview: ${row.preview}...`);
        });

        // Check the problematic record in detail
        console.log('\n🔍 Detailed check of missing record:');
        const problemId = notMigratedResult.rows[0].id;
        const detailResult = await sourcePool.query(`
          SELECT id, title, script_text,
                 LENGTH(script_text) as text_length,
                 script_text IS NULL as is_null
          FROM imsdb_data
          WHERE id = $1
        `, [problemId]);

        const record = detailResult.rows[0];
        console.log(`   ID: ${record.id}`);
        console.log(`   Title: ${record.title}`);
        console.log(`   script_text IS NULL: ${record.is_null}`);
        console.log(`   script_text length: ${record.text_length || 0}`);
        if (record.script_text) {
          console.log(`   Content preview: ${record.script_text.substring(0, 200)}...`);
        } else {
          console.log(`   ⚠️  NO CONTENT - This is why it wasn't migrated!`);
        }
      } else {
        console.log('   ✅ All records are in unified_embeddings');
      }
    } else {
      missingResult.rows.forEach(row => {
        console.log(`   - ID: ${row.id}, Source ID: ${row.source_id}`);
        console.log(`     Preview: ${row.preview}...`);
      });
    }

    await sourcePool.end();
    await pool.end();
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

checkLastRecord();
