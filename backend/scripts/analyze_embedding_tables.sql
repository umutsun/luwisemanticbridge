-- EMBEDDING TABLES ANALYSIS
-- VERİ SİLMEZ - Sadece analiz eder ve raporlar
-- Tarih: 2025-01-22

-- ============================================
-- STEP 1: TÜM EMBEDDING TABLOLARINI BUL
-- ============================================

WITH embedding_tables AS (
    SELECT
        table_name,
        table_schema,
        (SELECT COUNT(*) FROM information_schema.columns
         WHERE table_name = t.table_name
           AND column_name = 'embedding') as has_embedding_column
    FROM information_schema.tables t
    WHERE table_schema = 'public'
      AND (
        table_name LIKE '%embedding%'
        OR table_name LIKE '%chunk%'
        OR table_name = 'documents'
      )
)
SELECT
    table_name,
    pg_size_pretty(pg_total_relation_size(table_schema||'.'||table_name)) as table_size,
    (xpath('/row/count/text()',
           query_to_xml('SELECT COUNT(*) FROM '||table_schema||'.'||table_name, true, true, '')))[1]::text::int as row_count,
    has_embedding_column
FROM embedding_tables
ORDER BY pg_total_relation_size(table_schema||'.'||table_name) DESC;

-- ============================================
-- STEP 2: UNIFIED_EMBEDDINGS DETAYLI ANALİZ
-- ============================================

SELECT 'UNIFIED_EMBEDDINGS Analysis' as analysis_type;

SELECT
    source_table,
    source_type,
    COUNT(*) as record_count,
    COUNT(DISTINCT source_id) as unique_sources,
    COUNT(*) FILTER (WHERE embedding IS NOT NULL) as with_embedding,
    COUNT(*) FILTER (WHERE embedding IS NULL) as without_embedding,
    MIN(created_at) as oldest_record,
    MAX(created_at) as newest_record,
    AVG(LENGTH(content)) as avg_content_length,
    SUM(tokens_used) as total_tokens,
    pg_size_pretty(
        SUM(pg_column_size(embedding))::bigint
    ) as embedding_storage_size
FROM unified_embeddings
GROUP BY source_table, source_type
ORDER BY record_count DESC;

-- ============================================
-- STEP 3: DOCUMENT_EMBEDDINGS ANALİZ
-- ============================================

SELECT 'DOCUMENT_EMBEDDINGS Analysis' as analysis_type;

SELECT
    COUNT(*) as total_records,
    COUNT(DISTINCT document_id) as unique_documents,
    COUNT(*) FILTER (WHERE embedding IS NOT NULL) as with_embedding,
    MIN(created_at) as oldest_record,
    MAX(created_at) as newest_record,
    pg_size_pretty(pg_total_relation_size('document_embeddings')) as table_size
FROM document_embeddings;

-- ============================================
-- STEP 4: MESSAGE_EMBEDDINGS ANALİZ
-- ============================================

SELECT 'MESSAGE_EMBEDDINGS Analysis' as analysis_type;

SELECT
    COUNT(*) as total_records,
    COUNT(DISTINCT message_id) as unique_messages,
    COUNT(*) FILTER (WHERE embedding IS NOT NULL) as with_embedding,
    MIN(created_at) as oldest_record,
    MAX(created_at) as newest_record,
    pg_size_pretty(pg_total_relation_size('message_embeddings')) as table_size
FROM message_embeddings;

-- ============================================
-- STEP 5: SCRAPE_EMBEDDINGS ANALİZ
-- ============================================

SELECT 'SCRAPE_EMBEDDINGS Analysis' as analysis_type;

SELECT
    COUNT(*) as total_records,
    COUNT(DISTINCT url) as unique_urls,
    COUNT(*) FILTER (WHERE embedding IS NOT NULL) as with_embedding,
    MIN(created_at) as oldest_record,
    MAX(created_at) as newest_record,
    pg_size_pretty(pg_total_relation_size('scrape_embeddings')) as table_size
FROM scrape_embeddings;

-- ============================================
-- STEP 6: CHUNKS ANALİZ
-- ============================================

SELECT 'CHUNKS Analysis' as analysis_type;

SELECT
    document_table,
    COUNT(*) as chunk_count,
    AVG(chunk_index) as avg_chunks_per_doc,
    COUNT(*) FILTER (WHERE embedding IS NOT NULL) as with_embedding,
    MIN(created_at) as oldest_record,
    MAX(created_at) as newest_record
FROM chunks
GROUP BY document_table;

-- ============================================
-- STEP 7: DUPLIKASYON ANALİZİ
-- ============================================

SELECT 'DUPLICATION CHECK' as analysis_type;

-- Unified vs Document embeddings karşılaştırması
WITH unified_docs AS (
    SELECT source_id::int as doc_id
    FROM unified_embeddings
    WHERE source_table = 'documents'
),
document_embs AS (
    SELECT document_id as doc_id
    FROM document_embeddings
)
SELECT
    'Documents in both tables' as check_type,
    COUNT(*) as count
FROM unified_docs u
JOIN document_embs d ON u.doc_id = d.doc_id

UNION ALL

SELECT
    'Documents only in unified_embeddings' as check_type,
    COUNT(*) as count
FROM unified_docs u
LEFT JOIN document_embs d ON u.doc_id = d.doc_id
WHERE d.doc_id IS NULL

UNION ALL

SELECT
    'Documents only in document_embeddings' as check_type,
    COUNT(*) as count
FROM document_embs d
LEFT JOIN unified_docs u ON d.doc_id = u.doc_id
WHERE u.doc_id IS NULL;

-- ============================================
-- STEP 8: MIGRATION ÖNERİSİ (VERİ SİLMEDEN)
-- ============================================

SELECT 'MIGRATION RECOMMENDATION' as analysis_type;

SELECT
    'unified_embeddings' as target_table,
    'PRIMARY' as recommendation,
    'Keep all data here' as action,
    (SELECT COUNT(*) FROM unified_embeddings) as current_records
UNION ALL
SELECT
    'document_embeddings' as target_table,
    'MIGRATE' as recommendation,
    'Copy missing records to unified' as action,
    (SELECT COUNT(*) FROM document_embeddings) as current_records
UNION ALL
SELECT
    'message_embeddings' as target_table,
    'MIGRATE' as recommendation,
    'Copy missing records to unified' as action,
    (SELECT COUNT(*) FROM message_embeddings) as current_records
UNION ALL
SELECT
    'scrape_embeddings' as target_table,
    'MIGRATE' as recommendation,
    'Copy missing records to unified' as action,
    (SELECT COUNT(*) FROM scrape_embeddings) as current_records
UNION ALL
SELECT
    'chunks' as target_table,
    'EVALUATE' as recommendation,
    'Check if needed separately' as action,
    (SELECT COUNT(*) FROM chunks) as current_records;

-- ============================================
-- STEP 9: SAFE MIGRATION SCRIPT ÖRNEK
-- ============================================

-- NOT: Bu sadece ÖRNEK - çalıştırmayın, önce kontrol edin

/*
-- Document_embeddings'den unified'a güvenli kopyalama
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
    model_used
)
SELECT
    'documents' as source_table,
    'document' as source_type,
    document_id as source_id,
    COALESCE(title, 'Document ' || document_id) as source_name,
    content,
    embedding,
    metadata,
    created_at,
    updated_at,
    tokens_used,
    model_used
FROM document_embeddings de
WHERE NOT EXISTS (
    -- Zaten unified'da olmayan kayıtları al
    SELECT 1
    FROM unified_embeddings ue
    WHERE ue.source_table = 'documents'
      AND ue.source_id = de.document_id
);
*/

-- ============================================
-- STEP 10: ÖZET RAPOR
-- ============================================

SELECT 'SUMMARY REPORT' as report_type;

SELECT
    'Total Embedding Records' as metric,
    SUM(count) as value
FROM (
    SELECT COUNT(*) as count FROM unified_embeddings
    UNION ALL
    SELECT COUNT(*) FROM document_embeddings
    UNION ALL
    SELECT COUNT(*) FROM message_embeddings
    UNION ALL
    SELECT COUNT(*) FROM scrape_embeddings
    UNION ALL
    SELECT COUNT(*) FROM chunks
) t

UNION ALL

SELECT
    'Total Storage Used' as metric,
    pg_size_pretty(SUM(size)::bigint) as value
FROM (
    SELECT pg_total_relation_size('unified_embeddings') as size
    UNION ALL
    SELECT pg_total_relation_size('document_embeddings')
    UNION ALL
    SELECT pg_total_relation_size('message_embeddings')
    UNION ALL
    SELECT pg_total_relation_size('scrape_embeddings')
    UNION ALL
    SELECT pg_total_relation_size('chunks')
) t;

-- ============================================
-- NOT: BU SCRIPT HİÇBİR VERİ SİLMEZ
-- Sadece analiz eder ve raporlar
-- ============================================