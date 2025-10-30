-- ============================================
-- Create message_embeddings table
-- For storing chat message embeddings
-- ============================================

-- Create message_embeddings table if not exists
CREATE TABLE IF NOT EXISTS message_embeddings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    message_id UUID REFERENCES messages(id) ON DELETE CASCADE,
    session_id VARCHAR(255),
    embedding vector(1536),  -- OpenAI text-embedding-3-large dimension
    metadata JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_message_embeddings_message_id
ON message_embeddings(message_id);

CREATE INDEX IF NOT EXISTS idx_message_embeddings_session_id
ON message_embeddings(session_id);

CREATE INDEX IF NOT EXISTS idx_message_embeddings_created_at
ON message_embeddings(created_at DESC);

-- Create vector similarity search index (HNSW method for better performance)
CREATE INDEX IF NOT EXISTS idx_message_embeddings_vector_hnsw
ON message_embeddings
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- Add trigger to update updated_at
CREATE OR REPLACE FUNCTION update_message_embeddings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_message_embeddings_updated_at ON message_embeddings;
CREATE TRIGGER trigger_update_message_embeddings_updated_at
    BEFORE UPDATE ON message_embeddings
    FOR EACH ROW
    EXECUTE FUNCTION update_message_embeddings_updated_at();

-- Grant permissions
GRANT ALL ON message_embeddings TO postgres;
GRANT SELECT, INSERT, UPDATE, DELETE ON message_embeddings TO PUBLIC;

-- Check if table was created successfully
SELECT
    'message_embeddings' as table_name,
    COUNT(*) as row_count,
    pg_size_pretty(pg_total_relation_size('message_embeddings')) as table_size
FROM message_embeddings;

-- Show table structure
SELECT
    column_name,
    data_type,
    character_maximum_length,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_name = 'message_embeddings'
ORDER BY ordinal_position;