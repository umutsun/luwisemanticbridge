const { Client } = require('pg');
require('dotenv').config({ path: require('path').join(__dirname, '../../.env.lsemb') });

async function installPgvectorscale() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres:12Kemal1221@91.99.229.96:5432/lsemb'
  });

  try {
    await client.connect();
    console.log('Connected to database...');

    // First check if extension is available
    const checkResult = await client.query(`
      SELECT * FROM pg_available_extensions WHERE name = 'vectorscale';
    `);

    if (checkResult.rows.length === 0) {
      console.log('⚠️ pgvectorscale extension is not available in this PostgreSQL installation.');
      console.log('You need to install pgvectorscale on the PostgreSQL server first.');
      console.log('Visit: https://github.com/timescale/pgvectorscale for installation instructions.');
      console.log('\nFor PostgreSQL 15+, you typically need to:');
      console.log('1. Download the extension package');
      console.log('2. Install it on the server');
      console.log('3. Then run CREATE EXTENSION vectorscale;');
      return;
    }

    // Try to install pgvectorscale extension
    console.log('Installing pgvectorscale extension...');
    await client.query('CREATE EXTENSION IF NOT EXISTS vectorscale CASCADE;');

    // Verify installation
    const result = await client.query(`
      SELECT extname, extversion FROM pg_extension WHERE extname = 'vectorscale';
    `);

    if (result.rows.length > 0) {
      console.log('✅ pgvectorscale extension installed successfully!');
      console.log(`Version: ${result.rows[0].extversion}`);

      // Check for DiskANN index support
      console.log('\nChecking DiskANN index support...');
      const indexCheck = await client.query(`
        SELECT proname FROM pg_proc WHERE proname LIKE 'diskann%' LIMIT 5;
      `);

      if (indexCheck.rows.length > 0) {
        console.log('✅ DiskANN index functions available!');
        console.log('Functions found:', indexCheck.rows.map(r => r.proname).join(', '));
      }

      // Get pgvector version for compatibility check
      const vecResult = await client.query(`
        SELECT extversion FROM pg_extension WHERE extname = 'vector';
      `);

      if (vecResult.rows.length > 0) {
        console.log(`\npgvector version: ${vecResult.rows[0].extversion}`);
        console.log('pgvectorscale extends pgvector with performance optimizations.');
      }

    } else {
      console.log('❌ Failed to install pgvectorscale extension');
    }

  } catch (error) {
    console.error('Error:', error.message);
    if (error.message.includes('permission denied')) {
      console.log('⚠️ You need superuser privileges to install extensions.');
    } else if (error.message.includes('could not open extension control file')) {
      console.log('⚠️ pgvectorscale is not available on the PostgreSQL server.');
      console.log('The extension needs to be installed on the PostgreSQL server first.');
    }
  } finally {
    await client.end();
  }
}

installPgvectorscale();