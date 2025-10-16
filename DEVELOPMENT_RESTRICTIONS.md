# 🚨 DEVELOPMENT RESTRICTIONS & GUIDELINES

## 📋 PROJE PRENSİPLERİ

**Bu proje Alice Semantic Bridge için geliştirilmektedir. Mevcut UI/UX tasarımı ve database modeli KORUNACAKTIR.**

### 🎯 TEMEL KURALLAR

1. **MEVCUT YAPIYI KORU**
   - ✅ UI/UX tasarımını değiştirme
   - ✅ Database şemasını değiştirme
   - ✅ Mevcut component'leri yeniden isimlendirme
   - ✅ "enhanced", "advanced", "ultra" gibi eklemeler YAPMA

2. **SİADECE GEREKLİ DÜZELTMELER**
   - ✅ Bug fix'ler yapılabilir
   - ✅ Performance optimizasyonu
   - ✅ Security iyileştirmeleri
   - ✅ Test kapsamını genişletme

3. **YENİ ÖZELLİKLER İÇİN**
   - ✅ Mevcut pattern'lere sadık kal
   - ✅ CTO onayı olmadan yeni özellik EKLEME
   - ✅ Mevcut endpoint'leri değiştirme yerine yenilerini ekle

## 🏗️ MEVCUT ARKİTEKTÜR

### Database Modeli (KORUNACAK)
```
- unified_embeddings      ✅ DEĞİŞTİRİLEMEZ
- document_embeddings      ✅ DEĞİŞTİRİLEMEZ
- scrape_embeddings        ✅ DEĞİŞTİRİLEMEZ
- message_embeddings       ✅ DEĞİŞTİRİLEMEZ
- settings                  ✅ DEĞİŞTİRİLEMEZ
- documents                  ✅ DEĞİŞTİRİLEMEZ
```

### UI Component'leri (KORUNACAK)
```
- ChatInterface.tsx          ✅ DEĞİŞTİRİLEMEZ
- Header.tsx                ✅ DEĞİŞTİRİLEMEZ
- Dashboard pages             ✅ DEĞİŞTİRİLEMEZ
- Settings components        ✅ DEĞİŞTİRİLEMEZ
- Document operations        ✅ DEĞİŞTİRİLEMEZ
```

### API Endpoint'leri (KORUNACAK)
```
/api/v2/chat                 ✅ DEĞİŞTİRİLEMEZ
/api/v2/settings             ✅ DEĞİŞTİRİLEMEZ
/api/v2/documents            ✅ DEĞİŞTİRİLEMEZ
/api/v2/scraper               ✅ DEĞİŞTİRİLEMEZ
/api/v2/translate             ✅ DEĞİŞTİRİLEMEZ
```

## 🔧 İZİN VERİLEN İYİLEŞTİRMELER

### 1. **Performance Optimizasyonu**
```typescript
// ✅ DOĞRU
const cache = new Map();
const CACHE_TTL = 30000;

// ❌ YANLIŞ - Yeni component oluşturma
class UltraOptimizedCacheService  // YAPMA
```

### 2. **Security İyileştirmeleri**
```typescript
// ✅ DOĞRU
const validateInput = (input: string) => {
  return input.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
};

// ❌ YANLIŞ
export class AdvancedSecurityValidator  // YAPMA
```

### 3. **Service İyileştirmeleri**
```typescript
// ✅ DOĞRU - Mevcut service'i iyileştir
export class MessageStorageService {
  // Yeni method ekleyebilirsin
  async optimizeQuery() { ... }
}

// ❌ YANLIŞ
export class EnhancedMessageStorageService  // YAPMA
```

## 📝 TEST STRATEJİLERİ

### Test İçin Kurallar
1. **Mevcut Testleri Koru**
   - `test-suite/` içindeki testler değiştirilemez
   - Yeni testler eklenebilir ama mevcut yapıyı takip etmeli

2. **Agent Testleri**
   - Her agent kendi işini test etmeli
   - Cross-agent testleri ayrı dosyalarda olmalı
   - Test sonuçları raporlanmalı

3. **CI/CD Entegrasyonu**
   - Automated testleri devre dışı bırakma
   - Test başarısı <80% ise merge yapma

## 🚨 YASAKLAR

### Kesinlikle YAPILAMAYACAKLAR:
1. ❌ Mevcut component'leri "enhanced", "advanced" ile yeniden adlandırma
2. ❌ Database tablolarını yeniden yapılandırma
3. ❌ Mevcut endpoint'leri kaldırma veya değiştirme
4. ❌ UI/UX tasarımını kökten değiştirme
5. ❌ Yeni framework'ler ekleme (React'ı koru)
6. ❌ "Ultra", "Mega", "Pro" gibi isimlendirme

### ÖRNEKLER:
```typescript
// ❌ YANLIŞ
class UltraMegaChatbotService  // YAPMA
class AdvancedDocumentProcessor  // YAPMA
class ProModeSettings  // YAPMA

// ✅ DOĞRU
class ChatbotService  // Mevcut
class DocumentProcessorService  // Mevcut
class SettingsService  // Mevcut
```

## 📊 DEĞERLENDİRME METRİKLERİ

### Başarı Kriterleri:
- ✅ Performance: <100ms response time
- ✅ Test Coverage: >80%
- ✅ Security: OWASP compliance
- ✅ Code Quality: ESLint passed
- ✅ Database: No schema changes

## 🔄 GELİŞTİRME SÜRECİ

### 1. **Feature Request**
```markdown
1. Problem description
2. Proposed solution
3. Impact on existing architecture
4. CTO approval required
```

### 2. **Bug Fix**
```markdown
1. Bug description
2. Root cause analysis
3. Fix implementation
4. Test validation
```

### 3. **Performance Improvement**
```markdown
1. Current metrics
2. Target metrics
3. Implementation plan
4. Validation method
```

## 📋 CHECKLIST FOR DEVELOPERS

### Code Review Öncesi:
- [ ] Mevcut architecture'e uyuyor mu?
- [ ] UI/UX tasarımını koruyor mu?
- [ ] Database şemasını değiştiriyor mu?
- [ ] "Enhanced/Advanced" gibi isimlendirme var mı?
- [ ] Testleri yazıldı mı?
- [ ] Performance etkisi nedir?

### Deployment Öncesi:
- [ ] Tüm testler geçiyor mu? (>80%)
- [ ] Security scan yapıldı mı?
- [ ] Performance test edildi mi?
- [ ] CTO onayı alındı mı?

## 🎯 SONUÇ

**Bu proje sabit bir mimariye sahip. Innovation yerine reliability hedeflenmektedir. Mevcut yapıyı koruyarak sadece gerekli iyileştirmeleri yapın.**

**UNUTMA: Good enough is better than perfect. Mevcut çalışan sistem bozulmamalı!**

---

*Bu restriction file CTO tarafından onaylanmıştır. İhlal edenler projeden çıkarılacaktır.*