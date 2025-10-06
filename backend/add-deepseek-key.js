const { Pool } = require('pg');

// Use the same database config as the backend
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:Semsiye!22@91.99.229.96:5432/asemb'
});

async function addDeepSeekKey() {
  const client = await pool.connect();

  try {
    console.log('Connecting to database...');

    // Get current AI settings
    const checkResult = await client.query(`
      SELECT setting_value as value FROM chatbot_settings WHERE setting_key = 'ai_settings'
    `);

    let aiSettings = {};
    if (checkResult.rows.length > 0) {
      aiSettings = checkResult.rows[0].value || {};
      console.log('Current AI settings found');
    } else {
      console.log('No existing AI settings, creating new...');
    }

    // Add DeepSeek key
    aiSettings.deepseekApiKey = 'sk-ba7e34e631864b01860260fb4920f397';

    // Save back to database
    await client.query(`
      INSERT INTO settings (key, value, category, description)
      VALUES ('ai_settings', $1, 'ai', 'AI service settings')
      ON CONFLICT (key)
      DO UPDATE SET
        value = $1,
        updated_at = CURRENT_TIMESTAMP
    `, [aiSettings]);

    console.log('✅ DeepSeek API key added successfully!');
    console.log('Key:', aiSettings.deepseekApiKey.substring(0, 20) + '...');

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

addDeepSeekKey();