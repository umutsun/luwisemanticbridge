-- Create table for records that cannot be embedded
CREATE TABLE IF NOT EXISTS skipped_embeddings (
  id SERIAL PRIMARY KEY,
  source_table VARCHAR(255) NOT NULL,
  source_type VARCHAR(100) NOT NULL,
  source_id VARCHAR(255) NOT NULL,
  source_name TEXT,
  content TEXT,
  skip_reason TEXT NOT NULL,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  -- Unique constraint to prevent duplicates
  UNIQUE(source_table, source_id)
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_skipped_embeddings_source ON skipped_embeddings(source_table, source_id);
CREATE INDEX IF NOT EXISTS idx_skipped_embeddings_table ON skipped_embeddings(source_table);

-- Add comment
COMMENT ON TABLE skipped_embeddings IS 'Stores records that cannot be embedded due to missing/invalid content';
COMMENT ON COLUMN skipped_embeddings.skip_reason IS 'Reason why the record was skipped (e.g., "no_content", "empty_embedding", "invalid_format")';
