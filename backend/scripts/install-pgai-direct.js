/**
 * Direct pgAI Installation on PostgreSQL
 * Attempts to install pgai extension directly
 */

const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env.lsemb') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:12Kemal1221@91.99.229.96:5432/lsemb'
});

async function installPgAI() {
  console.log('🤖 pgAI Direct Installation');
  console.log('========================================\n');

  try {
    // 1. Check available extensions
    console.log('1️⃣ Checking available extensions...');

    const availableExt = await pool.query(`
      SELECT name, default_version, comment
      FROM pg_available_extensions
      WHERE name ILIKE '%ai%'
         OR name ILIKE '%ml%'
         OR name ILIKE '%vector%'
         OR name ILIKE '%embed%'
      ORDER BY name
    `);

    if (availableExt.rows.length > 0) {
      console.log('AI/ML related extensions available:');
      availableExt.rows.forEach(ext => {
        console.log(`  📦 ${ext.name} v${ext.default_version}`);
        if (ext.comment) {
          console.log(`     ${ext.comment}`);
        }
      });
    }

    // 2. Check if plpython3u is available (required for pgai)
    console.log('\n2️⃣ Checking Python support...');

    try {
      await pool.query('CREATE EXTENSION IF NOT EXISTS plpython3u');
      console.log('✅ plpython3u extension created');
    } catch (err) {
      console.log('⚠️  plpython3u not available:', err.message);
      console.log('   pgai requires plpython3u to be installed on the server');
    }

    // 3. Try different pgai variations
    console.log('\n3️⃣ Attempting to install pgai variations...');

    const extensionsToTry = ['pgai', 'ai', 'pg_ai', 'pgml', 'postgresml'];

    for (const extName of extensionsToTry) {
      try {
        await pool.query(`CREATE EXTENSION IF NOT EXISTS ${extName} CASCADE`);
        console.log(`✅ ${extName} extension installed successfully!`);

        // If successful, configure it
        await configurePgAI(extName);
        return;
      } catch (err) {
        if (!err.message.includes('does not exist')) {
          console.log(`  ❌ ${extName}: ${err.message.split('\n')[0]}`);
        }
      }
    }

    // 4. If no AI extension available, create custom implementation
    console.log('\n4️⃣ Creating custom pgai-like implementation...');
    await createCustomPgAI();

  } catch (error) {
    console.error('\n❌ Installation error:', error.message);
  } finally {
    await pool.end();
  }
}

async function configurePgAI(extensionName) {
  console.log(`\n📝 Configuring ${extensionName}...`);

  try {
    // Get OpenAI API key
    const apiKeyResult = await pool.query(`
      SELECT value FROM settings
      WHERE key = 'openai.apiKey'
      LIMIT 1
    `);

    if (apiKeyResult.rows.length === 0) {
      console.log('⚠️  OpenAI API key not found in settings');
      return;
    }

    let apiKey = apiKeyResult.rows[0].value;
    try {
      const parsed = JSON.parse(apiKey);
      apiKey = parsed.apiKey || parsed.key || apiKey;
    } catch {
      // Use as-is
    }

    // Store API key securely
    await pool.query(`
      INSERT INTO settings (key, value, category)
      VALUES ('pgai.openai_api_key', $1, 'ai')
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
    `, [apiKey]);

    console.log('✅ API key configured');

    // Create helper schema
    await pool.query('CREATE SCHEMA IF NOT EXISTS ai');

    // Create embedding functions
    await createEmbeddingFunctions();

    console.log('✅ pgai configuration complete!');

  } catch (error) {
    console.error('Configuration error:', error.message);
  }
}

async function createCustomPgAI() {
  console.log('Creating custom AI implementation...');

  try {
    // Create AI schema
    await pool.query('CREATE SCHEMA IF NOT EXISTS ai');

    // Create embedding queue table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ai.embedding_queue (
        id BIGSERIAL PRIMARY KEY,
        table_name VARCHAR(100),
        record_id VARCHAR(100),
        content TEXT,
        content_hash VARCHAR(64),
        embedding vector(3072),
        model VARCHAR(100) DEFAULT 'text-embedding-3-large',
        status VARCHAR(20) DEFAULT 'pending',
        tokens_used INTEGER,
        cost_usd NUMERIC(10, 6),
        error_message TEXT,
        retry_count INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        processed_at TIMESTAMP,
        UNIQUE(table_name, record_id)
      );

      CREATE INDEX IF NOT EXISTS idx_ai_queue_status
      ON ai.embedding_queue(status, created_at);
    `);

    // Create embedding cache
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ai.embedding_cache (
        id BIGSERIAL PRIMARY KEY,
        content_hash VARCHAR(64) UNIQUE,
        embedding vector(3072),
        model VARCHAR(100),
        tokens_used INTEGER,
        cost_usd NUMERIC(10, 6),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_ai_cache_hash
      ON ai.embedding_cache(content_hash);
    `);

    // Create configuration table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ai.config (
        key VARCHAR(100) PRIMARY KEY,
        value TEXT,
        description TEXT,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Store default config
      INSERT INTO ai.config (key, value, description)
      VALUES
        ('model', 'text-embedding-3-large', 'Default embedding model'),
        ('batch_size', '100', 'Batch size for processing'),
        ('max_retries', '3', 'Maximum retry attempts'),
        ('cache_enabled', 'true', 'Enable embedding cache')
      ON CONFLICT (key) DO NOTHING;
    `);

    console.log('✅ Custom AI tables created');

    // Create functions
    await createEmbeddingFunctions();

    // Create automatic triggers
    await createAutoEmbedTriggers();

    console.log('✅ Custom pgai implementation ready!');

    // Show status
    const status = await pool.query('SELECT * FROM ai.get_status()');
    console.log('\n📊 Status:', status.rows[0]);

  } catch (error) {
    console.error('Custom implementation error:', error.message);
  }
}

async function createEmbeddingFunctions() {
  console.log('Creating embedding functions...');

  await pool.query(`
    -- Hash function for content
    CREATE OR REPLACE FUNCTION ai.hash_content(content TEXT)
    RETURNS VARCHAR(64)
    LANGUAGE sql IMMUTABLE
    AS $$
      SELECT encode(digest(content, 'sha256'), 'hex');
    $$;

    -- Queue embedding generation
    CREATE OR REPLACE FUNCTION ai.queue_embedding(
      p_table_name VARCHAR,
      p_record_id VARCHAR,
      p_content TEXT
    )
    RETURNS BOOLEAN AS $$
    DECLARE
      v_hash VARCHAR(64);
      v_cached_embedding vector(3072);
    BEGIN
      -- Calculate content hash
      v_hash := ai.hash_content(p_content);

      -- Check cache first
      SELECT embedding INTO v_cached_embedding
      FROM ai.embedding_cache
      WHERE content_hash = v_hash;

      IF v_cached_embedding IS NOT NULL THEN
        -- Use cached embedding
        UPDATE unified_embeddings
        SET embedding = v_cached_embedding,
            updated_at = CURRENT_TIMESTAMP
        WHERE source_table = p_table_name
          AND source_id = p_record_id;

        RETURN TRUE;
      END IF;

      -- Queue for generation
      INSERT INTO ai.embedding_queue (table_name, record_id, content, content_hash)
      VALUES (p_table_name, p_record_id, p_content, v_hash)
      ON CONFLICT (table_name, record_id)
      DO UPDATE SET
        content = EXCLUDED.content,
        content_hash = EXCLUDED.content_hash,
        status = 'pending',
        retry_count = 0;

      RETURN TRUE;
    END;
    $$ LANGUAGE plpgsql;

    -- Process queue function (for external processing)
    CREATE OR REPLACE FUNCTION ai.get_pending_batch(batch_size INTEGER DEFAULT 10)
    RETURNS TABLE (
      queue_id BIGINT,
      content TEXT
    ) AS $$
    BEGIN
      RETURN QUERY
      UPDATE ai.embedding_queue
      SET status = 'processing',
          processed_at = CURRENT_TIMESTAMP
      WHERE id IN (
        SELECT id FROM ai.embedding_queue
        WHERE status = 'pending' AND retry_count < 3
        ORDER BY created_at
        LIMIT batch_size
        FOR UPDATE SKIP LOCKED
      )
      RETURNING id, content;
    END;
    $$ LANGUAGE plpgsql;

    -- Update embedding result
    CREATE OR REPLACE FUNCTION ai.update_embedding(
      p_queue_id BIGINT,
      p_embedding vector(3072),
      p_tokens INTEGER DEFAULT NULL,
      p_cost NUMERIC DEFAULT NULL
    )
    RETURNS BOOLEAN AS $$
    DECLARE
      v_record RECORD;
    BEGIN
      -- Get queue record
      SELECT * INTO v_record
      FROM ai.embedding_queue
      WHERE id = p_queue_id;

      IF NOT FOUND THEN
        RETURN FALSE;
      END IF;

      -- Update queue
      UPDATE ai.embedding_queue
      SET status = 'completed',
          embedding = p_embedding,
          tokens_used = p_tokens,
          cost_usd = p_cost
      WHERE id = p_queue_id;

      -- Add to cache
      INSERT INTO ai.embedding_cache (content_hash, embedding, model, tokens_used, cost_usd)
      VALUES (v_record.content_hash, p_embedding, v_record.model, p_tokens, p_cost)
      ON CONFLICT (content_hash) DO NOTHING;

      -- Update original table
      UPDATE unified_embeddings
      SET embedding = p_embedding,
          tokens_used = p_tokens,
          updated_at = CURRENT_TIMESTAMP
      WHERE source_table = v_record.table_name
        AND source_id = v_record.record_id;

      RETURN TRUE;
    END;
    $$ LANGUAGE plpgsql;

    -- Status function
    CREATE OR REPLACE FUNCTION ai.get_status()
    RETURNS TABLE (
      pending_count BIGINT,
      processing_count BIGINT,
      completed_count BIGINT,
      failed_count BIGINT,
      cache_size BIGINT,
      total_tokens BIGINT,
      total_cost NUMERIC
    ) AS $$
    BEGIN
      RETURN QUERY
      SELECT
        (SELECT COUNT(*) FROM ai.embedding_queue WHERE status = 'pending'),
        (SELECT COUNT(*) FROM ai.embedding_queue WHERE status = 'processing'),
        (SELECT COUNT(*) FROM ai.embedding_queue WHERE status = 'completed'),
        (SELECT COUNT(*) FROM ai.embedding_queue WHERE status = 'failed'),
        (SELECT COUNT(*) FROM ai.embedding_cache),
        (SELECT COALESCE(SUM(tokens_used), 0) FROM ai.embedding_queue WHERE status = 'completed'),
        (SELECT COALESCE(SUM(cost_usd), 0) FROM ai.embedding_queue WHERE status = 'completed');
    END;
    $$ LANGUAGE plpgsql;
  `);

  console.log('✅ Embedding functions created');
}

async function createAutoEmbedTriggers() {
  console.log('Creating automatic embedding triggers...');

  await pool.query(`
    -- Auto-queue trigger function
    CREATE OR REPLACE FUNCTION ai.auto_queue_trigger()
    RETURNS TRIGGER AS $$
    BEGIN
      -- Skip if content is too short
      IF LENGTH(NEW.content) < 10 THEN
        RETURN NEW;
      END IF;

      -- Queue for embedding generation
      PERFORM ai.queue_embedding(
        TG_TABLE_NAME,
        NEW.source_id::VARCHAR,
        NEW.content
      );

      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    -- Apply to unified_embeddings
    DROP TRIGGER IF EXISTS auto_queue_embedding ON unified_embeddings;

    CREATE TRIGGER auto_queue_embedding
    AFTER INSERT OR UPDATE OF content
    ON unified_embeddings
    FOR EACH ROW
    WHEN (NEW.embedding IS NULL)
    EXECUTE FUNCTION ai.auto_queue_trigger();
  `);

  console.log('✅ Auto-embedding triggers created');
}

// Run installation
installPgAI().catch(console.error);