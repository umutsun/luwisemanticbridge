-- Migration: Add message_embeddings table
-- Priority: 4th source in RAG system (experimental user data)

CREATE TABLE IF NOT EXISTS message_embeddings (
    id BIGSERIAL PRIMARY KEY,
    session_id VARCHAR(255) NOT NULL,
    user_id VARCHAR(255),
    message_type VARCHAR(20) NOT NULL CHECK (message_type IN ('question', 'answer')),
    content TEXT NOT NULL,
    embedding vector(1536),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for efficient search
CREATE INDEX IF NOT EXISTS idx_message_embeddings_session_id ON message_embeddings(session_id);
CREATE INDEX IF NOT EXISTS idx_message_embeddings_user_id ON message_embeddings(user_id);
CREATE INDEX IF NOT EXISTS idx_message_embeddings_type ON message_embeddings(message_type);
CREATE INDEX IF NOT EXISTS idx_message_embeddings_created_at ON message_embeddings(created_at DESC);

-- Create vector index for similarity search
CREATE INDEX IF NOT EXISTS idx_message_embeddings_vector ON message_embeddings
    USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Create trigger for updated_at
CREATE OR REPLACE FUNCTION update_message_embeddings_updated_at()
    RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER message_embeddings_updated_at
    BEFORE UPDATE ON message_embeddings
    FOR EACH ROW EXECUTE FUNCTION update_message_embeddings_updated_at();

-- Add comments
COMMENT ON TABLE message_embeddings IS 'User Q&A messages for RAG system - Priority 4 (experimental)';
COMMENT ON COLUMN message_embeddings.session_id IS 'Chat session identifier';
COMMENT ON COLUMN message_embeddings.message_type IS 'Type: question or answer';
COMMENT ON COLUMN message_embeddings.embedding IS 'Vector embedding for semantic search';
COMMENT ON COLUMN message_embeddings.metadata IS 'Additional info: model, tokens, confidence, etc.';