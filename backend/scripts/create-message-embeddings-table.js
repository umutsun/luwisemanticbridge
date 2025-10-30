const { Client } = require('pg');
const fs = require('fs').promises;
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env.lsemb') });

async function createMessageEmbeddingsTable() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres:12Kemal1221@91.99.229.96:5432/lsemb'
  });

  try {
    await client.connect();
    console.log('Connected to database...');

    // Read SQL file
    const sqlPath = path.join(__dirname, '../sql/create-message-embeddings-table.sql');
    const sql = await fs.readFile(sqlPath, 'utf8');

    // Execute SQL
    console.log('Creating message_embeddings table...');
    await client.query(sql);

    // Verify table creation
    const result = await client.query(`
      SELECT
        table_name,
        (SELECT COUNT(*) FROM message_embeddings) as row_count
      FROM information_schema.tables
      WHERE table_name = 'message_embeddings';
    `);

    if (result.rows.length > 0) {
      console.log('✅ message_embeddings table created successfully!');
      console.log(`Current rows: ${result.rows[0].row_count}`);

      // Show indexes
      const indexes = await client.query(`
        SELECT indexname, indexdef
        FROM pg_indexes
        WHERE tablename = 'message_embeddings';
      `);

      console.log('\nIndexes created:');
      indexes.rows.forEach(idx => {
        console.log(`- ${idx.indexname}`);
      });
    } else {
      console.log('❌ Failed to create message_embeddings table');
    }

  } catch (error) {
    console.error('Error:', error.message);
    if (error.message.includes('already exists')) {
      console.log('ℹ️ Table already exists');
    }
  } finally {
    await client.end();
  }
}

createMessageEmbeddingsTable();