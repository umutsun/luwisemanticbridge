-- SAFE INDEX CLEANUP SCRIPT
-- Bu script sadece INDEX'leri temizler, HİÇBİR VERİ SİLMEZ!
-- Tarih: 2025-01-22
-- Amaç: Duplicate vector index'leri kaldırarak %50 INSERT performans artışı

-- ============================================
-- STEP 1: MEVCUT DURUMU KAYDET (BACKUP)
-- ============================================

-- Index listesini kaydet
CREATE TABLE IF NOT EXISTS index_backup_20250122 AS
SELECT
    schemaname,
    tablename,
    indexname,
    indexdef,
    pg_size_pretty(pg_relation_size(indexrelid)) AS index_size,
    CURRENT_TIMESTAMP as backup_time
FROM pg_indexes
JOIN pg_stat_user_indexes USING (schemaname, tablename, indexname)
WHERE tablename = 'unified_embeddings';

-- ============================================
-- STEP 2: PERFORMANS ÖLÇÜMLERİ (ÖNCE)
-- ============================================

-- Mevcut INSERT hızını test et
DO $$
DECLARE
    start_time timestamp;
    end_time timestamp;
    duration interval;
BEGIN
    start_time := clock_timestamp();

    -- Test insert (sonra sileceğiz)
    INSERT INTO unified_embeddings (
        source_table, source_type, source_id, source_name, content, embedding
    )
    SELECT
        'test_cleanup',
        'test',
        999999,
        'performance_test',
        'Test content for performance measurement',
        (SELECT embedding FROM unified_embeddings LIMIT 1)
    FROM generate_series(1, 10);

    end_time := clock_timestamp();
    duration := end_time - start_time;

    RAISE NOTICE 'BEFORE CLEANUP - 10 INSERT süresi: %', duration;

    -- Test verisini sil
    DELETE FROM unified_embeddings WHERE source_table = 'test_cleanup';
END $$;

-- ============================================
-- STEP 3: KULLANIM İSTATİSTİKLERİNİ KONTROL ET
-- ============================================

-- Hangi index'ler kullanılıyor?
SELECT
    indexname,
    idx_scan as times_used,
    idx_tup_read as tuples_read,
    idx_tup_fetch as tuples_fetched,
    pg_size_pretty(pg_relation_size(indexrelid)) AS size,
    CASE
        WHEN idx_scan = 0 THEN 'NEVER USED - SAFE TO DROP'
        WHEN idx_scan < 100 THEN 'RARELY USED'
        ELSE 'ACTIVELY USED'
    END as usage_status
FROM pg_stat_user_indexes
WHERE tablename = 'unified_embeddings'
ORDER BY idx_scan DESC;

-- ============================================
-- STEP 4: DUPLICATE INDEX'LERİ GÜVENLİ KALDIR
-- ============================================

-- NOT: Bu indexler DUPLICATE - aynı işi yapıyorlar
-- Veri kaybı OLMAZ, sadece gereksiz index'ler kaldırılır

-- Duplicate HNSW index'leri kaldır (2 tane var, 1 tane yeter)
DROP INDEX IF EXISTS unified_embeddings_hnsw_idx;  -- Duplicate
-- idx_unified_embeddings_embedding_vector kalacak (primary HNSW)

-- Duplicate IVFFlat index'leri kaldır (2 tane var, 1 tane yeter)
DROP INDEX IF EXISTS unified_embeddings_ivfflat_idx;  -- Duplicate
-- idx_unified_embeddings_vector kalacak (primary IVFFlat)

-- NOT: DiskANN (idx_unified_embeddings_diskann) en iyi performans
-- Diğerleri backup için tutulabilir

-- ============================================
-- STEP 5: SONUÇ KONTROLÜ
-- ============================================

-- Kalan index'leri listele
SELECT
    indexname,
    pg_size_pretty(pg_relation_size(indexrelid)) AS size,
    indexdef
FROM pg_indexes
JOIN pg_stat_user_indexes USING (schemaname, tablename, indexname)
WHERE tablename = 'unified_embeddings';

-- ============================================
-- STEP 6: PERFORMANS ÖLÇÜMLERİ (SONRA)
-- ============================================

-- Temizlik sonrası INSERT hızını test et
DO $$
DECLARE
    start_time timestamp;
    end_time timestamp;
    duration interval;
BEGIN
    start_time := clock_timestamp();

    -- Test insert (sonra sileceğiz)
    INSERT INTO unified_embeddings (
        source_table, source_type, source_id, source_name, content, embedding
    )
    SELECT
        'test_cleanup_after',
        'test',
        999998,
        'performance_test_after',
        'Test content for performance measurement after cleanup',
        (SELECT embedding FROM unified_embeddings LIMIT 1)
    FROM generate_series(1, 10);

    end_time := clock_timestamp();
    duration := end_time - start_time;

    RAISE NOTICE 'AFTER CLEANUP - 10 INSERT süresi: %', duration;

    -- Test verisini sil
    DELETE FROM unified_embeddings WHERE source_table = 'test_cleanup_after';
END $$;

-- ============================================
-- STEP 7: VACUUM ve ANALYZE
-- ============================================

-- Tabloyu optimize et
VACUUM ANALYZE unified_embeddings;

-- ============================================
-- STEP 8: RAPOR
-- ============================================

SELECT
    'Cleanup Complete' as status,
    COUNT(*) as total_records,
    COUNT(*) FILTER (WHERE embedding IS NOT NULL) as with_embeddings,
    (SELECT COUNT(*) FROM pg_indexes WHERE tablename = 'unified_embeddings') as remaining_indexes,
    pg_size_pretty(pg_total_relation_size('unified_embeddings')) as table_size
FROM unified_embeddings;

-- ============================================
-- ROLLBACK SCRIPT (Gerekirse)
-- ============================================
-- Eğer sorun olursa, backup'tan index tanımlarını alıp
-- yeniden oluşturabiliriz:
--
-- SELECT indexdef FROM index_backup_20250122;
--
-- Her indexdef'i kopyalayıp çalıştırın
-- ============================================