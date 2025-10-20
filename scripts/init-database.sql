-- Initialize database tables for document management system

-- Drop existing tables if they exist
DROP TABLE IF EXISTS document_embeddings CASCADE;
DROP TABLE IF EXISTS documents CASCADE;

-- Create documents table
CREATE TABLE documents (
    id SERIAL PRIMARY KEY,
    title TEXT NOT NULL,
    content TEXT,
    type VARCHAR(50),
    size INTEGER,
    file_path TEXT,
    metadata JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create document_embeddings table
CREATE TABLE document_embeddings (
    id SERIAL PRIMARY KEY,
    document_id INTEGER REFERENCES documents(id) ON DELETE CASCADE,
    chunk_text TEXT NOT NULL,
    embedding vector(1536),
    metadata JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Add indexes for better performance
CREATE INDEX idx_documents_title ON documents(title);
CREATE INDEX idx_documents_type ON documents(type);
CREATE INDEX idx_documents_created_at ON documents(created_at);
CREATE INDEX idx_document_embeddings_document_id ON document_embeddings(document_id);
CREATE INDEX idx_document_embeddings_created_at ON document_embeddings(created_at);

-- Create document processing status table
CREATE TABLE document_processing (
    id SERIAL PRIMARY KEY,
    document_id INTEGER REFERENCES documents(id) ON DELETE CASCADE,
    status VARCHAR(50) DEFAULT 'pending',
    processor_type VARCHAR(50),
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    error_message TEXT,
    metadata JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create file metadata table for different file types
CREATE TABLE file_metadata (
    id SERIAL PRIMARY KEY,
    document_id INTEGER REFERENCES documents(id) ON DELETE CASCADE,
    file_type VARCHAR(50),
    original_name VARCHAR(255),
    file_size INTEGER,
    content_type VARCHAR(100),
    encoding VARCHAR(50),
    page_count INTEGER DEFAULT 0,
    column_count INTEGER DEFAULT 0,
    row_count INTEGER DEFAULT 0,
    data_schema JSONB,
    preview_data JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create embedding models table
CREATE TABLE embedding_models (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    provider VARCHAR(50) NOT NULL,
    model VARCHAR(100) NOT NULL,
    dimension INTEGER NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create embedding statistics table
CREATE TABLE embedding_stats (
    id SERIAL PRIMARY KEY,
    document_id INTEGER REFERENCES documents(id) ON DELETE CASCADE,
    model_id INTEGER REFERENCES embedding_models(id),
    chunk_count INTEGER,
    total_tokens INTEGER,
    processing_time_ms INTEGER,
    memory_usage_mb INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert default embedding models
INSERT INTO embedding_models (name, provider, model, dimension) VALUES
('OpenAI Embedding', 'openai', 'text-embedding-3-small', 1536),
('Google Embedding', 'google', 'text-embedding-004', 768);

-- Add constraints
ALTER TABLE documents ADD CONSTRAINT chk_file_size CHECK (size >= 0);
ALTER TABLE documents ADD CONSTRAINT chk_content_length CHECK (LENGTH(content) <= 1000000);

-- Create views for easy access
CREATE VIEW document_summary AS
SELECT
    d.id,
    d.title,
    d.type,
    d.size,
    d.created_at,
    d.updated_at,
    d.metadata,
    CASE
        WHEN EXISTS (SELECT 1 FROM document_embeddings de WHERE de.document_id = d.id) THEN true
        ELSE false
    END as has_embeddings,
    COUNT(de.id) as embedding_count,
    COUNT(dp.id) as process_count,
    MAX(dp.status) as latest_status
FROM documents d
LEFT JOIN document_embeddings de ON d.id = de.document_id
LEFT JOIN document_processing dp ON d.id = dp.document_id
GROUP BY d.id, d.title, d.type, d.size, d.created_at, d.updated_at, d.metadata;

CREATE TABLE document_tags (
    id SERIAL PRIMARY KEY,
    document_id INTEGER REFERENCES documents(id) ON DELETE CASCADE,
    tag_name VARCHAR(100) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(document_id, tag_name)
);

CREATE TABLE document_categories (
    id SERIAL PRIMARY KEY,
    document_id INTEGER REFERENCES documents(id) ON DELETE CASCADE,
    category_name VARCHAR(100) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(document_id, category_name)
);