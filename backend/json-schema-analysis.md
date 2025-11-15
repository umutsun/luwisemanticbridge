# JSON Schema Analizi - Mevcut vs Beklenen Yapı

## Sorun: Template Field'ları contentAnalysis İçinde Gömülü

### Şu Anki Yapı (Problemli):

```json
{
  "summary": "3 cümlelik özet",
  "keywords": ["anahtar1", "anahtar2"],
  "topics": ["konu1", "konu2"],
  "category": "Legal",
  "language": "tr",

  "focusKeywords": ["kanun", "madde", "yaptırım"],  // ✅ YENİ EKLEDİK
  "keywordMatches": {                                // ✅ YENİ EKLEDİK
    "kanun": ["cümle 1...", "cümle 2..."],
    "madde": ["cümle 3..."]
  },

  "extractedTables": [                               // ✅ YENİ EKLEDİK
    {
      "tableId": "table-1",
      "description": "Madde listesi",
      "rows": 10,
      "columns": 3,
      "data": [...]
    }
  ],

  "statistics": {
    "pageCount": 50,
    "wordCount": 15000
  },

  "structure": {
    "hasTableOfContents": true,
    "chapters": ["Bölüm 1", "Bölüm 2"]
  },

  "entities": {
    "people": ["Ali Veli"],
    "organizations": ["Maliye Bakanlığı"],
    "locations": ["Ankara"]
  },

  "dataQuality": {
    "score": 95,
    "hasStructuredData": true,
    "tableCount": 5
  },

  // ❌ SORUN: Template field'ları nested object içinde
  "contentAnalysis": {
    "kanunNo": "213",                           // Legal template için
    "maddeler": ["Madde 1: ...", "Madde 2: ..."],
    "yürürlükTarihi": "1961-01-10",
    "mevzuatTuru": "Kanun",
    "maddeSayisi": 520,
    "degisiklikler": ["..."],
    "yaptirimlar": ["Para cezası", "Hapis cezası"],
    "YetkiliKurum": "Maliye Bakanlığı",
    "documentType": "legal_document"
  }
}
```

### Sorunlar:

1. **Field Selector'da Gözükmeme**: `contentAnalysis.kanunNo` şeklinde nested access gerekiyor
2. **Template Target Fields Uyuşmazlığı**: Template'de `target_fields: ["kanunNo", "maddeler"]` flat ama response'da nested
3. **Transform Zorluğu**: SQL transform için `metadata->>'contentAnalysis'->>'kanunNo'` şeklinde double access gerekiyor
4. **UI Karmaşıklığı**: Frontend'de flat field selector gösteremiyoruz

---

## Çözüm: 3 Alternatif Yapı

### Alternatif 1: FLAT yapı (Template field'ları root level'da)

```json
{
  // BASE FIELDS (her template için ortak)
  "summary": "...",
  "keywords": [...],
  "topics": [...],
  "category": "Legal",
  "language": "tr",
  "focusKeywords": [...],
  "keywordMatches": {...},
  "extractedTables": [...],
  "statistics": {...},
  "structure": {...},
  "entities": {...},
  "dataQuality": {...},

  // TEMPLATE-SPECIFIC FIELDS (root level'da, direkt erişilebilir)
  "kanunNo": "213",                           // ✅ Flat access
  "maddeler": ["Madde 1: ...", "Madde 2: ..."],
  "yürürlükTarihi": "1961-01-10",
  "mevzuatTuru": "Kanun",
  "maddeSayisi": 520,
  "degisiklikler": [...],
  "yaptirimlar": ["Para cezası", "Hapis cezası"],
  "YetkiliKurum": "Maliye Bakanlığı",
  "documentType": "legal_document"
}
```

**Avantajlar:**
- ✅ Field selector direkt `kanunNo`, `maddeler` görebilir
- ✅ SQL transform: `metadata->>'kanunNo'` tek seviye
- ✅ Template target_fields ile 1:1 uyumlu
- ✅ Frontend'de kolay render

**Dezavantajlar:**
- ❌ Template değişince root level kirleniyor
- ❌ Field collision riski (novel'de de "title" varsa, legal'de de)

---

### Alternatif 2: Hybrid (Base + Template Object)

```json
{
  // BASE FIELDS
  "summary": "...",
  "keywords": [...],
  "topics": [...],
  "category": "Legal",
  "language": "tr",
  "focusKeywords": [...],
  "keywordMatches": {...},
  "extractedTables": [...],
  "statistics": {...},
  "structure": {...},
  "entities": {...},
  "dataQuality": {...},

  // TEMPLATE DATA (prefix ile grouped ama flat)
  "template": "legal",
  "legal_kanunNo": "213",                     // ✅ Prefixed flat
  "legal_maddeler": ["Madde 1: ..."],
  "legal_yürürlükTarihi": "1961-01-10",
  "legal_mevzuatTuru": "Kanun",
  "legal_maddeSayisi": 520,
  "legal_degisiklikler": [...],
  "legal_yaptirimlar": [...],
  "legal_YetkiliKurum": "Maliye Bakanlığı"
}
```

**Avantajlar:**
- ✅ Field collision önleniyor (prefix ile)
- ✅ Flat access
- ✅ Template değişince hangi field'lar geldiği belli

**Dezavantajlar:**
- ❌ Field isimleri uzuyor (`legal_kanunNo`)
- ❌ Field selector'da prefix göstermek gerekiyor

---

### Alternatif 3: İki Seviye Object (Recommended)

```json
{
  // COMMON METADATA (ortak, her zaman var)
  "common": {
    "summary": "...",
    "keywords": [...],
    "topics": [...],
    "category": "Legal",
    "language": "tr",
    "focusKeywords": [...],
    "keywordMatches": {...},
    "extractedTables": [...],
    "statistics": {...},
    "structure": {...},
    "entities": {...},
    "dataQuality": {...}
  },

  // TEMPLATE DATA (template'e özel, değişken)
  "templateData": {
    "template": "legal",
    "fields": {
      "kanunNo": "213",
      "maddeler": ["Madde 1: ..."],
      "yürürlükTarihi": "1961-01-10",
      "mevzuatTuru": "Kanun",
      "maddeSayisi": 520,
      "degisiklikler": [...],
      "yaptirimlar": [...],
      "YetkiliKurum": "Maliye Bakanlığı"
    }
  }
}
```

**Avantajlar:**
- ✅ Clean separation (common vs template-specific)
- ✅ Field selector: `common.*` ve `templateData.fields.*` ayrı gösterebilir
- ✅ SQL transform: `metadata->'templateData'->'fields'->>'kanunNo'`
- ✅ Template switch kolaylaşıyor

**Dezavantajlar:**
- ❌ Nested access (ama organize)

---

## 3 PDF Örneği

### 1. Legal: 213-Vergi Usul Kanunu

```json
{
  "common": {
    "summary": "Vergi Usul Kanunu, vergi sisteminin usul ve esaslarını düzenleyen temel kanundur.",
    "keywords": ["vergi", "kanun", "madde", "yaptırım", "mükellef"],
    "topics": ["Vergi Hukuku", "İdare Hukuku"],
    "category": "Legal",
    "language": "tr",
    "focusKeywords": ["kanun", "madde", "yaptırım"],
    "keywordMatches": {
      "kanun": ["Bu Kanun 04/01/1961 tarihinde kabul edilmiştir."],
      "madde": ["Madde 1 - Bu Kanunun adı Vergi Usul Kanunudur."],
      "yaptırım": ["Vergi kaçıranlar hakkında para cezası ve hapis cezası uygulanır."]
    },
    "extractedTables": [
      {
        "tableId": "table-1",
        "description": "Vergi ceza oranları tablosu",
        "rows": 15,
        "columns": 3,
        "data": [["Fiil", "Para Cezası", "Hapis"], ...]
      }
    ],
    "statistics": {
      "pageCount": 350,
      "wordCount": 85000,
      "sentenceCount": 4200
    },
    "entities": {
      "organizations": ["Maliye Bakanlığı", "Gelir İdaresi Başkanlığı"],
      "locations": ["Ankara"],
      "dates": ["04/01/1961", "01/01/1962"]
    }
  },
  "templateData": {
    "template": "legal",
    "fields": {
      "kanunNo": "213",
      "maddeler": ["Madde 1 - Bu Kanunun adı Vergi Usul Kanunudur.", "Madde 2 - ...", ...],
      "yürürlükTarihi": "01/01/1962",
      "mevzuatTuru": "Kanun",
      "maddeSayisi": 520,
      "degisiklikler": ["5228 sayılı Kanun ile değişiklik", "6009 sayılı Kanun ile değişiklik"],
      "yaptirimlar": ["Para cezası", "Hapis cezası", "Vergi ziyaı cezası"],
      "YetkiliKurum": "Maliye Bakanlığı"
    }
  }
}
```

---

### 2. Novel: Jitterbug Perfume (Tom Robbins)

```json
{
  "common": {
    "summary": "Jitterbug Perfume is a novel about immortality, perfume, and the search for the perfect scent across centuries.",
    "keywords": ["immortality", "perfume", "Alobar", "Kudra", "beets", "Pan"],
    "topics": ["Fiction", "Philosophy", "Love"],
    "category": "Literature",
    "language": "en",
    "focusKeywords": ["Alobar", "Kudra", "immortality", "beet"],
    "keywordMatches": {
      "Alobar": ["Alobar was the king of a city-state...", "Alobar's journey began..."],
      "Kudra": ["Kudra was a beautiful rope dancer...", "Kudra's wisdom..."],
      "immortality": ["The secret to immortality lay in breathing...", "Immortality was not a gift..."],
      "beet": ["The beet is the most intense of vegetables...", "Beets held mystical properties..."]
    },
    "extractedTables": [],
    "statistics": {
      "pageCount": 342,
      "wordCount": 95000,
      "sentenceCount": 8500
    },
    "entities": {
      "people": ["Alobar", "Kudra", "Priscilla", "Pan", "V'lu"],
      "locations": ["Seattle", "New Orleans", "Paris", "India"],
      "dates": ["8th century", "1980s"]
    }
  },
  "templateData": {
    "template": "novel",
    "fields": {
      "mainCharacters": ["Alobar", "Kudra", "Priscilla", "V'lu", "Pan"],
      "narrativeStyle": "third_person",
      "genre": "fiction_novel",
      "plotThemes": ["immortality", "love", "perfume", "philosophy", "mythology"],
      "setting": "Multiple time periods (8th century to 1980s), multiple locations (India, Paris, Seattle, New Orleans)"
    }
  }
}
```

---

### 3. Sheet Music: gel_gonlumu_yerden_yere

```json
{
  "common": {
    "summary": "Türk halk müziği türküsü. Hüzünlü bir aşk şarkısı. Gönül acısını dile getiriyor.",
    "keywords": ["türkü", "gönül", "aşk", "hüzün", "halk müziği"],
    "topics": ["Türk Halk Müziği", "Aşk Şarkıları"],
    "category": "Music",
    "language": "tr",
    "focusKeywords": ["makam", "usul", "güfte", "beste"],
    "keywordMatches": {
      "makam": ["Bu eser Hüseyni makamındadır."],
      "usul": ["9/8 usulünde yazılmıştır."],
      "güfte": ["Güfte: Gel gönlümü yerden yere vurma / Bu gönül seni sever durma durma"],
      "beste": ["Besteci bilgisi nota üzerinde belirtilmemiş."]
    },
    "extractedTables": [
      {
        "tableId": "chord-progression",
        "description": "Akor dizisi",
        "rows": 4,
        "columns": 8,
        "data": [["Am", "Dm", "E7", "Am", "F", "Dm", "E7", "Am"]]
      }
    ],
    "statistics": {
      "pageCount": 2,
      "wordCount": 150,
      "sentenceCount": 12
    },
    "entities": {
      "people": [],
      "organizations": [],
      "locations": []
    }
  },
  "templateData": {
    "template": "sheet_music",
    "fields": {
      "title": "Gel Gönlümü Yerden Yere",
      "composer": "Anonim",
      "lyricist": "Anonim",
      "genre": "Türkü",
      "key": "La minör",
      "makam": "Hüseyni",
      "usul": "Aksak (9/8)",
      "timeSignature": "9/8",
      "tempo": "Andante",
      "lyrics": "Gel gönlümü yerden yere vurma\nBu gönül seni sever durma durma\nŞu dağların karı erirse\nGözlerimin yaşı kurur mu\nKurur mu kurur mu kurur mu",
      "chords": ["Am", "Dm", "E7", "Am", "F", "Dm", "E7", "Am"],
      "musicalNotation": "la-si-do-re-mi notalarından oluşan melodik yapı",
      "language": "Turkish",
      "arranger": "Bilinmiyor",
      "publisher": "",
      "copyright": "Halk müziği - kamu malı",
      "difficulty": "intermediate",
      "instruments": ["ses", "bağlama", "piyano"],
      "form": "Türkü"
    }
  }
}
```

---

## Hangi Yapıyı Seçelim?

**Önerim: Alternatif 3 (İki Seviye Object)**

Sebepleri:
1. ✅ Clean separation (common vs template)
2. ✅ Field selector'da organize görünüm
3. ✅ Template değişince sadece `templateData.fields` değişiyor
4. ✅ SQL transform: `metadata->'common'->'focusKeywords'` ve `metadata->'templateData'->'fields'->'kanunNo'`
5. ✅ Nested ama mantıklı bir organizasyon

**Senin tercihin hangisi?**
