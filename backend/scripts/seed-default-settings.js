const { Pool } = require('pg');
require('dotenv').config();

// Database connection
const pool = new Pool({
  connectionString: process.env.ASEMB_DATABASE_URL || 'postgresql://postgres:Semsiye!22@91.99.229.96:5432/asemb'
});

// Default settings to seed
const defaultSettings = [
  // App settings
  { key: 'app.name', value: 'Alice Semantic Bridge' },
  { key: 'app.description', value: 'AI-Powered Knowledge Management System' },
  { key: 'app.version', value: '1.0.0' },
  { key: 'app.locale', value: 'tr' },

  // OpenAI settings
  { key: 'openai.apiKey', value: process.env.OPENAI_API_KEY || '' },
  { key: 'openai.model', value: process.env.OPENAI_MODEL || 'gpt-4o-mini' },
  { key: 'openai.embeddingModel', value: process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-large' },
  { key: 'openai.maxTokens', value: '4096' },
  { key: 'openai.temperature', value: '0.7' },

  // Anthropic settings
  { key: 'anthropic.apiKey', value: process.env.CLAUDE_API_KEY || '' },
  { key: 'anthropic.model', value: 'claude-3-5-sonnet-20241022' },
  { key: 'anthropic.maxTokens', value: '4096' },

  // Gemini settings
  { key: 'google.apiKey', value: process.env.GEMINI_API_KEY || '' },
  { key: 'google.projectId', value: process.env.GOOGLE_PROJECT_ID || '' },

  // Deepseek settings
  { key: 'deepseek.apiKey', value: process.env.DEEPSEEK_API_KEY || '' },
  { key: 'deepseek.baseUrl', value: 'https://api.deepseek.com' },
  { key: 'deepseek.model', value: 'deepseek-coder' },

  // Huggingface settings
  { key: 'huggingface.apiKey', value: process.env.HUGGINGFACE_API_KEY || '' },
  { key: 'huggingface.model', value: 'sentence-transformers/all-MiniLM-L6-v2' },
  { key: 'huggingface.endpoint', value: 'https://api-inference.huggingface.co/models/' },

  // Database settings
  { key: 'database.host', value: process.env.POSTGRES_HOST || '91.99.229.96' },
  { key: 'database.port', value: process.env.POSTGRES_PORT || '5432' },
  { key: 'database.name', value: process.env.POSTGRES_DB || 'asemb' },
  { key: 'database.user', value: process.env.POSTGRES_USER || 'postgres' },
  { key: 'database.ssl', value: 'false' },
  { key: 'database.maxConnections', value: '20' },

  // Redis settings
  { key: 'redis.host', value: process.env.REDIS_HOST || 'localhost' },
  { key: 'redis.port', value: process.env.REDIS_PORT || '6380' },
  { key: 'redis.password', value: '' },
  { key: 'redis.db', value: process.env.REDIS_DB || '2' },

  // Scraper settings
  { key: 'scraper.timeout', value: '30000' },
  { key: 'scraper.maxConcurrency', value: '3' },
  { key: 'scraper.userAgent', value: 'ASB Web Scraper' },

  // Embeddings settings
  { key: 'embeddings.provider', value: process.env.EMBEDDING_PROVIDER || 'google' },
  { key: 'embeddings.model', value: process.env.EMBEDDING_MODEL || 'text-embedding-004' },
  { key: 'embeddings.batchSize', value: '100' },
  { key: 'embeddings.maxTokens', value: '8192' },
  { key: 'embeddings.dimension', value: '1536' },
  { key: 'embeddings.enabled', value: 'true' },
  { key: 'embeddings.chunkSize', value: '1000' },
  { key: 'embeddings.chunkOverlap', value: '200' },

  // Data source settings
  { key: 'dataSource.useLocalDb', value: 'true' },
  { key: 'dataSource.localDbPercentage', value: '100' },
  { key: 'dataSource.externalApiPercentage', value: '0' },
  { key: 'dataSource.hybridMode', value: 'false' },
  { key: 'dataSource.prioritySource', value: 'local' },

  // LLM settings
  { key: 'llmSettings.temperature', value: '0.3' },
  { key: 'llmSettings.topP', value: '0.9' },
  { key: 'llmSettings.maxTokens', value: '4096' },
  { key: 'llmSettings.presencePenalty', value: '0' },
  { key: 'llmSettings.frequencyPenalty', value: '0' },
  { key: 'llmSettings.ragWeight', value: '95' },
  { key: 'llmSettings.llmKnowledgeWeight', value: '5' },
  { key: 'llmSettings.streamResponse', value: 'true' },
  { key: 'llmSettings.systemPrompt', value: 'Sen bir RAG asistanısın. SADECE verilen context\'ten cevap ver.' },
  { key: 'llmSettings.activeChatModel', value: 'anthropic/claude-3-5-sonnet' },
  { key: 'llmSettings.activeEmbeddingModel', value: 'google/text-embedding-004' },
  { key: 'llmSettings.responseStyle', value: 'professional' },
  { key: 'llmSettings.language', value: 'tr' },

  // RAG settings
  { key: 'ragSettings.similarityThreshold', value: '0.001' },
  { key: 'ragSettings.maxResults', value: '10' },
  { key: 'ragSettings.minResults', value: '3' },
  { key: 'ragSettings.enableHybridSearch', value: 'true' },
  { key: 'logging.level', value: 'info' },
  { key: 'logging.enableConsole', value: 'true' },
  { key: 'logging.enableFile', value: 'false' }
];

async function seedSettings() {
  try {
    console.log('Starting to seed default settings...');

    // Check if settings table exists
    const tableExists = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = 'settings'
      )
    `);

    if (!tableExists.rows[0].exists) {
      console.log('Creating settings table...');
      await pool.query(`
        CREATE TABLE settings (
          key VARCHAR(255) PRIMARY KEY,
          value TEXT NOT NULL,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        )
      `);
    }

    // Insert or update settings
    for (const setting of defaultSettings) {
      await pool.query(`
        INSERT INTO settings (key, value)
        VALUES ($1, $2)
        ON CONFLICT (key)
        DO UPDATE SET
          value = EXCLUDED.value,
          updated_at = CURRENT_TIMESTAMP
      `, [setting.key, setting.value]);
    }

    console.log('✅ Default settings seeded successfully!');
    console.log(`📊 Total settings inserted: ${defaultSettings.length}`);

  } catch (error) {
    console.error('❌ Error seeding settings:', error);
  } finally {
    await pool.end();
  }
}

// Run the seeding
seedSettings();