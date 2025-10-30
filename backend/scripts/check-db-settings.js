const { Pool } = require('pg');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables
const envPath = path.resolve(__dirname, '../../.env.lsemb');
dotenv.config({ path: envPath });

const lsembPool = new Pool({
  host: process.env.POSTGRES_HOST || '91.99.229.96',
  port: parseInt(process.env.POSTGRES_PORT || '5432'),
  database: process.env.POSTGRES_DB || 'lsemb',
  user: process.env.POSTGRES_USER || 'postgres',
  password: process.env.POSTGRES_PASSWORD || 'Semsiye!22',
  ssl: false
});

async function checkSettings() {
  try {
    console.log('🔍 Checking database settings in LSEMB...\n');

    // Check if settings table exists
    const tableCheck = await lsembPool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = 'settings'
      );
    `);

    if (!tableCheck.rows[0].exists) {
      console.log('❌ Settings table does not exist!');
      process.exit(1);
    }

    console.log('✅ Settings table exists\n');

    // Get all database-related settings
    const settingsQuery = `
      SELECT key, value, category, description
      FROM settings
      WHERE category = 'database' OR key IN ('host', 'port', 'database', 'user', 'password')
      ORDER BY category, key
    `;

    const result = await lsembPool.query(settingsQuery);

    if (result.rows.length === 0) {
      console.log('⚠️  No database settings found in settings table!');
      console.log('\nInserting default database settings...\n');

      // Insert default database settings
      const insertQuery = `
        INSERT INTO settings (key, value, category, description)
        VALUES
          ('host', '91.99.229.96', 'database', 'Database host'),
          ('port', '5432', 'database', 'Database port'),
          ('database', 'rag_chatbot', 'database', 'Source database name'),
          ('user', 'postgres', 'database', 'Database user'),
          ('password', 'Semsiye!22', 'database', 'Database password'),
          ('ssl', 'false', 'database', 'SSL connection')
        ON CONFLICT (key) DO UPDATE
        SET value = EXCLUDED.value,
            category = EXCLUDED.category,
            description = EXCLUDED.description;
      `;

      await lsembPool.query(insertQuery);
      console.log('✅ Default database settings inserted!\n');

      // Re-fetch settings
      const newResult = await lsembPool.query(settingsQuery);
      console.log('Database Settings:');
      newResult.rows.forEach(row => {
        const displayValue = row.key === 'password' ? '***' : row.value;
        console.log(`  ${row.key}: ${displayValue} (${row.category})`);
      });
    } else {
      console.log('Database Settings:');
      result.rows.forEach(row => {
        const displayValue = row.key === 'password' ? '***' : row.value;
        console.log(`  ${row.key}: ${displayValue} (${row.category})`);
      });
    }

    await lsembPool.end();
    console.log('\n✅ Check completed!');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error);
    process.exit(1);
  }
}

checkSettings();
