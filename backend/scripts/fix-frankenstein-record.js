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

async function fixFrankensteinRecord() {
  try {
    console.log('\n🔧 Fixing Frankenstein record (ID 84)...\n');

    // Insert placeholder record for ID 84
    const result = await pool.query(`
      INSERT INTO unified_embeddings (source_table, source_type, source_id, source_name, content, embedding, metadata)
      VALUES ($1, $2, $3, $4, $5, NULL, $6)
      ON CONFLICT (source_table, source_id) DO NOTHING
      RETURNING id
    `, [
      'imsdb_data',
      'document',
      '84',
      'Frankenstein',
      '[No content available]',
      JSON.stringify({ note: 'Skipped - no content in source table (script_text is NULL)' })
    ]);

    if (result.rows.length > 0) {
      console.log(`✅ Placeholder record created with ID: ${result.rows[0].id}`);
    } else {
      console.log(`ℹ️  Record already exists (conflict resolved with DO NOTHING)`);
    }

    // Verify the fix
    const verifyResult = await pool.query(`
      SELECT COUNT(*) as count
      FROM unified_embeddings
      WHERE source_table = 'imsdb_data'
    `);

    console.log(`\n📊 Total records in unified_embeddings for imsdb_data: ${verifyResult.rows[0].count}`);

    await pool.end();
    console.log('\n✅ Done!');
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

fixFrankensteinRecord();
