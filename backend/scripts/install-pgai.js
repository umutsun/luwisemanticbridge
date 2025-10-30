const { Client } = require('pg');
require('dotenv').config({ path: require('path').join(__dirname, '../../.env.lsemb') });

async function installPgai() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres:12Kemal1221@91.99.229.96:5432/lsemb'
  });

  try {
    await client.connect();
    console.log('Connected to database...');

    // First check if extension is available
    const checkResult = await client.query(`
      SELECT * FROM pg_available_extensions WHERE name = 'ai';
    `);

    if (checkResult.rows.length === 0) {
      console.log('⚠️ pgai extension is not available in this PostgreSQL installation.');
      console.log('You need to install pgai on the PostgreSQL server first.');
      console.log('Visit: https://github.com/pgai-io/pgai for installation instructions.');
      return;
    }

    // Try to install pgai extension
    console.log('Installing pgai extension...');
    await client.query('CREATE EXTENSION IF NOT EXISTS ai CASCADE;');

    // Verify installation
    const result = await client.query(`
      SELECT extname, extversion FROM pg_extension WHERE extname = 'ai';
    `);

    if (result.rows.length > 0) {
      console.log('✅ pgai extension installed successfully!');
      console.log(`Version: ${result.rows[0].extversion}`);
    } else {
      console.log('❌ Failed to install pgai extension');
    }

  } catch (error) {
    console.error('Error:', error.message);
    if (error.message.includes('permission denied')) {
      console.log('⚠️ You need superuser privileges to install extensions.');
    } else if (error.message.includes('could not open extension control file')) {
      console.log('⚠️ pgai is not available on the PostgreSQL server.');
      console.log('The pgai extension needs to be installed on the PostgreSQL server first.');
    }
  } finally {
    await client.end();
  }
}

installPgai();