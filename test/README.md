# Test Suite

Bu proje için test paketi, farklı seviyelerde testleri içeren yapılandırılmış bir test paketidir.

## Test Yapısı

```
test/
├── unit/                 # Birim testleri
│   ├── nodes/           # N8N düğümleri için birim testleri
│   ├── shared/          # Paylaşılan modüller için birim testleri
│   └── integration/     # Bileşen entegrasyon testleri
├── e2e/                # Uçtan uca testler
├── performance/        # Performans testleri
├── fixtures/           # Test verileri
└── helpers/           # Test yardımcı fonksiyonları
```

## Test Çalıştırma

### Tüm Testleri Çalıştırma

```bash
npm test
```

### Sadece Birim Testlerini Çalıştırma

```bash
npm test -- test/unit
```

### Belirli Bir Test Dosyası Çalıştırma

```bash
npm test -- test/unit/shared/cache-manager.test.ts
```

### Test Çıktısı Detaylandırma

```bash
npm test -- --verbose
```

### Test Raporu Oluşturma

```bash
npm test -- --coverage
```

## Test Türleri

### Birim Testleri (Unit Tests)

- **Amaç**: Tekil fonksiyonların, sınıfların ve modüllerin doğru çalıştığını doğrulamak
- **Kapsam**: Nodes, shared modüller
- **Araç**: Jest

### Entegrasyon Testleri (Integration Tests)

- **Amaç**: Farklı bileşenlerin birlikte doğru çalıştığını doğrulamak
- **Kapsam**: API sağlığı, veritabanı bağlantıları
- **Araç**: Jest

### Uçtan Uca Testler (E2E Tests)

- **Amaç**: Tüm uygulama akışlarının doğru çalıştığını doğrulamak
- **Kapsam**: Tam işlevsel testler
- **Araç**: Playwright (gelecekte eklenecek)

### Performans Testleri (Performance Tests)

- **Amaç**: Uygulama performansını ölçmek
- **Kapsam**: Yük testleri, yanıt süreleri
- **Araç**: K6 (gelecekte eklenecek)

## Test Verileri

Testler için kullanılan veriler `fixtures/` dizininde bulunur:

- `test/fixtures/database/`: Veritabanı test verileri
- `test/fixtures/redis/`: Redis test verileri
- `test/fixtures/responses/`: API yanıt örnekleri

## Test Yardımcı Fonksiyonları

`helpers/` dizininde testleri kolaylaştıran yardımcı fonksiyonlar bulunur:

- `test/helpers/test-config.ts`: Test yapılandırma yardımcıları
- `test/helpers/database-setup.ts`: Veritabanı kurulumu yardımcıları
- `test/helpers/mocks.ts`: Mock fonksiyonları

## Test Ortamı

Testler aşağıdaki ortamda çalışır:

- **Veritabanı**: PostgreSQL (test modu)
- **Cache**: Redis (test modu)
- **Node.js**: Test ortamı
- **Environment**: `.env.test`

## Test Kuralları

1. **Test İsimlendirme**: Test fonksiyonları açıklayıcı ve anlaşılır olmalı
2. **Test Gruplama**: İlgili testler `describe` blokları içinde gruplanmalı
3. **Mock Kullanımı**: Harici bağımlılıklar mock'lanmalı
4. **Hata Yönetimi**: Hata durumları test edilmeli
5. **Temizlik**: Test sonrası kaynaklar temizlenmeli

## Örnek Test

```typescript
describe('CacheManager', () => {
  let cacheManager: CacheManager;

  beforeEach(() => {
    cacheManager = new CacheManager();
  });

  afterEach(() => {
    cacheManager.clear();
  });

  it('should set and get value from cache', async () => {
    const key = 'test-key';
    const value = { data: 'test-value' };
    
    await cacheManager.set(key, value, 1000);
    const result = await cacheManager.get(key);
    
    expect(result).toEqual(value);
  });
});
```

## Test Raporları

Test raporları `coverage/` dizininde oluşturulur:

- `coverage/lcov-report/`: Detaylı rapor
- `coverage/lcov.info`: LCOV formatında rapor

## Geliştirme İçin Testler

Yeni özellikler geliştirirken test eklemek zorunludur:

1. Yeni kod için birim testleri ekleyin
2. Entegrasyon testleri ile tüm akışı test edin
3. Test kapsamını %80'in üzerine çıkarın
4. Testleri CI/CD pipeline'ına entegre edin

## Sorun Giderme

Testler başarısız olduğunda:

1. Hata mesajlarını dikkatlice okuyun
2. Test verilerini kontrol edin
3. Mock yapılandırmasını kontrol edin
4. Test ortamını yeniden başlatın

```bash
# Test ortamını temizle
npm run test:clean

# Testleri izleme modunda çalıştır
npm test -- --watch