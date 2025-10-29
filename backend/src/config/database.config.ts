import { Pool } from 'pg';
import dotenv from 'dotenv';
import { SettingsService, DatabaseConfig, RedisConfig } from '../services/settings.service';

dotenv.config();

// LSEMB System Database - Get from .env file
export const lsembDbConfig = {
  host: process.env.POSTGRES_HOST || '91.99.229.96',
  port: parseInt(process.env.POSTGRES_PORT || '5432'),
  database: process.env.POSTGRES_DB || 'lsemb',
  user: process.env.POSTGRES_USER || 'postgres',
  password: process.env.POSTGRES_PASSWORD || '123456',
  ssl: false, // SSL disabled for local development
  connectionTimeoutMillis: 30000, // 30 seconds timeout
  idleTimeoutMillis: 30000,
  max: 20 // Maximum number of clients in the pool
};


// Dynamic configurations from LSEMB database
let customerDbConfig: DatabaseConfig;
let redisConfig: RedisConfig;
let llmProviders: any;
let appConfig: any;

// Initialize all configurations from environment variables
export async function initializeConfigs(): Promise<void> {
  console.log('⚠️ Using configurations from environment variables');

  // Set configurations from environment
  customerDbConfig = {
    host: process.env.POSTGRES_HOST || 'localhost',
    port: parseInt(process.env.POSTGRES_PORT || '5432'),
    database: process.env.POSTGRES_DB || 'lsemb',
    user: process.env.POSTGRES_USER || 'postgres',
    password: process.env.POSTGRES_PASSWORD || '',
    ssl: process.env.POSTGRES_SSL === 'true'
  };

  redisConfig = {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    db: parseInt(process.env.REDIS_DB || '2'),
    password: process.env.REDIS_PASSWORD || 'Semsiye!22'
  };

  llmProviders = {
    primary: process.env.LLM_PROVIDER || 'openai',
    fallback_enabled: process.env.AI_FALLBACK_ENABLED === 'true',
    fallback_provider: process.env.AI_FALLBACK_PROVIDER || 'claude',
    openai: {
      api_key: process.env.OPENAI_API_KEY || '',
      api_base: process.env.OPENAI_API_BASE || null
    },
    claude: {
      api_key: process.env.CLAUDE_API_KEY || ''
    },
    gemini: {
      api_key: process.env.GEMINI_API_KEY || '',
      project_id: process.env.GOOGLE_PROJECT_ID || ''
    },
    deepseek: {
      api_key: process.env.DEEPSEEK_API_KEY || ''
    },
    huggingface: {
      api_key: process.env.HUGGINGFACE_API_KEY || ''
    }
  };

  appConfig = {
    port: process.env.API_PORT || '8083',
    cors_origin: process.env.CORS_ORIGINS || 'http://localhost:3000',
    log_level: process.env.LOG_LEVEL || 'info',
    rate_limit_window: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000'),
    rate_limit_max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100')
  };

  console.log('✅ All configurations loaded from environment variables');
}

// Sync API keys from environment variables to database
export async function syncAPIKeysToDatabase(): Promise<void> {
  console.log('🔄 Syncing API keys from environment variables to database (only if not exists)...');

  try {
    const apiKeys = [
      { key: 'openai.apiKey', value: process.env.OPENAI_API_KEY || '' },
      { key: 'anthropic.apiKey', value: process.env.CLAUDE_API_KEY || '' },
      { key: 'google.apiKey', value: process.env.GEMINI_API_KEY || '' },
      { key: 'deepseek.apiKey', value: process.env.DEEPSEEK_API_KEY || '' },
      { key: 'huggingface.apiKey', value: process.env.HUGGINGFACE_API_KEY || '' },
      { key: 'google.projectId', value: process.env.GOOGLE_PROJECT_ID || '' },
    ];

    for (const apiKey of apiKeys) {
      if (apiKey.value) {
        // Check if key already exists
        const existing = await lsembPool.query(
          'SELECT key, value FROM settings WHERE key = $1',
          [apiKey.key]
        );

        if (existing.rows.length === 0) {
          // Insert new key only if it doesn't exist
          await lsembPool.query(
            'INSERT INTO settings (key, value, category, description) VALUES ($1, $2, $3, $4)',
            [apiKey.key, apiKey.value, 'api_keys', `API key for ${apiKey.key.replace('.apiKey', '').replace('.', ' ').toUpperCase()}`]
          );
          console.log(`✅ Added ${apiKey.key} to database`);
        } else {
          // Keep existing key in database, don't override
          console.log(`🔒 Keeping existing ${apiKey.key} in database (not overriding from environment)`);
        }
      }
    }

    console.log('✅ API keys sync completed successfully');
  } catch (error) {
    console.error('❌ Failed to sync API keys to database:', error);
    throw error;
  }
}

// Export functions to get current configurations
export function getCustomerDbConfig(): DatabaseConfig {
  return customerDbConfig;
}

export function getRedisConfig(): RedisConfig {
  return redisConfig;
}

export function getLLMProviders(): any {
  return llmProviders;
}

export function getAppConfig(): any {
  return appConfig;
}

// LSEMB System Database Pool - OPTIMIZED
export const lsembPool = new Pool({
  ...lsembDbConfig,
  max: 25, // Increased from 20 to 25 for better concurrency
  idleTimeoutMillis: 10000, // Reduced from 30000 to 10000 for faster cleanup
  connectionTimeoutMillis: 60000, // Increased from 30000 to 60000 for reliability
  // Add connection pool monitoring
  allowExitOnIdle: false,
  // Enable automatic connection recovery
  keepAlive: true,
  keepAliveInitialDelayMillis: 10000,
});

// Connection pool monitoring and memory leak prevention
lsembPool.on('connect', (client) => {
  console.log('🔗 Database client connected');
});

lsembPool.on('error', (err, client) => {
  console.error('❌ Database client error:', err);
});

lsembPool.on('remove', (client) => {
  console.log('🗑️ Database client removed from pool');
});

// Monitor pool status every 30 seconds
setInterval(() => {
  const totalCount = lsembPool.totalCount;
  const idleCount = lsembPool.idleCount;
  const waitingCount = lsembPool.waitingCount;

  if (totalCount > 15) { // Alert if using more than 60% of pool
    console.log(`⚠️ Pool usage: ${totalCount}/25 (Idle: ${idleCount}, Waiting: ${waitingCount})`);
  }
}, 30000);

// Alias for backward compatibility - some services still use lsembPool
export const lsembPool = lsembPool;

// Customer Database Pool (created dynamically)
let customerPool: Pool | null = null;

export function getCustomerPool(config?: DatabaseConfig): Pool {
  if (!customerPool || config) {
    const dbConfig = config || getCustomerDbConfig();
    // DEBUG: Fixed database name mapping issue
    console.log('DEBUG: getCustomerPool creating pool with config:', JSON.stringify(dbConfig, null, 2));

    // Map the config properties to match Pool constructor expectations
    // The settings object uses 'name' but Pool expects 'database'
    const poolConfig = {
      host: dbConfig.host,
      port: dbConfig.port,
      database: (dbConfig as any).name || (dbConfig as any).database, // Handle both property names
      user: dbConfig.user,
      password: dbConfig.password,
      ssl: dbConfig.ssl,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 30000,
    };

    console.log('DEBUG: Pool configuration:', {
      host: poolConfig.host,
      port: poolConfig.port,
      database: poolConfig.database,
      user: poolConfig.user,
      ssl: poolConfig.ssl
    });

    customerPool = new Pool(poolConfig);
  }
  return customerPool;
}

// Settings-based Database Pool for Embeddings Manager
let settingsBasedPool: Pool | null = null;

export async function getSettingsBasedPool(): Promise<Pool> {
  if (settingsBasedPool) {
    return settingsBasedPool;
  }

  try {
    // Read database configuration from settings
    const client = await lsembPool.connect();
    try {
      const result = await client.query(`
        SELECT value FROM settings
        WHERE key = 'customer_database'
      `);

      if (result.rows.length > 0 && result.rows[0].value) {
        const dbConfig = result.rows[0].value;
        console.log('📊 Creating database pool from settings:', {
          host: dbConfig.host,
          port: dbConfig.port,
          database: dbConfig.database
        });

        settingsBasedPool = new Pool({
          host: dbConfig.host,
          port: dbConfig.port,
          database: dbConfig.database,
          user: dbConfig.user,
          password: dbConfig.password,
          ssl: dbConfig.ssl || false,
          max: 10,
          idleTimeoutMillis: 30000,
          connectionTimeoutMillis: 30000,
        });

        return settingsBasedPool;
      } else {
        console.log('⚠️ No customer_database settings found, using default config');
        // Fallback to default customer database config
        settingsBasedPool = getCustomerPool();
        return settingsBasedPool;
      }
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('❌ Error reading database settings:', error);
    // Fallback to default customer database config
    settingsBasedPool = getCustomerPool();
    return settingsBasedPool;
  }
}

// Function to reset the settings-based pool (when settings change)
export function resetSettingsBasedPool(): void {
  if (settingsBasedPool) {
    settingsBasedPool.end();
    settingsBasedPool = null;
  }
}

// Test database connection
export async function testDatabaseConnection(config: any): Promise<{ success: boolean; error?: string }> {
  const testPool = new Pool({
    ...config,
    max: 1,
    connectionTimeoutMillis: 5000,
  });

  try {
    const client = await testPool.connect();
    await client.query('SELECT NOW()');
    client.release();
    await testPool.end();
    return { success: true };
  } catch (error: any) {
    await testPool.end();
    return { 
      success: false, 
      error: error.message || 'Connection failed' 
    };
  }
}

// Initialize LSEMB database tables
export async function initializeLsembDatabase() {
  const client = await lsembPool.connect();
  
  try {
    // Create tables for ASEMB system
    await client.query(`
      CREATE TABLE IF NOT EXISTS scraped_pages (
        id SERIAL PRIMARY KEY,
        url TEXT UNIQUE NOT NULL,
        title TEXT,
        content TEXT,
        description TEXT,
        keywords TEXT,
        content_length INTEGER,
        chunk_count INTEGER DEFAULT 0,
        token_count INTEGER DEFAULT 0,
        scraping_mode VARCHAR(50),
        metadata JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS embeddings (
        id SERIAL PRIMARY KEY,
        source_type VARCHAR(50) NOT NULL,
        source_id INTEGER,
        content TEXT NOT NULL,
        embedding vector(1536),
        metadata JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS documents (
        id SERIAL PRIMARY KEY,
        filename TEXT NOT NULL,
        content TEXT,
        file_type VARCHAR(50),
        file_size INTEGER,
        chunk_count INTEGER DEFAULT 0,
        embedding_count INTEGER DEFAULT 0,
        metadata JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        parsed_data JSONB,
        column_headers TEXT[],
        row_count INTEGER,
        transform_status VARCHAR(50) DEFAULT 'pending',
        transform_progress INTEGER DEFAULT 0,
        target_table_name VARCHAR(255),
        source_db_id VARCHAR(100),
        transform_errors JSONB,
        transformed_at TIMESTAMP,
        data_quality_score FLOAT
      )
    `);

    // Create indexes for document transform
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_documents_transform_status ON documents(transform_status);
      CREATE INDEX IF NOT EXISTS idx_documents_file_type ON documents(file_type);
      CREATE INDEX IF NOT EXISTS idx_documents_source_db_id ON documents(source_db_id);
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS settings (
        id SERIAL PRIMARY KEY,
        key VARCHAR(255) UNIQUE NOT NULL,
        value JSONB NOT NULL,
        category VARCHAR(100),
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Insert default settings if they don't exist
    await client.query(`
      INSERT INTO settings (key, value, category, description) VALUES
      ('lsemb_database', $1, 'database', 'LSEMB system database configuration'),
      ('customer_database', $2, 'database', 'Customer database configuration'),
      ('redis_config', $3, 'database', 'Redis configuration'),
      ('llm_providers', $4, 'ai', 'LLM provider configurations'),
      ('app_config', $5, 'application', 'Application configuration')
      ON CONFLICT (key) DO NOTHING
    `, [
      JSON.stringify({
        host: process.env.POSTGRES_HOST || 'localhost',
        port: parseInt(process.env.POSTGRES_PORT || '5432'),
        database: process.env.POSTGRES_DB || 'lsemb',
        user: process.env.POSTGRES_USER || 'postgres',
        password: process.env.POSTGRES_PASSWORD || '',
        ssl: process.env.POSTGRES_SSL === 'true'
      }),
      JSON.stringify({
        host: process.env.POSTGRES_HOST || 'localhost',
        port: parseInt(process.env.POSTGRES_PORT || '5432'),
        database: process.env.POSTGRES_DB || 'lsemb',
        user: process.env.POSTGRES_USER || 'postgres',
        password: process.env.POSTGRES_PASSWORD || '',
        ssl: process.env.POSTGRES_SSL === 'true'
      }),
      JSON.stringify({
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
        db: parseInt(process.env.REDIS_DB || '2'),
        password: process.env.REDIS_PASSWORD || null
      }),
      JSON.stringify({
        primary: process.env.LLM_PROVIDER || 'openai',
        fallback_enabled: process.env.AI_FALLBACK_ENABLED === 'true',
        fallback_provider: process.env.AI_FALLBACK_PROVIDER || 'claude',
        openai: {
          api_key: process.env.OPENAI_API_KEY || '',
          api_base: process.env.OPENAI_API_BASE || null
        },
        claude: {
          api_key: process.env.CLAUDE_API_KEY || ''
        },
        gemini: {
          api_key: process.env.GEMINI_API_KEY || '',
          project_id: process.env.GOOGLE_PROJECT_ID || ''
        },
        deepseek: {
          api_key: process.env.DEEPSEEK_API_KEY || ''
        },
        huggingface: {
          api_key: process.env.HUGGINGFACE_API_KEY || ''
        }
      }),
      JSON.stringify({
        port: process.env.API_PORT || '8083',
        cors_origin: process.env.CORS_ORIGINS || 'http://localhost:3000',
        log_level: process.env.LOG_LEVEL || 'info',
        rate_limit_window: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000'),
        rate_limit_max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100')
      })
    ]);

    // Create chat tables
    await client.query(`
      CREATE TABLE IF NOT EXISTS chatbot_settings (
        id SERIAL PRIMARY KEY,
        setting_key VARCHAR(255) UNIQUE NOT NULL,
        setting_value TEXT,
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS conversations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id VARCHAR(255) NOT NULL,
        title VARCHAR(500),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        metadata JSONB DEFAULT '{}'::jsonb
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS messages (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        role VARCHAR(50) NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
        content TEXT NOT NULL,
        sources JSONB DEFAULT '[]'::jsonb,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        metadata JSONB DEFAULT '{}'::jsonb
      )
    `);

    // Create indexes for chat tables
    await client.query(`CREATE INDEX IF NOT EXISTS idx_chatbot_settings_key ON chatbot_settings(setting_key)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON conversations(user_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_conversations_created_at ON conversations(created_at DESC)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at)`);

    // Create updated_at trigger function for conversations
    await client.query(`
      CREATE OR REPLACE FUNCTION update_updated_at_column()
      RETURNS TRIGGER AS $$
      BEGIN
          NEW.updated_at = CURRENT_TIMESTAMP;
          RETURN NEW;
      END;
      $$ language 'plpgsql'
    `);

    // Create trigger for conversations
    await client.query(`
      DROP TRIGGER IF EXISTS update_conversations_updated_at ON conversations
    `);
    await client.query(`
      CREATE TRIGGER update_conversations_updated_at
          BEFORE UPDATE ON conversations
          FOR EACH ROW
          EXECUTE FUNCTION update_updated_at_column()
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS activity_log (
        id SERIAL PRIMARY KEY,
        operation_type VARCHAR(50) NOT NULL,
        source_url TEXT,
        title TEXT,
        status VARCHAR(20),
        details JSONB,
        metrics JSONB,
        error_message TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    console.log('✅ LSEMB database tables initialized');
  } catch (error) {
    console.error('❌ Failed to initialize LSEMB database:', error);
    throw error;
  } finally {
    client.release();
  }
}

// Save database settings
export async function saveDatabaseSettings(settings: any) {
  const client = await lsembPool.connect();

  try {
    await client.query(`
      INSERT INTO settings (key, value, category, description)
      VALUES ('source_database', $1, 'database', 'Source database connection settings')
      ON CONFLICT (key)
      DO UPDATE SET
        value = $1,
        updated_at = CURRENT_TIMESTAMP
    `, [JSON.stringify(settings)]);

    return { success: true };
  } catch (error: any) {
    console.error('Failed to save database settings:', error);
    return { success: false, error: error.message };
  } finally {
    client.release();
  }
}

// Get database settings
export async function getDatabaseSettings() {
  let client;
  try {
    client = await lsembPool.connect();
    // First try to get database configuration from frontend settings (newest method)
    console.log('DEBUG: Checking for frontend database settings...');

    // Get all database-related settings from frontend
    const dbSettings = await client.query(`
      SELECT key, value FROM settings
      WHERE key LIKE 'database.%'
      ORDER BY key
    `);

    if (dbSettings.rows.length > 0) {
      // Reconstruct database config from individual settings
      const dbConfig: any = {};
      dbSettings.rows.forEach(row => {
        const key = row.key.replace('database.', '');
        const value = row.value;

        // Parse value based on key
        if (key === 'port' || key === 'maxConnections') {
          dbConfig[key] = parseInt(value);
        } else if (key === 'ssl') {
          dbConfig[key] = value === 'true' || value === true;
        } else {
          dbConfig[key] = value;
        }
      });

      console.log('DEBUG: Found frontend database settings:', dbConfig);

      // Return in the expected format
      return {
        database: dbConfig
      };
    }

    // If no frontend settings found, try source_database (new key)
    console.log('DEBUG: No frontend settings found, trying source_database...');
    let result = await client.query(`
      SELECT value FROM settings WHERE key = 'source_database'
    `);

    // If source_database not found, try legacy customer_database for backward compatibility
    if (result.rows.length === 0) {
      console.log('DEBUG: source_database not found, trying legacy customer_database for backward compatibility');
      result = await client.query(`
        SELECT value FROM settings WHERE key = 'customer_database'
      `);
    } else {
      console.log('DEBUG: Found source_database setting');
    }

    if (result.rows.length > 0) {
      const value = result.rows[0].value;
      // Parse JSON if it's a string, otherwise return as-is
      if (typeof value === 'string') {
        try {
          const parsed = JSON.parse(value);
          console.log('DEBUG: Parsed database settings:', JSON.stringify(parsed, null, 2));
          return parsed;
        } catch (e) {
          console.error('DEBUG: Failed to parse JSON value:', e);
          return value;
        }
      }
      console.log('DEBUG: Database settings already parsed:', JSON.stringify(value, null, 2));
      return value;
    }

    return null;
  } catch (error) {
    console.error('Failed to get database settings:', error);
    return null;
  } finally {
    if (client) client.release();
  }
}

// Get AI settings
export async function getAiSettings() {
  let client;
  try {
    client = await lsembPool.connect();
    const result = await client.query(`
      SELECT setting_value as value FROM chatbot_settings WHERE setting_key = 'ai_settings'
    `);
    
    if (result.rows.length > 0 && result.rows[0].value) {
      return result.rows[0].value;
    }
    
    // Return a default object instead of null to prevent downstream errors
    return { openaiApiKey: null, openaiApiBase: null };
  } catch (error) {
    console.error('Failed to get AI settings:', error);
    // On error, also return a default object to ensure resilience
    return { openaiApiKey: null, openaiApiBase: null };
  } finally {
    if (client) client.release();
  }
}

export default {
  lsembPool,
  getCustomerPool,
  testDatabaseConnection,
  initializeLsembDatabase,
  saveDatabaseSettings,
  getDatabaseSettings,
  syncAPIKeysToDatabase
};