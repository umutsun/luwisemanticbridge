const { Pool } = require('pg');
require('dotenv').config();

const asembDbConfig = {
  host: process.env.ASEMB_DB_HOST || 'localhost',
  port: parseInt(process.env.ASEMB_DB_PORT || '5432'),
  database: process.env.ASEMB_DB_NAME || 'asemb',
  user: process.env.ASEMB_DB_USER || 'postgres',
  password: process.env.ASEMB_DB_PASSWORD || 'postgres',
  ssl: process.env.ASEMB_DB_SSL === 'true' ? { rejectUnauthorized: false } : false
};
const pool = new Pool({ ...asembDbConfig, max: 1 });

async function check() {
  const client = await pool.connect();
  try {
    // Check stats endpoint query
    console.log('=== Stats Endpoint Query ===');
    const result = await client.query(`
      SELECT
        COUNT(*) as totalEmbeddings,
        COUNT(DISTINCT source_table) as tablesProcessed
      FROM unified_embeddings
      WHERE source_type = 'database'
    `);
    console.log('Stats result:', result.rows[0]);

    // Check individual table counts the way tables endpoint does
    console.log('\n=== Individual Table Counts ===');
    const tables = ['ozelgeler', 'makaleler', 'sorucevap', 'danistaykararlari', 'chat_history'];
    let totalEmbedded = 0;

    for (const table of tables) {
      const tableResult = await client.query(`
        SELECT COUNT(*) as embedded
        FROM unified_embeddings
        WHERE source_type = 'database'
        AND (
          source_table = $1
          OR metadata->>'table' = $2
        )
      `, [table, table]);

      const count = parseInt(tableResult.rows[0].embedded) || 0;
      totalEmbedded += count;
      console.log(`${table}: ${count}`);
    }

    console.log(`\nTotal from individual tables: ${totalEmbedded}`);

    // Check if there are records not matching any table
    console.log('\n=== Records not matching known tables ===');
    const otherResult = await client.query(`
      SELECT COUNT(*) as count
      FROM unified_embeddings
      WHERE source_type = 'database'
      AND NOT (
        source_table = ANY($1)
        OR metadata->>'table' = ANY($1)
      )
    `, [tables]);
    console.log('Other records:', otherResult.rows[0]);

  } finally {
    client.release();
    await pool.end();
  }
}

check().catch(console.error);