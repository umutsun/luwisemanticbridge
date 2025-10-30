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

    console.log('✅ Found API key in settings');
    console.log(`📊 Embedding Model: ${embeddingModel}`);
    console.log(`💬 Chat Model: ${chatModel}`);

    // 2. Update pgAI configuration
    console.log('\n2️⃣ Updating pgAI configuration...');

    // Store in ai.config table
    await pool.query(`
      -- Ensure ai schema exists
      CREATE SCHEMA IF NOT EXISTS ai;

      -- Create or update config table
      CREATE TABLE IF NOT EXISTS ai.config (
        key VARCHAR(100) PRIMARY KEY,
        value TEXT,
        description TEXT,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Update API key
      INSERT INTO ai.config (key, value, description)
      VALUES ('openai_api_key', $1, 'OpenAI API Key from settings')
      ON CONFLICT (key) DO UPDATE
      SET value = EXCLUDED.value,
          updated_at = CURRENT_TIMESTAMP;

      -- Update embedding model
      INSERT INTO ai.config (key, value, description)
      VALUES ('embedding_model', $2, 'Default embedding model from settings')
      ON CONFLICT (key) DO UPDATE
      SET value = EXCLUDED.value,
          updated_at = CURRENT_TIMESTAMP;

      -- Update chat model
      INSERT INTO ai.config (key, value, description)
      VALUES ('chat_model', $3, 'Default chat model from settings')
      ON CONFLICT (key) DO UPDATE
      SET value = EXCLUDED.value,
          updated_at = CURRENT_TIMESTAMP;
    `, [apiKey, embeddingModel, chatModel]);

    console.log('✅ pgAI configuration updated');

    // 3. Create functions that use settings
    console.log('\n3️⃣ Creating settings-aware functions...');

    await pool.query(`
      -- Function to get current API key
      CREATE OR REPLACE FUNCTION ai.get_api_key()
      RETURNS TEXT AS $$
      DECLARE
        api_key TEXT;
      BEGIN
        -- First try ai.config
        SELECT value INTO api_key
        FROM ai.config
        WHERE key = 'openai_api_key';

        IF api_key IS NOT NULL THEN
          RETURN api_key;
        END IF;

        -- Fallback to settings table
        SELECT value INTO api_key
        FROM settings
        WHERE key = 'openai.apiKey'
        LIMIT 1;

        RETURN api_key;
      END;
      $$ LANGUAGE plpgsql SECURITY DEFINER;

      -- Function to get current embedding model
      CREATE OR REPLACE FUNCTION ai.get_embedding_model()
      RETURNS TEXT AS $$
      DECLARE
        model TEXT;
      BEGIN
        -- First try ai.config
        SELECT value INTO model
        FROM ai.config
        WHERE key = 'embedding_model';

        IF model IS NOT NULL THEN
          RETURN model;
        END IF;

        -- Fallback to settings table
        SELECT value INTO model
        FROM settings
        WHERE key = 'activeEmbeddingModel'
        LIMIT 1;

        -- Default if not found
        RETURN COALESCE(model, 'text-embedding-3-large');
      END;
      $$ LANGUAGE plpgsql;

      -- Function to get model dimensions
      CREATE OR REPLACE FUNCTION ai.get_model_dimensions(model_name TEXT)
      RETURNS INTEGER AS $$
      BEGIN
        CASE model_name
          WHEN 'text-embedding-3-large' THEN RETURN 3072;
          WHEN 'text-embedding-3-small' THEN RETURN 1536;
          WHEN 'text-embedding-ada-002' THEN RETURN 1536;
          ELSE RETURN 1536; -- Default
        END CASE;
      END;
      $$ LANGUAGE plpgsql IMMUTABLE;

      -- Enhanced queue embedding function
      CREATE OR REPLACE FUNCTION ai.queue_embedding_with_settings(
        p_table_name VARCHAR,
        p_record_id VARCHAR,
        p_content TEXT,
        p_model VARCHAR DEFAULT NULL
      )
      RETURNS BOOLEAN AS $$
      DECLARE
        v_hash VARCHAR(64);
        v_model VARCHAR(100);
        v_dimensions INTEGER;
      BEGIN
        -- Use provided model or get from settings
        v_model := COALESCE(p_model, ai.get_embedding_model());
        v_dimensions := ai.get_model_dimensions(v_model);

        -- Calculate content hash
        v_hash := encode(digest(p_content, 'sha256'), 'hex');

        -- Check cache for this model
        IF EXISTS (
          SELECT 1 FROM ai.embedding_cache
          WHERE content_hash = v_hash AND model = v_model
        ) THEN
          -- Use cached embedding
          UPDATE unified_embeddings ue
          SET embedding = ec.embedding,
              updated_at = CURRENT_TIMESTAMP
          FROM ai.embedding_cache ec
          WHERE ec.content_hash = v_hash
            AND ec.model = v_model
            AND ue.source_table = p_table_name
            AND ue.source_id = p_record_id;

          RETURN TRUE;
        END IF;

        -- Queue for generation with specific model
        INSERT INTO ai.embedding_queue (
          table_name, record_id, content, content_hash, model
        )
        VALUES (
          p_table_name, p_record_id, p_content, v_hash, v_model
        )
        ON CONFLICT (table_name, record_id)
        DO UPDATE SET
          content = EXCLUDED.content,
          content_hash = EXCLUDED.content_hash,
          model = EXCLUDED.model,
          status = 'pending',
          retry_count = 0;

        RETURN TRUE;
      END;
      $$ LANGUAGE plpgsql;

      -- Trigger that uses settings
      CREATE OR REPLACE FUNCTION ai.auto_embed_with_settings()
      RETURNS TRIGGER AS $$
      BEGIN
        IF LENGTH(NEW.content) < 10 THEN
          RETURN NEW;
        END IF;

        -- Queue with model from settings
        PERFORM ai.queue_embedding_with_settings(
          TG_TABLE_NAME,
          NEW.source_id::VARCHAR,
          NEW.content,
          NULL -- Will use model from settings
        );

        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;

      -- Apply new trigger
      DROP TRIGGER IF EXISTS auto_queue_embedding ON unified_embeddings;

      CREATE TRIGGER auto_queue_embedding
      AFTER INSERT OR UPDATE OF content
      ON unified_embeddings
      FOR EACH ROW
      WHEN (NEW.embedding IS NULL)
      EXECUTE FUNCTION ai.auto_embed_with_settings();
    `);

    console.log('✅ Settings-aware functions created');

    // 4. Create sync function to keep settings updated
    console.log('\n4️⃣ Creating settings sync function...');

    await pool.query(`
      -- Function to sync settings changes
      CREATE OR REPLACE FUNCTION ai.sync_settings()
      RETURNS VOID AS $$
      DECLARE
        v_api_key TEXT;
        v_model TEXT;
      BEGIN
        -- Get latest settings
        SELECT value INTO v_api_key
        FROM settings
        WHERE key = 'openai.apiKey'
        ORDER BY updated_at DESC
        LIMIT 1;

        SELECT value INTO v_model
        FROM settings
        WHERE key IN ('activeEmbeddingModel', 'embedding.activeModel')
        ORDER BY updated_at DESC
        LIMIT 1;

        -- Update ai.config
        IF v_api_key IS NOT NULL THEN
          UPDATE ai.config
          SET value = v_api_key, updated_at = CURRENT_TIMESTAMP
          WHERE key = 'openai_api_key';
        END IF;

        IF v_model IS NOT NULL THEN
          UPDATE ai.config
          SET value = v_model, updated_at = CURRENT_TIMESTAMP
          WHERE key = 'embedding_model';
        END IF;
      END;
      $$ LANGUAGE plpgsql;

      -- Trigger to auto-sync when settings change
      CREATE OR REPLACE FUNCTION ai.settings_change_trigger()
      RETURNS TRIGGER AS $$
      BEGIN
        IF NEW.key IN ('openai.apiKey', 'activeEmbeddingModel', 'embedding.activeModel') THEN
          PERFORM ai.sync_settings();
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;

      DROP TRIGGER IF EXISTS sync_ai_settings ON settings;

      CREATE TRIGGER sync_ai_settings
      AFTER INSERT OR UPDATE
      ON settings
      FOR EACH ROW
      EXECUTE FUNCTION ai.settings_change_trigger();
    `);

    console.log('✅ Settings sync trigger created');

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

    console.log('\n========================================');
    console.log('✅ pgAI Configuration Complete!');
    console.log('========================================\n');
    console.log('pgAI is now configured to use:');
    console.log('1. OpenAI API key from settings table');
    console.log('2. Embedding model from settings table');
    console.log('3. Auto-sync when settings change');
    console.log('\nThe system will automatically update when you change');
    console.log('settings in the dashboard!');

  } catch (error) {
    console.error('\n❌ Configuration error:', error.message);
  } finally {
    await pool.end();
  }
}

// Run configuration
configurePgAIFromSettings().catch(console.error);