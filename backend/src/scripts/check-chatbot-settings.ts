import { lsembPool } from '../config/database.config';

async function checkChatbotSettings() {
  try {
    console.log('Checking chatbot_settings table...\n');

    // Check if table exists
    const tableCheck = await lsembPool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = 'chatbot_settings'
      )
    `);

    const tableExists = tableCheck.rows[0].exists;
    console.log(`chatbot_settings table exists: ${tableExists ? '✅ YES' : '❌ NO'}`);

    if (tableExists) {
      // Check table structure
      const structure = await lsembPool.query(`
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_name = 'chatbot_settings'
        AND table_schema = 'public'
        ORDER BY ordinal_position
      `);

      console.log('\nchatbot_settings table structure:');
      structure.rows.forEach(col => {
        console.log(`  - ${col.column_name}: ${col.data_type} ${col.is_nullable === 'YES' ? '(nullable)' : '(required)'}`);
      });

      // Check current settings
      const currentSettings = await lsembPool.query(`
        SELECT setting_key, setting_value
        FROM chatbot_settings
        ORDER BY setting_key
      `);

      console.log(`\nCurrent settings (${currentSettings.rows.length} total):`);
      currentSettings.rows.forEach(row => {
        console.log(`  ${row.setting_key}: ${row.setting_value}`);
      });
    }

    // Test inserting a setting
    console.log('\nTesting chatbot_settings insertion...');
    try {
      await lsembPool.query(`
        INSERT INTO chatbot_settings (setting_key, setting_value)
        VALUES ('test_prompt', 'This is a test prompt')
        ON CONFLICT (setting_key)
        DO UPDATE SET setting_value = 'This is a test prompt'
      `);
      console.log('✅ chatbot_settings insertion successful');

      // Verify the insertion
      const verify = await lsembPool.query(`
        SELECT setting_value FROM chatbot_settings WHERE setting_key = 'test_prompt'
      `);
      console.log(`✅ Verification successful: ${verify.rows[0].setting_value}`);

      // Clean up test record
      await lsembPool.query(`
        DELETE FROM chatbot_settings WHERE setting_key = 'test_prompt'
      `);
      console.log('✅ Test record cleaned up');

    } catch (error) {
      console.error('❌ chatbot_settings insertion test failed:', error);
    }

  } catch (error) {
    console.error('Error checking chatbot_settings:', error);
  } finally {
    await lsembPool.end();
  }
}

checkChatbotSettings();