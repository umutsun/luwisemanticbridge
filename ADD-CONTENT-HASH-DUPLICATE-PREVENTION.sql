-- ========================================
-- UNIFIED_EMBEDDINGS DUPLICATE PREVENTION
-- Add content_hash column for cross-table duplicate detection
-- ========================================
--
-- Purpose: Prevent duplicate embeddings when migrating from different tables
--          with identical content (e.g., ozlgeler vs ozlgeler_test_100)
--
-- Author: System
-- Date: 2025-10-24
-- Database: lsemb
-- ========================================

BEGIN;

-- ========================================
-- STEP 0: Enable pgcrypto extension
-- ========================================
-- Required for digest() and sha256 hashing
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ========================================
-- STEP 1: Add content_hash column
-- ========================================
ALTER TABLE unified_embeddings
ADD COLUMN IF NOT EXISTS content_hash VARCHAR(64);

COMMENT ON COLUMN unified_embeddings.content_hash IS
'SHA-256 hash of normalized content for duplicate detection across different source tables';

-- ========================================
-- STEP 2: Create index for fast lookup
-- ========================================
CREATE INDEX IF NOT EXISTS idx_unified_embeddings_content_hash
ON unified_embeddings(content_hash);

-- Add composite index for common query pattern
CREATE INDEX IF NOT EXISTS idx_unified_embeddings_hash_source
ON unified_embeddings(content_hash, source_table, source_id);

-- ========================================
-- STEP 3: Backfill existing records
-- ========================================
-- Generate content_hash for all existing records
-- This normalizes content: lowercase, trim, compress whitespace
UPDATE unified_embeddings
SET content_hash = encode(
  digest(
    lower(trim(regexp_replace(content, '\s+', ' ', 'g'))),
    'sha256'
  ),
  'hex'
)
WHERE content_hash IS NULL AND content IS NOT NULL;

-- ========================================
-- STEP 4: Analysis - Find existing duplicates
-- ========================================
-- This query shows how many duplicates currently exist
SELECT
  '=== DUPLICATE ANALYSIS ===' as info;

WITH duplicate_analysis AS (
  SELECT
    content_hash,
    COUNT(*) as occurrence_count,
    array_agg(source_table || ' ID:' || source_id ORDER BY created_at) as locations,
    MIN(created_at) as first_occurrence,
    MAX(created_at) as last_occurrence
  FROM unified_embeddings
  WHERE content_hash IS NOT NULL
  GROUP BY content_hash
  HAVING COUNT(*) > 1
)
SELECT
  COUNT(*) as total_duplicate_groups,
  SUM(occurrence_count) as total_duplicate_rows,
  SUM(occurrence_count - 1) as wasteful_rows,
  ROUND(
    (SUM(occurrence_count - 1)::numeric /
     (SELECT COUNT(*) FROM unified_embeddings)::numeric) * 100,
    2
  ) as duplicate_percentage
FROM duplicate_analysis;

-- Show top 10 duplicate groups
SELECT
  content_hash,
  occurrence_count,
  locations,
  SUBSTRING(
    (SELECT content FROM unified_embeddings ue2
     WHERE ue2.content_hash = da.content_hash
     LIMIT 1),
    1, 100
  ) as content_preview,
  first_occurrence,
  last_occurrence
FROM (
  SELECT
    content_hash,
    COUNT(*) as occurrence_count,
    array_agg(source_table || ' ID:' || source_id ORDER BY created_at) as locations,
    MIN(created_at) as first_occurrence,
    MAX(created_at) as last_occurrence
  FROM unified_embeddings
  WHERE content_hash IS NOT NULL
  GROUP BY content_hash
  HAVING COUNT(*) > 1
  ORDER BY COUNT(*) DESC
  LIMIT 10
) da;

-- ========================================
-- STEP 5: Statistics
-- ========================================
SELECT
  '=== CONTENT HASH STATISTICS ===' as info;

SELECT
  COUNT(*) as total_rows,
  COUNT(DISTINCT content_hash) as unique_contents,
  COUNT(*) - COUNT(DISTINCT content_hash) as duplicate_rows,
  COUNT(CASE WHEN content_hash IS NULL THEN 1 END) as null_hash_count,
  ROUND(
    ((COUNT(*) - COUNT(DISTINCT content_hash))::numeric / COUNT(*)::numeric) * 100,
    2
  ) as duplicate_percentage
FROM unified_embeddings;

-- Show distribution by source table
SELECT
  source_table,
  COUNT(*) as total_records,
  COUNT(DISTINCT content_hash) as unique_content,
  COUNT(*) - COUNT(DISTINCT content_hash) as internal_duplicates,
  ROUND(AVG(LENGTH(content))) as avg_content_length
FROM unified_embeddings
WHERE content_hash IS NOT NULL
GROUP BY source_table
ORDER BY total_records DESC;

-- ========================================
-- STEP 6: Create helper function (optional)
-- ========================================
-- Function to generate content hash consistently
CREATE OR REPLACE FUNCTION generate_content_hash(content_text TEXT)
RETURNS VARCHAR(64) AS $$
BEGIN
  IF content_text IS NULL OR content_text = '' THEN
    RETURN NULL;
  END IF;

  RETURN encode(
    digest(
      lower(trim(regexp_replace(content_text, '\s+', ' ', 'g'))),
      'sha256'
    ),
    'hex'
  );
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION generate_content_hash(TEXT) IS
'Generate SHA-256 hash for content duplicate detection. Normalizes text before hashing.';

-- Test the function
SELECT
  '=== TESTING HASH FUNCTION ===' as info;

SELECT
  generate_content_hash('Test Content') as hash1,
  generate_content_hash('test   content') as hash2,
  generate_content_hash('TEST CONTENT') as hash3,
  (generate_content_hash('Test Content') = generate_content_hash('test   content')) as normalized_match;

-- ========================================
-- STEP 7: Create cleanup view (optional)
-- ========================================
-- View to identify duplicate records that can be safely deleted
CREATE OR REPLACE VIEW v_duplicate_embeddings AS
WITH ranked_duplicates AS (
  SELECT
    id,
    content_hash,
    source_table,
    source_id,
    source_name,
    created_at,
    ROW_NUMBER() OVER (
      PARTITION BY content_hash
      ORDER BY created_at ASC  -- Keep the oldest record
    ) as rn
  FROM unified_embeddings
  WHERE content_hash IS NOT NULL
)
SELECT
  id,
  content_hash,
  source_table,
  source_id,
  source_name,
  created_at,
  'DELETE' as action_recommended
FROM ranked_duplicates
WHERE rn > 1  -- All except the first occurrence
ORDER BY content_hash, created_at;

COMMENT ON VIEW v_duplicate_embeddings IS
'Shows duplicate embeddings that can be safely deleted. Keeps the oldest record for each content_hash.';

-- ========================================
-- STEP 8: Summary report
-- ========================================
SELECT
  '=== MIGRATION SUMMARY ===' as info;

SELECT
  'content_hash column' as component,
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'unified_embeddings'
    AND column_name = 'content_hash'
  ) THEN '✅ Added' ELSE '❌ Missing' END as status
UNION ALL
SELECT
  'content_hash index' as component,
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'unified_embeddings'
    AND indexname = 'idx_unified_embeddings_content_hash'
  ) THEN '✅ Created' ELSE '❌ Missing' END as status
UNION ALL
SELECT
  'helper function' as component,
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_proc
    WHERE proname = 'generate_content_hash'
  ) THEN '✅ Created' ELSE '❌ Missing' END as status
UNION ALL
SELECT
  'duplicate view' as component,
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_views
    WHERE viewname = 'v_duplicate_embeddings'
  ) THEN '✅ Created' ELSE '❌ Missing' END as status;

-- Show final statistics
SELECT
  (SELECT COUNT(*) FROM unified_embeddings) as total_embeddings,
  (SELECT COUNT(DISTINCT content_hash) FROM unified_embeddings WHERE content_hash IS NOT NULL) as unique_contents,
  (SELECT COUNT(*) FROM v_duplicate_embeddings) as duplicates_to_cleanup,
  (SELECT ROUND(pg_total_relation_size('unified_embeddings')::numeric / 1024 / 1024, 2)) as table_size_mb;

COMMIT;

-- ========================================
-- POST-MIGRATION NOTES
-- ========================================
--
-- 1. The content_hash column is now ready to use
-- 2. All existing records have been backfilled
-- 3. Use generate_content_hash() function in application code
-- 4. Check v_duplicate_embeddings view to find existing duplicates
-- 5. Next step: Update backend/src/routes/embeddings.routes.ts
--              to check content_hash before inserting
--
-- ========================================
