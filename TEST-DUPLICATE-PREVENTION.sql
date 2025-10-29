-- ========================================
-- TEST DUPLICATE PREVENTION
-- Test content_hash duplicate detection
-- ========================================
--
-- Purpose: Verify that ozlgeler_test_100 migration will correctly
--          skip duplicate content that already exists in ozlgeler
--
-- Run this AFTER: ADD-CONTENT-HASH-DUPLICATE-PREVENTION.sql
-- Run this BEFORE: Actual migration of ozlgeler_test_100
--
-- Database: lsemb
-- ========================================

-- ========================================
-- STEP 1: Verify content_hash column exists
-- ========================================
SELECT
  'Checking content_hash setup...' as step;

SELECT
  CASE
    WHEN EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'unified_embeddings'
      AND column_name = 'content_hash'
    ) THEN '✅ content_hash column exists'
    ELSE '❌ ERROR: content_hash column missing! Run ADD-CONTENT-HASH-DUPLICATE-PREVENTION.sql first'
  END as status;

SELECT
  CASE
    WHEN EXISTS (
      SELECT 1 FROM pg_indexes
      WHERE tablename = 'unified_embeddings'
      AND indexname = 'idx_unified_embeddings_content_hash'
    ) THEN '✅ content_hash index exists'
    ELSE '⚠️  WARNING: content_hash index missing (will slow down duplicate checks)'
  END as status;

-- ========================================
-- STEP 2: Check current unified_embeddings status
-- ========================================
SELECT
  '=== CURRENT UNIFIED_EMBEDDINGS STATUS ===' as info;

SELECT
  COUNT(*) as total_embeddings,
  COUNT(DISTINCT content_hash) as unique_content_hashes,
  COUNT(*) - COUNT(DISTINCT content_hash) as existing_duplicates,
  COUNT(CASE WHEN content_hash IS NULL THEN 1 END) as null_hashes
FROM unified_embeddings;

-- Show table distribution
SELECT
  source_table,
  COUNT(*) as total_records,
  COUNT(DISTINCT content_hash) as unique_content,
  COUNT(*) - COUNT(DISTINCT content_hash) as internal_duplicates
FROM unified_embeddings
GROUP BY source_table
ORDER BY total_records DESC;

-- ========================================
-- STEP 3: Simulate ozlgeler_test_100 migration
-- ========================================
-- This query shows what WOULD happen if you migrate ozlgeler_test_100

SELECT
  '=== SIMULATION: ozlgeler_test_100 MIGRATION ===' as info;

-- Check if ozlgeler_test_100 exists in source database
-- Note: Adjust connection string as needed
DO $$
BEGIN
  RAISE NOTICE 'Checking if ozlgeler_test_100 table exists...';
  RAISE NOTICE 'This is a simulation - actual table check requires dblink';
END $$;

-- ========================================
-- STEP 4: Content overlap analysis
-- ========================================
-- If you have sample data, this shows potential duplicates

SELECT
  '=== CONTENT OVERLAP ANALYSIS ===' as info;

-- Example: Find content that appears in multiple source tables
WITH content_sources AS (
  SELECT
    content_hash,
    array_agg(DISTINCT source_table ORDER BY source_table) as tables,
    array_agg(DISTINCT source_id::text ORDER BY source_id::text) as ids,
    COUNT(DISTINCT source_table) as table_count,
    MIN(created_at) as first_seen,
    MAX(created_at) as last_seen
  FROM unified_embeddings
  WHERE content_hash IS NOT NULL
  GROUP BY content_hash
  HAVING COUNT(DISTINCT source_table) > 1
)
SELECT
  content_hash,
  tables as appears_in_tables,
  ids as with_ids,
  table_count as number_of_tables,
  first_seen,
  last_seen,
  SUBSTRING(
    (SELECT content FROM unified_embeddings ue
     WHERE ue.content_hash = cs.content_hash
     LIMIT 1),
    1, 100
  ) || '...' as content_preview
FROM content_sources
ORDER BY table_count DESC, first_seen
LIMIT 20;

-- ========================================
-- STEP 5: Test duplicate detection function
-- ========================================
SELECT
  '=== TESTING CONTENT HASH FUNCTION ===' as info;

-- Test with sample text
SELECT
  generate_content_hash('Test Content Example') as hash1,
  generate_content_hash('test   content   example') as hash2,
  generate_content_hash('TEST CONTENT EXAMPLE') as hash3,
  (generate_content_hash('Test Content Example') =
   generate_content_hash('test   content   example')) as normalized_match;

-- ========================================
-- STEP 6: Estimate duplicate prevention impact
-- ========================================
SELECT
  '=== ESTIMATED IMPACT FOR YOUR SCENARIO ===' as info;

-- Example metrics (you can customize based on your tables)
SELECT
  'ozlgeler' as table_name,
  COUNT(*) as current_embeddings,
  COUNT(DISTINCT content_hash) as unique_contents,
  COUNT(*) - COUNT(DISTINCT content_hash) as internal_duplicates,
  ROUND(
    ((COUNT(*) - COUNT(DISTINCT content_hash))::numeric / COUNT(*)::numeric) * 100,
    2
  ) as duplicate_percentage
FROM unified_embeddings
WHERE source_table = 'ozlgeler'
  AND content_hash IS NOT NULL
UNION ALL
SELECT
  'ALL TABLES' as table_name,
  COUNT(*) as current_embeddings,
  COUNT(DISTINCT content_hash) as unique_contents,
  COUNT(*) - COUNT(DISTINCT content_hash) as duplicates_that_exist,
  ROUND(
    ((COUNT(*) - COUNT(DISTINCT content_hash))::numeric / COUNT(*)::numeric) * 100,
    2
  ) as duplicate_percentage
FROM unified_embeddings
WHERE content_hash IS NOT NULL;

-- ========================================
-- STEP 7: Sample duplicate detection query
-- ========================================
-- This is what the backend code will run during migration

SELECT
  '=== SAMPLE DUPLICATE CHECK QUERY ===' as info;

-- Example: Check if specific content would be considered duplicate
WITH sample_content AS (
  SELECT
    'Sample text for testing' as test_text,
    generate_content_hash('Sample text for testing') as test_hash
)
SELECT
  sc.test_text,
  sc.test_hash as content_hash,
  EXISTS (
    SELECT 1 FROM unified_embeddings
    WHERE content_hash = sc.test_hash
  ) as would_be_duplicate,
  (
    SELECT source_table || ' ID:' || source_id as existing_location
    FROM unified_embeddings
    WHERE content_hash = sc.test_hash
    LIMIT 1
  ) as duplicate_location
FROM sample_content sc;

-- ========================================
-- STEP 8: Performance test
-- ========================================
SELECT
  '=== PERFORMANCE TEST ===' as info;

-- Test query performance with EXPLAIN ANALYZE
EXPLAIN ANALYZE
SELECT id, source_table, source_id, source_name, created_at
FROM unified_embeddings
WHERE content_hash = generate_content_hash('test query performance');

-- ========================================
-- STEP 9: Recommendations
-- ========================================
SELECT
  '=== RECOMMENDATIONS ===' as info;

SELECT
  CASE
    WHEN (SELECT COUNT(*) FROM pg_indexes
          WHERE tablename = 'unified_embeddings'
          AND indexname = 'idx_unified_embeddings_content_hash') > 0
    THEN '✅ Index exists - duplicate checks will be fast'
    ELSE '⚠️  Create index: CREATE INDEX idx_unified_embeddings_content_hash ON unified_embeddings(content_hash);'
  END as index_recommendation
UNION ALL
SELECT
  CASE
    WHEN (SELECT COUNT(*) FROM unified_embeddings WHERE content_hash IS NULL) > 0
    THEN '⚠️  ' || (SELECT COUNT(*) FROM unified_embeddings WHERE content_hash IS NULL)::text ||
         ' records have NULL content_hash - run backfill UPDATE'
    ELSE '✅ All records have content_hash'
  END as hash_backfill_recommendation
UNION ALL
SELECT
  CASE
    WHEN (SELECT COUNT(DISTINCT content_hash) FROM unified_embeddings
          WHERE content_hash IS NOT NULL) <
         (SELECT COUNT(*) FROM unified_embeddings WHERE content_hash IS NOT NULL)
    THEN '✅ Duplicate prevention will save ' ||
         ((SELECT COUNT(*) FROM unified_embeddings WHERE content_hash IS NOT NULL) -
          (SELECT COUNT(DISTINCT content_hash) FROM unified_embeddings WHERE content_hash IS NOT NULL))::text ||
         ' redundant embeddings'
    ELSE '✅ No duplicates detected - all content is unique'
  END as duplicate_impact;

-- ========================================
-- STEP 10: Ready to migrate?
-- ========================================
SELECT
  '=== MIGRATION READINESS CHECKLIST ===' as info;

SELECT
  '✅ Schema ready' as item,
  CASE
    WHEN EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'unified_embeddings'
                 AND column_name = 'content_hash')
    THEN 'YES'
    ELSE 'NO - Run ADD-CONTENT-HASH-DUPLICATE-PREVENTION.sql'
  END as status
UNION ALL
SELECT
  '✅ Index optimized' as item,
  CASE
    WHEN EXISTS (SELECT 1 FROM pg_indexes
                 WHERE tablename = 'unified_embeddings'
                 AND indexname = 'idx_unified_embeddings_content_hash')
    THEN 'YES'
    ELSE 'NO - Create index for better performance'
  END as status
UNION ALL
SELECT
  '✅ Backfill complete' as item,
  CASE
    WHEN (SELECT COUNT(*) FROM unified_embeddings WHERE content_hash IS NULL) = 0
    THEN 'YES'
    ELSE 'NO - ' || (SELECT COUNT(*) FROM unified_embeddings WHERE content_hash IS NULL)::text || ' records need hashing'
  END as status
UNION ALL
SELECT
  '✅ Backend updated' as item,
  'CHECK MANUALLY - Verify embeddings.routes.ts has duplicate prevention code' as status;

-- ========================================
-- FINAL NOTE
-- ========================================
SELECT
  '=== NEXT STEPS ===' as info;

SELECT
  '1. Verify all checklist items above are ✅' as step
UNION ALL SELECT
  '2. Check backend logs show: "DUPLICATE PREVENTION: Content Hash Check"'
UNION ALL SELECT
  '3. Start migration of ozlgeler_test_100 via dashboard'
UNION ALL SELECT
  '4. Monitor console for "⚠️ DUPLICATE SKIPPED" messages'
UNION ALL SELECT
  '5. After migration, check duplicatesSkipped count in migration progress';
