#!/usr/bin/env node
/**
 * Fix Source Table Casing Issue
 * Normalizes all source_table values to lowercase
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

async function fixCasing() {
  const client = await pool.connect();

  try {
    console.log('🔧 Fixing source_table Casing Issue\n');
    console.log('═══════════════════════════════════════\n');

    // Check current state
    const before = await client.query(`
      SELECT source_table, COUNT(*) as count
      FROM unified_embeddings
      GROUP BY source_table
      HAVING source_table != LOWER(source_table)
      ORDER BY source_table
    `);

    if (before.rows.length === 0) {
      console.log('✅ No casing issues found. All source_table values are already normalized.\n');
      return;
    }

    console.log('📋 Tables with non-lowercase names:');
    before.rows.forEach(row => {
      console.log(`  - '${row.source_table}' → '${row.source_table.toLowerCase()}' (${row.count} records)`);
    });

    // Check for potential conflicts
    console.log('\n⚠️  Checking for potential conflicts...');
    for (const row of before.rows) {
      const lowercase = row.source_table.toLowerCase();
      const conflict = await client.query(`
        SELECT COUNT(*) as count
        FROM unified_embeddings
        WHERE source_table = $1
      `, [lowercase]);

      if (parseInt(conflict.rows[0].count) > 0) {
        console.log(`  ⚠️  '${lowercase}' already has ${conflict.rows[0].count} records`);
        console.log(`     Merging '${row.source_table}' (${row.count}) → '${lowercase}'`);
      }
    }

    console.log('\n🔄 Starting normalization...\n');

    // Normalize all source_table values to lowercase
    const result = await client.query(`
      UPDATE unified_embeddings
      SET source_table = LOWER(source_table)
      WHERE source_table != LOWER(source_table)
      RETURNING id, source_table
    `);

    console.log(`✅ Updated ${result.rowCount} records\n`);

    // Verify the fix
    const after = await client.query(`
      SELECT source_table, COUNT(*) as count
      FROM unified_embeddings
      GROUP BY source_table
      ORDER BY source_table
    `);

    console.log('📊 Final state:');
    after.rows.forEach(row => {
      console.log(`  - ${row.source_table}: ${row.count} records`);
    });

    console.log('\n═══════════════════════════════════════');
    console.log('✅ CASING ISSUE FIXED');
    console.log('═══════════════════════════════════════');
    console.log('All source_table values are now normalized to lowercase.');
    console.log('Migration should now work correctly without duplicates.\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
  } finally {
    client.release();
    await pool.end();
  }
}

fixCasing();
