# Crawl4AI Entegrasyonu - Kurulum ve Kullanım Kılavuzu

## 1. Genel Bakış

Luwi Semantic Bridge'e Crawl4AI entegrasyonu, modern web scraping yetenekleri kazandırır. Hibrit yaklaşım sayesinde hem CLI hem API kullanarak esnek bir scraping deneyimi sunar.

## 2. Kurulum Seçenekleri

### 2.1. CLI Kurulumu (Hızlı Başlangıç)

```bash
# Python ortamı oluşturma
python -m venv crawl4ai-env
source crawl4ai-env/bin/activate  # Linux/Mac
# veya
crawl4ai-env\Scripts\activate  # Windows

# Crawl4AI kurulumu
pip install crawl4ai
pip install "crawl4ai[async]"
pip install playwright
playwright install chromium
```

### 2.2. Docker ile API Sunucusu Kurulumu

```bash
# Docker ile API sunucusunu başlat
docker-compose -f docker-compose.crawl4ai.yml up -d

# Durum kontrolü
curl http://localhost:5000/health
```

### 2.3. Manuel API Sunucusu Kurulumu

```bash
# Python bağımlılıklarını kur
pip install -r requirements.crawl4ai.txt

# Playwright kurulumu
playwright install chromium
playwright install-deps chromium

# API sunucusunu başlat
python python/crawl4ai_server.py
```

## 3. Çevre Değişkenleri

`.env` dosyasına aşağıdaki değişkenleri ekleyin:

```env
# Crawl4AI API URL (varsayılan: http://localhost:5000)
CRAWL4AI_API_URL=http://localhost:5000

# Python yolu (CLI için)
PYTHON_PATH=python3
```

## 4. API Endpoint'leri

### 4.1. Tekli Scraping

```http
POST /api/v2/scraper/crawl4ai
Content-Type: application/json

{
  "url": "https://example.com",
  "options": {
    "useJs": true,
    "extractText": true,
    "extractLinks": true,
    "waitForSelector": ".content",
    "cssSelector": "article"
  },
  "category": "general",
  "processContent": true,
  "saveToDb": true,
  "generateEmbeddings": false
}
```

### 4.2. Toplu Scraping

```http
POST /api/v2/scraper/crawl4ai/batch
Content-Type: application/json

{
  "urls": [
    "https://example.com",
    "https://example.org"
  ],
  "options": {
    "useJs": true,
    "extractText": true
  },
  "category": "general",
  "processContent": true,
  "saveToDb": true
}
```

### 4.3. Durum Kontrolü

```http
GET /api/v2/scraper/crawl4ai/status
```

### 4.4. İş Durumu

```http
GET /api/v2/scraper/crawl4ai/job/{jobId}
```

## 5. Dashboard Kullanımı

1. Dashboard'a gidin: `http://localhost:3002/dashboard/scraper`
2. "Crawl4AI Scraper" sekmesini seçin
3. URL'leri girin ve seçenekleri yapılandırın
4. "Scrape Et" butonuna tıklayın

## 6. Seçenekler ve Parametreler

### 6.1. Temel Seçenekler

| Parametre | Tip | Varsayılan | Açıklama |
|-----------|-----|------------|----------|
| `useJs` | boolean | true | JavaScript çalıştır |
| `extractText` | boolean | true | Metin içeriği çıkar |
| `extractLinks` | boolean | true | Linkleri çıkar |
| `extractImages` | boolean | false | Resimleri çıkar |
| `waitForSelector` | string | null | Belirtilen seçiciyi bekle |
| `cssSelector` | string | null | Belirtilen seçiciden içerik çıkar |
| `wordCountThreshold` | number | 10 | Minimum kelime sayısı |
| `bypassCache` | boolean | false | Önbelleği atla |
| `userAgent` | string | null | Özel User-Agent |
| `proxy` | string | null | Proxy sunucusu |

### 6.2. İşleme Seçenekleri

| Parametre | Tip | Varsayılan | Açıklama |
|-----------|-----|------------|----------|
| `category` | string | "general" | İçerik kategorisi |
| `processContent` | boolean | false | İçeriği işle |
| `saveToDb` | boolean | false | Veritabanına kaydet |
| `generateEmbeddings` | boolean | false | Embedding oluştur |

## 7. Kategoriler

- `general`: Genel web siteleri
- `legal`: Yasal mevzuat ve kanunlar
- `technical`: Teknik dokümantasyon
- `news`: Haberler ve makaleler

## 8. Hibrit Mod

Sistem otomatik olarak en uygun scraping yöntemini seçer:

1. **Öncelik**: Crawl4AI API (kullanılabilir ise)
2. **Yedek**: Crawl4AI CLI
3. **Son Çare**: Hata mesajı

Karmaşık siteler (React, Vue, Angular vb.) için API tercih edilir.

## 9. Performans İpuçları

### 9.1. API için

- API sunucusunu ayrı bir makinede çalıştırın
- Redis önbelleğini kullanın
- Paralel işlemler için concurrency ayarını kullanın

### 9.2. CLI için

- Daha düşük concurrency kullanın (3-5)
- Uzun süreli işlemler için timeout'u artırın
- Geçici dosyaları temizlemek için cron job kullanın

## 10. Hata Ayıklama

### 10.1. Logları Kontrol Etme

```bash
# API sunucusu logları
docker-compose -f docker-compose.crawl4ai.yml logs -f crawl4ai-api

# Backend logları
tail -f logs/backend.log
```

### 10.2. Yaygın Hatalar

**Hata**: `Crawl4AI CLI not found`
**Çözüm**: `pip install crawl4ai`

**Hata**: `API server is not running`
**Çözüm**: `docker-compose -f docker-compose.crawl4ai.yml up -d`

**Hata**: `Scraping timeout`
**Çözüm**: `waitForSelector` ekleyin veya timeout'u artırın

## 11. Örnek Kullanım Senaryoları

### 11.1. Tekli URL Scraping

```javascript
const response = await fetch('/api/v2/scraper/crawl4ai', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    url: 'https://example.com',
    options: {
      useJs: true,
      extractText: true,
      waitForSelector: '.content'
    },
    category: 'general',
    processContent: true,
    saveToDb: true
  })
});

const result = await response.json();
console.log(result.data.title);
```

### 11.2. Toplu URL Scraping

```javascript
const response = await fetch('/api/v2/scraper/crawl4ai/batch', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    urls: [
      'https://example.com/page1',
      'https://example.com/page2'
    ],
    options: {
      useJs: true,
      extractText: true
    },
    category: 'news',
    saveToDb: true
  })
});

const { jobId } = await response.json();

// İlerlemeyi takip et
const checkProgress = async () => {
  const progress = await fetch(`/api/v2/scraper/crawl4ai/job/${jobId}`);
  const data = await progress.json();
  
  if (data.job.status === 'completed') {
    console.log('Scraping completed!');
  } else {
    setTimeout(checkProgress, 2000);
  }
};

checkProgress();
```

## 12. Güvenlik

- API sunucusunu güvenli bir ağda çalıştırın
- Rate limiting kullanın
- Gereksiz URL'leri filtreleyin
- Veritabanı erişimlerini kısıtlayın

## 13. Bakım

### 13.1. Düzenli Görevler

- Geçici dosyaları temizle (`temp/crawl4ai`)
- Veritabanını optimize et
- Logları rotate et
- API sunucusunu yeniden başlat

### 13.2. Monitor

- API sunucusu sağlık durumunu kontrol et
- Memory kullanımını izle
- Scraping başarı oranlarını takip et

## 14. Sorun Giderme

### 14.1. API Çalışmıyor

```bash
# Portu kontrol et
netstat -tlnp | grep 5000

# Servisi yeniden başlat
docker-compose -f docker-compose.crawl4ai.yml restart
```

### 14.2. CLI Çalışmıyor

```bash
# Python yolunu kontrol et
which python3
python3 -m crawl4ai --version

# Yeniden kur
pip uninstall crawl4ai
pip install crawl4ai
```

### 14.3. Performans Sorunları

- Memory leak kontrolü
- Browser instance'larını kapat
- Concurrency ayarlarını düşür
- Cache'i temizle

## 15. Sonraki Adımlar

1. Özel extraction stratejileri geliştirin
2. Daha fazla kategori ekleyin
3. Otomatik kategori belirleme implement edin
4. Medya (resim/video) scraping ekleyin
5. Distributed scraping için cluster kurun

## 16. Destek

Sorunlar için:
- GitHub Issues
- Dokümantasyon: `docs/crawl4ai-nodejs-integration.md`
- Logları kontrol et
- Sistem durumunu kontrol et