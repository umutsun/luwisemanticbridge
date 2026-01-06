-- Migration: RAG Configuration Schema
-- Date: 2026-01-06
-- Description: Complete RAG configuration - all prompts, patterns, and settings from database
-- This removes ALL hardcoded values from rag-chat.service.ts

-- =============================================
-- STRICT MODE PROMPTS
-- =============================================

-- Turkish Strict Mode Prompt
INSERT INTO settings (key, value, category, description)
VALUES (
  'ragSettings.strictModePromptTr',
  'Aşağıda numaralanmış kaynaklar var. Her kaynağın Tür ve Başlık bilgisi şemada yazılı.

⚠️ ÖNCELİKLİ KURAL 1 - KAYNAK UYUMU:
Önce kaynakların SORU ile ilgili olup olmadığını kontrol et.
- Soruda geçen ANAHTAR KELİMELER kaynakta var mı?
- EĞER HİÇBİR KAYNAK SORUYLA DOĞRUDAN İLGİLİ DEĞİLSE → kesin hüküm kurma.

⚠️ ÖNCELİKLİ KURAL 2 - ALINTI HÜKÜM CÜMLESİ OLMALI:
ALINTI sadece HÜKÜM/SONUÇ cümlesi olabilir ("mümkündür", "uygundur", "yapılmalıdır" gibi).
❌ ALINTI OLAMAZ:
- "KONU: ... hk." satırları (bunlar soru başlığı, kanıt değil)
- "İLGİ: ..." satırları
- "Dilekçenizde ... sorulmaktadır" cümleleri
- Sadece soru tekrarı olan metinler
✅ ALINTI OLMALI:
- "... mümkündür/uygundur/yapılmalıdır ..." gibi karar cümlesi
- "... öngörülmüştür/belirlenmiştir ..." gibi hüküm cümlesi

FORMAT:

**CEVAP**
[Tek sade cümle ile doğrudan cevap] [Kaynak X]

**ALINTI**
"[HÜKÜM CÜMLESİ - mümkündür/uygundur/yapılmalıdır içeren]" — Tür: [ŞEMADAN AL], Başlık: [ŞEMADAN AL] [Kaynak X]

KRİTİK KURALLAR:
1. ❌ ALAKASIZ KAYNAKTAN KESİN HÜKÜM KURMA
2. ❌ "KONU/İLGİ" SATIRLARINI ALINTI OLARAK KULLANMA - bunlar kanıt değil!
3. ✅ ALINTI mutlaka hüküm/sonuç cümlesi olmalı
4. Sorudaki anahtar kelimeler alıntıda da olmalı
5. CEVAP kısa olsun - SADECE kaynakta yazan bilgiyi özetle
6. ⚠️ İÇİNDEKİLER UYARISI olan kaynakları KULLANMA
7. SoruCevap/Özelge kaynağını TERCİH ET
8. Tür ve Başlık''ı ŞEMADAN KOPYALA

ÖRNEK YANLIŞ ALINTI:
"KONU: Vergi levhasının araçlarda bulundurulmasının mümkün olup olmadığı hk." ❌ Bu soru başlığı, kanıt değil!

ÖRNEK DOĞRU ALINTI:
"Nakliye araçlarınızda vergi levhanızın fotokopilerinin bulundurulması mümkündür." ✅ Bu hüküm cümlesi!',
  'rag',
  'Turkish strict mode prompt - requires verdict sentences as quotes'
)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, description = EXCLUDED.description;

-- English Strict Mode Prompt
INSERT INTO settings (key, value, category, description)
VALUES (
  'ragSettings.strictModePromptEn',
  'Sources are numbered below. Each source has Type and Title in the schema.

⚠️ PRIORITY RULE 1 - SOURCE RELEVANCE:
First check if sources are RELEVANT to the question.
- Do the KEY TERMS from the question appear in the source?
- IF NO SOURCE IS DIRECTLY RELEVANT → do not make definitive claims.

⚠️ PRIORITY RULE 2 - QUOTE MUST BE A VERDICT SENTENCE:
QUOTE must be a VERDICT/CONCLUSION sentence (containing "is permitted", "is appropriate", "must be done", etc.).
❌ CANNOT BE A QUOTE:
- "SUBJECT: ... regarding..." lines (these are question titles, not evidence)
- "REFERENCE: ..." lines
- "In your petition ... you asked" sentences
- Text that merely restates the question
✅ MUST BE A QUOTE:
- "... is permitted/appropriate/must be done ..." verdict sentences
- "... has been determined/established ..." conclusion sentences

FORMAT:

**ANSWER**
[Single concise sentence with direct answer] [Source X]

**QUOTE**
"[VERDICT SENTENCE - containing is permitted/appropriate/must be done]" — Type: [COPY FROM SCHEMA], Title: [COPY FROM SCHEMA] [Source X]

CRITICAL RULES:
1. ❌ NEVER make definitive claims from IRRELEVANT sources
2. ❌ NEVER use "SUBJECT/REFERENCE" lines as quotes - they are not evidence!
3. ✅ QUOTE must be a verdict/conclusion sentence
4. Key terms from question must appear in the quote
5. ANSWER must be short - ONLY summarize what is in the source
6. ⚠️ DO NOT use sources marked with TOC WARNING
7. PREFER Q&A/Ruling sources
8. Copy Type and Title FROM SCHEMA

EXAMPLE WRONG QUOTE:
"SUBJECT: Whether tax certificates can be kept in vehicles." ❌ This is a question title, not evidence!

EXAMPLE CORRECT QUOTE:
"Keeping copies of your tax certificate in your transport vehicles is permitted." ✅ This is a verdict sentence!',
  'rag',
  'English strict mode prompt - requires verdict sentences as quotes'
)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, description = EXCLUDED.description;

-- =============================================
-- FAST MODE PROMPTS
-- =============================================

INSERT INTO settings (key, value, category, description)
VALUES (
  'ragSettings.fastModePromptTr',
  'Bağlam bilgilerine dayanarak yaklaşık {maxLength} karakter uzunluğunda kapsamlı bir yanıt yaz. Kaynak referansı olmadan doğal paragraflar yaz. ASLA [1], [2], [3] gibi kaynak işaretleri KULLANMA - kaynaklar ayrıca gösterilecek.',
  'rag',
  'Turkish fast mode prompt template. Supports {maxLength} placeholder.'
)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, description = EXCLUDED.description;

INSERT INTO settings (key, value, category, description)
VALUES (
  'ragSettings.fastModePromptEn',
  'Write a comprehensive answer of approximately {maxLength} characters based on the context. Write natural paragraphs without citations. NEVER use [1], [2], [3] or any citation markers - sources are shown separately.',
  'rag',
  'English fast mode prompt template. Supports {maxLength} placeholder.'
)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, description = EXCLUDED.description;

-- =============================================
-- NO RESULTS MESSAGES
-- =============================================

INSERT INTO settings (key, value, category, description)
VALUES (
  'ragSettings.noResultsMessageTr',
  'Bu konuda yeterli bilgi bulunamadı. Daha spesifik bir soru sorarak veya farklı anahtar kelimelerle tekrar deneyebilirsiniz.',
  'rag',
  'Turkish message when no results found'
)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, description = EXCLUDED.description;

INSERT INTO settings (key, value, category, description)
VALUES (
  'ragSettings.noResultsMessageEn',
  'I couldn''t find relevant information for your question. Please try rephrasing or using different keywords.',
  'rag',
  'English message when no results found'
)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, description = EXCLUDED.description;

-- =============================================
-- FOLLOW-UP INSTRUCTIONS
-- =============================================

INSERT INTO settings (key, value, category, description)
VALUES (
  'ragSettings.followUpInstructionTr',
  '[DAHİLİ: Konuşma geçmişini bağlam olarak kullan. Bunun önceki bir soruyla ilgili olduğundan BAHSETME - doğal bir sohbet devam ediyormuş gibi yanıt ver.]',
  'rag',
  'Turkish instruction for follow-up questions'
)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, description = EXCLUDED.description;

INSERT INTO settings (key, value, category, description)
VALUES (
  'ragSettings.followUpInstructionEn',
  '[INTERNAL: Use conversation history for context. Do NOT mention that this relates to a previous question - answer naturally as if continuing a conversation.]',
  'rag',
  'English instruction for follow-up questions'
)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, description = EXCLUDED.description;

-- =============================================
-- SOURCE TYPE NORMALIZATIONS (JSON)
-- =============================================

INSERT INTO settings (key, value, category, description)
VALUES (
  'ragSettings.sourceTypeNormalizations',
  '{
    "csv_sorucevap": "SoruCevap",
    "sorucevap": "SoruCevap",
    "csv_ozelge": "Özelge",
    "csv_danistaykararlari": "Danıştay Kararı",
    "csv_makale": "Makale",
    "csv_makale_arsiv_2021": "Makale",
    "csv_makale_arsiv_2022": "Makale",
    "document_embeddings": "Döküman",
    "crawler": "Web Kaynağı"
  }',
  'rag',
  'JSON mapping of source_type values to display names'
)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, description = EXCLUDED.description;

-- =============================================
-- PREFERRED SOURCE TYPES (for prioritization)
-- =============================================

INSERT INTO settings (key, value, category, description)
VALUES (
  'ragSettings.preferredSourceTypes',
  '["sorucevap", "csv_sorucevap", "soru-cevap", "q&a", "ozelge", "csv_ozelge"]',
  'rag',
  'JSON array of preferred source types in priority order'
)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, description = EXCLUDED.description;

-- =============================================
-- TOC DETECTION CONFIGURATION
-- =============================================

INSERT INTO settings (key, value, category, description)
VALUES (
  'ragSettings.tocDetection',
  '{
    "minDotSequence": 5,
    "minDotRatio": 0.1,
    "maxContentLength": 300,
    "patterns": [
      "\\.{5,}",
      "…{3,}",
      "\\.{3,}\\s*\\d{2,4}\\s+\\d+\\."
    ]
  }',
  'rag',
  'JSON configuration for Table of Contents detection'
)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, description = EXCLUDED.description;

-- =============================================
-- POST-PROCESSOR PATTERNS
-- =============================================

-- HTML Cleaning Patterns
INSERT INTO settings (key, value, category, description)
VALUES (
  'ragSettings.htmlCleaningPatterns',
  '[
    {"pattern": "<br\\s*/?>", "replacement": " "},
    {"pattern": "</?(p|div|span|strong|em|b|i)>", "replacement": ""},
    {"pattern": "&nbsp;", "replacement": " "},
    {"pattern": "&amp;", "replacement": "&"},
    {"pattern": "&lt;", "replacement": "<"},
    {"pattern": "&gt;", "replacement": ">"},
    {"pattern": "&quot;", "replacement": "\""}
  ]',
  'rag',
  'JSON array of HTML patterns to clean from responses'
)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, description = EXCLUDED.description;

-- Quote Prefix Patterns (to remove)
INSERT INTO settings (key, value, category, description)
VALUES (
  'ragSettings.quotePrefixPatterns',
  '["Cevap:", "Soru:", "Yanıt:", "Answer:", "Question:", "Response:"]',
  'rag',
  'JSON array of prefixes to remove from quotes'
)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, description = EXCLUDED.description;

-- Generic Title Patterns (to replace with actual titles)
INSERT INTO settings (key, value, category, description)
VALUES (
  'ragSettings.genericTitlePatterns',
  '["Soru-Cevap", "SoruCevap", "csv_sorucevap", "Q&A", "Soru-cevap"]',
  'rag',
  'JSON array of generic titles to replace with actual source titles'
)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, description = EXCLUDED.description;

-- =============================================
-- SECTION HEADINGS TO STRIP
-- =============================================

INSERT INTO settings (key, value, category, description)
VALUES (
  'ragSettings.sectionHeadingsToStrip',
  '{
    "tr": ["KISA GİRİŞ:", "ANA BİLGİ:", "UYGULAMA:", "KAYNAKÇA:", "GİRİŞ:", "SONUÇ:", "DETAYLAR:", "ÖZET:"],
    "en": ["INTRODUCTION:", "MAIN POINTS:", "APPLICATION:", "REFERENCES:", "SOURCES:", "CONCLUSION:", "SUMMARY:", "DETAILS:"]
  }',
  'rag',
  'JSON object with section headings to strip from responses'
)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, description = EXCLUDED.description;

-- =============================================
-- FIELD LABELS FOR METADATA
-- =============================================

INSERT INTO settings (key, value, category, description)
VALUES (
  'ragSettings.fieldLabels',
  '{
    "tarih": "Tarih",
    "kurum": "Kurum",
    "makam": "Makam",
    "konu": "Konu",
    "kategori": "Kategori",
    "yil": "Yıl",
    "sayi": "Sayı",
    "esas_no": "Esas No",
    "karar_no": "Karar No",
    "karar_tarihi": "Karar Tarihi",
    "daire": "Daire",
    "yazar": "Yazar",
    "baslik": "Başlık",
    "ozet": "Özet"
  }',
  'rag',
  'JSON mapping of field names to display labels'
)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, description = EXCLUDED.description;

-- Priority fields for citation display
INSERT INTO settings (key, value, category, description)
VALUES (
  'ragSettings.citationPriorityFields',
  '["kurum", "makam", "tarih", "konu", "kategori", "yil", "sayi"]',
  'rag',
  'JSON array of fields to prioritize in citation display'
)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, description = EXCLUDED.description;

-- =============================================
-- CONTEXT FORMAT TEMPLATES
-- =============================================

INSERT INTO settings (key, value, category, description)
VALUES (
  'ragSettings.strictContextTemplate',
  '{
    "sourceHeader": "=== KAYNAK {n} ===",
    "schemaLabel": "📋 ŞEMA:",
    "typeLabel": "   Tür: {type}",
    "titleLabel": "   Başlık: {title}",
    "tocWarning": "   ⚠️ UYARI: Bu kaynak İÇİNDEKİLER TABLOSU - alıntı için KULLANMA!",
    "contentLabel": "📝 İÇERİK:",
    "sourceReminder": "MEVCUT KAYNAKLAR: {sources}\nBu referanslardan birini MUTLAKA kullan. ASLA boş [] yazma."
  }',
  'rag',
  'JSON template for strict mode context formatting'
)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, description = EXCLUDED.description;

-- =============================================
-- NUMERIC THRESHOLDS
-- =============================================

INSERT INTO settings (key, value, category, description)
VALUES ('ragSettings.highConfidenceThreshold', '0.50', 'rag', 'Threshold for high confidence results (0-1)')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

INSERT INTO settings (key, value, category, description)
VALUES ('ragSettings.lowConfidenceThreshold', '0.08', 'rag', 'Threshold for low confidence results (0-1)')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

INSERT INTO settings (key, value, category, description)
VALUES ('ragSettings.maxContextLength', '6000', 'rag', 'Maximum characters for context sent to LLM')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

INSERT INTO settings (key, value, category, description)
VALUES ('ragSettings.maxExcerptLength', '250', 'rag', 'Maximum characters for source excerpt')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

INSERT INTO settings (key, value, category, description)
VALUES ('ragSettings.summaryMaxLength', '2000', 'rag', 'Maximum characters for response summary')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

INSERT INTO settings (key, value, category, description)
VALUES ('ragSettings.excerptMaxLength', '300', 'rag', 'Maximum excerpt length for formatted sources')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

-- =============================================
-- STRICT MODE TOGGLE
-- =============================================

INSERT INTO settings (key, value, category, description)
VALUES ('ragSettings.strictMode', 'true', 'rag', 'Enable strict mode (source-faithful responses)')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

INSERT INTO settings (key, value, category, description)
VALUES ('ragSettings.disableCitationText', 'true', 'rag', 'Hide citation markers in response text')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

-- =============================================
-- VERIFICATION
-- =============================================

-- Check all RAG settings
-- SELECT key, LEFT(value, 100) as value_preview, description FROM settings WHERE key LIKE 'ragSettings.%' ORDER BY key;

-- =============================================
-- ROLLBACK (if needed)
-- =============================================

-- DELETE FROM settings WHERE key LIKE 'ragSettings.%' AND key NOT IN (
--   'ragSettings.similarityThreshold',
--   'ragSettings.maxResults',
--   'ragSettings.minResults',
--   'ragSettings.enableHybridSearch',
--   'ragSettings.enablePdfUpload',
--   'ragSettings.maxPdfSizeMB',
--   'ragSettings.maxPdfPages'
-- );
