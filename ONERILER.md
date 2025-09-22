# Önerilen Değişiklikler

## 1. Backend: Akıllı Soru Seçimi (rag-chat.service.ts)

```typescript
selectSmartQuestions(questions: string[], count: number): string[] {
  // Kategorilere ayır
  const categories = {
    'KDV': questions.filter(q => q.includes('KDV')),
    'vergi': questions.filter(q => q.includes('vergi') && !q.includes('KDV')),
    'e-': questions.filter(q => q.includes('e-')),
    'diğer': questions.filter(q => !q.includes('KDV') && !q.includes('vergi') && !q.includes('e-'))
  };

  // Her kategoriden dengeli seçim yap
  const selected = [];
  const categoryKeys = Object.keys(categories);

  for (let i = 0; i < count && i < categoryKeys.length; i++) {
    const category = categoryKeys[i];
    if (categories[category].length > 0) {
      selected.push(categories[category][0]);
    }
  }

  return selected.slice(0, count);
}
```

## 2. Frontend: Anlamlı Kaynak Gösterimi (page.tsx)

```typescript
// Kaynak başlığını düzenle
const formatSourceTitle = (source: any) => {
  const cleanTitle = source.title?.replace(/ - ID: \d+/g, '').replace(/^sorucevap -\s*/, '').trim();
  const category = source.category || '';
  const sourceType = getTableDisplayName(source.sourceTable);

  return `${cleanTitle} (${category})`;
};

// Özeti kısalt ve anlamlı hale getir
const formatSourceExcerpt = (source: any) => {
  const excerpt = source.excerpt || source.content || '';
  // İlk 100 karakter, noktadan sonra kes
  const short = excerpt.substring(0, 100);
  const lastDot = short.lastIndexOf('.');

  return lastDot > 50 ? short.substring(0, lastDot + 1) : short + '...';
};
```

## 3. Progress Göstergesi (CSS)

```css
.source-progress {
  height: 2px;
  background: #e5e7eb;
  border-radius: 1px;
  overflow: hidden;
  margin-top: 4px;
}

.source-progress-bar {
  height: 100%;
  background: #3b82f6;
  transition: width 0.3s ease;
}
```

## 4. Tıklayınca Düşen Prompt (Zaten güncelledik)

Mevcut implementasyonumuz zaten doğal dilde sorular üretiyor.
Örnek: "E-defter zorunluluğu hakkında detaylı bilgi ve örnekler verebilir misin?"
```

## 5. Öncelik Sırası

1. **Backend akıllı soru seçimi** - İlk 4 soruyu daha çeşitli hale getir
2. **Frontend kaynak gösterimi** - Başlık ve özetleri anlamlı hale getir
3. **Progress bar** - Minimal relevance göstergesi ekle
4. **Test et** - Kullanıcı deneyimini gözlemle