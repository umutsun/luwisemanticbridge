const { Pool } = require('pg');
require('dotenv').config({ path: '../.env.lsemb' });

const pool = new Pool({
  host: process.env.POSTGRES_HOST || '91.99.229.96',
  port: parseInt(process.env.POSTGRES_PORT || '5432'),
  database: process.env.POSTGRES_DB || 'lsemb',
  user: process.env.POSTGRES_USER || 'postgres',
  password: process.env.POSTGRES_PASSWORD || '12Kemal1221'
});

async function checkTableStructure() {
  try {
    console.log('🔍 Checking unified_embeddings table structure...\n');

    // Get column names
    const columns = await pool.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'unified_embeddings'
      ORDER BY ordinal_position
    `);

    console.log('📊 Table Columns:');
    columns.rows.forEach(col => {
      console.log(`  - ${col.column_name} (${col.data_type}) ${col.is_nullable === 'NO' ? 'NOT NULL' : 'NULL'}`);
    });

    // Sample data
    console.log('\n📝 Sample Data:');
    const sample = await pool.query(`
      SELECT id, source_table, source_id, metadata
      FROM unified_embeddings
      LIMIT 3
    `);

    sample.rows.forEach((row, i) => {
      console.log(`\n  Record ${i + 1}:`);
      console.log(`    ID: ${row.id}`);
      console.log(`    Source Table: ${row.source_table}`);
      console.log(`    Source ID: ${row.source_id}`);
      console.log(`    Metadata Table: ${row.metadata?.table || 'N/A'}`);
    });

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await pool.end();
  }
}

checkTableStructure();
