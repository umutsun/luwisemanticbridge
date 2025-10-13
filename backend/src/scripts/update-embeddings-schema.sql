-- Update document_embeddings table to include model_name and tokens_used
-- This script adds tracking for which model was used and how many tokens were consumed

-- Add new columns to document_embeddings table
ALTER TABLE document_embeddings
ADD COLUMN IF NOT EXISTS model_name VARCHAR(100) DEFAULT 'text-embedding-ada-002',
ADD COLUMN IF NOT EXISTS tokens_used INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS embedding_dimension INTEGER DEFAULT 1536;

-- Add comments to describe new columns
COMMENT ON COLUMN document_embeddings.model_name IS 'The name of the embedding model used (e.g., text-embedding-ada-002, text-embedding-3-small)';
COMMENT ON COLUMN document_embeddings.tokens_used IS 'Number of tokens used for this embedding';
COMMENT ON COLUMN document_embeddings.embedding_dimension IS 'Dimension of the embedding vector';

-- Create index on model_name for faster filtering
CREATE INDEX IF NOT EXISTS idx_document_embeddings_model_name ON document_embeddings(model_name);

-- Create index on tokens_used for analytics
CREATE INDEX IF NOT EXISTS idx_document_embeddings_tokens_used ON document_embeddings(tokens_used);

-- Update existing records to have default values for the new columns
UPDATE document_embeddings
SET model_name = 'text-embedding-ada-002',
    tokens_used = 0,
    embedding_dimension = 1536
WHERE model_name IS NULL OR tokens_used IS NULL;

-- Create a view for embedding statistics
CREATE OR REPLACE VIEW embedding_stats AS
SELECT
    model_name,
    COUNT(*) as total_embeddings,
    SUM(tokens_used) as total_tokens,
    AVG(tokens_used) as avg_tokens_per_embedding,
    MIN(tokens_used) as min_tokens,
    MAX(tokens_used) as max_tokens,
    embedding_dimension,
    created_at
FROM document_embeddings
GROUP BY model_name, embedding_dimension, created_at
ORDER BY created_at DESC;

-- Create a table to track embedding model usage and costs
CREATE TABLE IF NOT EXISTS embedding_model_usage (
    id SERIAL PRIMARY KEY,
    model_name VARCHAR(100) NOT NULL,
    total_tokens_used INTEGER DEFAULT 0,
    total_embeddings INTEGER DEFAULT 0,
    total_cost DECIMAL(10, 6) DEFAULT 0.000000,
    avg_tokens_per_embedding DECIMAL(10, 2),
    last_used_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create unique constraint on model_name
ALTER TABLE embedding_model_usage
ADD CONSTRAINT IF NOT EXISTS unique_model_name UNIQUE (model_name);

-- Insert default model record if it doesn't exist
INSERT INTO embedding_model_usage (model_name)
VALUES ('text-embedding-ada-002')
ON CONFLICT (model_name) DO NOTHING;

-- Create trigger to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_embedding_model_usage_updated_at
    BEFORE UPDATE ON embedding_model_usage
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Grant permissions if needed (adjust user/role as necessary)
-- GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO asemb_user;
-- GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO asemb_user;