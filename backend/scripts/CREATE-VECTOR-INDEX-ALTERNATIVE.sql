-- ========================================
-- VECTOR INDEX - ALTERNATIVE OPTIONS
-- ========================================
-- If DiskANN doesn't work, try these alternatives

\echo '========================================='
\echo 'CHECKING AVAILABLE INDEX TYPES'
\echo '========================================='

-- Check what index types are available
SELECT amname
FROM pg_am
WHERE amname IN ('ivfflat', 'hnsw', 'diskann');

\echo ''
\echo '========================================='
\echo 'OPTION 1: HNSW INDEX (RECOMMENDED)'
\echo '========================================='

-- Drop old indexes
DROP INDEX IF EXISTS unified_embeddings_diskann_idx;
DROP INDEX IF EXISTS unified_embeddings_hnsw_idx;
DROP INDEX IF EXISTS unified_embeddings_ivfflat_idx;

-- HNSW is fastest for most cases (better than IVFFlat)
CREATE INDEX unified_embeddings_hnsw_idx
ON unified_embeddings
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

\echo 'HNSW index created!'
\echo 'Performance: 10-50x faster than no index'

\echo ''
\echo '========================================='
\echo 'ANALYZING TABLE'
\echo '========================================='

ANALYZE unified_embeddings;

\echo ''
\echo '========================================='
\echo 'VERIFYING INDEX'
\echo '========================================='

SELECT
    indexname,
    indexdef
FROM pg_indexes
WHERE tablename = 'unified_embeddings'
  AND indexname LIKE '%hnsw%';

\echo ''
\echo '========================================='
\echo 'INDEX CREATED SUCCESSFULLY!'
\echo '========================================='
\echo 'HNSW (Hierarchical Navigable Small World) is:'
\echo '  - Faster than IVFFlat for most queries'
\echo '  - Good balance of speed and accuracy'
\echo '  - Works well with 18K+ rows'
\echo ''
\echo 'Parameters:'
\echo '  m = 16 (higher = more accurate, more memory)'
\echo '  ef_construction = 64 (higher = better quality, slower build)'
\echo '========================================='
