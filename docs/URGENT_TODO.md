# Alice Semantic Bridge - Acil Yapılacaklar Listesi

## 🚨 HEMEN YAPILACAKLAR (Öncelik Sırasıyla)

### 1. PostgreSQL İndeksleri Oluştur (5 dakika)
```sql
-- Bu komutları PostgreSQL'de çalıştır
CREATE EXTENSION IF NOT EXISTS vector;

CREATE INDEX IF NOT EXISTS idx_embeddings_vector 
  ON embeddings USING ivfflat (embedding vector_l2_ops);

CREATE INDEX IF NOT EXISTS idx_embeddings_source_id 
  ON embeddings(source_id);

CREATE INDEX IF NOT EXISTS idx_embeddings_created_at 
  ON embeddings(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_chunks_document_id 
  ON chunks(document_id);

CREATE INDEX IF NOT EXISTS idx_embeddings_workspace 
  ON embeddings((metadata->>'workspace'));

-- Text search index
CREATE INDEX IF NOT EXISTS idx_embeddings_content_gin 
  ON embeddings USING gin(to_tsvector('english', text));
```

### 2. TypeScript Build Hatalarını Düzelt (15 dakika)
```typescript
// shared/error-handler.ts - logger hatası
// 400. ve 405. satırlar:
// DEĞİŞTİR: node.logger.warn(...)
// YAP: console.warn(...)

// shared/embeddings.ts - status property hatası
// 356. ve 404. satırlar:
// KALDIR: status: error.response?.status

// src/shared/cache-manager.ts - line 262
// DEĞİŞTİR: .hashObject(identifier || '')
// YAP: .hashObject(identifier || {})

// nodes/AliceSemanticBridge.node.ts - line 524
// deleteBySourceId fonksiyonunu kontrol et, 2 parametre alıyor
```

### 3. Hybrid Search İmplementasyonu (30 dakika)
```typescript
// src/nodes/operations/hybrid-search.ts oluştur
export class HybridSearch {
  async search(query: string, options: SearchOptions): Promise<SearchResult[]> {
    const [vectorResults, keywordResults] = await Promise.all([
      this.vectorSearch(query, options),
      this.keywordSearch(query, options)
    ]);
    
    return this.rankResults(vectorResults, keywordResults, options.weights);
  }
}
```

### 4. Cache'i Aktif Et (10 dakika)
```typescript
// Her search operasyonunda cache kullan
const cacheKey = cache.generateKey('search', { query, limit });
const cached = await cache.get(cacheKey);
if (cached) return cached;

// Search yap...
await cache.set(cacheKey, results, 300); // 5 dakika TTL
```

### 5. Performance Monitoring Ekle (15 dakika)
```typescript
// src/monitoring/metrics.ts
export class PerformanceMetrics {
  private static metrics = new Map<string, number[]>();
  
  static track(operation: string, duration: number) {
    if (!this.metrics.has(operation)) {
      this.metrics.set(operation, []);
    }
    this.metrics.get(operation)!.push(duration);
  }
  
  static getStats(operation: string) {
    const durations = this.metrics.get(operation) || [];
    return {
      count: durations.length,
      avg: average(durations),
      p50: percentile(durations, 50),
      p95: percentile(durations, 95)
    };
  }
}
```

## 📊 PERFORMANS HEDEFLERİ

| Metrik | Şu An | Hedef | Yapılacak |
|--------|-------|-------|-----------|
| Search Latency | 150ms | 50ms | İndeks + Cache |
| Cache Hit Rate | 0% | 60% | Cache implementasyonu |
| Query Speed | 10 qps | 100 qps | Connection pooling |

## 🔧 HIZLI KOMUTLAR

```bash
# Build hatalarını kontrol et
cd C:\xampp\htdocs\alice-semantic-bridge
npm run build

# Testleri çalıştır
npm test

# Linting
npm run lint:fix

# PostgreSQL bağlantısını test et
psql -h 91.99.229.96 -U postgres -d postgres -c "SELECT version();"
```

## 🎯 BUGÜN BİTİRİLECEKLER

1. [ ] İndeksler oluştur (PostgreSQL)
2. [ ] Build hatalarını düzelt  
3. [ ] Cache'i aktif et
4. [ ] Hybrid search temel implementasyon
5. [ ] Performance metriklerini ekle
6. [ ] Test coverage'ı %60'a çıkar

## 💡 NOTLAR
- Redis zaten bağlı, sadece kullanmamız gerek
- PostgreSQL connection pooling zaten var
- Error handling framework var ama düzeltmeler gerekiyor
- Manage operations tamamlanmış (Codex başarılı!)

**TAHMİNİ SÜRE: 2-3 saat**

Her adımı tamamladıktan sonra `asb_redis set progress:{step} "completed"` ile kaydet!
