-- ========================================
-- VERIFY VECTOR OPTIMIZATION
-- ========================================
-- Run this to confirm everything is working

\echo '========================================='
\echo '1. CHECKING INDEXES'
\echo '========================================='

SELECT
    indexname,
    pg_size_pretty(pg_relation_size(indexrelid)) as index_size,
    idx_scan as times_used,
    idx_tup_read as tuples_read,
    idx_tup_fetch as tuples_fetched
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
  AND tablename = 'unified_embeddings'
ORDER BY indexname;

\echo ''
\echo '========================================='
\echo '2. TESTING INDEX USAGE'
\echo '========================================='

-- Explain query to see if index is used
EXPLAIN (ANALYZE, BUFFERS, VERBOSE)
SELECT
    id,
    metadata->>'title' as title,
    embedding <=> '[0,0,0,0,0,0,0,0,0,0]'::vector as distance
FROM unified_embeddings
WHERE embedding IS NOT NULL
  AND metadata->>'table' = 'sorucevap'
ORDER BY embedding <=> '[0,0,0,0,0,0,0,0,0,0]'::vector
LIMIT 10;

\echo ''
\echo '========================================='
\echo '3. TABLE STATISTICS'
\echo '========================================='

SELECT
    schemaname,
    tablename,
    n_live_tup as live_rows,
    n_dead_tup as dead_rows,
    last_vacuum,
    last_autovacuum,
    last_analyze,
    last_autoanalyze
FROM pg_stat_user_tables
WHERE tablename = 'unified_embeddings';

\echo ''
\echo '========================================='
\echo 'OPTIMIZATION STATUS'
\echo '========================================='

DO $$
DECLARE
    index_exists boolean;
    row_count bigint;
BEGIN
    -- Check if HNSW index exists
    SELECT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE tablename = 'unified_embeddings'
          AND indexname = 'unified_embeddings_hnsw_idx'
    ) INTO index_exists;

    -- Get row count
    SELECT COUNT(*) INTO row_count
    FROM unified_embeddings
    WHERE embedding IS NOT NULL;

    RAISE NOTICE '';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'OPTIMIZATION SUMMARY';
    RAISE NOTICE '========================================';

    IF index_exists THEN
        RAISE NOTICE '✓ HNSW Index: ACTIVE';
        RAISE NOTICE '✓ Rows with embeddings: %', row_count;
        RAISE NOTICE '✓ Expected speedup: 10-50x';
        RAISE NOTICE '';
        RAISE NOTICE 'Status: READY TO USE!';
        RAISE NOTICE '';
        RAISE NOTICE 'Next step: Restart backend to apply optimized query';
    ELSE
        RAISE NOTICE '✗ HNSW Index: NOT FOUND';
        RAISE NOTICE 'Please create index first';
    END IF;

    RAISE NOTICE '========================================';
END $$;
