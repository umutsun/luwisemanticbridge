-- Luwi Semantic Bridge - Index Optimization Migration
-- Author: Kilo Code
-- Date: 2025-09-01
-- Description: Consolidates all performance indexes and adds maintenance commands

-- 1. Ensure vector extension is available
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. Create all performance indexes (idempotent with IF NOT EXISTS)
CREATE INDEX IF NOT EXISTS idx_embeddings_vector 
  ON embeddings USING ivfflat (embedding vector_l2_ops);

CREATE INDEX IF NOT EXISTS idx_embeddings_source_id 
  ON embeddings(source_id);

CREATE INDEX IF NOT EXISTS idx_embeddings_created_at 
  ON embeddings(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_chunks_document_id 
  ON chunks(document_id);

CREATE INDEX IF NOT EXISTS idx_embeddings_workspace 
  ON embeddings((metadata->>'workspace'));

-- Text search index for full-text search capabilities
CREATE INDEX IF NOT EXISTS idx_embeddings_content_gin 
  ON embeddings USING gin(to_tsvector('english', text));

-- 3. Additional indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_embeddings_metadata_gin 
  ON embeddings USING gin(metadata);

CREATE INDEX IF NOT EXISTS idx_sources_type_status 
  ON sources(type, status);

CREATE INDEX IF NOT EXISTS idx_chunks_position 
  ON chunks(position);

-- 4. Maintenance commands to optimize database performance
-- Note: These should be executed after index creation
-- VACUUM ANALYZE embeddings;
-- VACUUM ANALYZE chunks;
-- VACUUM ANALYZE sources;

-- 5. Configuration recommendations (to be set in postgresql.conf)
-- maintenance_work_mem = 256MB
-- work_mem = 64MB
-- shared_buffers = 25% of available RAM
-- effective_cache_size = 50% of available RAM

-- 6. Comment on indexes for documentation
COMMENT ON INDEX idx_embeddings_vector IS 'IVFFlat index for fast vector similarity search using L2 distance';
COMMENT ON INDEX idx_embeddings_source_id IS 'Index for filtering embeddings by source ID';
COMMENT ON INDEX idx_embeddings_created_at IS 'Index for time-based queries on embeddings';
COMMENT ON INDEX idx_chunks_document_id IS 'Index for joining chunks with their parent documents';
COMMENT ON INDEX idx_embeddings_workspace IS 'Index for filtering by workspace metadata field';
COMMENT ON INDEX idx_embeddings_content_gin IS 'GIN index for full-text search on content';
COMMENT ON INDEX idx_embeddings_metadata_gin IS 'GIN index for efficient JSONB metadata querying';
COMMENT ON INDEX idx_sources_type_status IS 'Composite index for filtering sources by type and status';
COMMENT ON INDEX idx_chunks_position IS 'Index for ordering chunks by position within document';

-- 7. Update statistics for query planner
ANALYZE embeddings;
ANALYZE chunks;
ANALYZE sources;

-- End of migration