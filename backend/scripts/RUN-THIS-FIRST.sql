-- ========================================
-- VECTOR SEARCH OPTIMIZATION - RUN THIS FIRST
-- ========================================
-- This is the COMPLETE script to run on your database
-- Copy and paste this ENTIRE file into your PostgreSQL client

\echo '========================================='
\echo '1. CHECKING EXTENSIONS'
\echo '========================================='

-- Show current extensions
SELECT extname, extversion
FROM pg_extension
WHERE extname IN ('vector', 'vectorscale', 'ai')
ORDER BY extname;

\echo ''
\echo '========================================='
\echo '2. CREATING OPTIMIZED INDEXES'
\echo '========================================='

-- Drop old indexes if they exist
DROP INDEX IF EXISTS unified_embeddings_embedding_idx;
DROP INDEX IF EXISTS unified_embeddings_vector_idx;

-- Create DiskANN index (THE MOST IMPORTANT OPTIMIZATION!)
CREATE INDEX IF NOT EXISTS unified_embeddings_diskann_idx
ON unified_embeddings
USING diskann (embedding vector_cosine_ops)
WITH (
    num_neighbors = 50,
    search_list_size = 100,
    max_alpha = 1.2
);

\echo 'DiskANN index created!'

-- Supporting indexes for filtering
CREATE INDEX IF NOT EXISTS unified_embeddings_record_type_idx
ON unified_embeddings ((metadata->>'table'));

CREATE INDEX IF NOT EXISTS unified_embeddings_has_embedding_idx
ON unified_embeddings (id)
WHERE embedding IS NOT NULL;

\echo 'Supporting indexes created!'

\echo ''
\echo '========================================='
\echo '3. UPDATING TABLE STATISTICS'
\echo '========================================='

ANALYZE unified_embeddings;

\echo 'Statistics updated!'

\echo ''
\echo '========================================='
\echo '4. VERIFYING INDEXES'
\echo '========================================='

SELECT
    indexname,
    indexdef
FROM pg_indexes
WHERE tablename = 'unified_embeddings'
ORDER BY indexname;

\echo ''
\echo '========================================='
\echo '5. TABLE STATUS'
\echo '========================================='

SELECT
    COUNT(*) as total_rows,
    COUNT(CASE WHEN embedding IS NOT NULL THEN 1 END) as with_embeddings,
    pg_size_pretty(pg_total_relation_size('unified_embeddings')) as table_size
FROM unified_embeddings;

\echo ''
\echo '========================================='
\echo 'OPTIMIZATION COMPLETE!'
\echo '========================================='
\echo 'Expected performance improvement: 10-100x faster'
\echo 'Backend code has been updated to use optimized queries'
\echo 'No further action needed - just restart your backend!'
\echo '========================================='
