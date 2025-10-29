-- ============================================
-- TOKEN TRACKING - KULLANIM ÖRNEKLERİ
-- ============================================

-- ============================================
-- 1. TOKEN KAYDETME (INSERT) ÖRNEKLERİ
-- ============================================

-- Örnek 1: Chat mesajı
INSERT INTO token_usage (
  session_id,
  user_id,
  model,
  provider,
  prompt_tokens,
  completion_tokens,
  total_tokens,
  cost_usd,
  operation_type,
  operation_id,
  metadata
) VALUES (
  'chat_session_123',           -- Session ID
  'user_456',                   -- User ID
  'gpt-4o-mini',               -- Model
  'openai',                    -- Provider
  150,                         -- Prompt tokens
  350,                         -- Completion tokens
  500,                         -- Total tokens
  0.0003,                      -- Cost ($0.0003)
  'chat',                      -- Operation type
  'msg_789',                   -- Message ID
  '{"message": "User asked about quantum computing"}'::jsonb
);

-- Örnek 2: Document embedding
INSERT INTO token_usage (
  session_id,
  user_id,
  model,
  provider,
  prompt_tokens,
  completion_tokens,
  total_tokens,
  cost_usd,
  operation_type,
  operation_id,
  metadata
) VALUES (
  'doc_batch_abc',
  'user_456',
  'text-embedding-3-small',
  'openai',
  5000,                        -- 5000 tokens embedded
  0,                           -- Embeddings don't have completion
  5000,
  0.0001,                      -- $0.0001 (5000 × $0.02/1M)
  'embedding',
  'doc_12345',
  '{"document_name": "quarterly-report.pdf", "chunks": 10}'::jsonb
);

-- Örnek 3: Scrape processing
INSERT INTO token_usage (
  session_id,
  user_id,
  model,
  provider,
  prompt_tokens,
  completion_tokens,
  total_tokens,
  cost_usd,
  operation_type,
  operation_id,
  metadata
) VALUES (
  'scrape_job_xyz',
  'user_456',
  'claude-3-5-sonnet-20241022',
  'claude',
  2000,
  3000,
  5000,
  0.051,                       -- (2000×$3/1M) + (3000×$15/1M)
  'scrape_processing',
  'scrape_98765',
  '{"url": "https://example.com/article", "extracted_entities": 25}'::jsonb
);

-- Örnek 4: Migration
INSERT INTO token_usage (
  session_id,
  user_id,
  model,
  provider,
  prompt_tokens,
  completion_tokens,
  total_tokens,
  cost_usd,
  operation_type,
  operation_id,
  metadata
) VALUES (
  'migration_2025_01_15',
  'system',
  'text-embedding-004',
  'gemini',
  50000,
  0,
  50000,
  0.00,                        -- Gemini embeddings are free
  'migration',
  'migration_batch_001',
  '{"tables_migrated": ["documents", "scrapes"], "rows": 1000}'::jsonb
);

-- ============================================
-- 2. DASHBOARD QUERY'LERİ
-- ============================================

-- 2.1 MESSAGES DASHBOARD - Session bilgisi
SELECT
  session_id,
  COUNT(*) as message_count,
  SUM(total_tokens) as total_tokens,
  SUM(cost_usd) as total_cost,
  array_agg(DISTINCT model) as models_used,
  MIN(created_at) as session_start,
  MAX(created_at) as session_end
FROM token_usage
WHERE session_id = 'chat_session_123'
  AND operation_type = 'chat'
GROUP BY session_id;

-- Result:
-- message_count: 25
-- total_tokens: 45,000
-- total_cost: $0.125
-- models_used: {gpt-4o-mini, gpt-4o}

-- 2.2 DOCUMENTS DASHBOARD - Document processing costs
SELECT
  operation_id as document_id,
  metadata->>'document_name' as document_name,
  SUM(total_tokens) as total_tokens,
  SUM(cost_usd) as total_cost,
  COUNT(*) as operations,
  array_agg(DISTINCT model) as models_used
FROM token_usage
WHERE operation_type = 'embedding'
  AND operation_id LIKE 'doc_%'
GROUP BY operation_id, metadata->>'document_name'
ORDER BY total_cost DESC
LIMIT 10;

-- Result: Top 10 most expensive documents

-- 2.3 SCRAPES DASHBOARD - Scrape processing costs
SELECT
  operation_id as scrape_id,
  metadata->>'url' as url,
  SUM(total_tokens) as total_tokens,
  SUM(cost_usd) as total_cost,
  COUNT(*) as operations
FROM token_usage
WHERE operation_type = 'scrape_processing'
GROUP BY operation_id, metadata->>'url'
ORDER BY total_cost DESC
LIMIT 10;

-- 2.4 MIGRATIONS DASHBOARD - Migration costs
SELECT
  session_id as migration_job,
  metadata->>'tables_migrated' as tables,
  SUM(total_tokens) as total_tokens,
  SUM(cost_usd) as total_cost,
  MIN(created_at) as started_at,
  MAX(created_at) as completed_at
FROM token_usage
WHERE operation_type = 'migration'
GROUP BY session_id, metadata->>'tables_migrated'
ORDER BY MIN(created_at) DESC;

-- ============================================
-- 3. ANALİZ QUERY'LERİ
-- ============================================

-- 3.1 Bugünün toplam maliyeti
SELECT
  SUM(cost_usd) as total_cost,
  SUM(total_tokens) as total_tokens,
  COUNT(*) as total_requests
FROM token_usage
WHERE created_at >= CURRENT_DATE;

-- 3.2 Son 7 günün günlük maliyeti
SELECT
  DATE(created_at) as date,
  SUM(cost_usd) as daily_cost,
  SUM(total_tokens) as daily_tokens,
  COUNT(*) as daily_requests
FROM token_usage
WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'
GROUP BY DATE(created_at)
ORDER BY date DESC;

-- 3.3 Kullanıcı bazında toplam maliyet
SELECT
  user_id,
  SUM(cost_usd) as total_cost,
  SUM(total_tokens) as total_tokens,
  COUNT(*) as total_requests,
  array_agg(DISTINCT operation_type) as operations
FROM token_usage
WHERE user_id IS NOT NULL
GROUP BY user_id
ORDER BY total_cost DESC
LIMIT 20;

-- 3.4 İşlem tipi bazında maliyet dağılımı
SELECT
  operation_type,
  COUNT(*) as request_count,
  SUM(total_tokens) as total_tokens,
  SUM(cost_usd) as total_cost,
  AVG(cost_usd) as avg_cost_per_request,
  COUNT(DISTINCT user_id) as unique_users
FROM token_usage
GROUP BY operation_type
ORDER BY total_cost DESC;

-- 3.5 Model karşılaştırması
SELECT
  provider,
  model,
  COUNT(*) as usage_count,
  SUM(total_tokens) as total_tokens,
  SUM(cost_usd) as total_cost,
  AVG(total_tokens) as avg_tokens_per_use,
  AVG(cost_usd) as avg_cost_per_use
FROM token_usage
GROUP BY provider, model
ORDER BY total_cost DESC;

-- 3.6 En pahalı 10 işlem
SELECT
  operation_type,
  operation_id,
  model,
  total_tokens,
  cost_usd,
  metadata,
  created_at
FROM token_usage
ORDER BY cost_usd DESC
LIMIT 10;

-- 3.7 Saat bazında kullanım (son 24 saat)
SELECT
  DATE_TRUNC('hour', created_at) as hour,
  operation_type,
  COUNT(*) as requests,
  SUM(cost_usd) as hourly_cost
FROM token_usage
WHERE created_at >= NOW() - INTERVAL '24 hours'
GROUP BY DATE_TRUNC('hour', created_at), operation_type
ORDER BY hour DESC;

-- ============================================
-- 4. VİEW'LARI KULLANMA
-- ============================================

-- 4.1 Session özeti
SELECT * FROM v_session_token_summary
WHERE session_id = 'chat_session_123';

-- 4.2 Kullanıcı toplam kullanımı
SELECT * FROM v_user_token_summary
WHERE user_id = 'user_456';

-- 4.3 Günlük işlem bazında özet
SELECT * FROM v_daily_usage_by_operation
WHERE date = CURRENT_DATE
ORDER BY total_cost_usd DESC;

-- 4.4 Model kullanım istatistikleri
SELECT * FROM v_model_usage_stats
ORDER BY total_cost_usd DESC
LIMIT 10;

-- 4.5 İşlem tipi özeti
SELECT * FROM v_operation_type_summary
ORDER BY total_cost_usd DESC;

-- 4.6 Saatlik kullanım (real-time monitoring)
SELECT * FROM v_hourly_usage
ORDER BY hour DESC;

-- 4.7 Kullanıcı-işlem maliyet analizi
SELECT * FROM v_user_operation_costs
WHERE user_id = 'user_456'
ORDER BY total_cost_usd DESC;

-- ============================================
-- 5. FONKSİYON KULLANIMI
-- ============================================

-- 5.1 Bugünün toplam maliyeti
SELECT * FROM get_total_cost(
  CURRENT_DATE,
  CURRENT_DATE + INTERVAL '1 day'
);

-- 5.2 Belirli kullanıcının son 30 günlük maliyeti
SELECT * FROM get_total_cost(
  CURRENT_DATE - INTERVAL '30 days',
  CURRENT_DATE,
  'user_456'  -- user_id
);

-- 5.3 Belirli işlem tipinin maliyeti
SELECT * FROM get_total_cost(
  CURRENT_DATE - INTERVAL '7 days',
  CURRENT_DATE,
  NULL,              -- tüm kullanıcılar
  'embedding'        -- sadece embedding işlemleri
);

-- 5.4 Manuel maliyet hesaplama
SELECT calculate_token_cost(
  'openai',          -- provider
  'gpt-4o-mini',    -- model
  1000,             -- prompt tokens
  500               -- completion tokens
);
-- Result: 0.00045 ($0.00045)

-- ============================================
-- 6. DASHBOARD KPI'LARI
-- ============================================

-- 6.1 Bugünün KPI'ları
SELECT
  (SELECT SUM(cost_usd) FROM token_usage WHERE created_at >= CURRENT_DATE) as today_cost,
  (SELECT SUM(total_tokens) FROM token_usage WHERE created_at >= CURRENT_DATE) as today_tokens,
  (SELECT COUNT(*) FROM token_usage WHERE created_at >= CURRENT_DATE) as today_requests,
  (SELECT COUNT(DISTINCT user_id) FROM token_usage WHERE created_at >= CURRENT_DATE AND user_id IS NOT NULL) as today_users,
  (SELECT COUNT(DISTINCT model) FROM token_usage WHERE created_at >= CURRENT_DATE) as models_used_today;

-- 6.2 Bu ayki toplam
SELECT
  SUM(cost_usd) as monthly_cost,
  SUM(total_tokens) as monthly_tokens,
  COUNT(*) as monthly_requests
FROM token_usage
WHERE created_at >= DATE_TRUNC('month', CURRENT_DATE);

-- 6.3 En aktif kullanıcı (bugün)
SELECT
  user_id,
  COUNT(*) as requests,
  SUM(cost_usd) as cost
FROM token_usage
WHERE created_at >= CURRENT_DATE
  AND user_id IS NOT NULL
GROUP BY user_id
ORDER BY cost DESC
LIMIT 1;

-- 6.4 En çok kullanılan model (bugün)
SELECT
  model,
  COUNT(*) as usage_count,
  SUM(cost_usd) as total_cost
FROM token_usage
WHERE created_at >= CURRENT_DATE
GROUP BY model
ORDER BY usage_count DESC
LIMIT 1;

-- ============================================
-- 7. BUDGET ALERTS
-- ============================================

-- 7.1 Günlük budget aşımı kontrolü ($10 limit)
SELECT
  DATE(created_at) as date,
  SUM(cost_usd) as daily_cost,
  CASE
    WHEN SUM(cost_usd) > 10 THEN '🔴 ALERT: Budget exceeded!'
    WHEN SUM(cost_usd) > 8 THEN '🟡 WARNING: Near budget limit'
    ELSE '🟢 OK'
  END as status
FROM token_usage
WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'
GROUP BY DATE(created_at)
ORDER BY date DESC;

-- 7.2 Kullanıcı budget kontrolü
SELECT
  user_id,
  SUM(cost_usd) as total_cost,
  CASE
    WHEN SUM(cost_usd) > 100 THEN '🔴 HIGH USAGE'
    WHEN SUM(cost_usd) > 50 THEN '🟡 MEDIUM USAGE'
    ELSE '🟢 NORMAL'
  END as usage_level
FROM token_usage
WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'
  AND user_id IS NOT NULL
GROUP BY user_id
HAVING SUM(cost_usd) > 10  -- Sadece $10'dan fazla harcayanları göster
ORDER BY total_cost DESC;

-- ============================================
-- 8. EXPORT QUERY'LERİ (CSV İÇİN)
-- ============================================

-- 8.1 Detaylı rapor (tüm alanlar)
SELECT
  created_at,
  session_id,
  user_id,
  operation_type,
  operation_id,
  provider,
  model,
  prompt_tokens,
  completion_tokens,
  total_tokens,
  cost_usd,
  metadata->>'document_name' as document_name,
  metadata->>'url' as url
FROM token_usage
WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'
ORDER BY created_at DESC;

-- 8.2 Özet rapor (günlük)
SELECT
  DATE(created_at) as date,
  operation_type,
  provider,
  model,
  COUNT(*) as requests,
  SUM(total_tokens) as tokens,
  SUM(cost_usd) as cost
FROM token_usage
WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY DATE(created_at), operation_type, provider, model
ORDER BY date DESC, cost DESC;

-- ============================================
-- 9. PERFORMANS OPTİMİZASYONU
-- ============================================

-- 9.1 Eski kayıtları temizleme (6 aydan eski)
-- DELETE FROM token_usage
-- WHERE created_at < CURRENT_DATE - INTERVAL '6 months';

-- 9.2 İstatistikleri güncelleme
ANALYZE token_usage;
ANALYZE model_pricing;

-- 9.3 Index kullanımı kontrolü
SELECT
  schemaname,
  tablename,
  indexname,
  idx_scan as index_scans,
  idx_tup_read as tuples_read,
  idx_tup_fetch as tuples_fetched
FROM pg_stat_user_indexes
WHERE tablename = 'token_usage'
ORDER BY idx_scan DESC;
