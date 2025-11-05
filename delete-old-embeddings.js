const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.POSTGRES_HOST || 'localhost',
  port: parseInt(process.env.POSTGRES_PORT || '5432'),
  database: process.env.POSTGRES_DB || 'lsemb',
  user: process.env.POSTGRES_USER || 'postgres',
  password: process.env.POSTGRES_PASSWORD || 'password'
});

async function deleteOldEmbeddings() {
  try {
    console.log('🗑️ Deleting old embeddings...\n');

    // Delete from unified_embeddings
    const result1 = await pool.query('DELETE FROM unified_embeddings RETURNING id');
    console.log(`✅ Deleted ${result1.rowCount} rows from unified_embeddings`);

    // Delete from message_embeddings
    const result2 = await pool.query('DELETE FROM message_embeddings RETURNING id');
    console.log(`✅ Deleted ${result2.rowCount} rows from message_embeddings`);

    // Delete from document_embeddings
    const result3 = await pool.query('DELETE FROM document_embeddings RETURNING id');
    console.log(`✅ Deleted ${result3.rowCount} rows from document_embeddings`);

    console.log('\n✅ All old embeddings deleted successfully!');
    console.log('💡 New embeddings will be generated with text-embedding-3-large (3072-dim)');
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await pool.end();
  }
}

deleteOldEmbeddings();
