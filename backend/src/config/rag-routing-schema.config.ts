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

        // 4 Zorunlu Başlık (Murat'ın istediği format)
        articleSections: [
          {
            id: 'topic',
            title: 'Soru hangi konu veya konularla ilgili?',
            required: true,
            description: 'Sorunun ana konusunu ve ilgili alt konuları belirt'
          },
          {
            id: 'keywords',
            title: 'Soruyla ilgili anahtar kelimeler neler?',
            required: true,
            description: 'Konuyla ilgili teknik terimler ve anahtar kavramlar'
          },
          {
            id: 'regulations',
            title: 'Yasal düzenlemeler neler (Kanun, Tebliğ vb.)?',
            required: true,
            description: 'İlgili kanun maddeleri, tebliğler, yönetmelikler'
          },
          {
            id: 'assessment',
            title: 'Vergilex değerlendirmesi',
            required: true,
            footnoteRequired: true,
            description: 'Kaynaklara dayalı değerlendirme ve sonuç'
          }
        ],

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
          'Bulunan belgeler'
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
