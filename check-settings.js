const { Pool } = require('pg');
const pool = new Pool({
  host: '91.99.229.96',
  port: 5432,
  database: 'lsemb',
  user: 'postgres',
  password: 'Semsiye!22'
});

async function checkSettings() {
  try {
    console.log('Checking settings table...');

    // Check API keys
    const result = await pool.query(
      'SELECT key, value FROM settings WHERE key IN (\'openai.apiKey\', \'anthropic.apiKey\', \'google.apiKey\', \'deepseek.apiKey\') ORDER BY key'
    );

    console.log('Found', result.rows.length, 'API key settings');
    result.rows.forEach(row => {
      const preview = row.value.length > 20 ? row.value.substring(0, 20) + '...' : row.value;
      console.log(row.key + ':', preview);
    });

    // Check active chat model
    const modelResult = await pool.query(
      'SELECT key, value FROM settings WHERE key IN (\'llmSettings.activeChatModel\', \'activeChatModel\')'
    );

    console.log('\nActive chat models:');
    modelResult.rows.forEach(row => {
      console.log(row.key + ':', row.value);
    });

    await pool.end();
  } catch (error) {
    console.error('Error:', error.message);
    await pool.end();
  }
}

checkSettings();
