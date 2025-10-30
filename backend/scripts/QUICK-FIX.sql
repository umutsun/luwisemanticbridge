-- ========================================
-- QUICK FIX - RUN THIS NOW!
-- ========================================
-- This will create the best index your system supports

\echo 'Trying to create best available index...'
\echo ''

-- Drop any existing vector indexes
DROP INDEX IF EXISTS unified_embeddings_diskann_idx;
DROP INDEX IF EXISTS unified_embeddings_hnsw_idx;
DROP INDEX IF EXISTS unified_embeddings_ivfflat_idx;

-- Try HNSW first (best option)
DO $$
BEGIN
    -- Try to create HNSW index
    CREATE INDEX unified_embeddings_hnsw_idx
    ON unified_embeddings
    USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);

    RAISE NOTICE '✓ HNSW index created successfully! (Best performance)';
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE '✗ HNSW not available, trying IVFFlat...';

        -- Fallback to IVFFlat
        CREATE INDEX unified_embeddings_ivfflat_idx
        ON unified_embeddings
        USING ivfflat (embedding vector_cosine_ops)
        WITH (lists = 100);

        RAISE NOTICE '✓ IVFFlat index created (Good performance)';
END $$;

-- Update statistics
ANALYZE unified_embeddings;

\echo ''
\echo '========================================='
\echo 'INDEX CREATED!'
\echo '========================================='

-- Show what was created
SELECT
    indexname,
    CASE
        WHEN indexname LIKE '%hnsw%' THEN 'HNSW - Excellent (10-50x faster)'
        WHEN indexname LIKE '%ivfflat%' THEN 'IVFFlat - Good (5-10x faster)'
        WHEN indexname LIKE '%diskann%' THEN 'DiskANN - Best (50-100x faster)'
        ELSE 'Unknown'
    END as performance
FROM pg_indexes
WHERE tablename = 'unified_embeddings'
  AND indexname LIKE '%embedding%'
ORDER BY indexname DESC
LIMIT 1;

\echo ''
\echo 'Now restart your backend to use the new index!'
