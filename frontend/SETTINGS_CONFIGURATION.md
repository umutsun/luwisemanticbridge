# LSEMB Settings Configuration Guide

Bu doküman, LSEMB uygulamasının Settings sayfasındaki tüm konfigürasyon seçeneklerini açıklar.

---

## Tab Yapısı

| Tab | Açıklama |
|-----|----------|
| **App** | Genel uygulama ayarları, dil, logo, chat branding |
| **API** | Provider API keys, aktif servisler, source database |
| **RAG** | Arama parametreleri, veri kaynağı öncelikleri, soru kalıpları |
| **Prompts** | System prompt şablonları |
| **Transform** | Veri dönüşüm şablonları |
| **Services** | Harici servis yönetimi |
| **Advanced** | Güvenlik, storage, crawler ayarları |

---

## 1. App Settings (Genel Ayarlar)

### Sol Kolon - Uygulama Bilgileri

#### App Name
- Uygulamanın görünen adı
- Header ve sayfa başlıklarında kullanılır

#### Language
- Arayüz dili seçimi
- Desteklenen diller: Türkçe, English, Deutsch, Français, Español, Italiano, Português, Русский, 中文, العربية, 日本語, 한국어

#### Logo URL
- Uygulama logosu için URL
- Header'da görüntülenir

### Sağ Kolon - Chat Interface

#### Chat Interface (Template)
- Chat arayüzü tasarım şablonu
- Seçenekler:
  - **Base**: Temiz, fonksiyonel tasarım
  - **Gemini**: Modern glassmorphism stili
  - **Modern**: Şık çağdaş görünüm

#### Chat Branding
| Alan | Açıklama |
|------|----------|
| Chat Title | Chat header'ında görünen başlık |
| Chat Logo URL | Chat header'ında görünen logo |
| Primary Color | Ana tema rengi (hex format) |

---

## 2. API Settings

### Sol Kolon - Provider API Keys

Her provider için API key girişi ve doğrulama:

| Provider | Kullanım Alanı |
|----------|----------------|
| **OpenAI** | GPT modelleri, text-embedding |
| **Google AI** | Gemini modelleri, translation |
| **Anthropic** | Claude modelleri |
| **DeepSeek** | DeepSeek chat/coder |
| **HuggingFace** | Open-source modeller |
| **OpenRouter** | Çoklu model erişimi |
| **DeepL** | Profesyonel çeviri |

#### API Key Doğrulama
1. API key girin
2. "Validate" butonuna tıklayın
3. Yeşil ✓ = Başarılı, Kırmızı ✗ = Hatalı

#### Swagger Documentation
- Backend API dokümantasyonuna erişim
- OpenAPI spec indirme

### Sağ Kolon - Active Service Providers

#### LLM Provider & Model
- Aktif chat modeli seçimi
- Sadece doğrulanmış provider'lar listelenir

#### Embedding Provider & Model
- Vektör embedding modeli
- Önerilen: `text-embedding-3-small` (OpenAI)

#### Translation Provider
- Çeviri servisi seçimi
- Google veya DeepL

#### OCR Provider
- Görüntüden metin çıkarma
- Seçenekler: Gemini Vision, OpenAI Vision, DeepSeek Vision, Tesseract (ücretsiz)

### Source Database
Veri kaynağı veritabanı bağlantısı:

| Alan | Açıklama | Varsayılan |
|------|----------|------------|
| Database Type | PostgreSQL, MySQL, MariaDB | PostgreSQL |
| Host | Veritabanı sunucu adresi | localhost |
| Port | Bağlantı portu | 5432 (PG), 3306 (MySQL) |
| Database Name | Veritabanı adı | - |
| User | Kullanıcı adı | - |
| Password | Şifre | - |
| SSL Enabled | SSL bağlantısı | false |

**Test Connection**: Bağlantıyı test eder

---

## 3. RAG Settings

### Sol Kolon - Search Configuration

#### Search Parameters

| Parametre | Açıklama | Varsayılan | Önerilen Aralık |
|-----------|----------|------------|-----------------|
| Similarity Threshold | Minimum benzerlik skoru | 0.25 | 0.15 - 0.35 |
| Min Results | Başlangıç sonuç sayısı | 5 | 3 - 10 |
| Max Results | Maksimum sonuç sayısı | 15 | 10 - 25 |

#### Search Type
- **Semantic Only**: Sadece vektör araması (önerilen)
- **Keyword Only**: Sadece metin araması
- **Hybrid**: Her ikisi birden

#### Data Source Priorities

Her kaynak için 0-10 arası öncelik:

| Kaynak | Varsayılan | Açıklama |
|--------|------------|----------|
| Database Content | 8 | Veritabanı tabloları |
| Documents | 5 | Yüklenen dosyalar (PDF, Word, Excel) |
| Chat Messages | 3 | Önceki sohbet geçmişi |
| Web Content | 4 | Crawler ile toplanan sayfalar |

**Not**: 0 = Devre dışı, 10 = Maksimum öncelik

#### Table Priorities
- Her embedded tablo için 0-1 arası ağırlık
- Yüksek ağırlıklı tablolar arama sonuçlarında daha baskın

### Sağ Kolon - Chat Features

#### Opening Messages
- Chat başladığında gösterilen karşılama mesajları
- Her satır bir mesaj

#### Suggestion Cards
| Alan | Açıklama |
|------|----------|
| Enable Suggestions | Öneri kartlarını aç/kapa |
| Max Cards | Gösterilecek kart sayısı (1-6) |
| Custom Suggestions | Özel öneri metinleri (satır satır) |

#### Follow-up Questions
| Alan | Açıklama |
|------|----------|
| Auto Generate | Otomatik takip soruları |
| Max Questions | Maksimum soru sayısı (1-5) |

#### Question Generation Patterns
Domain-spesifik soru şablonları tanımlama.

##### Pattern Yapısı
```json
{
  "name": "emlak",
  "keywords": "satılık|kiralık|daire|arsa",
  "titleKeywords": "satılık|arsa",
  "defaultQuestion": "{topic} hakkında bilgi verir misiniz?",
  "priority": 1,
  "combinations": [
    {
      "with": "fiyat,metrekare",
      "question": "{topic} için m² fiyatı nedir?"
    }
  ]
}
```

##### Varsayılan Patterns
- **emlak**: Gayrimenkul sorguları
- **saglik**: Sağlık ve wellness
- **vergi**: Vergi ve mevzuat

---

## 4. Prompts Settings

System prompt şablonları için ayrı dokümantasyon mevcuttur.

---

## 5. Transform Settings

Veri dönüşüm şablonları için ayrı dokümantasyon mevcuttur.

---

## 6. Services Settings

Harici servis entegrasyonları için ayrı dokümantasyon mevcuttur.

---

## 7. Advanced Settings (Security)

### Security Configuration

| Alan | Açıklama | Varsayılan |
|------|----------|------------|
| Enable Authentication | Kimlik doğrulama | true |
| Session Timeout | Oturum süresi (saat) | 24 |
| Rate Limit | İstek limiti (req/min) | 100 |

### Storage Settings
Dosya depolama konfigürasyonu.

### Crawler Settings
Web crawler parametreleri.

### SMTP Settings
E-posta gönderim ayarları.

---

## Örnek Konfigürasyonlar

### Emlak Uygulaması (EmlakAI)
```
Data Source Priorities:
- Database: 10 (İlanlar en önemli)
- Documents: 3
- Chat: 2
- Web: 5

Table Priorities:
- ilan_detaylari: 1.0
- konum_bilgileri: 0.8
- fiyat_gecmisi: 0.6
```

### Hukuk Danışmanlığı
```
Data Source Priorities:
- Database: 5
- Documents: 10 (Kanun metinleri)
- Chat: 4
- Web: 7

Search Parameters:
- Similarity: 0.30 (Daha hassas)
- Max Results: 20
```

### Müşteri Destek Botu
```
Data Source Priorities:
- Database: 6
- Documents: 8 (Kullanım kılavuzları)
- Chat: 10 (Önceki çözümler)
- Web: 3
```

---

## Sorun Giderme

### API Key Doğrulanmıyor
1. Key'in doğru kopyalandığından emin olun
2. Provider'ın aktif ve çalışır durumda olduğunu kontrol edin
3. Key'in gerekli izinlere sahip olduğunu doğrulayın

### Arama Sonuçları Yetersiz
1. Similarity threshold'u düşürün (0.25 → 0.15)
2. Max results değerini artırın
3. İlgili data source önceliğini yükseltin

### Çok Fazla Alakasız Sonuç
1. Similarity threshold'u artırın (0.25 → 0.35)
2. Öncelikleri düşürün
3. Table weights'i ayarlayın

### Database Bağlantı Hatası
1. Host/port bilgilerini kontrol edin
2. Firewall kurallarını gözden geçirin
3. SSL ayarını kontrol edin
4. Kullanıcı izinlerini doğrulayın

---

## İpuçları

1. **Dengeli Başla**: İlk kurulumda varsayılan değerlerle başlayın
2. **Test Et**: Her değişiklikten sonra chat'te test edin
3. **İteratif Ayarla**: Kullanıcı geri bildirimlerine göre optimize edin
4. **Backup**: Ayarları değiştirmeden önce mevcut değerleri not edin
5. **API Key Güvenliği**: Production'da API key'leri environment variable olarak saklayın

---

Son güncelleme: Aralık 2025
