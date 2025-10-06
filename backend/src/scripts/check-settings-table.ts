import { asembPool } from '../config/database.config';

async function checkSettingsTable() {
  try {
    console.log('Checking settings table in ASEMB database...\n');

    // Check if settings table exists
    const tableCheck = await asembPool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = 'settings'
      )
    `);

    const tableExists = tableCheck.rows[0].exists;
    console.log(`Settings table exists: ${tableExists ? '✅ YES' : '❌ NO'}`);

    if (tableExists) {
      // Check table structure
      const structure = await asembPool.query(`
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_name = 'settings'
        AND table_schema = 'public'
        ORDER BY ordinal_position
      `);

      console.log('\nSettings table structure:');
      structure.rows.forEach(col => {
        console.log(`  - ${col.column_name}: ${col.data_type} ${col.is_nullable === 'YES' ? '(nullable)' : '(required)'}`);
      });

      // Check current settings
      const currentSettings = await asembPool.query(`
        SELECT setting_key as key, setting_value as value, description, created_at as updated_at
        FROM chatbot_settings
        ORDER BY description, setting_key
      `);

      console.log(`\nCurrent settings (${currentSettings.rows.length} total):`);
      currentSettings.rows.forEach(row => {
        console.log(`  ${row.category} - ${row.key}: ${row.value}`);
      });
    }

    // Test inserting a setting
    console.log('\nTesting settings insertion...');
    try {
      await asembPool.query(`
        INSERT INTO settings (key, value, category, description)
        VALUES ('test_connection', 'test_value', 'test', 'Test connection')
        ON CONFLICT (key)
        DO UPDATE SET
          value = 'test_value',
          updated_at = CURRENT_TIMESTAMP
      `);
      console.log('✅ Settings insertion successful');

      // Verify the insertion
      const verify = await asembPool.query(`
        SELECT setting_value as value FROM chatbot_settings WHERE setting_key = 'test_connection'
      `);
      console.log(`✅ Verification successful: ${verify.rows[0].value}`);

      // Clean up test record
      await asembPool.query(`
        DELETE FROM chatbot_settings WHERE setting_key = 'test_connection'
      `);
      console.log('✅ Test record cleaned up');

    } catch (error) {
      console.error('❌ Settings insertion test failed:', error);
    }

  } catch (error) {
    console.error('Error checking settings table:', error);
  } finally {
    await asembPool.end();
  }
}

checkSettingsTable();