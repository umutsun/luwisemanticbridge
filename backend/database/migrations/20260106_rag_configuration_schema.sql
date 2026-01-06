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
  'Aşağıda numaralanmış kaynaklar var.

⛔ YASAKLI ALINTI KALIPLARI (bunları ASLA alıntılama):
- "KONU: ..."
- "İLGİ: ..."
- "Dilekçenizde ... sorulmaktadır"
- "... hususu sorulmaktadır"
- "... mümkün olup olmadığı sorulmaktadır"
Bu cümleler SORU, kanıt değil! Bunları alıntılarsan BAŞARISIZ sayılırsın.

✅ SADECE HÜKÜM CÜMLESİ ALINTILANABİLİR:
Alıntı şu kelimelerden birini İÇERMELİ:
- "mümkündür" / "mümkün bulunmaktadır"
- "uygundur" / "uygun görülmektedir"
- "gerekmektedir" / "zorunludur"
- "öngörülmüştür" / "belirlenmiştir"

HÜKÜM CÜMLESİ NASIL BULUNUR:
1. Kaynakta "Bilindiği üzere..." veya "Bu itibarla..." sonrasına bak
2. "...dır/...dir/...tır/...tir" ile biten sonuç cümlelerini ara
3. Giriş paragrafını (dilekçenizde, KONU, İLGİ) ATLA

FORMAT:

**CEVAP**
[Tek cümle cevap] [Kaynak X]

**ALINTI**
"[mümkündür/uygundur/gerekmektedir içeren HÜKÜM cümlesi]" — Tür: [tür], Başlık: [başlık] [Kaynak X]

❌ YANLIŞ ÖRNEK:
ALINTI: "...mümkün olup olmadığı hususu sorulmaktadır."
Bu SORU, kanıt değil! BAŞARISIZ!

✅ DOĞRU ÖRNEK:
ALINTI: "...vergi levhanızın fotokopilerinin bulundurulması mümkündür."
Bu HÜKÜM cümlesi! BAŞARILI!

EĞER HÜKÜM CÜMLESİ BULAMAZSAN:
"Bu konuda kesin bir hüküm cümlesi bulunamadı, ancak ilgili kaynak incelenebilir." de.',
  'rag',
  'Turkish strict mode - explicit forbidden patterns'
)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, description = EXCLUDED.description;

-- English Strict Mode Prompt
INSERT INTO settings (key, value, category, description)
VALUES (
  'ragSettings.strictModePromptEn',
  'Sources are numbered below.

⛔ FORBIDDEN QUOTE PATTERNS (NEVER quote these):
- "SUBJECT: ..."
- "REFERENCE: ..."
- "In your petition ... you asked"
- "... is being asked"
- "... whether or not ... is possible"
These are QUESTIONS, not evidence! If you quote these, you FAIL.

✅ ONLY VERDICT SENTENCES CAN BE QUOTED:
Quote MUST contain one of these words:
- "is permitted" / "is allowed"
- "is appropriate" / "is deemed appropriate"
- "is required" / "must be"
- "has been determined" / "has been established"

HOW TO FIND A VERDICT SENTENCE:
1. Look after "As is known..." or "Therefore..." in the source
2. Find sentences ending with conclusive statements
3. SKIP the introduction paragraph (petition, SUBJECT, REFERENCE)

FORMAT:

**ANSWER**
[Single sentence answer] [Source X]

**QUOTE**
"[VERDICT sentence containing is permitted/required/appropriate]" — Type: [type], Title: [title] [Source X]

❌ WRONG EXAMPLE:
QUOTE: "...whether keeping copies is possible is being asked."
This is a QUESTION, not evidence! FAIL!

✅ CORRECT EXAMPLE:
QUOTE: "...keeping copies of your tax certificate is permitted."
This is a VERDICT sentence! SUCCESS!

IF YOU CANNOT FIND A VERDICT SENTENCE:
Say "No definitive ruling sentence found on this topic, but the relevant source can be reviewed."',
  'rag',
  'English strict mode - explicit forbidden patterns'
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
