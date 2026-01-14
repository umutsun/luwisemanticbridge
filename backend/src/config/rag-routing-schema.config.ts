/**
 * RAG Routing Schema Configuration
 *
 * Bu dosya RAG response formatları için default schema tanımlar.
 * Schema, settings tablosundan dinamik olarak override edilebilir.
 *
 * 4 Route Tipi:
 * 1. NEEDS_CLARIFICATION - Belirsiz/kısa sorgular
 * 2. OUT_OF_SCOPE - Kapsam dışı sorgular
 * 3. NOT_FOUND - Kaynak bulunamadı
 * 4. FOUND - Kaynak bulundu (mini-makale formatı)
 */

import { RAGRoutingSchema } from '../types/settings.types';

/**
 * Default RAG Routing Schema
 * Vergilex için optimize edilmiş default değerler
 */
export const DEFAULT_RAG_ROUTING_SCHEMA: RAGRoutingSchema = {
  version: '1.0',

  routes: {
    // ═══════════════════════════════════════════════════════════════
    // A) NEEDS_CLARIFICATION - Belirsiz Sorgular
    // ═══════════════════════════════════════════════════════════════
    NEEDS_CLARIFICATION: {
      triggers: {
        patterns: ['singleToken', 'justNumbers', 'vagueQuestion', 'tooShort']
      },
      format: {
        type: 'clarification',
        showSources: false,
        maxSuggestions: 3,
        template: 'Sorunuzu daha iyi anlayabilmem için lütfen daha fazla bilgi verin.',
        templateEn: 'Please provide more details so I can better understand your question.'
      }
    },

    // ═══════════════════════════════════════════════════════════════
    // B) OUT_OF_SCOPE - Kapsam Dışı
    // ═══════════════════════════════════════════════════════════════
    OUT_OF_SCOPE: {
      triggers: {
        patterns: ['outOfScopePattern', 'nonTaxLaw', 'greeting'],
        conditions: ['outOfScope']
      },
      format: {
        type: 'single_line',
        showSources: false,
        template: 'Bu soru Vergilex kapsamı dışındadır. Türk vergi mevzuatı ile ilgili sorularınızda yardımcı olabilirim.',
        templateEn: 'This question is outside Vergilex scope. I can help with questions about Turkish tax legislation.'
      }
    },

    // ═══════════════════════════════════════════════════════════════
    // C) NOT_FOUND - Kaynak Bulunamadı
    // ═══════════════════════════════════════════════════════════════
    NOT_FOUND: {
      triggers: {
        conditions: ['noResults', 'inScope']
      },
      format: {
        type: 'single_line',
        showSources: false,
        maxSuggestions: 2,
        template: 'Sorunuzla ilgili kaynak bulunamadı. Soruyu daha spesifik hale getirmeyi deneyebilirsiniz.',
        templateEn: 'No sources found for your question. Try making your question more specific.'
      }
    },

    // ═══════════════════════════════════════════════════════════════
    // D) FOUND - Kaynak Bulundu (Mini-Makale Formatı)
    // ═══════════════════════════════════════════════════════════════
    FOUND: {
      triggers: {
        conditions: ['hasResults']
      },
      format: {
        type: 'article',
        showSources: true,

        // Akademik Makale Formatı - 4 Bölüm
        // systemGenerated: true → Backend üretir, LLM yazmaz
        // systemGenerated: false/undefined → LLM yazar
        articleSections: [
          {
            id: 'keywords',
            title: 'Anahtar Terimler',
            titleEn: 'Key Terms',
            required: false,
            systemGenerated: true,  // Backend üretir (sources metadata'dan)
            description: '5-10 terim: soru + kaynaklarda geçen temel terimler.',
            descriptionEn: '5-10 terms: key terms from question + sources.'
          },
          {
            id: 'assessment',
            title: 'Değerlendirme',
            titleEn: 'Assessment',
            required: true,
            systemGenerated: false,  // LLM yazar
            description: 'SADECE sources\'tan hareketle değerlendirme yaz. Birden fazla paragraf kullan (en az 2 paragraf). Her önemli bilgiden sonra dipnot ekle [1], [2]. Paragraflar şık bir şekilde formatla. VERDICT SORULARINDA (zorunda mıyım/yapabilir miyim/yasak mı/gerekir mi): Eğer kaynaklarda AÇIK ve NET hüküm cümlesi yoksa, "Kaynaklarda bu konuda açık bir düzenleme bulunamamıştır" cümlesini mutlaka yaz ve kesin hüküm verme.',
            descriptionEn: 'Evaluate based ONLY on sources. Use multiple paragraphs (min 2). Add footnotes [1], [2] after important information. Format paragraphs elegantly. VERDICT QUESTIONS (must I/can I/is it prohibited/is it required): If sources have NO EXPLICIT ruling, MUST write "No clear regulation found in sources on this matter" and do NOT give definitive ruling.'
          }
        ],

        // Grounding Kuralları - Verdict Koruması
        groundingRules: {
          tr: `⛔ SEN SCOPE/KAPSAM KONTROLÜ YAPMIYORSUN!
- "Bu konu kapsam dışı / Vergilex dışında / scope dışı" GİBİ İFADELER YASAK
- Sen bir RAG yanıt üreticisin, scope classifier DEĞİLSİN
- Sana sources verildi → bunlardan metin üret, başka hiçbir şey yapma

KRİTİK KURAL (Karar sende değil):
- "NEEDS_CLARIFICATION / OUT_OF_SCOPE / NOT_FOUND / FOUND" gibi sınıflandırmalar yapma, bunları yazma.
- Yalnızca sources içeriğine dayan. Kaynakta olmayanı ekleme.
- Çelişki varsa açıkça belirt; öncelik sıralamasıyla ağırlıklandır:
  1) Kanun / CBK / Yönetmelik
  2) Tebliğ / Genel Tebliğ / Uygulama Tebliği
  3) Rehber / Sirküler / İdari açıklamalar
  4) Yargı kararları
  5) Özelgeler
  6) Makaleler / ikincil yorum ve Dokümanlar
  7) Soru/Cevap
- Aynı seviyede birden fazla kaynak varsa: tarih olarak daha yeni olanı öncele.
- Metin içinde dipnotları [1], [2] şeklinde kullan. Dipnot numarası sources sırasına bağlı kalmalı (sources sırasını değiştirme).
- Kesin hüküm (evet/hayır) isteyen sorularda: kaynak açık ve net demiyorsa kesin konuşma; "kaynaklarda doğrudan net ifade seçilemedi" diye temkinli yaz.`,
          en: `1. Only cite law/article numbers if they EXPLICITLY appear in source text. Do NOT invent references not in sources.
2. For verdict questions ("must I", "can I", "is it prohibited"): If no EXPLICIT ruling in sources, say "No clear regulation found in sources on this matter."
3. Use definitive statements ("required", "prohibited", "possible", "mandatory") ONLY if source explicitly states so verbatim.
4. When uncertain: Use hedged academic language like "According to sources...", "...may be considered as", "...appears to be".
5. For conflicting sources: Present both views, explain which is more recent/higher norm.`
        },

        // Kaynak Öncelik Sırası (yüksekten düşüğe)
        sourcePriority: [
          { type: 'kanun', label: 'Kanun/Yönetmelik', priority: 1 },
          { type: 'teblig', label: 'Tebliğ/Genel Tebliğ/Sirküler', priority: 2 },
          { type: 'rehber', label: 'Resmî rehber', priority: 3 },
          { type: 'yargi', label: 'Yargı kararı', priority: 4 },
          { type: 'ozelge', label: 'Özelge', priority: 5 },
          { type: 'makale', label: 'Makale', priority: 6 }
        ],

        // Dipnot Format Şablonları
        // NOT: Dipnotlar artık backend'de sources metadata'dan üretiliyor (generateFootnotes)
        // LLM dipnot yazmıyor, sadece metin içinde [1], [2] şeklinde atıf yapıyor
        footnoteFormat: {
          makale: 'yazar, başlık, dergi adı, tarih, sayı (+ varsa cilt/sayfa)',
          ozelge: 'tarih + sayı (+ mümkünse birim)',
          yargi: 'daire, tarih, E. No, K. No',
          pdf: 'doküman adı + yayımlayan kurum + tarih (+ varsa sayfa/bölüm)',
          kanun: 'kanun adı, madde numarası, fıkra (varsa)',
          teblig: 'tebliğ adı, tarih, sayı',
          sorucevap: '' // Kullanılabilir ama dipnot basılmaz
        },

        // Çelişki Yönetimi
        conflictHandling: {
          showConflict: true,
          preferNewer: true,
          preferHigherNorm: true
        },

        // Yasak İçerikler
        prohibitedContent: [
          'Arama sonucu',
          'X belge bulundu',
          'ALINTI',
          'Bulunan belgeler',
          'Dipnotlar',
          'Dipnot',
          'Footnotes',
          'Kaynaklar listesi'
        ],

        template: '' // Article format uses articleSections
      }
    }
  },

  // ═══════════════════════════════════════════════════════════════
  // Global Settings
  // ═══════════════════════════════════════════════════════════════
  globalSettings: {
    domainMode: 'TAX_ONLY',

    // Domain terimleri (vergi alanı)
    domainTerms: [
      'vergi', 'kdv', 'beyanname', 'mükellef', 'fatura', 'matrah', 'stopaj',
      'tevkifat', 'muafiyet', 'istisna', 'kanun', 'madde', 'tebliğ', 'özelge',
      'levha', 'vuk', 'gvk', 'kvk', 'damga', 'ötv', 'emlak', 'gelir',
      'kurumlar', 'katma değer', 'harç', 'tahakkuk', 'tahsilat', 'iade',
      'indirim', 'ceza', 'uzlaşma', 'defter', 'belge', 'e-fatura', 'e-defter'
    ],

    // Kapsam dışı pattern'lar
    outOfScopePatterns: [
      'einstein|newton|shakespeare|picasso',
      'hava\\s+durumu|weather',
      'futbol|basketbol|spor|maç',
      'yemek\\s+tarifi|recipe',
      'film|dizi|sinema|movie',
      '^(merhaba|selam|hello|hi|hey)\\s*\\?*$',
      'astroloji|burç|horoscope'
    ],

    // Vergi dışı kanun pattern'ları (TAX_ONLY modda OUT_OF_SCOPE)
    nonTaxLawPatterns: [
      'medeni\\s*kanun',
      '\\btmk[\'\\u2019]?\\w*',
      'borçlar\\s*kanun',
      '\\btbk[\'\\u2019]?\\w*',
      'ceza\\s*kanun',
      '\\btck[\'\\u2019]?\\w*',
      'ticaret\\s*kanun',
      '\\bttk[\'\\u2019]?\\w*',
      'iş\\s*kanun',
      'miras\\s*(payı|hukuk|bırakan)',
      '(velayet|nafaka|boşanma)',
      'kira\\s*(artış|sözleşme|bedeli)',
      '(tahliye|kiracı\\s*hakk)',
      '(tazminat\\s*davas|haksız\\s*fiil)'
    ],

    // Belirsizlik pattern'ları
    ambiguityPatterns: {
      justNumbers: '^\\d+$',
      vagueQuestion: '^(ne|nasıl|nedir|neden|kim)\\s*\\??$',
      singleToken: '^\\S+$',
      tooShort: '' // Word count < 2 && no question mark
    }
  }
};

/**
 * Get RAG Routing Schema with overrides from settings
 */
export function getRAGRoutingSchema(settingsOverride?: Partial<RAGRoutingSchema>): RAGRoutingSchema {
  if (!settingsOverride) {
    return DEFAULT_RAG_ROUTING_SCHEMA;
  }

  // Deep merge with defaults
  return {
    ...DEFAULT_RAG_ROUTING_SCHEMA,
    ...settingsOverride,
    routes: {
      ...DEFAULT_RAG_ROUTING_SCHEMA.routes,
      ...(settingsOverride.routes || {}),
    },
    globalSettings: {
      ...DEFAULT_RAG_ROUTING_SCHEMA.globalSettings,
      ...(settingsOverride.globalSettings || {}),
    }
  };
}

/**
 * Validate RAG Routing Schema
 */
export function validateRAGRoutingSchema(schema: any): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!schema.version) {
    errors.push('Missing version');
  }

  if (!schema.routes) {
    errors.push('Missing routes');
  } else {
    const requiredRoutes = ['NEEDS_CLARIFICATION', 'OUT_OF_SCOPE', 'NOT_FOUND', 'FOUND'];
    for (const route of requiredRoutes) {
      if (!schema.routes[route]) {
        errors.push(`Missing route: ${route}`);
      } else if (!schema.routes[route].format) {
        errors.push(`Missing format for route: ${route}`);
      }
    }
  }

  if (!schema.globalSettings) {
    errors.push('Missing globalSettings');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}
