const { Pool } = require('pg');
require('dotenv').config({ path: '.env.asemb' });

const pool = new Pool({
  host: process.env.POSTGRES_HOST,
  port: process.env.POSTGRES_PORT,
  user: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
  database: process.env.POSTGRES_DB,
});

async function checkSettings() {
  try {
    const client = await pool.connect();
    try {
      const result = await client.query("SELECT key, value FROM settings WHERE key LIKE '%api%' OR key LIKE '%embedding%' OR key LIKE '%openai%' OR key LIKE '%deepseek%'");
      console.log('Settings from database:');
      result.rows.forEach(row => {
        console.log(`${row.key}: ${row.value}`);
      });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await pool.end();
  }
}

checkSettings();