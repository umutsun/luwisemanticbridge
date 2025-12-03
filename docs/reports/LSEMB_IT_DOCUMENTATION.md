# LSEMB - Luwi Semantic Bridge
## IT Departmanı Teknik Dokümantasyonu

**Versiyon:** 1.0
**Tarih:** Aralık 2024
**Hazırlayan:** Luwi Software Engineering

---

## İçindekiler

1. [Yönetici Özeti](#yönetici-özeti)
2. [Problem Tanımı](#problem-tanımı)
3. [LSEMB Çözümü](#lsemb-çözümü)
4. [Veri İşleme Yetenekleri](#veri-işleme-yetenekleri)
5. [Arama Teknolojisi (RAG)](#arama-teknolojisi-rag)
6. [Güvenlik Mimarisi](#güvenlik-mimarisi)
7. [Kullanım Senaryoları](#kullanım-senaryoları)
8. [Teknik Spesifikasyonlar](#teknik-spesifikasyonlar)
9. [Entegrasyon Rehberi](#entegrasyon-rehberi)
10. [Yol Haritası](#yol-haritası)

---

## Yönetici Özeti

**LSEMB (Luwi Semantic Bridge)**, kurumsal veri kaynaklarınızı yapay zeka ile buluşturan semantik arama ve RAG (Retrieval Augmented Generation) platformudur.

### Temel Değer Önerisi

| Özellik | Geleneksel Arama | LSEMB |
|---------|------------------|-------|
| Arama Yöntemi | Anahtar kelime eşleştirme | Anlamsal benzerlik + anahtar kelime |
| Veri Kaynakları | Tek sistem | Çoklu kaynak (DB, dosya, web) |
| Cevap Formatı | Belge listesi | Doğal dil cevap + kaynak |
| Öğrenme | Statik | Sürekli güncellenen vektör tabanı |
| Dil Desteği | Sınırlı Türkçe | Tam Türkçe semantik anlama |

---

## Problem Tanımı

### Kurumsal Veri Zorlukları

Modern işletmeler, veri kaynaklarının çoğalması ve çeşitlenmesiyle karşı karşıya:

```
┌─────────────────────────────────────────────────────────────┐
│                    DAĞINIK VERİ KAYNAKLARI                   │
├─────────────────────────────────────────────────────────────┤
│  📄 Belgeler        │  🗄️ Veritabanları   │  🌐 Web        │
│  ─────────────────  │  ─────────────────  │  ────────────  │
│  • PDF raporlar     │  • ERP sistemleri   │  • Web siteleri│
│  • Word dökümanlar  │  • CRM verileri     │  • API'ler     │
│  • Excel tablolar   │  • Legacy DB'ler    │  • Sosyal medya│
│  • E-postalar       │  • Data warehouse   │  • Portal içerikleri│
└─────────────────────────────────────────────────────────────┘
                              ↓
              ❌ Ayrık sistemler, ayrık aramalar
              ❌ Bilgiye ulaşmak dakikalar/saatler alıyor
              ❌ Çalışanlar doğru kaynağı bulamıyor
              ❌ Bilgi siloları arası geçiş yok
```

### Mevcut Çözümlerin Yetersizlikleri

1. **Geleneksel Arama Motorları**
   - Yalnızca anahtar kelime eşleştirme
   - Türkçe morfoloji desteği zayıf
   - Bağlamı anlamıyor

2. **Silolu Sistemler**
   - Her sistemin kendi arama arayüzü
   - Çapraz veri ilişkilendirmesi yok
   - Veri tekrarı ve tutarsızlık

3. **Manuel Süreçler**
   - Zaman kaybı
   - İnsan hatası riski
   - Ölçeklenebilir değil

---

## LSEMB Çözümü

### Birleşik Zeka Motoru

LSEMB, dağınık veri kaynaklarınızı tek bir semantik arama noktasında birleştirir:

```
┌─────────────────────────────────────────────────────────────┐
│                         LSEMB                                │
│                  Luwi Semantic Bridge                        │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│   📄 Belgeler ──┐                                           │
│                 │     ┌──────────────────┐                  │
│   🗄️ Database ──┼────▶│  Vektör Motoru   │──▶ 🎯 Semantik  │
│                 │     │  (pgvector)      │     Arama       │
│   🌐 Web ───────┘     └──────────────────┘                  │
│                              │                               │
│                              ▼                               │
│                    ┌──────────────────┐                     │
│                    │   LLM Entegras.  │                     │
│                    │  (GPT/Claude/    │                     │
│                    │   Gemini/Ollama) │                     │
│                    └──────────────────┘                     │
│                              │                               │
│                              ▼                               │
│                    💬 Doğal Dil Cevaplar                    │
│                    📚 Kaynak Referansları                   │
│                    ❓ Takip Soruları                        │
└─────────────────────────────────────────────────────────────┘
```

### Temel Özellikler

#### 1. Çoklu Kaynak Desteği
- **Belgeler:** PDF, Word, Excel, CSV, Markdown, HTML
- **Veritabanları:** PostgreSQL, MySQL, SQL Server, REST API
- **Web:** Sitemap tarama, dinamik sayfa çekme, API entegrasyonu

#### 2. Akıllı Parçalama (Chunking)
- Paragraf bazlı akıllı bölme
- Bağlam koruyan overlap stratejisi
- Metadata zenginleştirme

#### 3. Hibrit Arama
- Vektör benzerliği (semantik)
- Anahtar kelime eşleştirme (keyword)
- Bulanık arama (fuzzy matching)

#### 4. LLM Destekli Cevap
- Kaynaklardan sentezlenmiş cevaplar
- Türkçe doğal dil üretimi
- Atıf ve referans sistemi

---

## Veri İşleme Yetenekleri

### Belge İşleme Pipeline

```
                    Belge İşleme Akışı
┌─────────────────────────────────────────────────────────┐
│                                                          │
│  📄 Ham Belge                                           │
│      │                                                   │
│      ▼                                                   │
│  ┌──────────────┐                                       │
│  │ Metin Çıkart │ OCR desteği, tablo tanıma            │
│  └──────────────┘                                       │
│      │                                                   │
│      ▼                                                   │
│  ┌──────────────┐                                       │
│  │  Temizleme   │ Encoding, format düzeltme            │
│  └──────────────┘                                       │
│      │                                                   │
│      ▼                                                   │
│  ┌──────────────┐                                       │
│  │   Chunking   │ Akıllı parçalama (512-1024 token)    │
│  └──────────────┘                                       │
│      │                                                   │
│      ▼                                                   │
│  ┌──────────────┐                                       │
│  │  Embedding   │ text-embedding-3-small / local       │
│  └──────────────┘                                       │
│      │                                                   │
│      ▼                                                   │
│  🗄️ pgvector veritabanı                                │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

### Desteklenen Belge Formatları

| Format | Özellikler | Max Boyut |
|--------|-----------|-----------|
| PDF | Metin + OCR, çoklu sayfa | 100 MB |
| DOCX | Tablo, stil koruması | 50 MB |
| XLSX | Sheet bazlı, formül değerleri | 50 MB |
| CSV | UTF-8, otomatik delimiter | 100 MB |
| HTML | Temiz metin çıkarma | 10 MB |
| MD | Frontmatter desteği | 5 MB |

### Veritabanı Entegrasyonu

```typescript
// Desteklenen veritabanları
const supportedDatabases = {
  postgresql: {
    features: ['full-text search', 'json support', 'native vector'],
    connector: 'pg-native'
  },
  mysql: {
    features: ['basic FTS', 'json support'],
    connector: 'mysql2'
  },
  mssql: {
    features: ['full-text search'],
    connector: 'mssql'
  },
  rest_api: {
    features: ['any JSON endpoint'],
    connector: 'axios'
  }
};
```

### Web Scraping Yetenekleri

- **Sitemap Tarama:** XML sitemap'ten tüm sayfa URL'lerini çekme
- **Dinamik Sayfa:** Playwright/Patchright ile JS-rendered içerik
- **Rate Limiting:** Hedef siteyi yormadan kontrollü çekme
- **Cloudflare Bypass:** Turnstile koruması geçme (Patchright)
- **Proxy Desteği:** Residential/mobile proxy entegrasyonu

---

## Arama Teknolojisi (RAG)

### RAG (Retrieval Augmented Generation) Nedir?

```
┌─────────────────────────────────────────────────────────────┐
│                        RAG Pipeline                          │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  👤 Kullanıcı Sorusu                                        │
│     "2024 yılında şirketimizin en çok satan ürünü neydi?"   │
│                              │                               │
│                              ▼                               │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ 1. RETRIEVAL (Getirme)                               │   │
│  │    • Soru vektöre dönüştürülür                       │   │
│  │    • Veritabanında en benzer chunk'lar bulunur       │   │
│  │    • Hibrit arama: vektör + keyword + fuzzy          │   │
│  └──────────────────────────────────────────────────────┘   │
│                              │                               │
│                              ▼                               │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ 2. AUGMENTATION (Zenginleştirme)                     │   │
│  │    • Bulunan chunk'lar prompt'a eklenir              │   │
│  │    • Kaynak metadata'sı korunur                      │   │
│  │    • Bağlam sınırı yönetimi                          │   │
│  └──────────────────────────────────────────────────────┘   │
│                              │                               │
│                              ▼                               │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ 3. GENERATION (Üretim)                               │   │
│  │    • LLM bağlama dayalı cevap üretir                 │   │
│  │    • Kaynak atıfları eklenir                         │   │
│  │    • Takip soruları önerilir                         │   │
│  └──────────────────────────────────────────────────────┘   │
│                              │                               │
│                              ▼                               │
│  💬 "2024 yılında en çok satan ürününüz X olmuştur.        │
│      Satış rakamları... [Kaynak: Q4 Raporu, sayfa 12]"     │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Hibrit Arama Stratejisi

LSEMB, tek başına vektör aramasının yetersiz kaldığı durumlar için üç farklı arama stratejisini birleştirir:

| Strateji | Güçlü Yönü | Kullanım |
|----------|-----------|----------|
| **Vektör Arama** | Anlamsal benzerlik | "Müşteri memnuniyeti nasıl artırılır?" |
| **Keyword Arama** | Kesin terim eşleşme | "KDV oranı %18" |
| **Fuzzy Arama** | Yazım hatası toleransı | "müştreri" → "müşteri" |

```sql
-- Hibrit arama SQL örneği
SELECT
  d.content,
  d.metadata,
  (
    -- Vektör benzerlik skoru (0.7 ağırlık)
    0.7 * (1 - (d.embedding <=> query_embedding)) +
    -- Keyword skoru (0.2 ağırlık)
    0.2 * ts_rank(d.fts_vector, plainto_tsquery('turkish', query)) +
    -- Fuzzy skoru (0.1 ağırlık)
    0.1 * similarity(d.content, query)
  ) as combined_score
FROM documents d
WHERE d.embedding <=> query_embedding < 0.8
ORDER BY combined_score DESC
LIMIT 10;
```

### Türkçe Dil Desteği

- **Morfolojik Analiz:** Kök kelime tespiti (gelmekteydi → gel-)
- **Stop Words:** Türkçe edat ve bağlaç filtreleme
- **Synonym Expansion:** Eş anlamlı kelime genişletme
- **Named Entity Recognition:** Türkçe özel isim tanıma

---

## Güvenlik Mimarisi

### Çok Katmanlı Güvenlik

```
┌─────────────────────────────────────────────────────────────┐
│                    Güvenlik Katmanları                       │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌────────────────────────────────────────────────────┐     │
│  │ 1. AĞ KATMANI                                      │     │
│  │    • HTTPS/TLS 1.3 zorunlu                         │     │
│  │    • IP whitelist / VPN                            │     │
│  │    • DDoS koruması                                 │     │
│  └────────────────────────────────────────────────────┘     │
│                              │                               │
│  ┌────────────────────────────────────────────────────┐     │
│  │ 2. KİMLİK DOĞRULAMA                                │     │
│  │    • JWT token tabanlı auth                        │     │
│  │    • OAuth 2.0 / SAML entegrasyonu                 │     │
│  │    • MFA desteği                                   │     │
│  └────────────────────────────────────────────────────┘     │
│                              │                               │
│  ┌────────────────────────────────────────────────────┐     │
│  │ 3. YETKİLENDİRME                                   │     │
│  │    • Rol bazlı erişim (RBAC)                       │     │
│  │    • Kaynak bazlı izinler                          │     │
│  │    • Workspace izolasyonu                          │     │
│  └────────────────────────────────────────────────────┘     │
│                              │                               │
│  ┌────────────────────────────────────────────────────┐     │
│  │ 4. VERİ KATMANI                                    │     │
│  │    • Veri şifreleme (at-rest, in-transit)          │     │
│  │    • PII maskeleme                                 │     │
│  │    • Audit logging                                 │     │
│  └────────────────────────────────────────────────────┘     │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Kurumsal Uyumluluk

| Standart | Durum | Notlar |
|----------|-------|--------|
| KVKK | ✅ Uyumlu | Veri lokalizasyonu, silme hakkı |
| ISO 27001 | ⏳ Hazırlık | 2025 Q2 hedefi |
| SOC 2 Type II | 📋 Planlı | 2025 Q4 hedefi |
| GDPR | ✅ Uyumlu | EU veri işleme |

### Veri İzolasyonu

```
┌─────────────────────────────────────────────────────────────┐
│                   Multi-Tenant Mimari                        │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │ Workspace A │  │ Workspace B │  │ Workspace C │         │
│  │  (Müşteri1) │  │  (Müşteri2) │  │  (Müşteri3) │         │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘         │
│         │                │                │                  │
│         ▼                ▼                ▼                  │
│  ┌─────────────────────────────────────────────────────┐    │
│  │              Tenant ID ile Veri İzolasyonu           │    │
│  │  • Her sorgu workspace_id filtrelenir               │    │
│  │  • Cross-workspace erişim engellenir                │    │
│  │  • Ayrı encryption key'ler                          │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## Kullanım Senaryoları

### 1. Mağaza Destek Asistanı

**Senaryo:** Perakende zincirinde mağaza personelinin ürün, prosedür ve politika sorularına anında cevap.

```
┌─────────────────────────────────────────────────────────────┐
│  👤 Mağaza Personeli                                         │
│     "Hasarlı ürün iadesi için prosedür nedir?"              │
│                                                              │
│  🤖 LSEMB Asistan                                           │
│     "Hasarlı ürün iadesi için şu adımları izleyin:          │
│                                                              │
│     1. Müşteriden fişi isteyin                              │
│     2. Ürünü görsel olarak kontrol edin                     │
│     3. POS sisteminde 'İade-Hasar' seçin                    │
│     4. Hasar fotoğrafı çekin                                │
│     5. Formu doldurun ve imzalatın                          │
│                                                              │
│     📚 Kaynak: İade Prosedürleri El Kitabı, Bölüm 4.2       │
│     📅 Güncelleme: 15 Kasım 2024                            │
│                                                              │
│     ❓ Takip Soruları:                                       │
│     • Garanti kapsamında mı değerlendiriliyor?              │
│     • Hasar limiti üzeri işlem nasıl yapılır?"              │
└─────────────────────────────────────────────────────────────┘
```

**Veri Kaynakları:**
- Prosedür el kitapları (PDF)
- İç genelgeler (Word)
- Eğitim materyalleri (Video transkript)
- FAQ veritabanı

**ROI:** Mağaza başına günde ortalama 2 saat zaman tasarrufu

---

### 2. İK Politika Asistanı

**Senaryo:** Çalışanların izin, yan haklar ve prosedür sorularına 7/24 destek.

```
┌─────────────────────────────────────────────────────────────┐
│  👤 Çalışan                                                  │
│     "Evlilik izni kaç gün ve nasıl başvurulur?"             │
│                                                              │
│  🤖 LSEMB Asistan                                           │
│     "Evlilik izni hakkında bilgiler:                        │
│                                                              │
│     📅 Süre: 3 iş günü (ücretli)                            │
│                                                              │
│     📝 Başvuru:                                              │
│     1. İK portalından 'İzin Talebi' seçin                   │
│     2. İzin türü: 'Evlilik İzni' seçin                      │
│     3. Evlilik cüzdanı fotokopisini ekleyin                 │
│     4. En az 1 hafta önceden başvurun                       │
│                                                              │
│     ⚠️ Not: Cumartesi/Pazar günleri izne dahil değildir    │
│                                                              │
│     📚 Kaynak: İK Politikaları 2024, Madde 12.3             │
│                                                              │
│     ❓ Takip Soruları:                                       │
│     • Balayı izni ayrıca kullanılabilir mi?                 │
│     • İzin süresince maaş nasıl hesaplanır?"                │
└─────────────────────────────────────────────────────────────┘
```

**Veri Kaynakları:**
- İK Politikaları dokümanı
- Toplu iş sözleşmesi
- İç yönetmelikler
- Sık sorulan sorular

**ROI:** İK departmanı sorgu yükünde %60 azalma

---

### 3. Ürün Bilgi Asistanı

**Senaryo:** Satış ekibinin ürün özellikleri, fiyatlandırma ve stok sorularına anlık cevap.

```
┌─────────────────────────────────────────────────────────────┐
│  👤 Satış Temsilcisi                                         │
│     "Model X-500 ile Y-600 arasındaki farklar neler?"       │
│                                                              │
│  🤖 LSEMB Asistan                                           │
│     "Model karşılaştırması:                                 │
│                                                              │
│     | Özellik      | X-500      | Y-600      |              │
│     |--------------|------------|------------|              │
│     | İşlemci      | i5-12400   | i7-12700   |              │
│     | RAM          | 8 GB       | 16 GB      |              │
│     | Depolama     | 256 GB SSD | 512 GB SSD |              │
│     | Ekran        | 15.6" FHD  | 15.6" QHD  |              │
│     | Fiyat        | ₺42.990    | ₺58.990    |              │
│                                                              │
│     ✅ Y-600 Avantajları:                                   │
│     • Daha güçlü işlemci (%40 performans)                   │
│     • 2x RAM kapasitesi                                     │
│     • Daha yüksek ekran çözünürlüğü                         │
│                                                              │
│     📚 Kaynak: Ürün Kataloğu Q4-2024                        │
│                                                              │
│     ❓ Takip Soruları:                                       │
│     • Stok durumu nedir?                                    │
│     • Kurumsal indirim uygulanabilir mi?"                   │
└─────────────────────────────────────────────────────────────┘
```

**Veri Kaynakları:**
- Ürün katalogları
- Teknik spesifikasyonlar
- Fiyat listeleri (Excel)
- Stok veritabanı (API)

**ROI:** Satış döngüsünde %25 kısalma

---

## Teknik Spesifikasyonlar

### Sistem Mimarisi

```
┌─────────────────────────────────────────────────────────────┐
│                      LSEMB Mimarisi                          │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐   │
│  │   Frontend   │    │   Backend    │    │   Python     │   │
│  │   (React)    │◀──▶│  (Node.js)   │◀──▶│  Services    │   │
│  │   Port 4001  │    │   Port 8084  │    │   Port 8001  │   │
│  └──────────────┘    └──────────────┘    └──────────────┘   │
│         │                   │                   │            │
│         │                   ▼                   │            │
│         │            ┌──────────────┐           │            │
│         │            │  PostgreSQL  │           │            │
│         └───────────▶│  + pgvector  │◀──────────┘            │
│                      │   Port 5432  │                        │
│                      └──────────────┘                        │
│                             │                                │
│                             ▼                                │
│                      ┌──────────────┐                        │
│                      │    Redis     │                        │
│                      │   Port 6379  │                        │
│                      └──────────────┘                        │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Teknoloji Stack

| Katman | Teknoloji | Versiyon | Açıklama |
|--------|-----------|----------|----------|
| **Frontend** | React | 18.x | Vite, TypeScript, Tailwind CSS |
| **Backend API** | Node.js | 20.x | Express, TypeScript |
| **AI/ML Services** | Python | 3.12 | FastAPI, LangChain |
| **Database** | PostgreSQL | 15.x | pgvector extension |
| **Cache** | Redis | 7.x | Session, queue, cache |
| **Process Manager** | PM2 | 5.x | Clustering, monitoring |
| **Web Server** | Nginx | 1.24 | Reverse proxy, SSL |

### Minimum Donanım Gereksinimleri

| Bileşen | Minimum | Önerilen | Enterprise |
|---------|---------|----------|------------|
| **CPU** | 4 core | 8 core | 16+ core |
| **RAM** | 8 GB | 16 GB | 32+ GB |
| **Disk** | 100 GB SSD | 250 GB NVMe | 500+ GB NVMe |
| **Network** | 100 Mbps | 1 Gbps | 10 Gbps |

### API Tasarımı

```typescript
// REST API Endpoints
const endpoints = {
  // Doküman İşlemleri
  'POST /api/documents/upload': 'Belge yükleme',
  'GET /api/documents/:id': 'Belge detayı',
  'DELETE /api/documents/:id': 'Belge silme',

  // Arama
  'POST /api/search': 'Semantik arama',
  'POST /api/chat': 'RAG chat endpoint',

  // Embedding
  'POST /api/embeddings/generate': 'Embedding oluşturma',
  'GET /api/embeddings/status': 'İşlem durumu',

  // Admin
  'GET /api/admin/stats': 'Sistem istatistikleri',
  'POST /api/admin/reindex': 'Yeniden indeksleme'
};
```

### LLM Entegrasyonları

| Provider | Modeller | Özellik |
|----------|----------|---------|
| **OpenAI** | GPT-4o, GPT-4o-mini | Yüksek kalite, ücretli |
| **Anthropic** | Claude 3.5 Sonnet | Uzun bağlam, güvenli |
| **Google** | Gemini 2.0 Flash | Hızlı, ekonomik |
| **Ollama** | Llama, Mistral, Qwen | On-premise, ücretsiz |
| **DeepSeek** | DeepSeek-V3 | Çok dilli, ekonomik |

### Embedding Modelleri

| Model | Boyut | Performans | Maliyet |
|-------|-------|------------|---------|
| text-embedding-3-small | 1536 | İyi | Düşük |
| text-embedding-3-large | 3072 | Çok iyi | Orta |
| nomic-embed-text | 768 | İyi | Ücretsiz (local) |

---

## Entegrasyon Rehberi

### Hızlı Başlangıç

```bash
# 1. Repo'yu klonlayın
git clone https://github.com/luwi-software/lsemb.git
cd lsemb

# 2. Ortam değişkenlerini ayarlayın
cp .env.example .env
# .env dosyasını düzenleyin

# 3. Docker ile başlatın
docker-compose up -d

# 4. Migration'ları çalıştırın
npm run migrate

# 5. Admin kullanıcısı oluşturun
npm run create-admin
```

### Ortam Değişkenleri

```env
# Veritabanı
DATABASE_URL=postgresql://user:pass@localhost:5432/lsemb
REDIS_URL=redis://localhost:6379

# LLM API Keys
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_API_KEY=...

# Güvenlik
JWT_SECRET=your-secret-key
ENCRYPTION_KEY=your-32-byte-key

# Uygulama
NODE_ENV=production
PORT=8084
```

### SSO Entegrasyonu

```typescript
// SAML 2.0 Konfigürasyonu
const samlConfig = {
  entryPoint: 'https://idp.company.com/sso',
  issuer: 'lsemb-app',
  cert: fs.readFileSync('./idp-cert.pem'),
  callbackUrl: 'https://lsemb.company.com/auth/callback'
};

// OAuth 2.0 (Azure AD örneği)
const oauthConfig = {
  clientId: 'your-client-id',
  clientSecret: 'your-client-secret',
  tenantId: 'your-tenant-id',
  redirectUri: 'https://lsemb.company.com/auth/callback'
};
```

### Webhook Entegrasyonu

```typescript
// Olay bildirimleri için webhook
const webhookEvents = {
  'document.uploaded': 'Yeni belge yüklendi',
  'document.processed': 'Belge işlendi',
  'search.performed': 'Arama yapıldı',
  'chat.completed': 'Chat tamamlandı'
};

// Webhook payload örneği
{
  "event": "document.processed",
  "timestamp": "2024-12-03T10:30:00Z",
  "data": {
    "documentId": "doc_123",
    "chunks": 45,
    "processingTime": 12.5
  }
}
```

---

## Yol Haritası

### 2025 Q1-Q2

| Özellik | Durum | Açıklama |
|---------|-------|----------|
| Multi-modal RAG | 🚧 Geliştirme | Görsel + metin birleşik arama |
| Knowledge Graph | 📋 Planlı | Entity ilişkilendirme |
| Fine-tuning UI | 📋 Planlı | Özel model eğitimi arayüzü |
| Real-time Sync | 🚧 Geliştirme | Anlık veri güncellemesi |

### 2025 Q3-Q4

| Özellik | Durum | Açıklama |
|---------|-------|----------|
| Agent Framework | 📋 Planlı | Otonom görev yürütme |
| Voice Interface | 📋 Planlı | Sesli soru-cevap |
| Mobile App | 📋 Planlı | iOS/Android uygulaması |
| Advanced Analytics | 📋 Planlı | Kullanım analitiği dashboard |

---

## Destek ve İletişim

### Teknik Destek

| Kanal | Yanıt Süresi | Kapsam |
|-------|--------------|--------|
| E-posta: support@luwi.dev | 24 saat | Genel sorular |
| Slack: #lsemb-support | 4 saat | Teknik sorunlar |
| Telefon: +90 xxx xxx xx xx | Anlık | Kritik durumlar |

### Dokümantasyon Kaynakları

- **API Referansı:** https://docs.luwi.dev/lsemb/api
- **Kurulum Rehberi:** https://docs.luwi.dev/lsemb/install
- **Video Eğitimler:** https://luwi.dev/academy
- **GitHub:** https://github.com/luwi-software/lsemb

---

**© 2024 Luwi Software Engineering. Tüm hakları saklıdır.**
