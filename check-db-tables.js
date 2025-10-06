const { Pool } = require('pg');
require('dotenv').config();

// Create a pool to check the database
const checkPool = new Pool({
  host: process.env.POSTGRES_HOST || '91.99.229.96',
  port: parseInt(process.env.POSTGRES_PORT || '5432'),
  database: process.env.POSTGRES_DB || 'asemb',
  user: process.env.POSTGRES_USER || 'postgres',
  password: process.env.POSTGRES_PASSWORD || 'Semsiye!22',
  ssl: process.env.POSTGRES_SSL === 'true' ? { rejectUnauthorized: false } : false
});

async function checkTables() {
  try {
    console.log('Checking database connection...');
    await checkPool.query('SELECT NOW()');
    console.log('✅ Database connected');

    console.log('Checking for unified_embeddings table...');
    const tableCheck = await checkPool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name = 'unified_embeddings'
    `);

    console.log('Table exists:', tableCheck.rows.length > 0);

    if (tableCheck.rows.length > 0) {
      console.log('✅ unified_embeddings table found');

      // Check if it has data
      const countCheck = await checkPool.query('SELECT COUNT(*) as count FROM unified_embeddings');
      console.log('Records in unified_embeddings:', countCheck.rows[0].count);

      // Check structure
      const structure = await checkPool.query(`
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_name = 'unified_embeddings'
        ORDER BY ordinal_position
      `);
      console.log('Table structure:');
      structure.rows.forEach(row => {
        console.log(`  - ${row.column_name}: ${row.data_type}`);
      });
    } else {
      console.log('❌ unified_embeddings table not found');

      // Check what tables do exist
      const allTables = await checkPool.query(`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
        ORDER BY table_name
      `);
      console.log('Available tables:');
      allTables.rows.forEach(row => {
        console.log(`  - ${row.table_name}`);
      });
    }

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await checkPool.end();
    process.exit(0);
  }
}

checkTables();