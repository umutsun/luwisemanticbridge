-- Luwi Semantic Bridge - Performance Indexes
-- Run this script in your PostgreSQL database to create performance indexes

-- Enable vector extension if not already enabled
CREATE EXTENSION IF NOT EXISTS vector;

-- Vector similarity index using IVFFlat
-- This speeds up vector similarity searches
CREATE INDEX IF NOT EXISTS idx_embeddings_vector 
  ON embeddings USING ivfflat (embedding vector_l2_ops)
  WITH (lists = 100);

-- Source ID index for fast lookups by source
CREATE INDEX IF NOT EXISTS idx_embeddings_source_id 
  ON embeddings(source_id);

-- Created at index for time-based queries
CREATE INDEX IF NOT EXISTS idx_embeddings_created_at 
  ON embeddings(created_at DESC);

-- Chunks document ID index for join operations
CREATE INDEX IF NOT EXISTS idx_chunks_document_id 
  ON chunks(document_id);

-- Workspace metadata index for filtering by workspace
CREATE INDEX IF NOT EXISTS idx_embeddings_workspace 
  ON embeddings((metadata->>'workspace'))
  WHERE metadata->>'workspace' IS NOT NULL;

-- Text search GIN index for full-text search
CREATE INDEX IF NOT EXISTS idx_embeddings_content_gin 
  ON embeddings USING gin(to_tsvector('english', text));

-- Composite index for hybrid search queries
CREATE INDEX IF NOT EXISTS idx_embeddings_hybrid
  ON embeddings(source_id, created_at DESC)
  INCLUDE (text, metadata);

-- Index for metadata tags if used
CREATE INDEX IF NOT EXISTS idx_embeddings_tags
  ON embeddings USING gin((metadata->'tags'))
  WHERE metadata->'tags' IS NOT NULL;

-- Partial index for active/non-deleted records if you have a status field
-- CREATE INDEX IF NOT EXISTS idx_embeddings_active
--   ON embeddings(source_id, created_at DESC)
--   WHERE (metadata->>'deleted')::boolean IS NOT TRUE;

-- Analyze tables to update statistics after creating indexes
ANALYZE embeddings;
ANALYZE chunks;

-- Show index sizes and usage
SELECT 
  schemaname,
  tablename,
  indexname,
  pg_size_pretty(pg_relation_size(indexrelid)) AS index_size
FROM pg_stat_user_indexes
WHERE tablename IN ('embeddings', 'chunks')
ORDER BY pg_relation_size(indexrelid) DESC;