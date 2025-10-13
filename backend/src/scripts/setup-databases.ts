import { Client } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

async function setupDatabases() {
  // First connect to postgres database to create other databases
  const client = new Client({
    host: process.env.ASEMB_DB_HOST || 'localhost',
    port: parseInt(process.env.ASEMB_DB_PORT || '5432'),
    user: process.env.ASEMB_DB_USER || 'postgres',
    password: process.env.ASEMB_DB_PASSWORD || 'postgres',
    database: 'postgres' // Connect to default postgres database
  });

  try {
    console.log('🔄 Connecting to PostgreSQL...');
    await client.connect();
    console.log('✅ Connected to PostgreSQL');

    // Create ASEMB database
    const lsembDbName = process.env.ASEMB_DB_NAME || 'lsemb';
    try {
      await client.query(`CREATE DATABASE ${lsembDbName}`);
      console.log(`✅ Created database: ${lsembDbName}`);
    } catch (error: any) {
      if (error.code === '42P04') {
        console.log(`ℹ️ Database ${lsembDbName} already exists`);
      } else {
        console.error(`❌ Error creating ${lsembDbName}:`, error.message);
      }
    }

    // Create Customer database (rag_chatbot)
    const customerDbName = process.env.CUSTOMER_DB_NAME || 'rag_chatbot';
    try {
      await client.query(`CREATE DATABASE ${customerDbName}`);
      console.log(`✅ Created database: ${customerDbName}`);
    } catch (error: any) {
      if (error.code === '42P04') {
        console.log(`ℹ️ Database ${customerDbName} already exists`);
      } else {
        console.error(`❌ Error creating ${customerDbName}:`, error.message);
      }
    }

    // Close connection to postgres database
    await client.end();

    // Now connect to ASEMB database and create tables
    const lsembClient = new Client({
      host: process.env.ASEMB_DB_HOST || 'localhost',
      port: parseInt(process.env.ASEMB_DB_PORT || '5432'),
      user: process.env.ASEMB_DB_USER || 'postgres',
      password: process.env.ASEMB_DB_PASSWORD || 'postgres',
      database: lsembDbName
    });

    await lsembClient.connect();
    console.log(`✅ Connected to ${lsembDbName} database`);

    // Create pgvector extension
    try {
      await lsembClient.query('CREATE EXTENSION IF NOT EXISTS vector');
      console.log('✅ Created vector extension');
    } catch (error: any) {
      console.log('ℹ️ Vector extension might already exist:', error.message);
    }

    // Create tables for ASEMB system
    await lsembClient.query(`
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
    console.log('✅ Created scraped_pages table');

    await lsembClient.query(`
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
    console.log('✅ Created embeddings table');

    await lsembClient.query(`
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
    console.log('✅ Created documents table');

    await lsembClient.query(`
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
    console.log('✅ Created settings table');

    await lsembClient.query(`
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
    console.log('✅ Created activity_log table');

    await lsembClient.query(`
      CREATE TABLE IF NOT EXISTS activity_history (
        id SERIAL PRIMARY KEY,
        operation_type TEXT NOT NULL,
        source_url TEXT,
        title TEXT,
        status TEXT NOT NULL,
        details JSONB,
        metrics JSONB,
        error_message TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ Created activity_history table');

    // Create indexes
    await lsembClient.query(`
      CREATE INDEX IF NOT EXISTS idx_activity_operation ON activity_history(operation_type);
      CREATE INDEX IF NOT EXISTS idx_activity_created ON activity_history(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_activity_status ON activity_history(status);
    `);
    console.log('✅ Created indexes');

    await lsembClient.end();

    // Connect to customer database and create tables
    const customerClient = new Client({
      host: process.env.CUSTOMER_DB_HOST || 'localhost',
      port: parseInt(process.env.CUSTOMER_DB_PORT || '5432'),
      user: process.env.CUSTOMER_DB_USER || 'postgres',
      password: process.env.CUSTOMER_DB_PASSWORD || 'postgres',
      database: customerDbName
    });

    await customerClient.connect();
    console.log(`✅ Connected to ${customerDbName} database`);

    // Create pgvector extension in customer database
    try {
      await customerClient.query('CREATE EXTENSION IF NOT EXISTS vector');
      console.log('✅ Created vector extension in customer database');
    } catch (error: any) {
      console.log('ℹ️ Vector extension might already exist in customer database:', error.message);
    }

    // Create RAG_DATA table if it doesn't exist
    await customerClient.query(`
      CREATE TABLE IF NOT EXISTS RAG_DATA (
        id SERIAL PRIMARY KEY,
        title VARCHAR(255),
        content TEXT NOT NULL,
        source VARCHAR(255),
        metadata JSONB,
        embedding vector(1536),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ Created RAG_DATA table in customer database');

    // Create indexes for RAG_DATA
    await customerClient.query(`
      CREATE INDEX IF NOT EXISTS idx_rag_data_embedding ON RAG_DATA USING ivfflat (embedding vector_cosine_ops);
      CREATE INDEX IF NOT EXISTS idx_rag_data_source ON RAG_DATA(source);
      CREATE INDEX IF NOT EXISTS idx_rag_data_created ON RAG_DATA(created_at DESC);
    `);
    console.log('✅ Created indexes for RAG_DATA table');

    await customerClient.end();

    console.log('\n🎉 Database setup completed successfully!');
    console.log('📊 Databases created:');
    console.log(`   - ${lsembDbName} (ASEMB system database)`);
    console.log(`   - ${customerDbName} (Customer database for RAG data)`);

  } catch (error: any) {
    console.error('❌ Setup failed:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

// Run setup
setupDatabases().catch(console.error);