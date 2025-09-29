import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

// ASEMB System Database - Our application's own database
export const asembDbConfig = {
  host: process.env.ASEMB_DB_HOST || process.env.POSTGRES_HOST || 'localhost',
  port: parseInt(process.env.ASEMB_DB_PORT || process.env.POSTGRES_PORT || '5432'),
  database: process.env.ASEMB_DB_NAME || process.env.POSTGRES_DB || 'postgres',
  user: process.env.ASEMB_DB_USER || process.env.POSTGRES_USER || 'postgres',
  password: process.env.ASEMB_DB_PASSWORD || process.env.POSTGRES_PASSWORD,
  ssl: process.env.ASEMB_DB_SSL === 'true' ? { rejectUnauthorized: false } : false
};

// Customer Database - For migration/embedding customer's data
export const customerDbConfig = {
  host: process.env.CUSTOMER_DB_HOST || process.env.POSTGRES_HOST || 'localhost',
  port: parseInt(process.env.CUSTOMER_DB_PORT || process.env.POSTGRES_PORT || '5432'),
  database: process.env.CUSTOMER_DB_NAME || 'rag_chatbot',
  user: process.env.CUSTOMER_DB_USER || process.env.POSTGRES_USER || 'postgres',
  password: process.env.CUSTOMER_DB_PASSWORD || process.env.POSTGRES_PASSWORD,
  ssl: process.env.CUSTOMER_DB_SSL === 'true' ? { rejectUnauthorized: false } : false
};

// ASEMB System Database Pool
export const asembPool = new Pool({
  ...asembDbConfig,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 30000,
});

// Customer Database Pool (created dynamically)
let customerPool: Pool | null = null;

export function getCustomerPool(config?: any): Pool {
  if (!customerPool || config) {
    const dbConfig = config || customerDbConfig;
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
      SELECT value FROM settings WHERE key = 'customer_database'
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
      SELECT value FROM settings WHERE key = 'ai_settings'
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