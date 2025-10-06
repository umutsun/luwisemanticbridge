-- Create pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Create schema
CREATE SCHEMA IF NOT EXISTS rag_data;

-- Create documents table with vector support
CREATE TABLE IF NOT EXISTS rag_data.documents (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255),
    content TEXT NOT NULL,
    url VARCHAR(500),
    source VARCHAR(100),
    metadata JSONB DEFAULT '{}',
    embedding vector(1536),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create index for vector similarity search
CREATE INDEX IF NOT EXISTS idx_documents_embedding
ON rag_data.documents
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- Create text search index
CREATE INDEX IF NOT EXISTS idx_documents_content_gin
ON rag_data.documents
USING gin(to_tsvector('english', content));

-- Create conversations table
CREATE TABLE IF NOT EXISTS rag_data.conversations (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(100),
    messages JSONB DEFAULT '[]',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create embeddings cache table
CREATE TABLE IF NOT EXISTS rag_data.embeddings_cache (
    id SERIAL PRIMARY KEY,
    text_hash VARCHAR(64) UNIQUE NOT NULL,
    text TEXT NOT NULL,
    embedding vector(1536),
    model VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create chatbot settings table
CREATE TABLE IF NOT EXISTS chatbot_settings (
    id SERIAL PRIMARY KEY,
    setting_key VARCHAR(100) UNIQUE NOT NULL,
    setting_value TEXT,
    description TEXT,
    category VARCHAR(50),
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert default settings
INSERT INTO chatbot_settings (setting_key, setting_value, description, category) VALUES
('ai_provider', 'gemini', 'Primary AI provider for chat responses', 'ai'),
('fallback_enabled', 'true', 'Enable fallback to other providers', 'ai'),
('temperature', '0.1', 'Default temperature for responses', 'ai'),
('max_tokens', '4096', 'Maximum tokens for responses', 'ai'),
('gemini_model', 'gemini-1.5-flash', 'Default Gemini model', 'ai'),
('system_prompt', 'Sen Türkiye vergi ve mali mevzuat konusunda uzman bir asistansın.', 'System prompt for AI responses', 'ai'),
('use_unified_embeddings', 'false', 'Use unified embeddings table', 'rag'),
('response_language', 'tr', 'Default response language', 'ui')
ON CONFLICT (setting_key) DO UPDATE SET
    setting_value = EXCLUDED.setting_value,
    description = COALESCE(EXCLUDED.description, chatbot_settings.description),
    updated_at = CURRENT_TIMESTAMP;

-- Create messages table for conversation history
CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL,
    role VARCHAR(20) NOT NULL,
    content TEXT NOT NULL,
    sources JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create table for storing conversation metadata
CREATE TABLE IF NOT EXISTS conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR(100) NOT NULL,
    title VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);