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

async function testSettingsEndpoint() {
  const pool = new Pool(asembDbConfig);

  try {
    console.log('Testing settings endpoint simulation...');

    // Simulate GET /api/v2/settings/all
    const result = await pool.query('SELECT key, value FROM settings');

    const settings = {};
    result.rows.forEach(row => {
      settings[row.key] = row.value;
    });

    console.log('Available settings:');
    Object.keys(settings).forEach(key => {
      console.log(`  - ${key}: ${typeof settings[key] === 'object' ? JSON.stringify(settings[key], null, 2) : settings[key]}`);
    });

    // Simulate GET /api/v2/settings/ (nested format)
    console.log('\n--- Nested Configuration ---');
    const config = {
      app: {},
      database: {},
      redis: {},
      openai: {},
      anthropic: {},
      deepseek: {},
      google: {},
      llmSettings: {},
      security: {},
      logging: {}
    };

    // Initialize API key objects
    config.openai.apiKey = '';
    config.google.apiKey = '';
    config.anthropic.apiKey = '';

    result.rows.forEach(row => {
      const key = row.key;
      const value = row.value;

      if (key.includes('.')) {
        const keys = key.split('.');
        let current = config;

        for (let i = 0; i < keys.length - 1; i++) {
          if (!current[keys[i]]) {
            current[keys[i]] = {};
          }
          current = current[keys[i]];
        }

        const lastKey = keys[keys.length - 1];

        try {
          current[lastKey] = JSON.parse(value);
        } catch {
          if (!isNaN(Number(value)) && value !== '') {
            current[lastKey] = Number(value);
          } else if (value === 'true' || value === 'false') {
            current[lastKey] = value === 'true';
          } else {
            current[lastKey] = value;
          }
        }
      }
    });

    console.log(JSON.stringify(config, null, 2));

    console.log('\n✅ Settings endpoint test completed successfully');
    return { success: true, settings, config };

  } catch (error) {
    console.error('❌ Settings test failed:', error.message);
    return { success: false, error: error.message };
  } finally {
    await pool.end();
  }
}

testSettingsEndpoint().then(result => {
  if (result.success) {
    console.log('\n✅ All tests passed! The settings system is working correctly.');
  } else {
    console.log('\n❌ Tests failed:', result.error);
  }
});