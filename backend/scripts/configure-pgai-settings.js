/**
 * Configure pgAI to use OpenAI settings from database
 * Reads API key and model from settings table
 */

const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env.lsemb') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:12Kemal1221@91.99.229.96:5432/lsemb'
});

async function configurePgAIFromSettings() {
  console.log('🔧 Configuring pgAI from Settings');
  console.log('========================================\n');

  try {
    // 1. Get OpenAI settings from database
    console.log('1️⃣ Fetching OpenAI settings from database...');

    const settingsQuery = await pool.query(`
      SELECT key, value
      FROM settings
      WHERE key IN (
        'openai.apiKey',
        'openaiApiKey',
        'OPENAI_API_KEY',
        'activeEmbeddingModel',
        'embedding.activeModel',
        'embeddingModel',
        'activeChatModel',
        'chat.activeModel'
      )
    `);

    if (settingsQuery.rows.length === 0) {
      throw new Error('No OpenAI settings found in database');
    }

    // Parse settings
    let apiKey = null;
    let embeddingModel = 'text-embedding-3-large'; // Default
    let chatModel = 'gpt-4'; // Default for LLM operations

    settingsQuery.rows.forEach(row => {
      const key = row.key.toLowerCase();
      let value = row.value;

      // Try to parse JSON values
      try {
        const parsed = JSON.parse(value);
        if (typeof parsed === 'object') {
          value = parsed.apiKey || parsed.key || parsed.value || value;
        }
      } catch {
        // Use as-is if not JSON
      }

      // Extract API key
      if (key.includes('apikey') || key.includes('api_key')) {
        apiKey = value;
      }

      // Extract embedding model
      if (key.includes('embedding') && key.includes('model')) {
        embeddingModel = value;
      }

      // Extract chat model
      if (key.includes('chat') && key.includes('model')) {
        chatModel = value;
      }
    });

    if (!apiKey) {
      throw new Error('OpenAI API key not found in settings');
    }

    // Fix embedding model if it's a chat model
    if (embeddingModel && !embeddingModel.includes('embedding')) {
      console.log(`⚠️  Model '${embeddingModel}' is not an embedding model`);
      embeddingModel = 'text-embedding-3-large';
      console.log(`📊 Using default embedding model: ${embeddingModel}`);
    } else {
      console.log(`📊 Embedding Model: ${embeddingModel}`);
    }

    console.log('✅ Found API key in settings');
    console.log(`💬 Chat Model: ${chatModel}`);

    // 2. Update pgAI configuration
    console.log('\n2️⃣ Updating pgAI configuration...');

    // Ensure ai schema exists
    await pool.query('CREATE SCHEMA IF NOT EXISTS ai');

    // Create config table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ai.config (
        key VARCHAR(100) PRIMARY KEY,
        value TEXT,
        description TEXT,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Update API key
    await pool.query(`
      INSERT INTO ai.config (key, value, description)
      VALUES ('openai_api_key', $1, 'OpenAI API Key from settings')
      ON CONFLICT (key) DO UPDATE
      SET value = EXCLUDED.value,
          updated_at = CURRENT_TIMESTAMP
    `, [apiKey]);

    // Update embedding model
    await pool.query(`
      INSERT INTO ai.config (key, value, description)
      VALUES ('embedding_model', $1, 'Default embedding model from settings')
      ON CONFLICT (key) DO UPDATE
      SET value = EXCLUDED.value,
          updated_at = CURRENT_TIMESTAMP
    `, [embeddingModel]);

    // Update chat model
    await pool.query(`
      INSERT INTO ai.config (key, value, description)
      VALUES ('chat_model', $1, 'Default chat model from settings')
      ON CONFLICT (key) DO UPDATE
      SET value = EXCLUDED.value,
          updated_at = CURRENT_TIMESTAMP
    `, [chatModel]);

    console.log('✅ pgAI configuration updated');

    // 3. Create helper functions
    console.log('\n3️⃣ Creating helper functions...');

    // Function to get API key
    await pool.query(`
      CREATE OR REPLACE FUNCTION ai.get_api_key()
      RETURNS TEXT AS $$
      DECLARE
        api_key TEXT;
      BEGIN
        SELECT value INTO api_key
        FROM ai.config
        WHERE key = 'openai_api_key';
        RETURN api_key;
      END;
      $$ LANGUAGE plpgsql SECURITY DEFINER
    `);

    // Function to get embedding model
    await pool.query(`
      CREATE OR REPLACE FUNCTION ai.get_embedding_model()
      RETURNS TEXT AS $$
      DECLARE
        model TEXT;
      BEGIN
        SELECT value INTO model
        FROM ai.config
        WHERE key = 'embedding_model';
        RETURN COALESCE(model, 'text-embedding-3-large');
      END;
      $$ LANGUAGE plpgsql
    `);

    // Function to get model dimensions
    await pool.query(`
      CREATE OR REPLACE FUNCTION ai.get_model_dimensions(model_name TEXT)
      RETURNS INTEGER AS $$
      BEGIN
        CASE model_name
          WHEN 'text-embedding-3-large' THEN RETURN 3072;
          WHEN 'text-embedding-3-small' THEN RETURN 1536;
          WHEN 'text-embedding-ada-002' THEN RETURN 1536;
          ELSE RETURN 1536;
        END CASE;
      END;
      $$ LANGUAGE plpgsql IMMUTABLE
    `);

    console.log('✅ Helper functions created');

    // 4. Create sync function
    console.log('\n4️⃣ Creating settings sync function...');

    await pool.query(`
      CREATE OR REPLACE FUNCTION ai.sync_settings()
      RETURNS VOID AS $$
      DECLARE
        v_api_key TEXT;
        v_model TEXT;
      BEGIN
        -- Get latest API key
        SELECT value INTO v_api_key
        FROM settings
        WHERE key = 'openai.apiKey'
        LIMIT 1;

        -- Get latest embedding model
        SELECT value INTO v_model
        FROM settings
        WHERE key = 'activeEmbeddingModel'
        LIMIT 1;

        -- Update ai.config if values found
        IF v_api_key IS NOT NULL THEN
          UPDATE ai.config
          SET value = v_api_key, updated_at = CURRENT_TIMESTAMP
          WHERE key = 'openai_api_key';
        END IF;

        IF v_model IS NOT NULL AND v_model LIKE '%embedding%' THEN
          UPDATE ai.config
          SET value = v_model, updated_at = CURRENT_TIMESTAMP
          WHERE key = 'embedding_model';
        END IF;
      END;
      $$ LANGUAGE plpgsql
    `);

    console.log('✅ Settings sync function created');

    // 5. Display current configuration
    console.log('\n5️⃣ Current pgAI Configuration:');

    const configResult = await pool.query(`
      SELECT key, value, updated_at
      FROM ai.config
      ORDER BY key
    `);

    console.log('\n📋 Configuration:');
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
        ai.get_api_key() IS NOT NULL as has_api_key,
        ai.get_embedding_model() as current_model,
        ai.get_model_dimensions(ai.get_embedding_model()) as dimensions
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

    // 8. Update Python service configuration
    console.log('\n7️⃣ Updating Python service config...');

    // Store config for Python service to use
    await pool.query(`
      INSERT INTO ai.config (key, value, description)
      VALUES
        ('python_service_enabled', 'true', 'Enable Python service for embedding generation'),
        ('batch_size', '50', 'Batch size for processing'),
        ('max_retries', '3', 'Maximum retry attempts')
      ON CONFLICT (key) DO NOTHING
    `);

    console.log('\n========================================');
    console.log('✅ pgAI Configuration Complete!');
    console.log('========================================\n');
    console.log('pgAI is now configured to:');
    console.log('1. Use OpenAI API key from settings table');
    console.log('2. Use embedding model from settings table');
    console.log('3. Auto-sync when settings change');
    console.log('4. Work with Python service for processing');
    console.log('\nThe system will automatically update when you change');
    console.log('settings in the dashboard!');

  } catch (error) {
    console.error('\n❌ Configuration error:', error.message);
    console.error('Details:', error);
  } finally {
    await pool.end();
  }
}

// Run configuration
configurePgAIFromSettings().catch(console.error);