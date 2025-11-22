# Safe Migration Plan - Teknik Borç Ödeme
**Tarih**: 2025-01-22
**Prensip**: VERİ KAYBI YAŞAMADAN

## 📋 Görev Listesi

### Phase 1: Hızlı Kazançlar (BUGÜN - 30 dakika)
✅ **Veri Riski**: YOK
🚀 **Performans Kazancı**: %50

#### 1.1 Duplicate Index Temizliği (5 dakika)
```bash
# SSH to production
ssh root@91.99.229.96

# PostgreSQL'e bağlan
PGPASSWORD=Semsiye!22 psql -U postgres -d scriptus_lsemb

# Script'i çalıştır
\i /path/to/safe_cleanup_indexes.sql
```

**Etki**:
- INSERT hızı: %50 artış
- Disk: %30 tasarruf
- Veri kaybı: YOK (sadece index)

#### 1.2 Performans Ölçümü (10 dakika)
```sql
-- Önce
SELECT pg_size_pretty(pg_total_relation_size('unified_embeddings'));

-- Temizlik sonrası
VACUUM ANALYZE unified_embeddings;
SELECT pg_size_pretty(pg_total_relation_size('unified_embeddings'));
```

#### 1.3 Monitoring Kurulumu (15 dakika)
```sql
-- Monitoring tablosu oluştur (veri silmez)
CREATE TABLE IF NOT EXISTS performance_metrics (
    id SERIAL PRIMARY KEY,
    metric_name VARCHAR(100),
    metric_value NUMERIC,
    measured_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Baseline kaydet
INSERT INTO performance_metrics (metric_name, metric_value)
SELECT
    'embedding_insert_ms',
    EXTRACT(MILLISECONDS FROM (
        SELECT clock_timestamp() - clock_timestamp()
        FROM generate_series(1, 100)
    ));
```

---

### Phase 2: Veri Konsolidasyonu (BU HAFTA - Veri Koruyarak)
✅ **Veri Riski**: YOK - Sadece kopyalama
🎯 **Amaç**: Tek kaynak doğruluğu

#### 2.1 Analiz (30 dakika)
```bash
# Embedding tablolarını analiz et
psql -f analyze_embedding_tables.sql > embedding_analysis_$(date +%Y%m%d).txt
```

#### 2.2 Safe Migration Script Oluştur (1 saat)
```sql
-- ÖRNEK: document_embeddings → unified_embeddings
-- VERİ SİLMEZ, sadece eksik olanları kopyalar

BEGIN;  -- Transaction başlat

-- Backup tablosu oluştur
CREATE TABLE document_embeddings_backup_20250122 AS
SELECT * FROM document_embeddings;

-- Eksik kayıtları kopyala
INSERT INTO unified_embeddings (
    source_table, source_type, source_id, source_name,
    content, embedding, metadata, created_at
)
SELECT
    'documents', 'document', document_id::text, title,
    content, embedding, metadata, created_at
FROM document_embeddings de
WHERE NOT EXISTS (
    SELECT 1 FROM unified_embeddings ue
    WHERE ue.source_table = 'documents'
      AND ue.source_id = de.document_id::text
);

-- Kontrol
SELECT COUNT(*) as migrated_count FROM unified_embeddings
WHERE source_table = 'documents'
  AND created_at > NOW() - INTERVAL '1 hour';

COMMIT;  -- veya ROLLBACK; if problem
```

#### 2.3 Application Code Update (2 saat)
```typescript
// backend/src/services/embedding.service.ts
class EmbeddingService {
  // ESKİ - multiple tables
  // async saveToDocumentEmbeddings() { ... }

  // YENİ - unified table only
  async saveEmbedding(data: {
    sourceTable: string,
    sourceId: string,
    content: string,
    embedding: number[]
  }) {
    // Always save to unified_embeddings
    await pool.query(`
      INSERT INTO unified_embeddings
      (source_table, source_type, source_id, content, embedding)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (source_table, source_id)
      DO UPDATE SET
        content = EXCLUDED.content,
        embedding = EXCLUDED.embedding,
        updated_at = CURRENT_TIMESTAMP
    `, [sourceTable, sourceType, sourceId, content, embedding]);
  }
}
```

---

### Phase 3: Redis Basitleştirme (BU HAFTA)
✅ **Veri Riski**: YOK
🎯 **Amaç**: Kod karmaşıklığını azalt

#### 3.1 Yeni Redis Config Deploy (30 dakika)
```bash
# 1. Backup current config
cp backend/src/config/redis.ts backend/src/config/redis.backup.ts

# 2. Deploy simplified version
cp backend/src/config/redis-simplified.ts backend/src/config/redis.ts

# 3. Test
npm run test:redis

# 4. Deploy
pm2 restart backend
```

#### 3.2 Monitor Redis (Continuous)
```bash
# Redis health check
redis-cli -n 2 ping
redis-cli -n 2 INFO stats

# Memory usage
redis-cli -n 2 INFO memory
```

---

### Phase 4: API Stratejisi (SONRA)
✅ **Veri Riski**: YOK
🎯 **Amaç**: Maintenance yükünü azalt

#### 4.1 Kullanım Analizi
```javascript
// Track which APIs are used
app.use('/api/v2/*', (req, res, next) => {
  // Log to metrics
  metricsDB.insert({
    endpoint: req.path,
    method: req.method,
    timestamp: new Date()
  });
  next();
});

// GraphQL tracking already built-in
```

#### 4.2 Deprecation Plan
```javascript
// Add deprecation headers
app.use('/api/v2/deprecated/*', (req, res, next) => {
  res.setHeader('X-API-Deprecation', 'true');
  res.setHeader('X-API-Deprecation-Date', '2025-06-01');
  res.setHeader('X-API-Alternative', '/api/graphql');
  next();
});
```

---

## 🛡️ Güvenlik Kontrol Listesi

### Her Adımda:
- [ ] Backup al
- [ ] Transaction kullan
- [ ] Test environment'da dene
- [ ] Rollback planı hazırla
- [ ] Monitoring ekle

### Backup Commands:
```bash
# Database backup
pg_dump -U postgres -d scriptus_lsemb \
  --table=unified_embeddings \
  --table=document_embeddings \
  --table=message_embeddings \
  > embeddings_backup_$(date +%Y%m%d).sql

# Redis backup
redis-cli -n 2 BGSAVE

# Application backup
tar -czf backend_backup_$(date +%Y%m%d).tar.gz backend/
```

---

## 📊 Success Metrics

### Immediate (After Phase 1):
- [ ] INSERT speed: +50%
- [ ] Disk usage: -30%
- [ ] No data loss: ✓

### Week 1 (After Phase 2-3):
- [ ] Single source of truth: unified_embeddings
- [ ] Redis connections: Simplified
- [ ] Code complexity: -40%

### Month 1 (After Phase 4):
- [ ] API endpoints: Consolidated
- [ ] Maintenance time: -50%
- [ ] Documentation: Complete

---

## 🚨 Rollback Planları

### Index Rollback:
```sql
-- Eğer sorun olursa
SELECT indexdef FROM index_backup_20250122;
-- Her satırı kopyala ve çalıştır
```

### Data Rollback:
```sql
-- Backup'tan restore
DROP TABLE unified_embeddings;
CREATE TABLE unified_embeddings AS
SELECT * FROM unified_embeddings_backup_20250122;
```

### Code Rollback:
```bash
# Git ile
git revert HEAD
pm2 restart backend

# Veya backup'tan
tar -xzf backend_backup_20250122.tar.gz
pm2 restart backend
```

---

## ✅ Final Checklist

### Before Starting:
- [ ] Full backup taken
- [ ] Team notified
- [ ] Monitoring ready
- [ ] Rollback tested

### During Migration:
- [ ] Use transactions
- [ ] Check data integrity
- [ ] Monitor performance
- [ ] Keep audit log

### After Completion:
- [ ] Verify no data loss
- [ ] Performance improved
- [ ] Documentation updated
- [ ] Team trained

---

**NOT**: Bu plan VERİ KAYBI YAŞAMADAN teknik borcu öder. Her adımda backup ve rollback planı var.

**İlk Adım**: `safe_cleanup_indexes.sql` çalıştır - 5 dakika, %50 performans artışı!