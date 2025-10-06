const { Pool } = require('pg');
require('dotenv').config({ path: '.env.asemb' });

const asembDbConfig = {
  host: process.env.POSTGRES_HOST || 'asemb.luwi.dev',
  port: parseInt(process.env.POSTGRES_PORT || '5432'),
  database: process.env.POSTGRES_DB || 'asemb',
  user: process.env.POSTGRES_USER || 'postgres',
  password: process.env.POSTGRES_PASSWORD || '',
  ssl: process.env.POSTGRES_SSL === 'true' ? { rejectUnauthorized: false } : false
};

console.log('Testing database connection with config:', {
  host: asembDbConfig.host,
  port: asembDbConfig.port,
  database: asembDbConfig.database,
  user: asembDbConfig.user,
  password: asembDbConfig.password ? '***' : 'empty',
  ssl: asembDbConfig.ssl
});

async function testConnection() {
  const pool = new Pool(asembDbConfig);

  try {
    console.log('Connecting to database...');
    const client = await pool.connect();
    console.log('✅ Connected successfully!');

    const result = await client.query('SELECT version()');
    console.log('Database version:', result.rows[0].version);

    // Check if settings table exists
    const tableCheck = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = 'settings'
      );
    `);
    console.log('Settings table exists:', tableCheck.rows[0].exists);

    if (tableCheck.rows[0].exists) {
      const settingsCount = await client.query('SELECT COUNT(*) FROM settings');
      console.log('Settings count:', settingsCount.rows[0].count);

      const settings = await client.query('SELECT key, category FROM settings ORDER BY key');
      console.log('Available settings:');
      settings.rows.forEach(row => {
        console.log(`  - ${row.key} (${row.category || 'no category'})`);
      });
    }

    client.release();
    await pool.end();
    console.log('✅ Connection test completed successfully');
  } catch (error) {
    console.error('❌ Connection failed:', error.message);
    await pool.end();
    process.exit(1);
  }
}

testConnection();