const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.POSTGRES_HOST || 'localhost',
  port: parseInt(process.env.POSTGRES_PORT || '5432'),
  database: process.env.POSTGRES_DB || 'lsemb',
  user: process.env.POSTGRES_USER || 'postgres',
  password: process.env.POSTGRES_PASSWORD || 'password'
});

async function updateEmbeddingModel() {
  try {
    // First, let's check current value
    const check = await pool.query(
      "SELECT * FROM settings WHERE key = 'llmSettings.activeEmbeddingModel'"
    );
    console.log('Current setting:', check.rows);

    // Update the embedding model
    const result = await pool.query(
      'UPDATE settings SET value = $1 WHERE key = $2 RETURNING *',
      ['openai/text-embedding-3-small', 'llmSettings.activeEmbeddingModel']
    );

    console.log('Updated successfully:', result.rows);

    // Clear cache if exists
    await pool.query("DELETE FROM settings WHERE key LIKE 'cache:%'");

    console.log('✅ Embedding model updated to: openai/text-embedding-3-small');
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
  }
}

updateEmbeddingModel();
