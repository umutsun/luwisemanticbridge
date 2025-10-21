# 🔍 Multi-Provider OCR Sistemi

Basit, güçlü ve maliyet-etkin OCR entegrasyonu.

## 🎯 Özellikler

✅ **Multi-Provider Desteği**
- OpenAI (GPT-4o) - En güçlü
- Gemini (2.0 Flash) - En ucuz ve hızlı
- DeepSeek (Replicate) - Yenilikçi OCR
- Tesseract (Yerel) - Ücretsiz fallback

✅ **Akıllı Özellikler**
- Redis cache (% 60+ hit rate hedefi)
- Otomatik fallback chain
- Settings-based provider seçimi
- Maliyet tracking
- Provider health monitoring

✅ **Performance**
- Cache ile ~%70 maliyet tasarrufu
- Ortalama response time: < 2 saniye
- Parallel processing desteği

---

## 📦 Kurulum

### 1. Gerekli Paketler (Zaten Yüklü)

```bash
# Backend package.json'da mevcut:
- openai@^4.104.0
- @google/generative-ai@^0.24.1
- ioredis@^5.7.0
- sharp@^0.34.4
- axios@^1.11.0
```

### 2. API Key'leri Ayarlama

Settings tablosuna API key'leri ekleyin:

```sql
-- OpenAI API Key
INSERT INTO settings (key, value, category, description)
VALUES ('openai_api_key', '"sk-..."', 'api_keys', 'OpenAI API Key');

-- Gemini API Key
INSERT INTO settings (key, value, category, description)
VALUES ('gemini_api_key', '"AIza..."', 'api_keys', 'Google Gemini API Key');

-- Replicate API Key (DeepSeek için)
INSERT INTO settings (key, value, category, description)
VALUES ('replicate_api_key', '"r8_..."', 'api_keys', 'Replicate API Key');
```

### 3. OCR Ayarları

```sql
-- Active Provider Seçimi
INSERT INTO settings (key, value, category, description)
VALUES ('ocr_active_provider', '"auto"', 'ocr', 'Active OCR Provider');

-- Fallback Ayarları
INSERT INTO settings (key, value, category, description)
VALUES ('ocr_fallback_enabled', 'true', 'ocr', 'Fallback enabled'),
       ('ocr_fallback_provider', '"tesseract"', 'ocr', 'Fallback provider');

-- Cache Ayarları
INSERT INTO settings (key, value, category, description)
VALUES ('ocr_cache_enabled', 'true', 'ocr', 'Cache enabled'),
       ('ocr_cache_ttl', '604800', 'ocr', 'Cache TTL (7 days)');
```

---

## 🚀 Kullanım

### API Endpoints

#### 1. OCR İşleme

```bash
POST /api/v2/ocr/process
Content-Type: multipart/form-data

# Body:
- file: (image/pdf file)
- provider: 'auto' | 'openai' | 'gemini' | 'deepseek' | 'tesseract'
- language: 'tur' | 'eng' | 'auto' (optional)
- prompt: Custom OCR prompt (optional)
- detailLevel: 'low' | 'high' (optional, default: 'high')
```

**Response:**

```json
{
  "success": true,
  "data": {
    "text": "Çıkarılan metin içeriği...",
    "confidence": 0.95,
    "metadata": {
      "provider": "gemini",
      "model": "gemini-2.0-flash-exp",
      "processingTimeMs": 1234,
      "tokensUsed": 856,
      "cost": 0.000128,
      "cacheHit": false,
      "imageFormat": "image/jpeg",
      "imageSize": { "width": 1920, "height": 1080 }
    }
  }
}
```

#### 2. Mevcut Provider'ları Listele

```bash
GET /api/v2/ocr/providers
```

**Response:**

```json
{
  "success": true,
  "data": [
    {
      "name": "openai",
      "enabled": true,
      "ready": true,
      "config": {
        "model": "gpt-4o",
        "supportedFormats": ["image/jpeg", "image/png", "image/webp"],
        "maxFileSize": 20971520,
        "costPerToken": 0.000005
      }
    },
    {
      "name": "gemini",
      "enabled": true,
      "ready": true,
      "config": {
        "model": "gemini-2.0-flash-exp",
        "supportedFormats": ["image/jpeg", "image/png", "application/pdf"],
        "maxFileSize": 20971520,
        "costPerToken": 0.00000015
      }
    }
  ]
}
```

#### 3. OCR Ayarlarını Getir

```bash
GET /api/v2/ocr/settings
```

#### 4. OCR Ayarlarını Kaydet

```bash
POST /api/v2/ocr/settings
Content-Type: application/json

{
  "activeProvider": "gemini",
  "fallbackEnabled": true,
  "fallbackProvider": "tesseract",
  "cacheEnabled": true,
  "cacheTTL": 604800
}
```

#### 5. Cache İstatistikleri

```bash
GET /api/v2/ocr/cache/stats
```

**Response:**

```json
{
  "success": true,
  "data": {
    "totalEntries": 142,
    "cacheHits": 89,
    "cacheMisses": 53,
    "cacheWrites": 142,
    "hitRate": 62.68,
    "estimatedSavings": 0.89
  }
}
```

#### 6. Cache Temizle

```bash
DELETE /api/v2/ocr/cache?fileHash=abc123&provider=gemini
```

---

## 💻 Kod Örnekleri

### TypeScript / Node.js

```typescript
import axios from 'axios';
import FormData from 'form-data';
import fs from 'fs';

async function ocrImage(filePath: string, provider = 'auto') {
  const form = new FormData();
  form.append('file', fs.createReadStream(filePath));
  form.append('provider', provider);
  form.append('language', 'tur');

  const response = await axios.post('http://localhost:5000/api/v2/ocr/process', form, {
    headers: form.getHeaders()
  });

  return response.data;
}

// Kullanım
const result = await ocrImage('./invoice.pdf', 'gemini');
console.log(result.data.text);
```

### Python

```python
import requests

def ocr_image(file_path, provider='auto'):
    with open(file_path, 'rb') as f:
        files = {'file': f}
        data = {
            'provider': provider,
            'language': 'tur'
        }

        response = requests.post(
            'http://localhost:5000/api/v2/ocr/process',
            files=files,
            data=data
        )

        return response.json()

# Kullanım
result = ocr_image('./invoice.pdf', 'gemini')
print(result['data']['text'])
```

### cURL

```bash
curl -X POST http://localhost:5000/api/v2/ocr/process \
  -F "file=@invoice.pdf" \
  -F "provider=gemini" \
  -F "language=tur"
```

---

## 🎛️ Provider Seçim Stratejisi

### Otomatik Seçim (Auto Mode)

```typescript
// Auto mode: Dosya tipine göre en uygun provider'ı seçer

PDF dosyalar → Gemini (native PDF desteği)
Görsel dosyalar → Provider health sırasına göre:
  1. Gemini (hızlı + ucuz)
  2. OpenAI (güvenilir)
  3. DeepSeek (yenilikçi)
  4. Tesseract (ücretsiz)
```

### Manuel Seçim

```typescript
// Settings'den activeProvider belirleyin:
{
  "activeProvider": "gemini",  // Tüm istekler için default
  "fallbackEnabled": true,            // Başarısız olursa fallback'e geç
  "fallbackProvider": "tesseract"     // Fallback provider
}
```

### Fallback Chain

```
Primary Provider Fail
        ↓
Fallback Provider Dene
        ↓
Tesseract (Son Çare)
        ↓
Error Throw
```

---

## 💰 Maliyet Karşılaştırması

| Provider | Model | Maliyet (1000 görsel) | Hız | Doğruluk |
|----------|-------|----------------------|-----|----------|
| **Gemini** | 2.0 Flash | ~$0.15 | ⚡⚡⚡ | ⭐⭐⭐⭐ |
| **OpenAI** | GPT-4o | ~$5.00 | ⚡⚡ | ⭐⭐⭐⭐⭐ |
| **DeepSeek** | VL-7B | ~$2.60 | ⚡⚡ | ⭐⭐⭐⭐ |
| **Tesseract** | Local | $0.00 | ⚡ | ⭐⭐⭐ |

**Cache ile tasarruf:** ~%70 maliyet düşüşü!

---

## 🔧 Troubleshooting

### Problem: Provider "not ready"

```bash
# API key'leri kontrol edin
SELECT key, value FROM settings WHERE category = 'api_keys';

# Provider durumunu kontrol edin
GET /api/v2/ocr/providers
```

### Problem: Cache çalışmıyor

```bash
# Redis bağlantısını kontrol edin
redis-cli ping

# Cache stats'a bakın
GET /api/v2/ocr/cache/stats
```

### Problem: Yavaş response

```bash
# Cache hit rate'i kontrol edin (hedef: %60+)
# Eğer düşükse:
- Cache TTL'yi artırın
- Tekrar eden dökümanlar için manuel cache ekleyin
```

---

## 📊 Monitoring

### Cache Performance

```typescript
// Cache stats endpoint'ini düzenli aralıklarla çağırın
setInterval(async () => {
  const stats = await fetch('/api/v2/ocr/cache/stats');
  console.log('Hit Rate:', stats.hitRate + '%');
  console.log('Savings: $', stats.estimatedSavings);
}, 60000); // Her dakika
```

### Provider Health

```typescript
// Provider durumlarını izleyin
const providers = await fetch('/api/v2/ocr/providers');
const unhealthy = providers.data.filter(p => !p.ready);

if (unhealthy.length > 0) {
  console.warn('Unhealthy providers:', unhealthy);
}
```

---

## 🎯 Best Practices

1. **Auto mode kullanın** - Sistem en uygun provider'ı seçer
2. **Fallback'i aktif tutun** - Kesintisiz hizmet için
3. **Cache'i enable edin** - Maliyet tasarrufu için kritik
4. **Gemini'yi tercih edin** - Çoğu senaryo için ideal (ucuz + hızlı)
5. **OpenAI'yi kritik işler için** - Maksimum doğruluk gerekiyorsa
6. **Tesseract'i basit OCR için** - API maliyeti yoksa

---

## 📝 TODO / Gelecek Geliştirmeler

- [ ] PDF multi-page processing optimization
- [ ] Batch OCR endpoint
- [ ] WebSocket progress updates
- [ ] OCR quality scoring
- [ ] Custom model fine-tuning desteği
- [ ] Frontend UI component'leri

---

## 📞 Destek

Sorularınız için:
- GitHub Issues
- Documentation: `/docs/ocr-integration.md`
- API Docs: `/api-docs` (Swagger)

---

## ✨ Özet

**3 satırda OCR:**

```typescript
import { ocrRouterService } from './services/ocr';

const result = await ocrRouterService.processDocument('./file.pdf');
console.log(result.text);
```

**O kadar basit!** 🚀
