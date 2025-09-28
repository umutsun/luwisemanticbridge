#!/bin/bash
# Database setup script for ASEM production

# Connect to PostgreSQL and run setup commands
docker exec -i asemb-postgres psql -U postgres << 'EOF'
-- Create user if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'asemb_user') THEN
        CREATE ROLE asemb_user LOGIN PASSWORD 'Semsiye!22';
    END IF;
END
$$;

-- Create database if it doesn't exist
SELECT 'CREATE DATABASE asemb WITH OWNER asemb_user'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'asemb')\gexec

-- Connect to asemb database and create schema
\c asemb

-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Create tables if they don't exist
CREATE TABLE IF NOT EXISTS embeddings (
    id SERIAL PRIMARY KEY,
    content TEXT NOT NULL,
    embedding vector(1536),
    metadata JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS chunks (
    id SERIAL PRIMARY KEY,
    document_id INTEGER,
    content TEXT NOT NULL,
    chunk_index INTEGER,
    embedding vector(1536),
    metadata JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sources (
    id SERIAL PRIMARY KEY,
    original_id TEXT,
    table_name TEXT,
    content TEXT,
    metadata JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS queries (
    id SERIAL PRIMARY KEY,
    query TEXT NOT NULL,
    embedding vector(1536),
    response TEXT,
    sources JSONB,
    metadata JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS settings (
    id SERIAL PRIMARY KEY,
    key VARCHAR(255) UNIQUE NOT NULL,
    value JSONB,
    category VARCHAR(100),
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS audit_logs (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(255),
    action VARCHAR(255) NOT NULL,
    resource VARCHAR(255),
    details JSONB,
    ip_address INET,
    user_agent TEXT,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(255) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(50) DEFAULT 'user',
    permissions JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_login TIMESTAMP,
    is_active BOOLEAN DEFAULT true
);

CREATE TABLE IF NOT EXISTS sessions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    session_token VARCHAR(255) UNIQUE NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_embeddings_embedding ON embeddings USING hnsw (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS idx_chunks_embedding ON chunks USING hnsw (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS idx_queries_embedding ON queries USING hnsw (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS idx_embeddings_content ON embeddings USING gin(to_tsvector('english', content));
CREATE INDEX IF NOT EXISTS idx_chunks_content ON chunks USING gin(to_tsvector('english', content));
CREATE INDEX IF NOT EXISTS idx_sources_original_id ON sources (original_id, table_name);
CREATE INDEX IF NOT EXISTS idx_settings_key ON settings (key);
CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs (timestamp);
CREATE INDEX IF NOT EXISTS idx_users_username ON users (username);
CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);
CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions (session_token);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions (expires_at);

-- Grant permissions
GRANT ALL PRIVILEGES ON DATABASE asemb TO asemb_user;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO asemb_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO asemb_user;

-- Insert default settings if not exists
INSERT INTO settings (key, value, category, description) VALUES
('ai_settings', '{
    "modelProvider": "openai",
    "model": "gpt-3.5-turbo",
    "embeddingProvider": "openai",
    "embeddingModel": "text-embedding-ada-002",
    "fallbackProvider": "openai",
    "fallbackModel": "gpt-3.5-turbo",
    "maxTokens": 4096,
    "temperature": 0.7
}', 'ai', 'Default AI service settings')
ON CONFLICT (key) DO NOTHING;

EOF

echo "Database setup completed!"