const { Pool } = require('pg');
require('dotenv').config({ path: require('path').join(__dirname, '../../.env.lsemb') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:12Kemal1221@91.99.229.96:5432/lsemb'
});

async function checkExtensions() {
  try {
    // Check installed extensions
    const result = await pool.query(`
      SELECT extname, extversion
      FROM pg_extension
      WHERE extname IN ('pgai', 'vectorscale', 'pgvectorscale', 'vector', 'pg_cron')
      ORDER BY extname
    `);

    console.log('PostgreSQL Extensions Status:');
    console.log('==============================');

    const installedExtensions = new Set(result.rows.map(r => r.extname));

    if (result.rows.length > 0) {
      result.rows.forEach(row => {
        console.log(`✅ ${row.extname} v${row.extversion} - INSTALLED`);
      });
    }

    // Check if extensions are available but not installed
    const available = await pool.query(`
      SELECT name, comment
      FROM pg_available_extensions
      WHERE name IN ('pgai', 'vectorscale', 'pgvectorscale', 'pg_cron')
      AND name NOT IN (SELECT extname FROM pg_extension)
      ORDER BY name
    `);

    if (available.rows.length > 0) {
      console.log('\nAvailable but not installed:');
      available.rows.forEach(row => {
        console.log(`❌ ${row.name} - NOT INSTALLED`);
        if (row.comment) {
          console.log(`   Description: ${row.comment}`);
        }
      });
    }

    // Specific checks
    if (!installedExtensions.has('vector')) {
      console.log('\n⚠️  pgvector is NOT installed - Required for vector operations');
    }

    if (!installedExtensions.has('pgai') && !installedExtensions.has('vectorscale')) {
      console.log('\n📋 Summary:');
      console.log('- pgai: NOT installed (required for automatic embeddings)');
      console.log('- pgvectorscale: NOT installed (required for performance optimization)');
      console.log('\nThese extensions need to be installed on the PostgreSQL server.');
      console.log('They cannot be installed via pgAdmin from a remote client.');
    }

    await pool.end();
  } catch (error) {
    console.error('Error:', error.message);
    await pool.end();
  }
}

checkExtensions();