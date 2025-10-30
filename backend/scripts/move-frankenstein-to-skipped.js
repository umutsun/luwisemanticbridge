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

async function moveFrankensteinToSkipped() {
  try {
    console.log('\n🔧 Moving Frankenstein record to skipped_embeddings...\n');

    // Insert into skipped_embeddings
    const result = await pool.query(`
      INSERT INTO skipped_embeddings (
        source_table,
        source_type,
        source_id,
        source_name,
        content,
        skip_reason,
        metadata
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (source_table, source_id) DO UPDATE SET
        skip_reason = EXCLUDED.skip_reason,
        metadata = EXCLUDED.metadata,
        updated_at = CURRENT_TIMESTAMP
      RETURNING id
    `, [
      'imsdb_data',
      'document',
      '84',
      'Frankenstein',
      '[No content available]',
      'no_content',
      JSON.stringify({
        note: 'Skipped - no content in source table (script_text is NULL)',
        original_title: 'Frankenstein',
        skipped_at: new Date().toISOString(),
        moved_manually: true
      })
    ]);

    if (result.rows.length > 0) {
      console.log(`✅ Record moved to skipped_embeddings with ID: ${result.rows[0].id}`);
    } else {
      console.log(`ℹ️  Record already exists in skipped_embeddings (updated instead)`);
    }

    // Verify
    const verify = await pool.query(`
      SELECT * FROM skipped_embeddings
      WHERE source_table = 'imsdb_data' AND source_id = '84'
    `);

    console.log('\n📋 Record in skipped_embeddings:');
    console.log(`   Source: ${verify.rows[0].source_table}`);
    console.log(`   ID: ${verify.rows[0].source_id}`);
    console.log(`   Name: ${verify.rows[0].source_name}`);
    console.log(`   Reason: ${verify.rows[0].skip_reason}`);
    console.log(`   Created: ${verify.rows[0].created_at}`);

    // Check migration stats
    const stats = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE embedding IS NOT NULL) as embedded,
        COUNT(*) as total
      FROM unified_embeddings
      WHERE source_table = 'imsdb_data'
    `);

    const skippedCount = await pool.query(`
      SELECT COUNT(*) as count
      FROM skipped_embeddings
      WHERE source_table = 'imsdb_data'
    `);

    console.log('\n📊 Migration stats for imsdb_data:');
    console.log(`   Embedded: ${stats.rows[0].embedded}`);
    console.log(`   Total in unified_embeddings: ${stats.rows[0].total}`);
    console.log(`   Skipped: ${skippedCount.rows[0].count}`);
    console.log(`   Grand total: ${parseInt(stats.rows[0].total) + parseInt(skippedCount.rows[0].count)}`);

    await pool.end();
    console.log('\n✅ Done!');
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('Stack:', error.stack);
    await pool.end();
    process.exit(1);
  }
}

moveFrankensteinToSkipped();
