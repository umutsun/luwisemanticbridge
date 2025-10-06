const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
(async () => {
  try {
    const query = "SELECT metadata->>'table' AS table_key, source_table, COUNT(1) AS count FROM unified_embeddings GROUP BY table_key, source_table ORDER BY COUNT(1) DESC LIMIT 20";
    const res = await pool.query(query);
    console.log(res.rows);
  } catch (err) {
    console.error('db error', err);
  } finally {
    await pool.end();
  }
})();
