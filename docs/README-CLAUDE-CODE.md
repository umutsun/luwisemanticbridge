# Claude Code CLI için GLM-4.5 Z.AI Entegrasyonu

Bu proje, Claude Code CLI aracılığıyla Z.AI API'sini kullanarak GLM-4.5 modeliyle kod yazmanızı sağlayan bir TypeScript entegrasyonudur.

## 🎯 Amaç

Claude Code CLI arayüzünü kullanarak, GLM-4.5 modeliyle kod yazmak ve geliştirme süreçlerinizi hızlandırmak.

## 📁 Oluşturulan Dosyalar

1. **[`claude-code-zai.ts`](claude-code-zai.ts:1)** - Ana Claude Code Z.AI entegrasyon sınıfı
2. **[`claude-code-example.ts`](claude-code-example.ts:1)** - Kullanım örnekleri
3. **[`.env.example`](.env.example:1)** - Ortam değişkenleri şablonu
4. **[`package-zai.json`](package-zai.json:1)** - Proje bağımlılıkları

## 🚀 Kurulum

### 1. Gerekli Paketleri Yükleyin

```bash
npm install dotenv node-fetch
```

### 2. Ortam Değişkenlerini Ayarlayın

`.env` dosyası oluşturun ve Z.AI API anahtarınızı ekleyin:

```bash
cp .env.example .env
```

`.env` dosyasını düzenleyin:

```env
ZAI_API_KEY=your_zai_api_key_here
ZAI_BASE_URL=https://api.zai.chat/v1
ZAI_DEFAULT_MODEL=glm-4.5
```

## 💡 Kullanım

### 1. Interactive CLI Modu

Claude Code benzeri bir arayüzle GLM-4.5 modeliyle kod yazın:

```bash
npx tsx claude-code-zai.ts
```

Örnek kullanım:
```
🤖 Claude Code Z.AI - GLM-4.5 Kod Yazma Asistanı
📝 Çıkmak için "exit" yazın

Claude Code> Bir kullanıcıdan isim ve yaş alan ve bunları konsola yazdıran bir fonksiyon yaz
🔄 Kod oluşturuluyor...

💻 Oluşturulan Kod:
```typescript
function getUserInfo() {
  const name = prompt("Lütfen adınızı girin:");
  const age = prompt("Lütfen yaşınızı girin:");
  
  if (name && age) {
    console.log(`Adınız: ${name}, Yaşınız: ${age}`);
  } else {
    console.log("Geçersiz giriş!");
  }
}

// Fonksiyonu çağır
getUserInfo();
```

📖 Açıklama:
Bu kod, kullanıcıdan adını ve yaşını alarak konsola yazdıran basit bir fonksiyon içerir. prompt() fonksiyonu ile kullanıcıdan bilgi alınır ve alınan bilgiler konsola yazdırılır.

💡 Öneriler:
1. Hata yönetimi için try-catch blokları ekleyebilirsiniz
2. Yaş için sayısal doğrulama yapabilirsiniz
3. Daha iyi kullanıcı deneyimi için input validasyonları ekleyebilirsiniz

==================================================
```

### 2. Örnekleri Çalıştırma

```bash
npx tsx claude-code-example.ts
```

Bu komut, farklı senaryolar için kod oluşturma örneklerini çalıştırır:
- Temel TypeScript fonksiyonları
- React componentleri
- Express API endpoint'leri
- Dosyaya kod kaydetme

### 3. Programatik Kullanım

```typescript
import { ClaudeCodeZAI } from './claude-code-zai';

// Client oluştur
const client = new ClaudeCodeZAI();

// Kod oluştur
const response = await client.generateCode({
  prompt: 'Bir kullanıcıdan isim ve yaş alan ve bunları konsola yazdıran bir fonksiyon yaz',
  language: 'typescript',
  maxTokens: 500,
  temperature: 0.3
});

console.log('💻 Oluşturulan Kod:');
console.log(response.code);

console.log('📖 Açıklama:');
console.log(response.explanation);

if (response.suggestions && response.suggestions.length > 0) {
  console.log('💡 Öneriler:');
  response.suggestions.forEach((suggestion, index) => {
    console.log(`${index + 1}. ${suggestion}`);
  });
}

// Kodu dosyaya kaydet
const filepath = await client.saveCodeToFile(response.code, 'user-function.ts');
console.log(`💾 Kod kaydedildi: ${filepath}`);
```

## 🔧 Özellikler

### Kod Oluşturma Seçenekleri

- **Dil Destekleri**: TypeScript, JavaScript, Python, Java, C#, Go, Rust ve daha fazlası
- **Framework Desteği**: React, Vue, Angular, Express, FastAPI, Django, Spring ve daha fazlası
- **Bağlam Bilgisi**: Mevcut kod yapısını ve bağlamını dikkate alarak kod oluşturma
- **Kod Kalitesi**: En iyi pratiklere uygun, temiz ve okunabilir kod

### Çıktı Formatı

Her kod oluşturma isteği için aşağıdaki bilgileri alırsınız:
- Oluşturulan kod
- Kodun açıklaması
- İyileştirme önerileri
- Dil ve framework bilgisi

### Ek Özellikler

- **Dosyaya Kaydetme**: Oluşturulan kodu doğrudan dosyaya kaydetme
- **Stream Desteği**: Gerçek zamanlı kod oluşturma (yakında)
- **Hata Yönetimi**: Kapsamlı hata yakalama ve bildirim

## 📚 API Referansı

### ClaudeCodeZAI Sınıfı

#### Constructor

```typescript
new ClaudeCodeZAI(apiKey?: string, baseUrl?: string, defaultModel?: string)
```

- `apiKey`: Z.AI API anahtarı (isteğe bağlı, varsayılan: `process.env.ZAI_API_KEY`)
- `baseUrl`: API base URL (isteğe bağlı, varsayılan: `'https://api.zai.chat/v1'`)
- `defaultModel`: Varsayılan model (isteğe bağlı, varsayılan: `'glm-4.5'`)

#### Metotlar

##### `generateCode(options: CodeGenerationRequest): Promise<CodeGenerationResponse>`

Kod oluşturur.

```typescript
const response = await client.generateCode({
  prompt: 'Bir hesap makinesi sınıfı yaz',
  language: 'typescript',
  framework: 'node',
  maxTokens: 800,
  temperature: 0.3
});
```

##### `saveCodeToFile(code: string, filename: string, directory?: string): Promise<string>`

Kodu dosyaya kaydeder.

```typescript
const filepath = await client.saveCodeToFile(code, 'calculator.ts');
```

##### `generateAndSave(options: CodeGenerationRequest, filename: string): Promise<{ filepath: string; response: CodeGenerationResponse }>`

Kod oluşturur ve dosyaya kaydeder.

```typescript
const { filepath, response } = await client.generateAndSave({
  prompt: 'Bir API endpoint\'i yaz',
  language: 'typescript',
  framework: 'express'
}, 'api-endpoint.ts');
```

### Türler

#### CodeGenerationRequest

```typescript
interface CodeGenerationRequest {
  prompt: string;
  language?: string;
  framework?: string;
  context?: string;
  maxTokens?: number;
  temperature?: number;
  model?: string;
}
```

#### CodeGenerationResponse

```typescript
interface CodeGenerationResponse {
  code: string;
  explanation: string;
  language: string;
  framework?: string;
  suggestions?: string[];
}
```

## 🎯 Kullanım Senaryoları

### 1. Yeni Proje Başlatma

```bash
npx tsx claude-code-zai.ts
Claude Code> Express ve TypeScript ile basit bir CRUD API projesi oluştur
```

### 2. Mevcut Projeye Özellik Ekleme

```bash
npx tsx claude-code-zai.ts
Claude Code> Mevcut React projeme kullanıcı profili sayfası ekle. Props olarak user objesi alsın.
```

### 3. Kod Refactoring

```bash
npx tsx claude-code-zai.ts
Claude Code> Bu fonksiyonu daha okunabilir hale getir ve hata yönetimi ekle:
function calc(a,b){return a/b}
```

### 4. Test Kodu Oluşturma

```bash
npx tsx claude-code-zai.ts
Claude Code> Bu fonksiyon için Jest test kodu yaz:
function add(a: number, b: number): number {
  return a + b;
}
```

## 🛠️ Geliştirme

### Development Modu

```bash
npx tsx watch claude-code-zai.ts
```

## ⚠️ Önemli Notlar

1. **API Anahtarı**: Z.AI'den aldığınız API anahtarını `.env` dosyasına eklemeyi unutmayın.
2. **Model Seçimi**: GLM-4.5 modeli varsayılan olarak ayarlanmıştır, ancak Z.AI tarafından desteklenen diğer modelleri de kullanabilirsiniz.
3. **Hata Yönetimi**: Tüm API çağrıları try-catch blokları ile sarılmıştır.
4. **Güvenlik**: API anahtarınızı asla kod içine gömmeyin, her zaman ortam değişkenleri kullanın.
5. **Kod Kalitesi**: Oluşturulan kodları her zaman gözden geçirin ve test edin.

## 🔄 Desteklenen Modeller

- `glm-4.5` (varsayılan)
- `gpt-4-turbo`
- `gpt-4`
- `gpt-3.5-turbo`
- Diğer Z.AI destekli modeller

## 🐛 Hata Çözümleme

### Yaygın Hatalar

1. **Z.AI API anahtarı gereklidir**
   - Çözüm: `.env` dosyasına `ZAI_API_KEY` ekleyin

2. **401 Unauthorized**
   - Çözüm: API anahtarınızın geçerli olduğundan emin olun

3. **429 Too Many Requests**
   - Çözüm: İsteklerinizi yavaşlatın veya rate limit bekleyin

4. **Stream okunamadı**
   - Çözüm: İnternet bağlantınızı kontrol edin

## 📝 İyileştirmeler

Gelecek sürümlerde planlanan özellikler:
- [ ] Daha iyi stream desteği
- [ ] Proje analizi ve bağlam anlama
- [ ] Kod refactoring önerileri
- [ ] Test kodu otomasyonu
- [ ] Dokümantasyon oluşturma

## 📄 Lisans

MIT