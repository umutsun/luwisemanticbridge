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

async function checkStructure() {
  try {
    // Get one existing record
    const result = await pool.query(`
      SELECT *
      FROM unified_embeddings
      WHERE source_table = 'imsdb_data'
      LIMIT 1
    `);

    if (result.rows.length > 0) {
      console.log('\n📋 Sample record from unified_embeddings:\n');
      console.log(JSON.stringify(result.rows[0], null, 2));
      console.log('\n📊 Column names:');
      console.log(Object.keys(result.rows[0]));
    }

    await pool.end();
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

checkStructure();
