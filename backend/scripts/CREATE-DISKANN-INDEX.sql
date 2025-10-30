-- ========================================
-- CREATE DISKANN INDEX - CORRECT SYNTAX
-- ========================================

\echo '========================================='
\echo 'CREATING DISKANN INDEX WITH CORRECT SYNTAX'
\echo '========================================='

-- First check pgvectorscale version
SELECT extname, extversion
FROM pg_extension
WHERE extname = 'vectorscale';

\echo ''
\echo 'Creating StreamingDiskANN index...'

-- Drop if exists
DROP INDEX IF EXISTS unified_embeddings_diskann_idx;

-- Correct syntax for pgvectorscale StreamingDiskANN
CREATE INDEX unified_embeddings_diskann_idx
ON unified_embeddings
USING diskann (embedding)
WITH (
  num_neighbors = 50,
  search_list_size = 100,
  max_alpha = 1.2,
  num_dimensions = 1536,
  num_bits_per_dimension = 2
);

\echo 'DiskANN index created successfully!'

\echo ''
\echo '========================================='
\echo 'VERIFYING INDEX'
\echo '========================================='

SELECT
    schemaname,
    tablename,
    indexname,
    indexdef
FROM pg_indexes
WHERE tablename = 'unified_embeddings'
  AND indexname = 'unified_embeddings_diskann_idx';

\echo ''
\echo '========================================='
\echo 'ANALYZING TABLE'
\echo '========================================='

ANALYZE unified_embeddings;

\echo ''
\echo 'Index created and statistics updated!'
\echo 'Backend will now use ultra-fast DiskANN search!'
