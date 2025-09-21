# Alice Semantic Bridge - Teknik Dokümantasyon

## Sistem Genel Bakış

Alice Semantic Bridge, Türkçe vergi ve mali mevzuat dokümanları için geliştirilmiş bir RAG (Retrieval-Augmented Generation) sistemidir. Sistem, embedding tabanlı semantik arama ve AI destekli sohbet yetenekleri sunar.

## Mimari

### Bileşenler

#### Frontend (Next.js)
- Teknik stack: Next.js, TypeScript, Tailwind CSS
- Ana sayfa: Embedding yönetimi ve RAG interface
- Progress tracking ve real-time güncellemeler

#### Backend (Node.js/Express)
- API yönetimi ve embedding işlemleri
- Veritabanı entegrasyonu (PostgreSQL)
- Redis caching
- OpenAI/Google AI entegrasyonu

#### Veritabanı
- PostgreSQL (Ana veritabanı)
- ASEMB database (Vector embeddings)
- Redis (Caching ve session management)

## Embedding Sistemi

### Paralel Worker Mimarisi

Sistem, embedding işlemleri için paralel bir worker mimarisi kullanır:

```typescript
// Worker başlatma örneği
for (let i = 0; i < workerCount; i++) {
  const workerPromise = processTableWithParallelBatches(
    tableName,
    batchSize,
    embeddingMethod,
    operationId,
    true, // resume mode
    i,    // workerIndex
    workerCount,
    i     // batchOffset
  );
}
```

#### Özellikler:
- **Sequential batch processing**: Worker'lar sıralı batch işler
- **Duplicate check**: Aynı kaydın tekrar embed edilmesini önler
- **Auto-recovery**: Hata durumunda otomatik kurtarma
- **Progress tracking**: Real-time progress güncellemeleri

### Embedding Algoritması

1. **Veri Hazırlığı**:
   ```typescript
   const contentToEmbed = `
   ${row.baslik || row.title || ''}
   ${row.icerik || row.content || ''}
   ${row.aciklama || ''}
   `.trim();
   ```

2. **Embedding Oluşturma**:
   ```typescript
   const embedding = await generateEmbedding(contentToEmbed, model);
   ```

3. **Vector Veritabanına Kaydet**:
   ```typescript
   await pool.query(`
     INSERT INTO unified_embeddings
     (id, source_table, source_id, embedding, metadata, created_at)
     VALUES ($1, $2, $3, $4, $5, NOW())
   `, [embeddingId, sourceTable, sourceId, embedding, metadata]);
   ```

## RAG Chat Sistemi

### Semantic Search

Sistem iki farklı arama modu destekler:

1. **Unified Embeddings** (Tercih edilen):
   ```typescript
   const results = await semanticSearch.unifiedSemanticSearch(message, 20);
   ```

2. **Hybrid Search** (Fallback):
   ```typescript
   const results = await semanticSearch.hybridSearch(message, 20);
   ```

### AI Provider Önceliği

Sistem birden fazla AI provider'ı destekler:
```typescript
const aiProviderPriority = ['gemini', 'claude', 'openai', 'fallback'];
```

## Veritabanı Şeması

### Tablolar

#### `unified_embeddings`
- `id`: UUID
- `source_table`: Kaynak tablo adı
- `source_id`: Kaynak kayıt ID'si
- `embedding`: Vector (1536 dimension)
- `metadata`: JSON metadata
- `created_at`: Timestamp

#### `conversations`
- `id`: UUID
- `user_id`: Kullanıcı ID
- `title`: Konuşma başlığı
- `created_at/updated_at`: Timestamp'ler

#### `messages`
- `id`: UUID
- `conversation_id`: Konuşma ID
- `role`: user/assistant/system
- `content`: Mesaj içeriği
- `sources`: JSON kaynak dizisi

## API Endpoint'leri

### Embedding İşlemleri
- `POST /api/v2/embeddings/generate` - Embedding başlat
- `POST /api/v2/embeddings/pause` - İşlemi duraklat
- `POST /api/v2/embeddings/resume` - İşleme devam et
- `POST /api/v2/embeddings/stop` - İşlemi durdur
- `GET /api/v2/embeddings/progress` - Progress durumunu al

### RAG Chat
- `POST /api/rag/chat` - Chat mesajı işle
- `GET /api/rag/conversations` - Konuşmaları listele
- `GET /api/rag/conversation/:id` - Tek konuşma detayı

## Caching Stratejisi

### Redis Kullanımı
- **Progress state**: `embedding:progress`
- **Session management**: Kullanıcı oturumları
- **API responses**: Sık kullanılan yanıtlar

### Cache Keys
```typescript
// Progress caching
await redis.set('embedding:progress', JSON.stringify(progressData));

// Embedding cache
const cacheKey = getEmbeddingCacheKey(text);
const cached = await redis.get(cacheKey);
```

## Hata Yönetimi

### Auto-recovery Mekanizması
1. **Stuck detection**: 30 saniye activity yoksa
2. **Auto-pause**: İşlemi duraklat
3. **Auto-resume**: 5 saniye sonra devam et
4. **Manual recovery**: Kullanıcı müdahalesi

### Error Types
- **API limits**: OpenAI/Google quota exceeded
- **Network errors**: Bağlantı sorunları
- **Database errors**: Sorgu hataları
- **System errors**: Memory/CPU issues

## Performans Optimizasyonları

### Batch Processing
- Optimal batch size: 50-100
- Paralel worker sayısı: CPU core sayısına bağlı
- Memory optimization: Stream processing

### Database Optimizasyonları
- Connection pooling
- Batch insert'ler
- Index optimization

## Güvenlik

### API Key Management
- Environment variables
- Database encryption
- Key rotation

### Rate Limiting
- OpenAI: 3500 RPM
- Google: 60 QPM
- Custom limits per endpoint

## Monitoring ve Logging

### Progress Tracking
- Real-time SSE updates
- Worker status monitoring
- Performance metrics

### Log Levels
```typescript
console.log('🔄 Processing batch...');
console.warn('⚠️ Rate limit approaching');
console.error('❌ API connection failed');
```

## Deployment

### Environment Variables
```bash
# Database
DATABASE_URL=postgresql://...
ASEMB_DATABASE_URL=postgresql://...

# AI APIs
OPENAI_API_KEY=sk-...
GOOGLE_AI_API_KEY=...

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# App Settings
NODE_ENV=production
PORT=3001
```

### Başlangıç Script'i
```bash
# Backend
npm start

# Frontend
npm run dev

# Production
npm run build
npm start
```

## TODO ve Gelecek Planları

### Kısa Vadeli
- [ ] GPU desteği ekle
- [ ] Queue system implement et
- [ ] Monitoring dashboard

### Uzun Vadeli
- [ ] Multi-tenant architecture
- [ ] Advanced analytics
- [ ] Auto-scaling workers