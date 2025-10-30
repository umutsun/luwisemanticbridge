-- Complete Migration Script for LSEMB
-- This script creates all necessary tables and functions for pgai integration
-- Run this with: psql postgresql://postgres:password@host:port/dbname -f complete_migration.sql

-- =============================================================================
-- 1. ENABLE REQUIRED EXTENSIONS
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- =============================================================================
-- 2. CREATE UNIFIED EMBEDDINGS TABLE (Main table for all embeddings)
-- =============================================================================

CREATE TABLE IF NOT EXISTS unified_embeddings (
    id BIGSERIAL PRIMARY KEY,
    source_table VARCHAR(100) NOT NULL,
    source_type VARCHAR(50) NOT NULL,
    source_id BIGINT NOT NULL,
    source_name TEXT,
    content TEXT,
    embedding vector(3072),
    metadata JSONB DEFAULT '{}'::jsonb,
    tokens_used INTEGER DEFAULT 0,
    model_used VARCHAR(100) DEFAULT 'text-embedding-3-large',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- Unique constraint to prevent duplicates
    CONSTRAINT unique_source_embedding UNIQUE (source_table, source_id)
);

-- Indexes for unified_embeddings
CREATE INDEX IF NOT EXISTS idx_unified_embeddings_source ON unified_embeddings(source_table, source_id);
CREATE INDEX IF NOT EXISTS idx_unified_embeddings_type ON unified_embeddings(source_type);
CREATE INDEX IF NOT EXISTS idx_unified_embeddings_created ON unified_embeddings(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_unified_embeddings_vector ON unified_embeddings USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX IF NOT EXISTS idx_unified_embeddings_metadata ON unified_embeddings USING gin (metadata);

-- =============================================================================
-- 3. CREATE DOCUMENT EMBEDDINGS TABLE (For backward compatibility)
-- =============================================================================

CREATE TABLE IF NOT EXISTS document_embeddings (
    id BIGSERIAL PRIMARY KEY,
    document_id BIGINT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    chunk_index INTEGER DEFAULT 0,
    content TEXT NOT NULL,
    embedding vector(3072),
    metadata JSONB DEFAULT '{}'::jsonb,
    tokens_used INTEGER DEFAULT 0,
    model_used VARCHAR(100) DEFAULT 'text-embedding-3-large',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    CONSTRAINT unique_document_chunk UNIQUE (document_id, chunk_index)
);

-- Indexes for document_embeddings
CREATE INDEX IF NOT EXISTS idx_document_embeddings_doc_id ON document_embeddings(document_id);
CREATE INDEX IF NOT EXISTS idx_document_embeddings_created ON document_embeddings(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_document_embeddings_vector ON document_embeddings USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- =============================================================================
-- 4. CREATE MESSAGE EMBEDDINGS TABLE (For backward compatibility)
-- =============================================================================

CREATE TABLE IF NOT EXISTS message_embeddings (
    id BIGSERIAL PRIMARY KEY,
    message_id BIGINT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    session_id BIGINT,
    content TEXT NOT NULL,
    embedding vector(3072),
    metadata JSONB DEFAULT '{}'::jsonb,
    tokens_used INTEGER DEFAULT 0,
    model_used VARCHAR(100) DEFAULT 'text-embedding-3-large',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    CONSTRAINT unique_message_embedding UNIQUE (message_id)
);

-- Indexes for message_embeddings
CREATE INDEX IF NOT EXISTS idx_message_embeddings_msg_id ON message_embeddings(message_id);
CREATE INDEX IF NOT EXISTS idx_message_embeddings_session ON message_embeddings(session_id);
CREATE INDEX IF NOT EXISTS idx_message_embeddings_created ON message_embeddings(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_message_embeddings_vector ON message_embeddings USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- =============================================================================
-- 5. CREATE TOKEN TRACKING TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS embedding_tokens (
    id BIGSERIAL PRIMARY KEY,
    table_name VARCHAR(100) NOT NULL,
    record_id BIGINT NOT NULL,
    operation_type VARCHAR(50) DEFAULT 'embedding',
    tokens_used INTEGER DEFAULT 0,
    model_used VARCHAR(100) DEFAULT 'text-embedding-3-large',
    cost_usd DECIMAL(10, 6) DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'::jsonb
);

-- Indexes for token tracking
CREATE INDEX IF NOT EXISTS idx_embedding_tokens_table ON embedding_tokens(table_name, record_id);
CREATE INDEX IF NOT EXISTS idx_embedding_tokens_created ON embedding_tokens(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_embedding_tokens_model ON embedding_tokens(model_used);

-- =============================================================================
-- 6. CREATE MIGRATION PROGRESS TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS migration_progress (
    id BIGSERIAL PRIMARY KEY,
    migration_name VARCHAR(200) NOT NULL UNIQUE,
    source_table VARCHAR(100) NOT NULL,
    target_table VARCHAR(100) NOT NULL,
    total_records INTEGER DEFAULT 0,
    processed_records INTEGER DEFAULT 0,
    successful_records INTEGER DEFAULT 0,
    failed_records INTEGER DEFAULT 0,
    status VARCHAR(50) DEFAULT 'pending', -- pending, running, completed, failed, paused
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    last_processed_id BIGINT,
    error_message TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for migration progress
CREATE INDEX IF NOT EXISTS idx_migration_progress_status ON migration_progress(status);
CREATE INDEX IF NOT EXISTS idx_migration_progress_name ON migration_progress(migration_name);

-- =============================================================================
-- 7. CREATE HELPER FUNCTIONS
-- =============================================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply triggers to all tables
DROP TRIGGER IF EXISTS update_unified_embeddings_updated_at ON unified_embeddings;
CREATE TRIGGER update_unified_embeddings_updated_at
    BEFORE UPDATE ON unified_embeddings
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_document_embeddings_updated_at ON document_embeddings;
CREATE TRIGGER update_document_embeddings_updated_at
    BEFORE UPDATE ON document_embeddings
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_message_embeddings_updated_at ON message_embeddings;
CREATE TRIGGER update_message_embeddings_updated_at
    BEFORE UPDATE ON message_embeddings
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_migration_progress_updated_at ON migration_progress;
CREATE TRIGGER update_migration_progress_updated_at
    BEFORE UPDATE ON migration_progress
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- 8. SIMILARITY SEARCH FUNCTIONS
-- =============================================================================

-- Semantic search in unified embeddings
CREATE OR REPLACE FUNCTION search_unified_embeddings(
    query_embedding vector(3072),
    match_threshold float DEFAULT 0.7,
    match_count int DEFAULT 10,
    filter_source_table text DEFAULT NULL
)
RETURNS TABLE (
    id bigint,
    source_table varchar(100),
    source_type varchar(50),
    source_id bigint,
    source_name text,
    content text,
    similarity float,
    metadata jsonb,
    created_at timestamptz
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        ue.id,
        ue.source_table,
        ue.source_type,
        ue.source_id,
        ue.source_name,
        ue.content,
        1 - (ue.embedding <=> query_embedding) AS similarity,
        ue.metadata,
        ue.created_at
    FROM unified_embeddings ue
    WHERE
        (filter_source_table IS NULL OR ue.source_table = filter_source_table)
        AND ue.embedding IS NOT NULL
        AND 1 - (ue.embedding <=> query_embedding) > match_threshold
    ORDER BY ue.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;

-- Search documents
CREATE OR REPLACE FUNCTION search_documents(
    query_embedding vector(3072),
    match_threshold float DEFAULT 0.7,
    match_count int DEFAULT 10
)
RETURNS TABLE (
    document_id bigint,
    chunk_index integer,
    content text,
    similarity float,
    metadata jsonb
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        de.document_id,
        de.chunk_index,
        de.content,
        1 - (de.embedding <=> query_embedding) AS similarity,
        de.metadata
    FROM document_embeddings de
    WHERE
        de.embedding IS NOT NULL
        AND 1 - (de.embedding <=> query_embedding) > match_threshold
    ORDER BY de.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;

-- Search messages
CREATE OR REPLACE FUNCTION search_messages(
    query_embedding vector(3072),
    match_threshold float DEFAULT 0.7,
    match_count int DEFAULT 10,
    filter_session_id bigint DEFAULT NULL
)
RETURNS TABLE (
    message_id bigint,
    session_id bigint,
    content text,
    similarity float,
    metadata jsonb
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        me.message_id,
        me.session_id,
        me.content,
        1 - (me.embedding <=> query_embedding) AS similarity,
        me.metadata
    FROM message_embeddings me
    WHERE
        me.embedding IS NOT NULL
        AND (filter_session_id IS NULL OR me.session_id = filter_session_id)
        AND 1 - (me.embedding <=> query_embedding) > match_threshold
    ORDER BY me.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;

-- =============================================================================
-- 9. TOKEN COST CALCULATION FUNCTION
-- =============================================================================

CREATE OR REPLACE FUNCTION calculate_embedding_cost(
    token_count INTEGER,
    model_name VARCHAR(100) DEFAULT 'text-embedding-3-large'
)
RETURNS DECIMAL(10, 6)
LANGUAGE plpgsql
AS $$
DECLARE
    cost_per_token DECIMAL(12, 10);
BEGIN
    -- Pricing as of 2024 (adjust as needed)
    CASE model_name
        WHEN 'text-embedding-3-large' THEN
            cost_per_token := 0.00000013; -- $0.13 per 1M tokens
        WHEN 'text-embedding-3-small' THEN
            cost_per_token := 0.00000002; -- $0.02 per 1M tokens
        WHEN 'text-embedding-ada-002' THEN
            cost_per_token := 0.0000001; -- $0.10 per 1M tokens
        ELSE
            cost_per_token := 0.00000013; -- Default to large model
    END CASE;

    RETURN token_count * cost_per_token;
END;
$$;

-- =============================================================================
-- 10. STATISTICS VIEWS
-- =============================================================================

-- Drop existing views first
DROP VIEW IF EXISTS embedding_statistics CASCADE;
DROP VIEW IF EXISTS token_cost_summary CASCADE;
DROP VIEW IF EXISTS migration_status_summary CASCADE;

-- View for embedding statistics
CREATE VIEW embedding_statistics AS
SELECT
    source_table,
    source_type,
    COUNT(*) as total_embeddings,
    SUM(tokens_used) as total_tokens,
    AVG(tokens_used) as avg_tokens_per_embedding,
    COUNT(DISTINCT model_used) as models_used,
    MIN(created_at) as first_embedding,
    MAX(created_at) as last_embedding
FROM unified_embeddings
GROUP BY source_table, source_type;

-- View for token costs
CREATE VIEW token_cost_summary AS
SELECT
    table_name,
    model_used,
    COUNT(*) as operation_count,
    SUM(tokens_used) as total_tokens,
    SUM(cost_usd) as total_cost_usd,
    DATE_TRUNC('day', created_at) as date
FROM embedding_tokens
GROUP BY table_name, model_used, DATE_TRUNC('day', created_at)
ORDER BY date DESC, total_cost_usd DESC;

-- View for migration status
CREATE VIEW migration_status_summary AS
SELECT
    migration_name,
    source_table,
    target_table,
    status,
    total_records,
    processed_records,
    successful_records,
    failed_records,
    CASE
        WHEN total_records > 0
        THEN ROUND((processed_records::DECIMAL / total_records) * 100, 2)
        ELSE 0
    END as progress_percentage,
    started_at,
    completed_at,
    CASE
        WHEN completed_at IS NOT NULL AND started_at IS NOT NULL
        THEN EXTRACT(EPOCH FROM (completed_at - started_at))
        ELSE NULL
    END as duration_seconds
FROM migration_progress;

-- =============================================================================
-- 11. GRANT PERMISSIONS (Optional - adjust as needed)
-- =============================================================================

-- Grant permissions to application user (if needed)
-- GRANT ALL ON unified_embeddings TO your_app_user;
-- GRANT ALL ON document_embeddings TO your_app_user;
-- GRANT ALL ON message_embeddings TO your_app_user;
-- GRANT ALL ON embedding_tokens TO your_app_user;
-- GRANT ALL ON migration_progress TO your_app_user;
-- GRANT EXECUTE ON FUNCTION search_unified_embeddings TO your_app_user;
-- GRANT EXECUTE ON FUNCTION search_documents TO your_app_user;
-- GRANT EXECUTE ON FUNCTION search_messages TO your_app_user;

-- =============================================================================
-- MIGRATION COMPLETE
-- =============================================================================

-- Display summary
DO $$
BEGIN
    RAISE NOTICE '=============================================================================';
    RAISE NOTICE 'LSEMB Database Migration Complete!';
    RAISE NOTICE '=============================================================================';
    RAISE NOTICE 'Created tables:';
    RAISE NOTICE '  ✓ unified_embeddings';
    RAISE NOTICE '  ✓ document_embeddings';
    RAISE NOTICE '  ✓ message_embeddings';
    RAISE NOTICE '  ✓ embedding_tokens';
    RAISE NOTICE '  ✓ migration_progress';
    RAISE NOTICE '';
    RAISE NOTICE 'Created functions:';
    RAISE NOTICE '  ✓ search_unified_embeddings()';
    RAISE NOTICE '  ✓ search_documents()';
    RAISE NOTICE '  ✓ search_messages()';
    RAISE NOTICE '  ✓ calculate_embedding_cost()';
    RAISE NOTICE '';
    RAISE NOTICE 'Created views:';
    RAISE NOTICE '  ✓ embedding_statistics';
    RAISE NOTICE '  ✓ token_cost_summary';
    RAISE NOTICE '  ✓ migration_status_summary';
    RAISE NOTICE '=============================================================================';
END $$;
