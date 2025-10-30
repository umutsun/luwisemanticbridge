/**
 * Configure pgAI to use API settings from database
 * Reads API key and model from settings table (API tab)
 */

const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env.lsemb') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:12Kemal1221@91.99.229.96:5432/lsemb'
});

async function configurePgAIFromAPISettings() {
  console.log('🔧 Configuring pgAI from API Settings');
  console.log('========================================\n');

  try {
    // 1. Get API settings from database
    console.log('1️⃣ Fetching API settings from database...');

    // API settings use format: api.openai.apiKey, api.openai.model, etc.
    const settingsQuery = await pool.query(`
      SELECT key, value, category
      FROM settings
      WHERE category = 'api'
        OR key LIKE 'api.%'
        OR key LIKE 'openai%'
        OR key IN (
          'activeEmbeddingModel',
          'activeChatModel',
          'activeEmbeddingProvider',
          'embeddingProvider'
        )
      ORDER BY key
    `);

    if (settingsQuery.rows.length === 0) {
      throw new Error('No API settings found in database');
    }

    console.log(`Found ${settingsQuery.rows.length} API settings`);

    // Parse settings
    let apiKey = null;
    let embeddingModel = 'text-embedding-3-large'; // Default
    let embeddingProvider = 'openai'; // Default
    let chatModel = 'gpt-4'; // Default for LLM operations

    settingsQuery.rows.forEach(row => {
      const key = row.key.toLowerCase();
      let value = row.value;

      // Try to parse JSON values
      try {
        const parsed = JSON.parse(value);
        if (typeof parsed === 'object') {
          // Handle nested objects like {apiKey: "sk-..."}
          value = parsed.apiKey || parsed.key || parsed.value || value;
        }
      } catch {
        // Use as-is if not JSON
      }

      console.log(`  Checking: ${row.key} = ${value?.substring(0, 20)}...`);

      // Extract API key (various possible keys)
      if (
        key === 'api.openai.apikey' ||
        key === 'api.openai.key' ||
        key === 'openai.apikey' ||
        key === 'openaiapikey' ||
        key.includes('api_key')
      ) {
        apiKey = value;
        console.log('  ✓ Found API key');
      }

      // Extract embedding model
      if (
        key === 'api.openai.embeddingmodel' ||
        key === 'activeembeddingmodel' ||
        key === 'api.embedding.model' ||
        (key.includes('embedding') && key.includes('model'))
      ) {
        // Only use if it's actually an embedding model
        if (value && value.includes('embedding')) {
          embeddingModel = value;
          console.log(`  ✓ Found embedding model: ${value}`);
        }
      }

      // Extract embedding provider
      if (
        key === 'api.embedding.provider' ||
        key === 'activeembeddingprovider' ||
        key === 'embeddingprovider'
      ) {
        embeddingProvider = value;
        console.log(`  ✓ Found embedding provider: ${value}`);
      }

      // Extract chat model
      if (
        key === 'api.openai.chatmodel' ||
        key === 'activechatmodel' ||
        key === 'api.chat.model' ||
        (key.includes('chat') && key.includes('model'))
      ) {
        chatModel = value;
        console.log(`  ✓ Found chat model: ${value}`);
      }
    });

    if (!apiKey) {
      console.log('\n⚠️  API key not found in expected locations.');
      console.log('Searching all settings for API key pattern...');

      // Fallback: search all settings for API key pattern
      const allSettings = await pool.query(`
        SELECT key, value
        FROM settings
        WHERE value LIKE 'sk-%'
           OR value LIKE '%"apiKey":"sk-%'
           OR value LIKE '%"key":"sk-%'
      `);

      if (allSettings.rows.length > 0) {
        const firstKey = allSettings.rows[0];
        let value = firstKey.value;
        try {
          const parsed = JSON.parse(value);
          value = parsed.apiKey || parsed.key || value;
        } catch {}

        if (value && value.startsWith('sk-')) {
          apiKey = value;
          console.log(`  ✓ Found API key in: ${firstKey.key}`);
        }
      }
    }

    if (!apiKey) {
      throw new Error('OpenAI API key not found in settings');
    }

    console.log('\n✅ Configuration found:');
    console.log(`  API Key: sk-...${apiKey.slice(-4)}`);
    console.log(`  Embedding Provider: ${embeddingProvider}`);
    console.log(`  Embedding Model: ${embeddingModel}`);
    console.log(`  Chat Model: ${chatModel}`);

    // 2. Update pgAI configuration
    console.log('\n2️⃣ Updating pgAI configuration...');

    // Ensure ai schema exists
    await pool.query('CREATE SCHEMA IF NOT EXISTS ai');

    // Create/update config table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ai.config (
        key VARCHAR(100) PRIMARY KEY,
        value TEXT,
        description TEXT,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Update configurations
    const configs = [
      ['openai_api_key', apiKey, 'OpenAI API Key from API settings'],
      ['embedding_provider', embeddingProvider, 'Embedding provider from API settings'],
      ['embedding_model', embeddingModel, 'Default embedding model from API settings'],
      ['chat_model', chatModel, 'Default chat model from API settings']
    ];

    for (const [key, value, description] of configs) {
      await pool.query(`
        INSERT INTO ai.config (key, value, description)
        VALUES ($1, $2, $3)
        ON CONFLICT (key) DO UPDATE
        SET value = EXCLUDED.value,
            description = EXCLUDED.description,
            updated_at = CURRENT_TIMESTAMP
      `, [key, value, description]);
    }

    console.log('✅ pgAI configuration updated');

    // 3. Create API settings aware functions
    console.log('\n3️⃣ Creating API settings aware functions...');

    // Function to get API key from settings
    await pool.query(`
      CREATE OR REPLACE FUNCTION ai.get_api_key_from_settings()
      RETURNS TEXT AS $$
      DECLARE
        api_key TEXT;
      BEGIN
        -- Try API category settings first
        SELECT value INTO api_key
        FROM settings
        WHERE (
          key = 'api.openai.apiKey'
          OR key = 'api.openai.key'
          OR key = 'openai.apiKey'
        )
        AND category = 'api'
        LIMIT 1;

        -- If not found, try ai.config
        IF api_key IS NULL THEN
          SELECT value INTO api_key
          FROM ai.config
          WHERE key = 'openai_api_key';
        END IF;

        RETURN api_key;
      END;
      $$ LANGUAGE plpgsql SECURITY DEFINER
    `);

    // Function to get embedding model from settings
    await pool.query(`
      CREATE OR REPLACE FUNCTION ai.get_model_from_settings()
      RETURNS TEXT AS $$
      DECLARE
        model TEXT;
      BEGIN
        -- Try API settings first
        SELECT value INTO model
        FROM settings
        WHERE (
          key = 'api.openai.embeddingModel'
          OR key = 'activeEmbeddingModel'
          OR key = 'api.embedding.model'
        )
        LIMIT 1;

        -- Validate it's an embedding model
        IF model IS NOT NULL AND NOT model LIKE '%embedding%' THEN
          model := 'text-embedding-3-large';
        END IF;

        -- If not found, use ai.config
        IF model IS NULL THEN
          SELECT value INTO model
          FROM ai.config
          WHERE key = 'embedding_model';
        END IF;

        RETURN COALESCE(model, 'text-embedding-3-large');
      END;
      $$ LANGUAGE plpgsql
    `);

    console.log('✅ API settings functions created');

    // 4. Create auto-sync trigger for API settings
    console.log('\n4️⃣ Creating API settings sync trigger...');

    await pool.query(`
      CREATE OR REPLACE FUNCTION ai.sync_api_settings()
      RETURNS TRIGGER AS $$
      BEGIN
        -- Only process API category settings
        IF NEW.category = 'api' OR NEW.key LIKE 'api.%' THEN
          -- Sync API key
          IF NEW.key IN ('api.openai.apiKey', 'api.openai.key') THEN
            UPDATE ai.config
            SET value = NEW.value, updated_at = CURRENT_TIMESTAMP
            WHERE key = 'openai_api_key';
          END IF;

          -- Sync embedding model
          IF NEW.key IN ('api.openai.embeddingModel', 'api.embedding.model') THEN
            IF NEW.value LIKE '%embedding%' THEN
              UPDATE ai.config
              SET value = NEW.value, updated_at = CURRENT_TIMESTAMP
              WHERE key = 'embedding_model';
            END IF;
          END IF;

          -- Sync chat model
          IF NEW.key IN ('api.openai.chatModel', 'api.chat.model') THEN
            UPDATE ai.config
            SET value = NEW.value, updated_at = CURRENT_TIMESTAMP
            WHERE key = 'chat_model';
          END IF;

          -- Sync provider
          IF NEW.key IN ('api.embedding.provider', 'api.provider') THEN
            UPDATE ai.config
            SET value = NEW.value, updated_at = CURRENT_TIMESTAMP
            WHERE key = 'embedding_provider';
          END IF;
        END IF;

        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);

    // Apply trigger
    await pool.query(`
      DROP TRIGGER IF EXISTS sync_api_settings_to_ai ON settings;

      CREATE TRIGGER sync_api_settings_to_ai
      AFTER INSERT OR UPDATE
      ON settings
      FOR EACH ROW
      EXECUTE FUNCTION ai.sync_api_settings()
    `);

    console.log('✅ API settings sync trigger created');

    // 5. Display current configuration
    console.log('\n5️⃣ Current pgAI Configuration:');

    const configResult = await pool.query(`
      SELECT key, value, updated_at
      FROM ai.config
      WHERE key IN ('openai_api_key', 'embedding_provider', 'embedding_model', 'chat_model')
      ORDER BY key
    `);

    console.log('\n📋 Active Configuration:');
    configResult.rows.forEach(row => {
      const displayValue = row.key === 'openai_api_key'
        ? 'sk-...' + row.value.slice(-4)
        : row.value;
      console.log(`  ${row.key}: ${displayValue}`);
    });

    // 6. Test the configuration
    console.log('\n6️⃣ Testing configuration...');

    const testResult = await pool.query(`
      SELECT
        ai.get_api_key_from_settings() IS NOT NULL as has_api_key,
        ai.get_model_from_settings() as current_model,
        ai.get_model_dimensions(ai.get_model_from_settings()) as dimensions
    `);

    console.log('\n✅ Test Results:');
    console.log(`  API Key configured: ${testResult.rows[0].has_api_key}`);
    console.log(`  Current Model: ${testResult.rows[0].current_model}`);
    console.log(`  Model Dimensions: ${testResult.rows[0].dimensions}`);

    // 7. Show queue status
    const statusResult = await pool.query(`
      SELECT * FROM ai.get_status()
    `);

    console.log('\n📊 Queue Status:');
    console.log(`  Pending: ${statusResult.rows[0].pending_count}`);
    console.log(`  Processing: ${statusResult.rows[0].processing_count}`);
    console.log(`  Completed: ${statusResult.rows[0].completed_count}`);
    console.log(`  Cache Size: ${statusResult.rows[0].cache_size}`);

    console.log('\n========================================');
    console.log('✅ pgAI API Settings Configuration Complete!');
    console.log('========================================\n');
    console.log('pgAI is now configured to:');
    console.log('1. Use OpenAI API key from API settings tab');
    console.log('2. Use embedding model from API settings');
    console.log('3. Auto-sync when API settings change');
    console.log('4. Support multiple embedding providers');
    console.log('\nChanges in Dashboard → Settings → API tab will');
    console.log('automatically update pgAI configuration!');

  } catch (error) {
    console.error('\n❌ Configuration error:', error.message);
    console.error('Details:', error);
  } finally {
    await pool.end();
  }
}

// Run configuration
configurePgAIFromAPISettings().catch(console.error);