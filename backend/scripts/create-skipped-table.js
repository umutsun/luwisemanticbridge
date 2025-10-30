const { Pool } = require('pg');
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '../../.env.lsemb') });

const pool = new Pool({
  host: process.env.POSTGRES_HOST || '91.99.229.96',
  port: parseInt(process.env.POSTGRES_PORT || '5432'),
  user: process.env.POSTGRES_USER || 'postgres',
  password: process.env.POSTGRES_PASSWORD,
  database: process.env.POSTGRES_DB || 'lsemb',
  ssl: false
});

async function createSkippedTable() {
  try {
    console.log('\n🔧 Creating skipped_embeddings table...\n');

    const sql = fs.readFileSync(
      path.join(__dirname, 'create-skipped-embeddings-table.sql'),
      'utf8'
    );

    await pool.query(sql);

    console.log('✅ Table created successfully!');

    // Check if table exists
    const result = await pool.query(`
      SELECT COUNT(*) as count
      FROM information_schema.tables
      WHERE table_name = 'skipped_embeddings'
    `);

    console.log(`\n📊 Table exists: ${result.rows[0].count === '1' ? 'Yes' : 'No'}`);

    await pool.end();
  } catch (error) {
    console.error('❌ Error:', error.message);
    await pool.end();
    process.exit(1);
  }
}

createSkippedTable();
