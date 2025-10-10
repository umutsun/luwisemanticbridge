import { Pool } from 'pg';
import dotenv from 'dotenv';
import { SettingsService, DatabaseConfig, RedisConfig } from '../services/settings.service';

dotenv.config();

// ASEM System Database - Get from .env file
export const asembDbConfig = {
  host: process.env.POSTGRES_HOST || 'localhost',
  port: parseInt(process.env.POSTGRES_PORT || '5432'),
  database: process.env.POSTGRES_DB || 'asemb',
  user: process.env.POSTGRES_USER || 'postgres',
  password: process.env.POSTGRES_PASSWORD || '',
  ssl: process.env.POSTGRES_SSL === 'true' ? { rejectUnauthorized: false } : false
};


// Dynamic configurations from ASEMB database
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
    database: process.env.POSTGRES_DB || 'asemb',
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
  console.log('🔄 Syncing API keys from environment variables to database...');

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
        const existing = await asembPool.query(
          'SELECT key FROM settings WHERE key = $1',
          [apiKey.key]
        );

        if (existing.rows.length === 0) {
          // Insert new key
          await asembPool.query(
            'INSERT INTO settings (key, value, category, description) VALUES ($1, $2, $3, $4)',
            [apiKey.key, apiKey.value, 'api_keys', `API key for ${apiKey.key.replace('.apiKey', '').replace('.', ' ').toUpperCase()}`]
          );
          console.log(`✅ Added ${apiKey.key} to database`);
        } else {
          // Update existing key
          await asembPool.query(
            'UPDATE settings SET value = $1 WHERE key = $2',
            [apiKey.value, apiKey.key]
          );
          console.log(`✅ Updated ${apiKey.key} in database`);
        }
      }
    }

    console.log('✅ API keys synced to database successfully');
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

// ASEMB System Database Pool
export const asembPool = new Pool({
  ...asembDbConfig,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 30000,
});

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
      database: dbConfig.name || dbConfig.database, // Handle both property names
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
    const client = await asembPool.connect();
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

// Initialize ASEMB database tables
export async function initializeAsembDatabase() {
  const client = await asembPool.connect();
  
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
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
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
      ('asemb_database', $1, 'database', 'ASEMB system database configuration'),
      ('customer_database', $2, 'database', 'Customer database configuration'),
      ('redis_config', $3, 'database', 'Redis configuration'),
      ('llm_providers', $4, 'ai', 'LLM provider configurations'),
      ('app_config', $5, 'application', 'Application configuration')
      ON CONFLICT (key) DO NOTHING
    `, [
      JSON.stringify({
        host: process.env.POSTGRES_HOST || 'localhost',
        port: parseInt(process.env.POSTGRES_PORT || '5432'),
        database: process.env.POSTGRES_DB || 'asemb',
        user: process.env.POSTGRES_USER || 'postgres',
        password: process.env.POSTGRES_PASSWORD || '',
        ssl: process.env.POSTGRES_SSL === 'true'
      }),
      JSON.stringify({
        host: process.env.POSTGRES_HOST || 'localhost',
        port: parseInt(process.env.POSTGRES_PORT || '5432'),
        database: process.env.POSTGRES_DB || 'asemb',
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

    console.log('✅ ASEMB database tables initialized');
  } catch (error) {
    console.error('❌ Failed to initialize ASEMB database:', error);
    throw error;
  } finally {
    client.release();
  }
}

// Save database settings
export async function saveDatabaseSettings(settings: any) {
  const client = await asembPool.connect();
  
  try {
    await client.query(`
      INSERT INTO settings (key, value, category, description)
      VALUES ('customer_database', $1, 'database', 'Customer database connection settings')
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
    client = await asembPool.connect();
    // First try to get source_database (new key), if not found fallback to customer_database (old key)
    let result = await client.query(`
      SELECT value FROM settings WHERE key = 'source_database'
    `);

    // If source_database not found, try customer_database for backward compatibility
    if (result.rows.length === 0) {
      console.log('DEBUG: source_database not found, trying customer_database for backward compatibility');
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
    client = await asembPool.connect();
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
  asembPool,
  getCustomerPool,
  testDatabaseConnection,
  initializeAsembDatabase,
  saveDatabaseSettings,
  getDatabaseSettings,
  syncAPIKeysToDatabase
};