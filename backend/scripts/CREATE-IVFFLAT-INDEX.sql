-- ========================================
-- IVFFLAT INDEX (FALLBACK - ALWAYS WORKS)
-- ========================================
-- Use this if HNSW and DiskANN don't work
-- Still 5-10x faster than no index!

\echo '========================================='
\echo 'CREATING IVFFLAT INDEX'
\echo '========================================='

-- Drop other indexes
DROP INDEX IF EXISTS unified_embeddings_diskann_idx;
DROP INDEX IF EXISTS unified_embeddings_hnsw_idx;
DROP INDEX IF EXISTS unified_embeddings_ivfflat_idx;

-- IVFFlat with optimal lists parameter
-- Formula: lists = rows / 1000 (for ~18K rows = 18 lists)
-- But we use higher for better accuracy
CREATE INDEX unified_embeddings_ivfflat_idx
ON unified_embeddings
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

\echo 'IVFFlat index created with 100 lists'

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
  AND indexname LIKE '%ivfflat%';

\echo ''
\echo '========================================='
\echo 'PERFORMANCE NOTE'
\echo '========================================='

-- Set probes for query time (higher = more accurate, slower)
-- Default is lists/10, we use lists/5 for better recall
SET ivfflat.probes = 20;

\echo ''
\echo 'IVFFlat index created successfully!'
\echo ''
\echo 'To optimize queries, add to your backend initialization:'
\echo '  await pool.query("SET ivfflat.probes = 20");'
\echo ''
\echo 'Performance: 5-10x faster than no index'
\echo '(HNSW would be 2x faster than this if available)'
\echo '========================================='
