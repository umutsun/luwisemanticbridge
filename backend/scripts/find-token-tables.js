const { Pool } = require('pg');
require('dotenv').config({ path: require('path').join(__dirname, '../../.env.lsemb') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:12Kemal1221@91.99.229.96:5432/lsemb'
});

async function findTokenTables() {
  try {
    // List all tables that might contain token data
    const result = await pool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      AND (
        table_name LIKE '%token%'
        OR table_name LIKE '%usage%'
        OR table_name LIKE '%cost%'
        OR table_name LIKE '%billing%'
        OR table_name LIKE '%stat%'
      )
      ORDER BY table_name
    `);

    console.log('Tables related to tokens/usage/cost/stats:');
    console.log('==========================================');
    if (result.rows.length > 0) {
      result.rows.forEach(row => {
        console.log('- ' + row.table_name);
      });
    } else {
      console.log('No tables found with token/usage/cost/stat in the name');
    }

    // Also check for any columns named token or cost in other tables
    const columns = await pool.query(`
      SELECT DISTINCT table_name, column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
      AND (
        column_name LIKE '%token%'
        OR column_name LIKE '%cost%'
        OR column_name LIKE '%usage%'
      )
      ORDER BY table_name, column_name
    `);

    if (columns.rows.length > 0) {
      console.log('\nColumns related to tokens/cost/usage:');
      console.log('=====================================');
      columns.rows.forEach(row => {
        console.log(`- ${row.table_name}.${row.column_name}`);
      });
    }

    await pool.end();
  } catch (error) {
    console.error('Error:', error.message);
    await pool.end();
  }
}

findTokenTables();