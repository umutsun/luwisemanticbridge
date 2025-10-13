# Luwi Semantic Bridge - Scraping Altyapısı Teknik Analiz Raporu

## 1. Genel Mimari

Luwi Semantic Bridge projesi, çok katmanlı bir scraping altyapısı kullanmaktadır. Sistem, farklı web siteleri türleri için özelleştirilmiş scraping stratejileri sunar ve içerikleri vektör embedding'ler ile işleyerek semantik arama kapasitesi sağlar.

### 1.1. Katmanlı Mimari

```
┌────────────────────────────────────────────────────┐
│                API Katmanı                         │
│  ┌─────────────────────────────────────────────┐  │
│  │  Express.js Router (scraper.routes.ts)     │  │
│  │  MCP WebScrape Tool Integration            │  │
│  │  n8n Custom Nodes (WebScrape, Enhanced)    │  │
│  └─────────────────────────────────────────────┘  │
├────────────────────────────────────────────────────┤
│              Servis Katmanı                        │
│  ┌─────────────────────────────────────────────┐  │
│  │  AdvancedScraperService                    │  │
│  │  GibScraperService (Türk Devlet Siteleri)  │  │
│  │  EnhancedPuppeteerService                  │  │
│  │  PuppeteerScraperService                   │  │
│  │  [Öneri] Crawl4AI Service                  │  │
│  └─────────────────────────────────────────────┘  │
├────────────────────────────────────────────────────┤
│              Veri İşleme Katmanı                   │
│  ┌─────────────────────────────────────────────┐  │
│  │  Text Splitting (LangChain)                 │  │
│  │  Embedding Generation (OpenAI/Local)       │  │
│  │  Content Cleaning & Structuring            │  │
│  │  [Öneri] Async JavaScript Execution        │  │
│  └─────────────────────────────────────────────┘  │
├────────────────────────────────────────────────────┤
│               Depolama Katmanı                     │
│  ┌─────────────────────────────────────────────┐  │
│  │  PostgreSQL (pgvector extension)           │  │
│  │  Redis (Cache & Job Tracking)              │  │
│  │  Activity History & Metrics                │  │
│  └─────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────┘
```

## 2. Kullanılan Teknolojiler

### 2.1. Scraping Motorları

1. **Playwright (Chromium)**
   - Dinamik içerikli siteler için kullanılır
   - JavaScript tabanlı modern web uygulamalarında etkindir
   - Otomatik scroll ve bekleme mekanizmaları

2. **Puppeteer**
   - Gelişmiş Puppeteer servisi (enhanced-puppeteer.service.ts)
   - Özel Türk devlet siteleri için optimize edilmiş GİB scraper
   - Otomasyon tespiti gizleme özellikleri

3. **Axios + Cheerio**
   - Statik içerikli siteler için kullanılır
   - Daha hızlı ve daha az kaynak tüketir
   - HTML ayrıştırma ve temizleme

### 2.2. Veri İşleme

1. **LangChain TextSplitter**
   - RecursiveCharacterTextSplitter kullanılır
   - Chunk boyutu: 1000-1500 karakter
   - Overlap: 200 karakter

2. **Embedding Üretimi**
   - OpenAI text-embedding-ada-002
   - Yerel embedding alternatifi (hash-based 1536-boyutlu)
   - Tiktoken ile token sayımı

### 2.3. Depolama

1. **PostgreSQL + pgvector**
   - Vektör benzerlik araması
   - scraped_data tablosu
   - document_embeddings tablosu

2. **Redis**
   - İş ilerleme takibi
   - Cache katmanı
   - Real-time progress tracking

## 3. Scraping Stratejileri

### 3.1. Otomatik Mod Seçimi

Sistem URL'ye göre uygun scraping stratejisini otomatik seçer:

```typescript
// Türk devlet siteleri için GİB scraper
const isTurkishGovSite = /\.gov\.tr|gib\.gov|mevzuat|kanun|resmigazete|tbmm\.gov|hazine\.gov|tcmb\.gov|sgk\.gov|iskur\.gov/i.test(url);

// Dinamik içerik tespiti
const dynamicPatterns = [
  /\.gov\./i,
  /twitter\.com/i, /x\.com/i,
  /instagram\.com/i, /facebook\.com/i,
  /linkedin\.com/i, /youtube\.com/i,
  /medium\.com/i, /dev\.to/i,
  /stackoverflow\.com/i
];
```

### 3.2. İçerik Çıkarım Seçenekleri

1. **Öncelikli Seçiciler (Priority Selectors)**
   - MUI Grid bileşenleri için özel seçiciler
   - Türk devlet siteleri için özel seçiciler

2. **İçerik Çıkarım Modları**
   - `all`: Tüm eşleşen seçicilerden içerik çıkar
   - `first`: İlk eşleşen seçiciyi kullanır
   - `best`: En çok içeriğe sahip seçiciyi kullanır

### 3.3. Özel GİB Scraper

Türk Gelir İdaresi ve benzeri devlet siteleri için özel olarak geliştirilmiştir:

- Kanun maddelerini yapısal olarak çıkarır
- Accordion ve tab içeriklerini otomatik genişletir
- Türkçe dil desteği ve karakter kodlaması
- Özel CSS seçicileri: `.accordion-body`, `.panel-body`, `.madde-metni`

## 4. Performans Optimizasyonları

### 4.1. Paralel İşleme

```typescript
const concurrency = this.getNodeParameter('concurrency', 0, 10);
const limit = p_limit(concurrency);
const scrapePromises = items.map((item, i) => limit(async () => {
  // Scraping işlemi
}));
```

### 4.2. Cache Katmanları

1. **L1 Cache**: In-memory LRU (1000 items, 5 min TTL)
2. **L2 Cache**: Redis (1 hour TTL)
3. **L3 Cache**: Database (persistent)

### 4.3. Bağlantı Yönetimi

```typescript
const poolConfig = {
  max: 20,              // Maximum pool size
  min: 5,               // Minimum pool size
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
  statement_timeout: 30000,
  query_timeout: 30000
};
```

## 5. Hata Yönetimi ve Geri Alma Mekanizmaları

### 5.1. Hata Sınıflandırması

```typescript
interface ScrapeError {
  type: 'timeout' | 'blocked' | 'not_found' | 'access_denied' | 'parse_error';
  message: string;
  suggestion?: string;
  retryable: boolean;
}
```

### 5.2. Geri Dönüş Stratejileri

1. **GİB Scraper → Enhanced Puppeteer**
2. **Enhanced Puppeteer → Puppeteer**
3. **Puppeteer → Playwright**
4. **Playwright → Axios (Static)**

### 5.3. Retry Mekanizması

Exponential backoff with jitter:
```typescript
const delay = Math.min(
  baseDelay * Math.pow(2, attempt) + Math.random() * 1000,
  maxDelay
);
```

## 6. ÖNERİLER: Crawl4AI Entegrasyonu

### 6.1. Crawl4AI Avantajları

Crawl4AI (https://docs.crawl4ai.com/) projenin scraping yeteneklerini önemli ölçüde artırabilir:

1. **Async/Tabanlı Mimari**: Mevcut senkron yapılardan daha performanslı
2. **Gelişmiş JavaScript Yürütme**: karmaşık SPA'lar için daha iyi destek
3. **Medya Çıkarma**: Görsel ve video meta verileri için yerleşik destek
4. **Önbelleğe Alınmış Session': Daha hızlı ardışık istekler
5. **CLF (Crawl4AI Format)**: Yapılandırılmış veri çıkarma

### 6.2. Entegrasyon Mimarisi

```typescript
// Önerilen Crawl4AI Service
class Crawl4AIService {
  private crawler: AsyncWebCrawler;
  
  async initialize() {
    this.crawler = new AsyncWebCrawler({
      headless: true,
      verbose: true,
      browser_type: 'chromium',
      // Mevcut Puppeteer/Playwright ile aynı browser instance'ını paylaşabilir
      browser_instance: await this.getSharedBrowser()
    });
  }
  
  async scrapeWithCrawl4AI(url: string, options: any) {
    const result = await this.crawler.arun(
      url,
      {
        word_count_threshold: 10,
        extraction_strategy: new LLMExtractionStrategy(
          new OpenAIEmbeddingProvider()
        ),
        css_selector: options.customSelector,
        wait_for: options.waitForSelector,
        // Mevcut sistemle uyumlu parametreler
        bypass_cache: !options.useCache,
        js_code: options.customJS,
        ...options
      }
    );
    
    return this.formatForLUWI(result);
  }
}
```

### 6.3. Mevcut Sistemle Entegrasyon

```typescript
// scraper.routes.ts'de entegrasyon noktası
router.post('/', async (req: Request, res: Response) => {
  const { useCrawl4AI = false, ...options } = req.body;
  
  if (useCrawl4AI && isComplexSite(req.body.url)) {
    // Crawl4AI'yi karmaşık siteler için kullan
    const result = await crawl4AIService.scrapeWithCrawl4AI(url, options);
    return res.json(result);
  }
  
  // Mevcut geri dönüş stratejileri
  // ... existing code
});

function isComplexSite(url: string): boolean {
  const complexPatterns = [
    /react\.js/i, /vue\.js/i, /angular\.js/i,
    /next\.js/i, /nuxt\.js/i, /gatsby\.js/i,
    /webapp/i, /spa/i
  ];
  
  return complexPatterns.some(pattern => pattern.test(url)) ||
         dynamicPatterns.some(pattern => pattern.test(url));
}
```

## 7. İzleme ve Metrikler

### 7.1. Aktivasyon Geçmişi

```sql
CREATE TABLE activity_history (
  id SERIAL PRIMARY KEY,
  operation_type TEXT NOT NULL,
  source_url TEXT,
  title TEXT,
  status TEXT NOT NULL,
  details JSONB,
  metrics JSONB,
  error_message TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### 7.2. Metrikler

- Content length
- Chunk count
- Token count
- Extraction time
- Success/failure rates
- Scraping mode distribution

## 8. Entegrasyonlar

### 8.1. n8n Entegrasyonu

Özel n8n node'ları:
- `WebScrape.node.js`: Temel scraping
- `WebScrapeEnhanced.node.js`: Gelişmiş scraping
- `WebScrapeEnhanced.v2.node.ts`: En son sürüm
- `WebScrapeCrawl4AI.node.ts` [Öneri]: Crawl4AI entegrasyonu

### 8.2. MCP (Model Context Protocol)

Luwi CLI üzerinden web scraping:
```bash
luwi-cli webscrape --url=https://example.com --store-embeddings=true
luwi-cli webscrape --url=https://example.com --engine=crawl4ai [Öneri]
```

## 9. Güvenlik Özellikleri

### 9.1. Robots.txt Uyumu

```typescript
async checkRobotsTxt(url: string): Promise<boolean> {
  // Robots.txt kontrolü
  const robotsUrl = `${baseUrl.protocol}//${baseUrl.host}/robots.txt`;
  // İzin kontrolü
}
```

### 9.2. Rate Limiting

```typescript
const limits = {
  search: 100,      // requests per minute
  insert: 1000,     // documents per hour
  delete: 10,       // operations per hour
};
```

## 10. Veritabanı Şeması

### 10.1. Ana Tablolar

```sql
-- Scraped veriler
CREATE TABLE scraped_data (
  id SERIAL PRIMARY KEY,
  url TEXT UNIQUE NOT NULL,
  title TEXT,
  content TEXT,
  description TEXT,
  keywords TEXT,
  metadata JSONB,
  content_chunks TEXT[],
  embeddings vector(1536)[],
  chunk_count INTEGER DEFAULT 0,
  content_length INTEGER,
  token_count INTEGER,
  scraping_mode TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Embedding'ler
CREATE TABLE document_embeddings (
  id SERIAL PRIMARY KEY,
  document_id INTEGER REFERENCES scraped_data(id),
  chunk_text TEXT,
  embedding vector(1536),
  metadata JSONB
);
```

## 11. Performans Karakteristikleri

### 11.1. İşleme Hızı

- Statik siteler: 1-3 saniye
- Dinamik siteler: 5-15 saniye
- Türk devlet siteleri: 10-30 saniye
- Crawl4AI ile karmaşık SPA'lar: 3-8 saniye [Öneri]

### 11.2. Kaynak Kullanımı

- Bellek: 50-200MB per scraping session
- CPU: Orta (dinamik siteler için yüksek)
- Ağ: URL'ye bağlı olarak değişken
- Crawl4AI: Daha düşük CPU kullanımı, daha yüksek bellek verimliliği [Öneri]

## 12. Sınırlamalar ve Gelecek Geliştirmeler

### 12.1. Mevcut Sınırlamalar

1. CAPTCHA korumalı sitelerde zorlanır
2. WebSocket tabanlı içerikler tam olarak desteklenmez
3. PDF ve belge indirme sınırlıdır

### 12.2. Potansiyel İyileştirmeler

1. ✅ **Crawl4AI Entegrasyonu** (Öncelikli öneri)
2. CAPTCHA çözüm entegrasyonu
3. Distributed scraping (birden çok worker)
4. WebSocket desteği
5. MediaWiki API entegrasyonu

## 13. Yol Haritası Önerileri

### 13.1. Kısa Vadeli (1-2 ay)

1. **Crawl4AI Entegrasyonu**
   - Mevcut sistemle paralel çalışacak şekilde entegrasyon
   - Performans testleri ve benchmark'lar
   - Karmaşık siteler için varsayılan motor olarak ayarlama

2. **MCP Aracı Geliştirme**
   ```bash
   # Örnek MCP komutu
   luwi-cli webscrape --url=https://example.com --engine=crawl4ai --format=json
   ```

### 13.2. Orta Vadeli (3-6 ay)

1. **Akıllı Motor Seçimi**
   - URL analizi ile en uygun scraping motorunu otomatik seçme
   - Öğrenme algoritması ile başarı oranlarını artırma

2. **Session Yönetimi**
   - Puppeteer ve Playwright instance'larını paylaşma
   - Crawl4AI ile entegre session havuzu

### 13.3. Uzun Vadeli (6+ ay)

1. **Dağıtık Scraping**
   - Birden fazla worker ile paralel scraping
   - Load balancing ve job queue sistemi

2. **Medya İşleme**
   - Görsel OCR entegrasyonu
   - Video transkripsiyonu

## 14. Sonuç

Luwi Semantic Bridge projesi, çok katmanlı scraping altyapısı ile farklı web siteleri türleri için esnek çözümler sunmaktadır. Özellikle Türk devlet siteleri için geliştirilmiş GİB scraper ve önerilen Crawl4AI entegrasyonu ile sistemin yetenekleri önemli ölçüde artırılabilir. Mevcut mimari, ölçeklenebilirlik ve performans optimizasyonları ile gelecekteki geliştirmelere açık bir yapıya sahiptir.