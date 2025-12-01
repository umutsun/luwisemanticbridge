# RAG Priority Configuration Guide

Bu dokümantasyon, LSEMB'nin RAG (Retrieval-Augmented Generation) sisteminde veri kaynaklarının öncelik yapılandırmasını açıklar.

## Genel Bakış

RAG sistemi, kullanıcı sorularına yanıt verirken birden fazla veri kaynağından bilgi alır. Öncelik sistemi, hangi kaynakların daha fazla ağırlıklandırılacağını kontrol etmenizi sağlar.

## Veri Kaynakları

### 1. Database Content (Veritabanı İçeriği)
- **Varsayılan Öncelik:** 8
- **Açıklama:** Bağlı PostgreSQL veritabanındaki tablolardan gelen içerik
- **Kullanım Alanı:** Emlak ilanları, ürün katalogları, müşteri verileri vb.
- **Tablo Öncelikleri:** Database tab'ında her tablo için ayrı öncelik ayarlanabilir

### 2. Documents (Dokümanlar)
- **Varsayılan Öncelik:** 5
- **Açıklama:** Yüklenmiş PDF, Word, Excel dosyaları
- **Kullanım Alanı:** Kılavuzlar, sözleşmeler, teknik dokümanlar

### 3. Chat Messages (Sohbet Mesajları)
- **Varsayılan Öncelik:** 3
- **Açıklama:** Önceki sohbet geçmişi ve soru-cevaplar
- **Kullanım Alanı:** FAQ oluşturma, sık sorulan soruları yanıtlama

### 4. Web Content (Web İçeriği)
- **Varsayılan Öncelik:** 4
- **Açıklama:** Crawler ile toplanan web sayfaları
- **Kullanım Alanı:** Haber, blog yazıları, dış kaynak bilgileri

## Öncelik Değerleri

| Değer | Anlam | Etki |
|-------|-------|------|
| 0 | Devre dışı | Kaynak aramaya dahil edilmez |
| 1-3 | Düşük öncelik | Diğer kaynaklar tercih edilir |
| 4-6 | Orta öncelik | Dengeli katkı |
| 7-9 | Yüksek öncelik | Sonuçlarda baskın |
| 10 | Maksimum öncelik | En yüksek ağırlık |

## Örnek Senaryolar

### Emlak Uygulaması (EmlakAI)
```
Database Content: 10  (İlanlar en önemli)
Documents: 3         (Sözleşmeler, evraklar)
Chat Messages: 2     (Önceki sorular)
Web Content: 5       (Piyasa haberleri)

Tablo Öncelikleri:
- ilan_detaylari: 10
- konum_bilgileri: 8
- fiyat_gecmisi: 6
```

### Hukuk Danışmanlığı (Vergilex)
```
Database Content: 5  (Mevzuat veritabanı)
Documents: 10        (Kanun metinleri, yönetmelikler)
Chat Messages: 4     (Önceki danışmanlıklar)
Web Content: 7       (Güncel mevzuat değişiklikleri)
```

### Müşteri Destek Botu
```
Database Content: 6  (Ürün bilgileri)
Documents: 8         (Kullanım kılavuzları)
Chat Messages: 10    (Önceki çözümler)
Web Content: 3       (Dış kaynaklar)
```

## Tablo Öncelikleri (Database Tab)

Database Settings sayfasında her tablo için ayrı öncelik ayarlayabilirsiniz:

1. **Settings > Database** sekmesine gidin
2. "Source Table Weights" bölümünü bulun
3. Her tablo için 1-10 arası öncelik belirleyin

### Tablo Öncelik Stratejisi

```
Yüksek Öncelik (8-10):
- Ana içerik tabloları (ürünler, ilanlar)
- Sık sorgulanan tablolar

Orta Öncelik (4-7):
- Detay tabloları (özellikler, kategoriler)
- Bağlantı tabloları

Düşük Öncelik (1-3):
- Log tabloları
- Arşiv verileri
- Nadiren kullanılan tablolar
```

## Soru Üretme Patterns

RAG Settings'teki "Question Generation Patterns" ile domain-spesifik soru şablonları tanımlayabilirsiniz:

### Pattern Yapısı
```json
{
  "name": "emlak",
  "keywords": "satılık|kiralık|daire|arsa|villa",
  "defaultQuestion": "{topic} hakkında detaylı bilgi verir misiniz?",
  "priority": 1,
  "combinations": [
    {
      "with": "fiyat,ücret",
      "question": "{topic} için fiyat aralığı nedir?"
    },
    {
      "with": "konum,bölge",
      "question": "{topic} hangi bölgelerde bulunuyor?"
    }
  ]
}
```

### Varsayılan Patterns
- **emlak:** Gayrimenkul sorguları
- **saglik:** Sağlık ve wellness
- **vergi:** Vergi ve mevzuat
- **genel:** Genel sorular (fallback)

## API Entegrasyonu

Backend'de bu öncelikler şu şekilde kullanılır:

```typescript
// rag-chat.service.ts
const weightedResults = results.map(result => ({
  ...result,
  score: result.similarity * getSourcePriority(result.source)
}));
```

## İpuçları

1. **Dengeli Başla:** İlk kurulumda varsayılan değerlerle başlayın
2. **Test Et:** Farklı sorularla sonuçları kontrol edin
3. **İteratif Ayarla:** Kullanıcı geri bildirimlerine göre optimize edin
4. **Sıfır Kullanın:** Kullanılmayan kaynakları 0 yaparak devre dışı bırakın
5. **Tablo Önceliklerini Unutmayın:** Database content yüksek olsa bile, düşük öncelikli tablolar az katkı sağlar

## Sorun Giderme

### Sonuçlar Beklenen Kaynaktan Gelmiyor
- İlgili kaynağın önceliğini artırın
- Diğer kaynakların önceliğini düşürün
- Similarity threshold'u kontrol edin

### Çok Fazla Alakasız Sonuç
- Öncelikleri düşürün
- Similarity threshold'u artırın (0.25 → 0.35)

### Yetersiz Sonuç
- Öncelikleri artırın
- Min/Max results değerlerini yükseltin
- Similarity threshold'u düşürün (0.25 → 0.15)

---

Son güncelleme: Aralık 2025
