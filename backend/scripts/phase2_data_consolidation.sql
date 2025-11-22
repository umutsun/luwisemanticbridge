-- ============================================
-- PHASE 2: DATA CONSOLIDATION SCRIPT
-- Date: 2025-01-22
-- Purpose: Safely migrate all embedding data to unified_embeddings
-- IMPORTANT: NO DATA WILL BE DELETED - ONLY COPIED
-- ============================================

-- ============================================
-- STEP 1: CREATE BACKUP TABLES (SAFETY FIRST)
-- ============================================

BEGIN TRANSACTION;

-- Create timestamp for this migration
DO $$
DECLARE
    migration_timestamp TEXT := TO_CHAR(NOW(), 'YYYYMMDD_HH24MI');
BEGIN
    RAISE NOTICE 'Starting migration at: %', migration_timestamp;
END $$;

-- Backup existing unified_embeddings (safety)
CREATE TABLE IF NOT EXISTS unified_embeddings_backup_20250122 AS
SELECT * FROM unified_embeddings;

RAISE NOTICE 'Backup created: unified_embeddings_backup_20250122';

-- ============================================
-- STEP 2: ANALYZE CURRENT STATE
-- ============================================

-- Check what we're dealing with
WITH migration_stats AS (
    SELECT
        'unified_embeddings' as table_name,
        COUNT(*) as total_records,
        COUNT(DISTINCT source_table || ':' || source_id) as unique_items,
        pg_size_pretty(pg_total_relation_size('unified_embeddings')) as table_size
    FROM unified_embeddings

    UNION ALL

    SELECT
        'document_embeddings' as table_name,
        COUNT(*) as total_records,
        COUNT(DISTINCT document_id) as unique_items,
        pg_size_pretty(pg_total_relation_size('document_embeddings')) as table_size
    FROM document_embeddings

    UNION ALL

    SELECT
        'message_embeddings' as table_name,
        COUNT(*) as total_records,
        COUNT(DISTINCT message_id) as unique_items,
        pg_size_pretty(pg_total_relation_size('message_embeddings')) as table_size
    FROM message_embeddings

    UNION ALL

    SELECT
        'scrape_embeddings' as table_name,
        COUNT(*) as total_records,
        COUNT(DISTINCT url) as unique_items,
        pg_size_pretty(pg_total_relation_size('scrape_embeddings')) as table_size
    FROM scrape_embeddings
)
SELECT * FROM migration_stats;

-- ============================================
-- STEP 3: MIGRATE DOCUMENT_EMBEDDINGS
-- ============================================

-- Only migrate records that don't exist in unified_embeddings
WITH migration_candidates AS (
    SELECT
        de.*,
        d.title as doc_title,
        d.file_type as doc_type
    FROM document_embeddings de
    LEFT JOIN documents d ON de.document_id = d.id
    WHERE NOT EXISTS (
        SELECT 1
        FROM unified_embeddings ue
        WHERE ue.source_table = 'documents'
          AND ue.source_id = de.document_id::text
    )
)
INSERT INTO unified_embeddings (
    source_table,
    source_type,
    source_id,
    source_name,
    content,
    embedding,
    metadata,
    created_at,
    updated_at,
    tokens_used,
    model_used,
    embedding_provider
)
SELECT
    'documents' as source_table,
    COALESCE(doc_type, 'document') as source_type,
    document_id::text as source_id,
    COALESCE(doc_title, 'Document ' || document_id) as source_name,
    content,
    embedding,
    COALESCE(metadata, '{}'::jsonb) as metadata,
    created_at,
    COALESCE(updated_at, created_at) as updated_at,
    COALESCE(tokens_used, 0) as tokens_used,
    COALESCE(model_used, 'text-embedding-ada-002') as model_used,
    COALESCE(embedding_provider, 'openai') as embedding_provider
FROM migration_candidates;

GET DIAGNOSTICS row_count;
RAISE NOTICE 'Migrated % document embeddings', row_count;

-- ============================================
-- STEP 4: MIGRATE MESSAGE_EMBEDDINGS
-- ============================================

WITH migration_candidates AS (
    SELECT
        me.*,
        m.content as msg_content,
        c.name as conversation_name
    FROM message_embeddings me
    LEFT JOIN messages m ON me.message_id = m.id
    LEFT JOIN conversations c ON m.conversation_id = c.id
    WHERE NOT EXISTS (
        SELECT 1
        FROM unified_embeddings ue
        WHERE ue.source_table = 'messages'
          AND ue.source_id = me.message_id::text
    )
)
INSERT INTO unified_embeddings (
    source_table,
    source_type,
    source_id,
    source_name,
    content,
    embedding,
    metadata,
    created_at,
    updated_at,
    tokens_used,
    model_used,
    embedding_provider
)
SELECT
    'messages' as source_table,
    'message' as source_type,
    message_id::text as source_id,
    COALESCE(
        conversation_name,
        'Message ' || message_id
    ) as source_name,
    COALESCE(content, msg_content, '') as content,
    embedding,
    COALESCE(
        metadata,
        jsonb_build_object(
            'conversation_id', me.conversation_id,
            'user_id', me.user_id
        )
    ) as metadata,
    created_at,
    COALESCE(updated_at, created_at) as updated_at,
    COALESCE(tokens_used, 0) as tokens_used,
    COALESCE(model_used, 'text-embedding-ada-002') as model_used,
    COALESCE(embedding_provider, 'openai') as embedding_provider
FROM migration_candidates;

GET DIAGNOSTICS row_count;
RAISE NOTICE 'Migrated % message embeddings', row_count;

-- ============================================
-- STEP 5: MIGRATE SCRAPE_EMBEDDINGS
-- ============================================

WITH migration_candidates AS (
    SELECT
        se.*
    FROM scrape_embeddings se
    WHERE NOT EXISTS (
        SELECT 1
        FROM unified_embeddings ue
        WHERE ue.source_table = 'scrapes'
          AND ue.source_id = se.url
    )
)
INSERT INTO unified_embeddings (
    source_table,
    source_type,
    source_id,
    source_name,
    content,
    embedding,
    metadata,
    created_at,
    updated_at,
    tokens_used,
    model_used,
    embedding_provider
)
SELECT
    'scrapes' as source_table,
    'webpage' as source_type,
    url as source_id,
    COALESCE(title, url) as source_name,
    content,
    embedding,
    COALESCE(
        metadata,
        jsonb_build_object(
            'url', url,
            'title', title,
            'crawl_id', crawl_id
        )
    ) as metadata,
    created_at,
    COALESCE(updated_at, created_at) as updated_at,
    COALESCE(tokens_used, 0) as tokens_used,
    COALESCE(model_used, 'text-embedding-ada-002') as model_used,
    COALESCE(embedding_provider, 'openai') as embedding_provider
FROM migration_candidates;

GET DIAGNOSTICS row_count;
RAISE NOTICE 'Migrated % scrape embeddings', row_count;

-- ============================================
-- STEP 6: MIGRATE CHUNKS TABLE
-- ============================================

WITH migration_candidates AS (
    SELECT
        c.*,
        d.title as doc_title
    FROM chunks c
    LEFT JOIN documents d ON c.document_id = d.id
    WHERE c.document_table = 'documents'
      AND NOT EXISTS (
        SELECT 1
        FROM unified_embeddings ue
        WHERE ue.source_table = 'chunks'
          AND ue.source_id = c.id::text
    )
)
INSERT INTO unified_embeddings (
    source_table,
    source_type,
    source_id,
    source_name,
    content,
    embedding,
    metadata,
    created_at,
    updated_at,
    tokens_used,
    model_used,
    embedding_provider
)
SELECT
    'chunks' as source_table,
    'chunk' as source_type,
    id::text as source_id,
    COALESCE(
        doc_title || ' - Chunk ' || chunk_index,
        'Document ' || document_id || ' - Chunk ' || chunk_index
    ) as source_name,
    chunk_text as content,
    embedding,
    jsonb_build_object(
        'document_id', document_id,
        'chunk_index', chunk_index,
        'document_table', document_table,
        'original_metadata', metadata
    ) as metadata,
    created_at,
    COALESCE(updated_at, created_at) as updated_at,
    0 as tokens_used,  -- chunks table doesn't track this
    'text-embedding-ada-002' as model_used,
    'openai' as embedding_provider
FROM migration_candidates
WHERE embedding IS NOT NULL;  -- Only migrate chunks with embeddings

GET DIAGNOSTICS row_count;
RAISE NOTICE 'Migrated % chunk embeddings', row_count;

-- ============================================
-- STEP 7: VERIFICATION
-- ============================================

-- Verify migration success
WITH verification AS (
    SELECT
        source_table,
        COUNT(*) as count,
        COUNT(DISTINCT source_id) as unique_sources,
        MIN(created_at) as oldest,
        MAX(created_at) as newest
    FROM unified_embeddings
    GROUP BY source_table
)
SELECT * FROM verification
ORDER BY source_table;

-- Check for any dimension mismatches
SELECT
    source_table,
    vector_dims(embedding) as dimensions,
    COUNT(*) as count
FROM unified_embeddings
WHERE embedding IS NOT NULL
GROUP BY source_table, vector_dims(embedding)
ORDER BY source_table, dimensions;

-- ============================================
-- STEP 8: CREATE INDEXES IF MISSING
-- ============================================

-- Ensure we have proper indexes on unified_embeddings
CREATE INDEX IF NOT EXISTS idx_unified_source
    ON unified_embeddings(source_table, source_id);

CREATE INDEX IF NOT EXISTS idx_unified_created
    ON unified_embeddings(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_unified_source_type
    ON unified_embeddings(source_type);

-- ============================================
-- STEP 9: UPDATE APPLICATION VIEWS (OPTIONAL)
-- ============================================

-- Create views for backward compatibility (if needed)
CREATE OR REPLACE VIEW v_document_embeddings AS
SELECT
    source_id::int as document_id,
    content,
    embedding,
    metadata,
    created_at,
    updated_at,
    tokens_used,
    model_used,
    embedding_provider
FROM unified_embeddings
WHERE source_table = 'documents';

CREATE OR REPLACE VIEW v_message_embeddings AS
SELECT
    source_id::int as message_id,
    (metadata->>'conversation_id')::int as conversation_id,
    (metadata->>'user_id')::int as user_id,
    content,
    embedding,
    metadata,
    created_at,
    updated_at,
    tokens_used,
    model_used,
    embedding_provider
FROM unified_embeddings
WHERE source_table = 'messages';

CREATE OR REPLACE VIEW v_scrape_embeddings AS
SELECT
    source_id as url,
    source_name as title,
    (metadata->>'crawl_id')::int as crawl_id,
    content,
    embedding,
    metadata,
    created_at,
    updated_at,
    tokens_used,
    model_used,
    embedding_provider
FROM unified_embeddings
WHERE source_table = 'scrapes';

-- ============================================
-- STEP 10: FINAL REPORT
-- ============================================

-- Summary report
SELECT
    'Migration Complete!' as status,
    (SELECT COUNT(*) FROM unified_embeddings) as total_unified_records,
    (SELECT COUNT(DISTINCT source_table) FROM unified_embeddings) as source_tables,
    (SELECT pg_size_pretty(pg_total_relation_size('unified_embeddings'))) as unified_table_size,
    NOW() as completed_at;

-- IMPORTANT: Review results before committing!
-- If everything looks good:
COMMIT;

-- If there are issues:
-- ROLLBACK;

-- ============================================
-- CLEANUP SCRIPT (RUN ONLY AFTER VERIFICATION)
-- ============================================

/*
-- ONLY RUN THIS AFTER CONFIRMING MIGRATION SUCCESS!
-- This will rename old tables (not delete) for safety

-- Step 1: Rename old tables (keep as backup)
ALTER TABLE document_embeddings RENAME TO document_embeddings_old_20250122;
ALTER TABLE message_embeddings RENAME TO message_embeddings_old_20250122;
ALTER TABLE scrape_embeddings RENAME TO scrape_embeddings_old_20250122;
ALTER TABLE chunks RENAME TO chunks_old_20250122;

-- Step 2: Update application code to use unified_embeddings or views

-- Step 3: After 30 days of stable operation, drop old tables:
-- DROP TABLE document_embeddings_old_20250122;
-- DROP TABLE message_embeddings_old_20250122;
-- DROP TABLE scrape_embeddings_old_20250122;
-- DROP TABLE chunks_old_20250122;
*/