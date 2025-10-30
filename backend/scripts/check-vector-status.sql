-- Check pgvectorscale and pgai status
-- Run this to see current state before optimization

\echo '========================================='
\echo 'CHECKING EXTENSIONS'
\echo '========================================='

SELECT extname, extversion
FROM pg_extension
WHERE extname IN ('vector', 'vectorscale', 'ai')
ORDER BY extname;

\echo ''
\echo '========================================='
\echo 'CHECKING INDEXES ON unified_embeddings'
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
\echo 'CHECKING TABLE SIZE AND ROW COUNT'
\echo '========================================='

SELECT
    COUNT(*) as total_rows,
    COUNT(CASE WHEN embedding IS NOT NULL THEN 1 END) as rows_with_embeddings,
    COUNT(CASE WHEN embedding IS NULL THEN 1 END) as rows_without_embeddings,
    pg_size_pretty(pg_total_relation_size('unified_embeddings')) as total_size
FROM unified_embeddings;

\echo ''
\echo '========================================='
\echo 'CHECKING RECORD TYPES'
\echo '========================================='

SELECT
    metadata->>'table' as record_type,
    COUNT(*) as count,
    COUNT(CASE WHEN embedding IS NOT NULL THEN 1 END) as with_embeddings
FROM unified_embeddings
GROUP BY metadata->>'table'
ORDER BY count DESC;

\echo ''
\echo '========================================='
\echo 'CHECKING EMBEDDING DIMENSIONS'
\echo '========================================='

SELECT
    array_length(embedding, 1) as dimensions,
    COUNT(*) as count
FROM unified_embeddings
WHERE embedding IS NOT NULL
GROUP BY array_length(embedding, 1)
LIMIT 5;
