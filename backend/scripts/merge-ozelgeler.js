#!/usr/bin/env node
/**
 * Merge özelgeler → ozelgeler
 * Fixes Turkish character issue in source_table names
 */

const { Pool } = require('pg');
require('dotenv').config({ path: '../../.env.lsemb' });

const pool = new Pool({
  host: process.env.POSTGRES_HOST || '91.99.229.96',
  port: parseInt(process.env.POSTGRES_PORT || '5432'),
  database: process.env.POSTGRES_DB || 'lsemb',
  user: process.env.POSTGRES_USER || 'postgres',
  password: process.env.POSTGRES_PASSWORD
});

async function mergeOzelgeler() {
  const client = await pool.connect();

  try {
    console.log('🔧 Merging özelgeler → ozelgeler\n');
    console.log('═══════════════════════════════════════\n');

    // Check current state
    const before = await client.query(`
      SELECT source_table, COUNT(*) as count
      FROM unified_embeddings
      WHERE source_table IN ('ozelgeler', 'özelgeler')
      GROUP BY source_table
      ORDER BY source_table
    `);

    console.log('📋 Current state:');
    before.rows.forEach(row => {
      const bytes = Buffer.from(row.source_table, 'utf8');
      console.log(`  - '${row.source_table}': ${row.count} records [hex: ${bytes.toString('hex')}]`);
    });

    // Update özelgeler to ozelgeler
    const result = await client.query(`
      UPDATE unified_embeddings
      SET source_table = 'ozelgeler'
      WHERE source_table = 'özelgeler'
      RETURNING id
    `);

    console.log(`\n✅ Merged ${result.rowCount} records from 'özelgeler' to 'ozelgeler'\n`);

    // Verify
    const after = await client.query(`
      SELECT source_table, COUNT(*) as count
      FROM unified_embeddings
      WHERE source_table = 'ozelgeler'
      GROUP BY source_table
    `);

    console.log('📊 Final state:');
    after.rows.forEach(row => {
      console.log(`  - '${row.source_table}': ${row.count} records`);
    });

    console.log('\n═══════════════════════════════════════');
    console.log('✅ MERGE COMPLETE');
    console.log('═══════════════════════════════════════');
    console.log('All ozelgeler records are now under the correct table name.');
    console.log('Migration should now recognize all 1,001 records as embedded.\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    client.release();
    await pool.end();
  }
}

mergeOzelgeler();
