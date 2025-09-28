-- PostgreSQL Schema and User Setup for ASEMB
-- Run this script to initialize the database

-- Create user and database
CREATE USER asemb_user WITH PASSWORD 'Semsiye!22';
CREATE DATABASE asemb WITH OWNER asemb_user;

-- Connect to the new database (run this separately)
-- \c asemb

-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Create tables for ASEMB
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

-- Create settings table for AI configuration
CREATE TABLE IF NOT EXISTS settings (
    id SERIAL PRIMARY KEY,
    key VARCHAR(255) UNIQUE NOT NULL,
    value JSONB,
    category VARCHAR(100),
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create audit logs table
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

-- Create users table for authentication
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

-- Create sessions table
CREATE TABLE IF NOT EXISTS sessions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    session_token VARCHAR(255) UNIQUE NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better performance
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
GRANT ALL PRIVILEGES ON SCHEMA public TO asemb_user;