// _temp_db_query.js
require('dotenv').config({ path: '.env.test' });
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

pool.query('SELECT COUNT(*) FROM unified_embeddings;')
  .then(res => {
    console.log('Total rows in unified_embeddings:', res.rows[0].count);
    pool.end();
  })
  .catch(err => {
    console.error('Database query error:', err);
    pool.end();
  });
