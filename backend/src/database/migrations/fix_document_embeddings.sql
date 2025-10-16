-- Fix document_embeddings table structure
-- Add missing columns

-- Check if table exists, if not create it
CREATE TABLE IF NOT EXISTS document_embeddings (
    id SERIAL PRIMARY KEY,
    document_id INTEGER REFERENCES documents(id) ON DELETE CASCADE,
    chunk_text TEXT NOT NULL,
    embedding vector(1536),
    metadata JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Add missing columns if they don't exist
DO $$
BEGIN
    -- Add model_name column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'document_embeddings' AND column_name = 'model_name') THEN
        ALTER TABLE document_embeddings ADD COLUMN model_name VARCHAR(100);
    END IF;

    -- Add tokens_used column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'document_embeddings' AND column_name = 'tokens_used') THEN
        ALTER TABLE document_embeddings ADD COLUMN tokens_used INTEGER;
    END IF;

    -- Update existing rows to have default values
    UPDATE document_embeddings SET model_name = 'text-embedding-ada-002' WHERE model_name IS NULL;
    UPDATE document_embeddings SET tokens_used = 0 WHERE tokens_used IS NULL;
END $$;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_document_embeddings_document_id ON document_embeddings(document_id);
CREATE INDEX IF NOT EXISTS idx_document_embeddings_created_at ON document_embeddings(created_at);

-- Show table structure
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'document_embeddings'
ORDER BY ordinal_position;