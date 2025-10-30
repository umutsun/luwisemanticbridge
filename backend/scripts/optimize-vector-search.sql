-- ========================================
-- PGVECTORSCALE OPTIMIZATION FOR unified_embeddings
-- ========================================
-- This script creates DiskANN indexes for ultra-fast vector search
-- Expected improvement: 10-100x faster queries on large datasets

\echo '========================================='
\echo 'STEP 1: VERIFY EXTENSIONS'
\echo '========================================='

-- Ensure vectorscale extension is installed
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vectorscale') THEN
        RAISE NOTICE 'Installing vectorscale extension...';
        CREATE EXTENSION IF NOT EXISTS vectorscale CASCADE;
    ELSE
        RAISE NOTICE 'vectorscale extension already installed';
    END IF;
END $$;

-- Ensure vector extension is up to date
CREATE EXTENSION IF NOT EXISTS vector;

\echo ''
\echo '========================================='
\echo 'STEP 2: DROP OLD INDEXES (if exist)'
\echo '========================================='

-- Drop old indexes to recreate with optimal settings
DROP INDEX IF EXISTS unified_embeddings_embedding_idx;
DROP INDEX IF EXISTS unified_embeddings_vector_idx;
DROP INDEX IF EXISTS unified_embeddings_diskann_idx;

\echo 'Old indexes dropped (if existed)'

\echo ''
\echo '========================================='
\echo 'STEP 3: CREATE DISKANN INDEX'
\echo '========================================='

-- Create DiskANN index with optimal parameters
-- DiskANN is faster than IVFFlat and HNSW for large datasets
CREATE INDEX unified_embeddings_diskann_idx
ON unified_embeddings
USING diskann (embedding vector_cosine_ops)
WITH (
    num_neighbors = 50,           -- Number of neighbors to consider (higher = more accurate, slower build)
    search_list_size = 100,       -- Search list size (higher = more accurate, slower search)
    max_alpha = 1.2,              -- Alpha parameter for DiskANN
    num_dimensions = 1536,        -- Dimensions for text-embedding-3-small
    num_bits_per_dimension = 2    -- Quantization (lower = faster, less memory, slightly less accurate)
);

\echo 'DiskANN index created successfully!'
\echo 'This index uses disk-based ANN for memory-efficient fast search'

\echo ''
\echo '========================================='
\echo 'STEP 4: CREATE SUPPORTING INDEXES'
\echo '========================================='

-- Index for record_type filtering (metadata->>'table')
CREATE INDEX IF NOT EXISTS unified_embeddings_record_type_idx
ON unified_embeddings ((metadata->>'table'));

\echo 'Record type index created'

-- Index for NULL embedding filtering
CREATE INDEX IF NOT EXISTS unified_embeddings_has_embedding_idx
ON unified_embeddings (id)
WHERE embedding IS NOT NULL;

\echo 'Non-null embedding index created'

-- Composite index for filtering + similarity search
CREATE INDEX IF NOT EXISTS unified_embeddings_type_embedding_idx
ON unified_embeddings ((metadata->>'table'), embedding)
WHERE embedding IS NOT NULL;

\echo 'Composite type+embedding index created'

\echo ''
\echo '========================================='
\echo 'STEP 5: ANALYZE TABLE FOR QUERY PLANNER'
\echo '========================================='

ANALYZE unified_embeddings;

\echo 'Table statistics updated'

\echo ''
\echo '========================================='
\echo 'STEP 6: VERIFY INDEX CREATION'
\echo '========================================='

SELECT
    schemaname,
    tablename,
    indexname,
    indexdef
FROM pg_indexes
WHERE tablename = 'unified_embeddings'
ORDER BY indexname;

\echo ''
\echo '========================================='
\echo 'OPTIMIZATION COMPLETE!'
\echo '========================================='
\echo 'Next steps:'
\echo '1. Update semantic-search.service.ts to use optimized queries'
\echo '2. Test search performance'
\echo '3. Expected improvement: 10-100x faster on large datasets'
\echo '========================================='
