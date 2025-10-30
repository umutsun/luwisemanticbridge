const { Pool } = require('pg');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables
const envPath = path.resolve(__dirname, '../../.env.lsemb');
dotenv.config({ path: envPath });

// LSEMB Database Pool
const lsembPool = new Pool({
  host: process.env.POSTGRES_HOST || '91.99.229.96',
  port: parseInt(process.env.POSTGRES_PORT || '5432'),
  database: process.env.POSTGRES_DB || 'lsemb',
  user: process.env.POSTGRES_USER || 'postgres',
  password: process.env.POSTGRES_PASSWORD || 'Semsiye!22',
  ssl: false
});

console.log('Environment loaded:');
console.log('  POSTGRES_HOST:', process.env.POSTGRES_HOST);
console.log('  POSTGRES_DB:', process.env.POSTGRES_DB);
console.log('  POSTGRES_USER:', process.env.POSTGRES_USER);
console.log('');

async function testSourceTables() {
  try {
    console.log('🔍 Fetching database settings from LSEMB...\n');

    // Get database settings
    const settingsQuery = `
      SELECT key, value
      FROM settings
      WHERE category = 'database'
      AND key IN ('host', 'port', 'database', 'user', 'password')
      ORDER BY key
    `;

    const settingsResult = await lsembPool.query(settingsQuery);
    console.log('Database Settings:');
    settingsResult.rows.forEach(row => {
      const displayValue = row.key === 'password' ? '***' : row.value;
      console.log(`  ${row.key}: ${displayValue}`);
    });

    // Create connection to source database
    const dbSettings = {};
    settingsResult.rows.forEach(row => {
      dbSettings[row.key] = row.value;
    });

    console.log('\n🔗 Connecting to source database...\n');

    const sourcePool = new Pool({
      host: dbSettings.host || 'localhost',
      port: parseInt(dbSettings.port || '5432'),
      database: dbSettings.database || 'rag_chatbot',
      user: dbSettings.user || 'postgres',
      password: dbSettings.password || '',
      ssl: false
    });

    // List all tables
    const tablesQuery = `
      SELECT
        schemaname as schema,
        tablename as name
      FROM pg_catalog.pg_tables
      WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
      ORDER BY schemaname, tablename
    `;

    const tablesResult = await sourcePool.query(tablesQuery);

    console.log(`Found ${tablesResult.rows.length} tables:\n`);

    for (const table of tablesResult.rows) {
      try {
        const countQuery = `SELECT COUNT(*) as count FROM "${table.schema}"."${table.name}"`;
        const countResult = await sourcePool.query(countQuery);
        const count = countResult.rows[0].count;
        console.log(`  ✓ ${table.schema}.${table.name} (${count} rows)`);
      } catch (error) {
        console.log(`  ✗ ${table.schema}.${table.name} (error: ${error.message})`);
      }
    }

    await sourcePool.end();
    await lsembPool.end();

    console.log('\n✅ Test completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error);
    process.exit(1);
  }
}

testSourceTables();
