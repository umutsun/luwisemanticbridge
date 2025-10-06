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
    port: parseInt(process.env.REDIS_PORT || '6380'),
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
    customerPool = new Pool({
      ...dbConfig,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 30000,
    });
  }
  return customerPool;
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
    const result = await client.query(`
      SELECT setting_value as value FROM chatbot_settings WHERE setting_key = 'customer_database'
    `);
    
    if (result.rows.length > 0) {
      return result.rows[0].value;
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
  getDatabaseSettings
};