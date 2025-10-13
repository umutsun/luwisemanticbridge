import { lsembPool } from '../config/database.config';

async function updateDatabaseSettings() {
  try {
    console.log('🔧 Updating database settings in settings table...');

    const dbSettings = [
      { key: 'database.host', value: '91.99.229.96' },
      { key: 'database.port', value: '5432' },
      { key: 'database.name', value: 'lsemb' },
      { key: 'database.user', value: 'postgres' },
      { key: 'database.password', value: 'BilmemneNe123!' },
      { key: 'database.ssl', value: 'false' },
      { key: 'database.maxConnections', value: '20' },
      { key: 'database.type', value: 'postgresql' }
    ];

    for (const setting of dbSettings) {
      await lsembPool.query(`
        INSERT INTO settings (key, value, description, updated_at)
        VALUES ($1, $2, 'Database configuration', CURRENT_TIMESTAMP)
        ON CONFLICT (key)
        DO UPDATE SET
          value = $2,
          updated_at = CURRENT_TIMESTAMP
      `, [setting.key, setting.value]);

      console.log(`✅ Updated ${setting.key} = ${setting.key.includes('password') ? '***' : setting.value}`);
    }

    console.log('🎉 Database settings updated successfully!');

    // Verify the settings
    const result = await lsembPool.query(`
      SELECT key, value
      FROM settings
      WHERE key LIKE 'database.%'
      ORDER BY key
    `);

    console.log('\n📋 Current database settings:');
    result.rows.forEach(row => {
      const value = row.key.includes('password') ? '***' : row.value;
      console.log(`  ${row.key}: ${value}`);
    });

    await lsembPool.end();
  } catch (error) {
    console.error('❌ Error updating database settings:', error);
    process.exit(1);
  }
}

updateDatabaseSettings();