-- Luwi Semantic Bridge - Database Schema
-- Author: Claude (CTO & System Architect)
-- Version: 1.0.0

-- ## Extensions ##
-- Ensure the necessary extensions are enabled. Run these commands as a superuser.
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";

-- ## Tables ##

-- 1. sources
-- Stores information about each data source (e.g., a specific Google Doc, a website, a database table).
CREATE TABLE sources (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  type VARCHAR(50) NOT NULL CHECK (type IN ('google_docs', 'web', 'pdf', 'text', 'postgres')),
  config JSONB NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'error', 'syncing')),
  last_sync_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE sources IS 'Stores and manages various data sources for embedding.';
COMMENT ON COLUMN sources.config IS 'Flexible field for source-specific settings, e.g., { "url": "https://example.com" } or { "documentId": "..." }.';

-- 2. embeddings
-- Stores the actual text chunks, their vector embeddings, and associated metadata.
CREATE TABLE embeddings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  source_id UUID NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  content_hash VARCHAR(64) NOT NULL,
  embedding vector(1536) NOT NULL,
  token_count INTEGER,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE embeddings IS 'Stores text chunks, their vector embeddings, and metadata for semantic search.';
COMMENT ON COLUMN embeddings.source_id IS 'Foreign key to the sources table.';
COMMENT ON COLUMN embeddings.content_hash IS 'SHA-256 hash of the content to prevent duplicates, as per Gemini''s performance strategy.';
COMMENT ON COLUMN embeddings.embedding IS '1536-dimension vector from OpenAI''s text-embedding-ada-002 model.';
COMMENT ON COLUMN embeddings.metadata IS 'Flexible field for filterable data, e.g., { "page": 5, "author": "John Doe" }.';


-- ## Indexes ##
-- Indexes are crucial for performance, especially for vector search and metadata filtering.

-- For fast retrieval of sources by type and status
CREATE INDEX idx_sources_type ON sources(type);
CREATE INDEX idx_sources_status ON sources(status);

-- For fast lookup of embeddings by source
CREATE INDEX idx_embeddings_source_id ON embeddings(source_id);

-- For preventing duplicate content (deduplication)
CREATE UNIQUE INDEX idx_embeddings_content_hash ON embeddings(content_hash);

-- For fast filtering on metadata fields
CREATE INDEX idx_embeddings_metadata ON embeddings USING GIN(metadata);

-- The most critical index: for fast vector similarity search (cosine similarity)
-- The number of lists is a trade-off between search speed and index build time.
-- A good starting point is sqrt(number of rows), or N/1000 for larger datasets.
-- We start with 100 lists. This should be tuned later.
CREATE INDEX idx_embeddings_vector ON embeddings USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- For full-text search capabilities
CREATE INDEX IF NOT EXISTS idx_tsvector ON embeddings USING GIN(to_tsvector('english', content));


-- ## Triggers for updated_at ##
-- Automatically update the updated_at timestamp on row changes.

CREATE OR REPLACE FUNCTION trigger_set_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to sources table
CREATE TRIGGER set_timestamp_sources
BEFORE UPDATE ON sources
FOR EACH ROW
EXECUTE FUNCTION trigger_set_timestamp();

-- Apply trigger to embeddings table
CREATE TRIGGER set_timestamp_embeddings
BEFORE UPDATE ON embeddings
FOR EACH ROW
EXECUTE FUNCTION trigger_set_timestamp();

-- End of Schema