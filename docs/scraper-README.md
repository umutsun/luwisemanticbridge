# Luwi Semantic Bridge - Akıllı Scraper Sistemi

## 📖 İçerikler
- [Genel Bakış](#genel-bakış)
- [Hızlı Başlangıç](#hızlı-başlangıç)
- [Özellikler](#özellikler)
- [Kurulum](#kurulum)
- [Kullanım](#kullanım)
- [API Referansı](#api-referansı)
- [Yapılandırma](#yapılandırma)
- [Sıkça Sorulan Sorular](#sıkça-sorulan-sorular)

## 🎯 Genel Bakış

Luwi Scraper Sistemi, web sitelerinden içerik çıkarma, işleme ve anlamsal arama yapma yeteneklerini bir araya getiren akıllı bir platformdur. Otomatik site analizi, varlık (entity) çıkarımı ve LLM tabanlı içerik zenginleştirme özellikleri sunar.

### Ana Özellikler
- 🔍 **Akıllı Site Analizi**: Site yapısını otomatik olarak tespit eder
- 📦 **Kategori Bazlı Toplu Çekme**: Kategori sayfalarından toplu içerik çekme
- 🏷️ **Varlık Çıkarımı**: ISBN, ürün ID, fiyat, e-posta gibi varlıkları otomatik çıkarır
- 🤖 **LLM İşlemleme**: İçerik özetleme ve anahtar noktaları çıkarma
- 🔎 **Anlamsal Arama**: Çekilen içerik üzerinde akıllı arama
- 📊 **Gerçek Zamanlı İlerleme: Dairesel ilerleme çubukları ile takip

## 🚀 Hızlı Başlangıç

### 1. Proje Oluşturma
```bash
# Frontend'de scraper sayfasına gidin
http://localhost:3002/dashboard/scraper
```

### 2. Site Ekleme
```javascript
const siteConfig = {
  name: "Kitapyurdu",
  baseUrl: "https://www.kitapyurdu.com",
  category: "kitapçı",
  type: "ecommerce",
  autoDetect: true  // Otomatik analiz etkin
};
```

### 3. Konu Analizi Başlatma
```javascript
// "Pinokyo" konusunu araştır
const workflow = {
  concept: "Pinokyo",
  projectId: "proje_id",
  maxSearchResults: 20,
  maxContentItems: 30
};
```

## ✨ Özellikler

### 1. 🔍 Site Analizi ve Yönetimi
- **Otomatik Site Tespiti**: E-ticaret, blog, haber sitesi gibi tipleri algılar
- **Seçici Analizi**: CSS seçicilerini otomatik olarak belirler
- **Route Pattern Tespiti**: URL yapılarını analiz eder
- **Varlık Yapılandırması**: Site tipine göre otomatik varlık tipleri belirler

### 2. 📦 Kategori Çekme
- **Toplu Ürün Çekme**: Kategori sayfalarından tüm ürünleri çeker
- **Sayfalandırma Desteği**: "Sonraki Sayfa" butonlarını otomatik takip eder
- **Varlık Çıkarımı**: Her ürün için ISBN, fiyat, görsel URL'si gibi bilgileri çıkarır
- **Görsel İndirme**: Ürün görsellerini indirme seçeneği

### 3. 🏷️ Varlık Çıkarımı (NER)
- **Varsayılan Varlıklar**:
  - E-posta, Telefon, Tarih
  - Görsel URL, Kaynak URL
  - Konum, Kişi, Kurum

- **E-ticaret Varlıkları**:
  - ISBN numarası (978 ile başlayan)
  - Ürün ID/SKU
  - Fiyat ve para birimi (TL, $, €)
  - Barkod numarası
  - Stok durumu
  - İndirim yüzdesi

### 4. 🤖 LLM ile İçerik İşleme
- **Dil Tespiti**: Türkçe/İngilizce içerik algılama
- **Özet Çıkarma**: İçeriğin ana fikrini özeller
- **Anahtar Noktalar**: Önemli bilgileri listeler
- **Konu Tespiti**: İçeriğin ana konularını belirler
- **Kalite Skoru**: İçerik kalitesini 0-1 arası puanlar

### 5. 🔎 Anlamsal Arama
- **Vektör Tabanlı**: OpenAI embeddings ile anlamsal arama
- **Filtreleme**: Site tipi, varlık varlığı gibi filtreler
- **İlişki Skoru**: İçeriğin sorguyla benzerlik yüzdesi
- **Varlık Vurgulama**: Arama sonuçlarında çıkarılan varlıkları gösterir

## 🛠 Kurulum

### Frontend
```bash
cd frontend
npm install
npm run dev  # Port: 3002
```

### Backend
```bash
cd backend
npm install
# .env dosyası yapılandırın
npm run dev  # Port: 8083
```

### .env Dosyası
```env
OPENAI_API_KEY=sk-...
DATABASE_URL=postgresql://...
REDIS_URL=redis://localhost:6379
```

## 📋 Kullanım

### 1. Site Ekleme

```javascript
// Site ekleme endpoint'i
POST /api/v2/scraper/projects/{projectId}/sites

{
  "name": "İletişim Yayıncılık",
  "baseUrl": "https://www.iskultur.com.tr",
  "category": "yayınevi",
  "type": "ecommerce",
  "autoDetect": true
}
```

### 2. Kategori Çekme

```javascript
// Kategori çekme başlatma
POST /api/v2/scraper/category-scrape

{
  "categoryUrl": "https://www.kitapyurdu.com/kategori/kitap-cocuk-kitaplari/2.html",
  "projectId": "proje_id",
  "maxProducts": 100,
  "extractEntities": true,
  "followPagination": true,
  "downloadImages": false
}
```

### 3. Konu Analizi

```javascript
// Konu workflow başlatma
POST /api/v2/scraper/concept-workflow

{
  "concept": "Yapay Zeka",
  "projectId": "proje_id",
  "maxSearchResults": 20,
  "maxContentItems": 30,
  "rewritePrompt": "Çocuklar için basit bir dille açıkla"
}
```

### 4. Anlamsal Arama

```javascript
// İçerik arama
POST /api/v2/scraper/semantic-search

{
  "query": "Pinokyo kitabı özeti",
  "projectIds": ["proje_id"],
  "maxResultsPerSite": 5,
  "filters": {
    "siteType": "ecommerce",
    "hasEntities": true
  }
}
```

## 📚 API Referansı

### Site Yönetimi

| Endpoint | Method | Açıklama |
|----------|--------|----------|
| `/api/v2/scraper/projects/{id}/sites` | POST | Site ekle |
| `/api/v2/scraper/sites/{id}/analyze` | POST | Site analiz et |
| `/api/v2/scraper/sites/{id}/entity-types` | POST | Varlık tiplerini ayarla |
| `/api/v2/scraper/sites/{id}` | GET | Site detayları |

### İçerik Çekme

| Endpoint | Method | Açıklama |
|----------|--------|----------|
| `/api/v2/scraper/scrape` | POST | Tek URL çek |
| `/api/v2/scraper/category-scrape` | POST | Kategori çek |
| `/api/v2/scraper/batch-scrape` | POST | Çoklu çek |
| `/api/v2/scraper/category-scrape/{id}/status` | GET | İşlem durumu |

### İş Akışları

| Endpoint | Method | Açıklama |
|----------|--------|----------|
| `/api/v2/scraper/concept-workflow` | POST | Konu analizi başlat |
| `/api/v2/scraper/workflow-jobs/{id}` | GET | İş durumu |
| `/api/v2/scraper/workflows` | GET | Tüm işler |

### Arama

| Endpoint | Method | Açıklama |
|----------|--------|----------|
| `/api/v2/scraper/semantic-search` | POST | Anlamsal arama |
| `/api/v2/scraper/search-jobs/{id}` | GET | Arama sonuçları |

## ⚙️ Yapılandırma

### Site Tipleri ve Özellikleri

| Site Tipi | Özellikleri | Otomatik Varlıklar |
|-----------|-------------|-------------------|
| **ecommerce** | Ürün grid, fiyat, sepet | ISBN, SKU, Fiyat, Stok |
| **blog** | Makale, yazar, tarih | Tarih, Yazar, Görsel |
| **news** | Haber, başlık, etiket | Tarih, Konum, Kurum |
| **website** | Genel içerik | E-posta, Telefon, Link |
| **api** | JSON/XML veri | Yapıya özel |

### Varlık Patternleri

```javascript
// ISBN Örnek
{
  "type": "ISBN",
  "label": "ISBN Numarası",
  "pattern": "ISBN[:\\s]*978[-\\d\\s]{10,17}",
  "enabled": true,
  "category": "product"
}

// Fiyat Örnek
{
  "type": "PRICE",
  "label": "Fiyat",
  "pattern": "\\$\\d+(?:\\.\\d{2})?|\\d+(?:\\.\\d{2})?\\s*(?:TL|USD|EUR|£)",
  "enabled": true,
  "category": "product"
}
```

### İşlem Durumları

| Durum | Açıklama |
|-------|----------|
| `pending` | Beklemede |
| `processing` | İşleniyor |
| `completed` | Tamamlandı |
| `failed` | Hatalı |
| `cancelled` | İptal edildi |

## 🎨 UI Kullanımı

### Ana Bileşenler

1. **Workflow Sekmesi**
   - Konu analizi başlatma
   - Kategori çekme ayarları
   - Gerçek zamanlı ilerleme takibi

2. **Sites Sekmesi**
   - Site listesi (Grid/List görünüm)
   - Site ekleme modalı
   - Site yapılandırma paneli

3. **Search Sekmesi**
   - Anlamsal arama formu
   - Filtreleme seçenekleri
   - Sonuçları gösterme

4. **Entities Sekmesi**
   - Varlık tipleri listesi
   - Özel varlık ekleme
   - Pattern düzenleme

### İlerleme Göstergesi

Dairesel ilerleme çubuğu şu bilgileri gösterir:
- İşlem yüzdesi
- Mevcut adım
- Tamamlanan öğe sayısı
- Hata mesajları (varsa)

## ❓ Sıkça Sorulan Sorular

### S: Otomatik site analizi nasıl çalışır?
C: Sistem siteyi ziyaret eder, HTML yapısını analiz eder ve:
- İçerik seçicilerini (title, content, price) tespit eder
- URL pattern'lerini çıkarır
- E-ticaret özelliklerini (sepet, ödeme) kontrol eder
- Uygun varlık tiplerini belirler

### S: ISBN tespiti nasıl yapılır?
C: Sistem şu pattern'leri arar:
- `ISBN: 978-975-21-4001-0`
- `9789752140010`
- `ISBN 978 975 21 4001 0`

### S: Türkçe içerikleri işleyebilir mi?
C: Evet, sistem:
- Türkçe dilini otomatik tespit eder
- Türkçe prompt'lar kullanır
- Türkçe varlıkları (TL, stokta var vb.) tanır

### S: Çekilen veriler nasıl saklanır?
C: Veriler `scrape_embeddings` tablosunda saklanır:
- Orijinal ve işlenmiş içerik
- Çıkarılan varlıklar
- Embedding vektörleri
- Kalite metrikleri

### S: Performansı nasıl optimize edebilirim?
C: İpuçları:
- Batch işlemler kullanın
- Gereksiz varlık tiplerini devre dışı bırakın
- Rate limit'i ayarlayın
- Veritabanı indekslerini kontrol edin

## 🔧 Hata Ayıklama

### Yaygın Hatalar

1. **Site Analizi Başarısız**
   - Site erişilebilir mi kontrol edin
   - robots.txt dosyasını kontrol edin
   - Rate limit ayarlarını düşürün

2. **Varlık Çıkarımında Sonuç Yok**
   - Pattern'lerin doğru olduğundan emin olun
   - Varlık tiplerinin etkin olduğunu kontrol edin
   - İçerik dilini doğrulayın

3. **Arama Boş Dönüyor**
   - Embeddings'in oluşturulduğundan emin olun
   - Sorgu formatını kontrol edin
   - Proje ID'sinin doğru olduğunu doğrulayın

### Log Kontrolü

```bash
# Backend logları
cd backend
tail -f logs/app.log

# Spesifik hatalar
grep "ERROR" logs/app.log
```

## 🚀 İleri Kullanım

### 1. Özel Varlık Tipi Ekleme

```javascript
// Yayınevi kodu için
{
  "type": "PUBLISHER_CODE",
  "label": "Yayınevi Kodu",
  "pattern": "\\b[A-Z]{3,5}\\d{2,4}\\b",
  "enabled": true,
  "category": "product"
}
```

### 2. Zamanlanmış Çekim

```javascript
// Her gün yeni kitapları çek
const cron = require('node-cron');
cron.schedule('0 2 * * *', async () => {
  await scrapeNewReleases();
});
```

### 3. Özel İşlem Akışı

```javascript
// Kitap karşılaştırma akışı
async function compareBooks(isbn1, isbn2) {
  const books = await Promise.all([
    scrapeBookDetails(isbn1),
    scrapeBookDetails(isbn2)
  ]);
  return generateComparison(books);
}
```

## 📄 Lisans

Bu proje MIT Lisansı altında dağıtılmaktadır.

## 🤝 Destek

Sorularınız veya hata raporlarınız için:
- GitHub Issues: [Projeyi aç](./issues)
- E-posta: hello@luwi.dev

---

*Luwi Semantic Bridge - Akıllı Web Scraper Sistemi*