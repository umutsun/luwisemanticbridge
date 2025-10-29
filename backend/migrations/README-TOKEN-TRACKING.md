# Token Tracking System - Kurulum ve Kullanım

## 🎯 Amaç

Tüm LLM işlemlerinde (chat, embeddings, search, migrations, document/scrape processing) kullanılan token'ları track etmek ve maliyet hesaplamak.

## 📦 Kurulum

### 1. Migration'ı Çalıştır

pgAdmin'de veya psql ile:

```bash
psql -h 91.99.229.96 -U postgres -d lsemb -f migrations/001-token-tracking.sql
```

Veya pgAdmin'de:
1. Query Tool aç (Tools → Query Tool)
2. `001-token-tracking.sql` dosyasını aç
3. Execute (F5)

### 2. Başarı Kontrolü

```sql
-- Tabloları kontrol et
SELECT tablename FROM pg_tables WHERE tablename IN ('token_usage', 'model_pricing');

-- Kaç model fiyatı yüklendi?
SELECT COUNT(*) as pricing_count FROM model_pricing;
-- Beklenen: ~30 row

-- View'ları kontrol et
SELECT viewname FROM pg_views WHERE viewname LIKE 'v_%token%';
-- Beklenen: 7 view
```

## 📊 Nasıl Çalışır?

### Veri Akışı

```
LLM Request
    ↓
Token Usage Kaydedilir
    ↓
Otomatik Maliyet Hesaplanır (model_pricing'den)
    ↓
Dashboard'da Görüntülenir
```

### Tracked Operations

| Operation Type | Örnek | Nerede Kullanılır |
|---------------|-------|-------------------|
| `chat` | Kullanıcı mesajı | Messages/Chat |
| `embedding` | Document embedding | Documents, Migrations |
| `search` | Semantic search | Search |
| `migration` | Bulk embedding | Migrations |
| `document_processing` | Document analysis | Documents |
| `scrape_processing` | Scrape extraction | Scrapes |

## 💡 Kullanım Örnekleri

### Token Kaydetme

```sql
-- Chat mesajı için
INSERT INTO token_usage (
  session_id, user_id, model, provider,
  prompt_tokens, completion_tokens, total_tokens, cost_usd,
  operation_type, operation_id, metadata
) VALUES (
  'chat_123', 'user_456', 'gpt-4o-mini', 'openai',
  150, 350, 500, 0.0003,
  'chat', 'msg_789',
  '{"message": "User question"}'::jsonb
);

-- Document embedding için
INSERT INTO token_usage (
  session_id, user_id, model, provider,
  prompt_tokens, completion_tokens, total_tokens, cost_usd,
  operation_type, operation_id, metadata
) VALUES (
  'doc_batch_abc', 'user_456', 'text-embedding-3-small', 'openai',
  5000, 0, 5000, 0.0001,
  'embedding', 'doc_12345',
  '{"document_name": "report.pdf", "chunks": 10}'::jsonb
);
```

### Dashboard Query'leri

```sql
-- 1. Session bilgisi (Messages Dashboard)
SELECT * FROM v_session_token_summary
WHERE session_id = 'chat_123';

-- 2. Kullanıcı toplam kullanımı
SELECT * FROM v_user_token_summary
WHERE user_id = 'user_456';

-- 3. Bugünün maliyeti
SELECT * FROM get_total_cost(CURRENT_DATE, CURRENT_DATE + INTERVAL '1 day');

-- 4. İşlem tipi bazında özet
SELECT * FROM v_operation_type_summary
ORDER BY total_cost_usd DESC;

-- 5. Model karşılaştırması
SELECT * FROM v_model_usage_stats
ORDER BY total_cost_usd DESC
LIMIT 10;
```

## 📈 Dashboard Entegrasyonu

### Messages Dashboard

```typescript
// GET /api/v2/dashboard/messages/token-stats?sessionId=chat_123

Response:
{
  "sessionId": "chat_123",
  "messageCount": 25,
  "totalTokens": 45000,
  "totalCostUsd": 0.125,
  "modelsUsed": ["gpt-4o-mini", "gpt-4o"],
  "breakdown": [
    { "model": "gpt-4o-mini", "tokens": 30000, "cost": 0.045 },
    { "model": "gpt-4o", "tokens": 15000, "cost": 0.080 }
  ]
}
```

### Documents Dashboard

```sql
-- En pahalı 10 document
SELECT
  operation_id as document_id,
  metadata->>'document_name' as name,
  SUM(total_tokens) as tokens,
  SUM(cost_usd) as cost
FROM token_usage
WHERE operation_type = 'embedding'
GROUP BY operation_id, metadata->>'document_name'
ORDER BY cost DESC
LIMIT 10;
```

### Scrapes Dashboard

```sql
-- Scrape processing maliyetleri
SELECT
  operation_id as scrape_id,
  metadata->>'url' as url,
  SUM(cost_usd) as cost
FROM token_usage
WHERE operation_type = 'scrape_processing'
GROUP BY operation_id, metadata->>'url'
ORDER BY cost DESC;
```

### Migrations Dashboard

```sql
-- Migration job maliyetleri
SELECT
  session_id as job_id,
  SUM(total_tokens) as tokens,
  SUM(cost_usd) as cost,
  MIN(created_at) as started,
  MAX(created_at) as completed
FROM token_usage
WHERE operation_type = 'migration'
GROUP BY session_id
ORDER BY MIN(created_at) DESC;
```

## 💰 Model Fiyatları (2025)

| Model | Input ($/1M) | Output ($/1M) |
|-------|-------------|--------------|
| gpt-4o-mini | $0.15 | $0.60 |
| gpt-4o | $5.00 | $15.00 |
| claude-3-5-sonnet | $3.00 | $15.00 |
| claude-3-haiku | $0.25 | $1.25 |
| gemini-1.5-flash | $0.35 | $1.05 |
| text-embedding-3-small | $0.02 | $0.00 |

### Fiyat Güncelleme

```sql
-- Yeni fiyat ekle/güncelle
INSERT INTO model_pricing (provider, model, input_price_per_1m, output_price_per_1m)
VALUES ('openai', 'gpt-4o-mini', 0.15, 0.60)
ON CONFLICT (provider, model, effective_date)
DO UPDATE SET
  input_price_per_1m = EXCLUDED.input_price_per_1m,
  output_price_per_1m = EXCLUDED.output_price_per_1m;
```

## 🎯 KPI'lar ve Metrikler

### Bugünün Özeti

```sql
SELECT
  SUM(cost_usd) as today_cost,
  SUM(total_tokens) as today_tokens,
  COUNT(*) as today_requests,
  COUNT(DISTINCT user_id) as active_users
FROM token_usage
WHERE created_at >= CURRENT_DATE;
```

### Son 7 Günlük Trend

```sql
SELECT
  DATE(created_at) as date,
  SUM(cost_usd) as daily_cost,
  COUNT(*) as requests
FROM token_usage
WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'
GROUP BY DATE(created_at)
ORDER BY date;
```

### Top 10 Kullanıcı (Maliyet Bazında)

```sql
SELECT
  user_id,
  SUM(cost_usd) as total_cost,
  SUM(total_tokens) as total_tokens,
  COUNT(*) as requests
FROM token_usage
WHERE user_id IS NOT NULL
GROUP BY user_id
ORDER BY total_cost DESC
LIMIT 10;
```

## 🔔 Budget Alerts

```sql
-- Günlük $10 limiti aşan günler
SELECT
  DATE(created_at) as date,
  SUM(cost_usd) as daily_cost
FROM token_usage
GROUP BY DATE(created_at)
HAVING SUM(cost_usd) > 10
ORDER BY date DESC;

-- Yüksek harcama yapan kullanıcılar (aylık $50+)
SELECT
  user_id,
  SUM(cost_usd) as monthly_cost
FROM token_usage
WHERE created_at >= DATE_TRUNC('month', CURRENT_DATE)
  AND user_id IS NOT NULL
GROUP BY user_id
HAVING SUM(cost_usd) > 50
ORDER BY monthly_cost DESC;
```

## 📝 Backend Entegrasyonu

### TypeScript Service

```typescript
import TokenTrackerService from './services/token-tracker.service';

const tokenTracker = new TokenTrackerService(pool);

// Track usage
await tokenTracker.trackUsage({
  sessionId: 'chat_123',
  userId: 'user_456',
  model: 'gpt-4o-mini',
  provider: 'openai',
  promptTokens: 150,
  completionTokens: 350,
  totalTokens: 500,
  operationType: 'chat',
  operationId: 'msg_789',
  metadata: { message: 'User question' }
});

// Get session summary
const summary = await tokenTracker.getSessionSummary('chat_123');
console.log(`Total cost: $${summary.totalCostUsd}`);
```

### LLM Manager Integration

```typescript
// Otomatik tracking
class LLMManager {
  async generateCompletion(prompt, options) {
    const response = await this.provider.chat.completions.create({...});

    // Track tokens
    if (this.tokenTracker && response.usage) {
      await this.tokenTracker.trackUsage({
        sessionId: options.sessionId,
        userId: options.userId,
        model: this.model,
        provider: this.provider,
        promptTokens: response.usage.prompt_tokens,
        completionTokens: response.usage.completion_tokens,
        totalTokens: response.usage.total_tokens,
        operationType: options.operationType || 'chat',
      });
    }

    return response;
  }
}
```

## 🧪 Test Query'leri

```sql
-- Test: Manuel maliyet hesaplama
SELECT calculate_token_cost('openai', 'gpt-4o-mini', 1000, 500);
-- Beklenen: ~0.00045

-- Test: Bugünün toplamı
SELECT * FROM get_total_cost(CURRENT_DATE, CURRENT_DATE + INTERVAL '1 day');

-- Test: View çalışıyor mu?
SELECT COUNT(*) FROM v_session_token_summary;
SELECT COUNT(*) FROM v_user_token_summary;
SELECT COUNT(*) FROM v_model_usage_stats;
```

## 🗂️ Dosyalar

1. **001-token-tracking.sql** - Ana migration (çalıştır)
2. **USAGE-EXAMPLES.sql** - Kullanım örnekleri (referans)
3. **README-TOKEN-TRACKING.md** - Bu dosya (dokümantasyon)

## ✅ Checklist

- [ ] Migration çalıştırıldı
- [ ] Model pricing yüklendi (~30 row)
- [ ] View'lar oluşturuldu (7 adet)
- [ ] Test query'leri çalıştı
- [ ] Backend servis entegre edildi
- [ ] Dashboard endpoint'leri eklendi
- [ ] Frontend component'leri oluşturuldu

## 🎯 Özet

Bu sistem ile:

- ✅ **Tüm işlemler track edilir**: Chat, embeddings, search, migrations, documents, scrapes
- ✅ **Otomatik maliyet hesaplanır**: Güncel model fiyatları kullanılır
- ✅ **Session bazında görülür**: Her chat session'ın maliyeti bilinir
- ✅ **User bazında analiz edilir**: Kim ne kadar harcıyor?
- ✅ **Operation bazında karşılaştırılır**: Hangi işlem daha pahalı?
- ✅ **Model bazında optimize edilir**: En ucuz model hangisi?
- ✅ **Budget kontrolü**: Günlük/aylık limitleri aşma uyarıları

Başarılar! 🚀
