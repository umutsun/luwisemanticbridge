-- Migration: Semantic Analyzer Configuration Schema
-- Date: 2026-01-07
-- Description: Complete semantic analyzer configuration - verdict patterns, action groups, fail messages
-- This removes hardcoded values from semantic_analyzer_service.py and syncs with LLM prompts

-- =============================================
-- ACTION GROUPS (Turkish Verbs)
-- =============================================

INSERT INTO settings (key, value, category, description)
VALUES (
  'semanticAnalyzer.actionGroups',
  '{
    "keep": ["bulundur", "bulundurmak", "taşı", "taşımak", "muhafaza", "sakla", "saklama"],
    "hang": ["as", "asmak", "asma", "asıl", "asılma"],
    "fill": ["doldur", "doldurmak", "düzenle", "düzenleme", "tanzim"],
    "submit": ["ibraz", "ibraz et", "sun", "sunmak", "ver", "teslim"],
    "rent": ["kirala", "kiralama", "kira"],
    "sell": ["sat", "satış", "satım", "devret", "devir"],
    "buy": ["al", "satın al", "satın alma", "temin"],
    "export": ["ihraç", "ihracat", "dış satım"],
    "import": ["ithal", "ithalat", "dış alım"],
    "register": ["tescil", "kayıt", "kaydet", "kaydettir"]
  }',
  'semantic_analyzer',
  'Turkish verb groups for action matching. Key = action name, value = array of synonyms'
)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, description = EXCLUDED.description;

-- =============================================
-- OBJECT ANCHORS
-- =============================================

INSERT INTO settings (key, value, category, description)
VALUES (
  'semanticAnalyzer.objectAnchors',
  '{
    "vergi_levhası": ["vergi levhası", "vergi levha", "vl", "levha"],
    "sevk_irsaliyesi": ["sevk irsaliyesi", "irsaliye", "sevk belgesi"],
    "fatura": ["fatura", "e-fatura", "efatura", "elektronik fatura"],
    "beyanname": ["beyanname", "kdv beyannamesi", "gelir vergisi beyannamesi"],
    "defter": ["defter", "yevmiye defteri", "envanter defteri", "büyük defter"],
    "fiş": ["fiş", "ödeme kaydedici cihaz fişi", "perakende satış fişi", "yazarkasa fişi"],
    "makbuz": ["makbuz", "gider pusulası", "müstahsil makbuzu"],
    "belge": ["belge", "evrak", "doküman"],
    "ödeme": ["ödeme", "tahsilat", "para", "nakit"],
    "taşınmaz": ["taşınmaz", "gayrimenkul", "arsa", "arazi", "bina", "konut", "işyeri"],
    "araç": ["araç", "otomobil", "taşıt", "motorlu taşıt"],
    "fotokopi": ["fotokopi", "kopya", "suret"]
  }',
  'semantic_analyzer',
  'Object anchor keywords for context matching. Different objects = different validation'
)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, description = EXCLUDED.description;

-- =============================================
-- VERDICT PATTERNS (CRITICAL - synced with LLM prompts)
-- =============================================

INSERT INTO settings (key, value, category, description)
VALUES (
  'semanticAnalyzer.verdictPatterns',
  '[
    "mümkündür", "mümkün değildir",
    "uygundur", "uygun değildir",
    "gerekmektedir", "gerekmemektedir", "gerekmez",
    "zorunludur", "zorunlu değildir",
    "zorunlu idi", "zorunlu değil idi",
    "yeterlidir", "yeterli değildir", "yetmez",
    "yapılmalıdır", "yapılamaz",
    "bulunmaktadır", "bulunmamaktadır",
    "kaldırılmıştır", "kaldırılmamıştır"
  ]',
  'semantic_analyzer',
  'Verdict detection patterns. Quote MUST contain one of these to be valid. SYNC with ragSettings.strictModePromptTr!'
)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, description = EXCLUDED.description;

-- =============================================
-- FORBIDDEN PATTERNS (CRITICAL - synced with LLM prompts)
-- =============================================

INSERT INTO settings (key, value, category, description)
VALUES (
  'semanticAnalyzer.forbiddenPatterns',
  '[
    {"pattern": "sorulmaktadır", "description": "soru kalıbı"},
    {"pattern": "mümkün\\s+olup\\s+olmadığı", "description": "soru kalıbı"},
    {"pattern": "olup\\s+olmadığı\\s*(hk\\.?|hakkında)", "description": "KONU satırı"},
    {"pattern": "\\s+hk\\.?\\s*$", "description": "KONU başlığı"},
    {"pattern": "^KONU\\s*:", "description": "KONU: başlığı"},
    {"pattern": "^İLGİ\\s*:", "description": "İLGİ: başlığı"},
    {"pattern": "Dilekçenizde.*sorulmaktadır", "description": "dilekçe soru kalıbı"}
  ]',
  'semantic_analyzer',
  'Forbidden quote patterns with descriptions. SYNC with ragSettings.strictModePromptTr forbidden list!'
)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, description = EXCLUDED.description;

-- =============================================
-- MODALITY QUESTION PATTERNS
-- =============================================

INSERT INTO settings (key, value, category, description)
VALUES (
  'semanticAnalyzer.modalityQuestionPatterns',
  '{
    "ZORUNLU": [
      "zorunlu\\s*(mu|mudur|mıdır|mı)",
      "zorunlulu[gğ]u\\s+var\\s*(mı|mıdır)",
      "mecburi\\s*(mi|midir)",
      "şart\\s*(mı|mıdır)"
    ],
    "MUMKUN": [
      "mümkün\\s*(mü|müdür|midir|mi)",
      "yapılabilir\\s*mi",
      "olabilir\\s*mi"
    ],
    "UYGUN": [
      "uygun\\s*(mu|mudur)",
      "doğru\\s*mu"
    ],
    "GEREKLI": [
      "gerekli\\s*(mi|midir)",
      "gerek(ir|iyor)\\s*(mi|mı)",
      "gerek\\s+var\\s*(mı|mıdır)",
      "lazım\\s*(mı|mıdır)"
    ],
    "YETERLI": [
      "yeterli\\s*(mi|midir)",
      "yeter\\s*(mi|midir)"
    ]
  }',
  'semantic_analyzer',
  'Question modality detection patterns. Key = modality enum, value = regex patterns'
)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, description = EXCLUDED.description;

-- =============================================
-- MODALITY ANSWER PATTERNS
-- =============================================

INSERT INTO settings (key, value, category, description)
VALUES (
  'semanticAnalyzer.modalityAnswerPatterns',
  '{
    "ZORUNLU_POSITIVE": ["zorunludur", "mecburidir"],
    "ZORUNLU_NEGATIVE": ["zorunlu değildir", "mecburi değildir", "zorunlu bulunmamaktadır"],
    "MUMKUN_POSITIVE": ["mümkündür", "yapılabilir"],
    "MUMKUN_NEGATIVE": ["mümkün değildir", "yapılamaz"],
    "UYGUN_POSITIVE": ["uygundur"],
    "UYGUN_NEGATIVE": ["uygun değildir"],
    "GEREKLI_POSITIVE": ["gerekmektedir", "gereklidir"],
    "GEREKLI_NEGATIVE": ["gerekmemektedir", "gerekmez"],
    "YETERLI_POSITIVE": ["yeterlidir", "yeter"],
    "YETERLI_NEGATIVE": ["yeterli değildir", "yetmez"]
  }',
  'semantic_analyzer',
  'Answer modality patterns. Format: MODALITY_POLARITY = patterns array'
)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, description = EXCLUDED.description;

-- =============================================
-- FAIL MESSAGES (Turkish)
-- =============================================

INSERT INTO settings (key, value, category, description)
VALUES (
  'semanticAnalyzer.failMessages',
  '{
    "action_mismatch": "Mevcut kaynak farklı bir eylemi ({quote_action}) ele alıyor. Sorulan eylem ({question_action}) hakkında doğrudan hüküm bulunamadı.",
    "modality_mismatch": "Sorulan ''{question_modality}'' için cevap ''{answer_modality}'' türünde verilmiş. Doğru modalite eşleşmesi bulunamadı.",
    "modality_inference": "Kaynak yalnızca ''mümkün/olabilir'' yönünde bilgi içeriyor. ''Zorunlu olup olmadığı'' hakkında açık hüküm cümlesi bulunamadı.",
    "quote_not_verbatim": "Belirtilen alıntı, kaynak metinde birebir bulunamadı. Lütfen kaynağı kontrol ediniz.",
    "forbidden_pattern": "Bu alıntı soru başlığı/giriş paragrafıdır, hüküm değildir.",
    "no_verdict": "Bu konuda açık hüküm cümlesi bulunamadı.",
    "no_strong_verdict": "Kaynakta sadece ''mümkün/uygun'' gibi yumuşak ifadeler var. Kesin zorunluluk/yasak bildiren hüküm bulunamadı.",
    "generic": "Bu konuda kesin bir hüküm cümlesi bulunamadı.",
    "alinti_empty": "Kaynak metin bu soru için doğrudan alıntılanabilir ifade içermiyor.",
    "quote_is_system_message": "ALINTI alanında gerçek kaynak metni yerine sistem mesajı bulundu. ALINTI, kaynaktan birebir alıntı olmalıdır.",
    "temporal_mismatch": "Soru genel (yıl belirtilmemiş) ama kaynak belirli bir yılı referans alıyor. Güncel bilgi için doğrulama gerekebilir.",
    "intent_mismatch": "Soru prosedür (nasıl) soruyor ama kaynak bilgi (nedir) veriyor. Uygulama detayları için ek kaynak gerekebilir."
  }',
  'semantic_analyzer',
  'Standardized fail-closed messages for validation issues. Used in both CEVAP and ALINTI'
)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, description = EXCLUDED.description;

-- =============================================
-- SYSTEM MESSAGE PATTERNS
-- =============================================

INSERT INTO settings (key, value, category, description)
VALUES (
  'semanticAnalyzer.systemMessagePatterns',
  '[
    {"pattern": "kesin\\s+(bir\\s+)?hüküm\\s+cümlesi\\s+bulunamadı", "description": "fail-closed hüküm mesajı"},
    {"pattern": "açık\\s+hüküm\\s+cümlesi\\s+bulunamadı", "description": "fail-closed hüküm mesajı"},
    {"pattern": "doğrudan\\s+hüküm\\s+bulunamadı", "description": "fail-closed hüküm mesajı"},
    {"pattern": "bu\\s+konuda.*bulunamadı", "description": "fail-closed genel mesajı"},
    {"pattern": "ilgili\\s+kaynak\\s+incelenebilir", "description": "fail-closed öneri mesajı"},
    {"pattern": "kaynak\\s+metinde\\s+birebir\\s+bulunamadı", "description": "verbatim fail mesajı"},
    {"pattern": "modalite\\s+eşleşmesi\\s+bulunamadı", "description": "modality fail mesajı"},
    {"pattern": "soru\\s+başlığı.*hüküm\\s+değil", "description": "forbidden pattern mesajı"}
  ]',
  'semantic_analyzer',
  'Patterns to detect system messages in ALINTI field (LLM should not quote these)'
)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, description = EXCLUDED.description;

-- =============================================
-- TOC DETECTION PATTERNS
-- =============================================

INSERT INTO settings (key, value, category, description)
VALUES (
  'semanticAnalyzer.tocPatterns',
  '[
    {"pattern": "\\.{5,}", "weight": 0.3, "description": "5+ dots sequence"},
    {"pattern": "…{3,}", "weight": 0.3, "description": "3+ ellipsis"},
    {"pattern": "^\\.+\\s*\\d+\\s*$", "weight": 0.25, "description": "dots followed by page number"},
    {"pattern": "^\\d+\\.\\s+[A-ZÇĞİÖŞÜ]", "weight": 0.15, "description": "numbered section"},
    {"pattern": "İÇİNDEKİLER", "weight": 0.5, "description": "Table of contents header"},
    {"pattern": "BÖLÜM\\s+\\d+", "weight": 0.2, "description": "Chapter header"}
  ]',
  'semantic_analyzer',
  'Table of Contents detection patterns with weights'
)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, description = EXCLUDED.description;

-- =============================================
-- CONFIDENCE THRESHOLDS
-- =============================================

INSERT INTO settings (key, value, category, description)
VALUES ('semanticAnalyzer.verbatimTolerance', '0.85', 'semantic_analyzer', 'Minimum similarity for verbatim match (0-1)')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

INSERT INTO settings (key, value, category, description)
VALUES ('semanticAnalyzer.minConfidenceThreshold', '0.3', 'semantic_analyzer', 'Minimum confidence to consider quote valid')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

INSERT INTO settings (key, value, category, description)
VALUES ('semanticAnalyzer.cautiousModeThreshold', '0.7', 'semantic_analyzer', 'Below this confidence = cautious mode')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

-- =============================================
-- PENALTY VALUES
-- =============================================

INSERT INTO settings (key, value, category, description)
VALUES (
  'semanticAnalyzer.penalties',
  '{
    "partial_relevance": 0.15,
    "temporal_mismatch": 0.35,
    "intent_mismatch": 0.25,
    "weak_verdict": 0.1,
    "toc_content": 0.5
  }',
  'semantic_analyzer',
  'Confidence penalty values for various issues'
)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, description = EXCLUDED.description;

-- =============================================
-- TEMPORAL DETECTION PATTERNS
-- =============================================

INSERT INTO settings (key, value, category, description)
VALUES (
  'semanticAnalyzer.temporalPatterns',
  '{
    "questionIndicators": [
      "\\bhangi\\s+yıl\\b",
      "\\b\\d{4}\\s*yılı\\b",
      "\\bbu\\s+yıl\\b",
      "\\bgeçen\\s+yıl\\b",
      "\\bgelecek\\s+yıl\\b",
      "\\b(19|20)\\d{2}\\b"
    ],
    "quoteYearPatterns": [
      "\\b(19|20)\\d{2}\\s*yılı?\\s*(için|içinde|nda|nde|dan|den|itibaren)",
      "\\b(19|20)\\d{2}\\s*yılı\\b",
      "\\b(19|20)\\d{2}\\s*(senesinde|senesi)"
    ]
  }',
  'semantic_analyzer',
  'Temporal alignment detection patterns for year-specific vs general questions'
)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, description = EXCLUDED.description;

-- =============================================
-- INTENT DETECTION PATTERNS
-- =============================================

INSERT INTO settings (key, value, category, description)
VALUES (
  'semanticAnalyzer.intentPatterns',
  '{
    "proceduralQuestion": [
      "\\bnasıl\\s+(uygulanır|hesaplanır|yapılır|işler|çalışır)",
      "\\bne\\s+şekilde\\b",
      "\\bhangi\\s+şekilde\\b",
      "\\buygulama\\s+(usul|yöntem)",
      "\\bhesaplama\\s+(usul|yöntem)"
    ],
    "factualAnswer": [
      "\\bnedir\\b.*\\bcevap\\b",
      "\\btarife\\s+nedir\\b",
      "\\boran(ı|lar)?\\s*:?\\s*%",
      "^\\s*%\\s*\\d+"
    ]
  }',
  'semantic_analyzer',
  'Intent alignment detection - procedural (how) vs factual (what) questions'
)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, description = EXCLUDED.description;

-- =============================================
-- CERTIFIED COPY DETECTION
-- =============================================

INSERT INTO settings (key, value, category, description)
VALUES (
  'semanticAnalyzer.certifiedCopyPatterns',
  '{
    "indicators": [
      "onaylı\\s*(suret|kopya|örnek)",
      "noter\\s*(onaylı|tasdikli)",
      "aslı\\s*(gibidir|yerine)",
      "tasdikli\\s*(suret|kopya)"
    ],
    "ambiguousTerms": ["fotokopi", "kopya", "suret"]
  }',
  'semantic_analyzer',
  'Patterns for detecting certified copy vs regular copy context'
)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, description = EXCLUDED.description;

-- =============================================
-- VERSION TRACKING
-- =============================================

INSERT INTO settings (key, value, category, description)
VALUES (
  'semanticAnalyzer.configVersion',
  '1.0.0',
  'semantic_analyzer',
  'Configuration version for tracking changes'
)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

INSERT INTO settings (key, value, category, description)
VALUES (
  'semanticAnalyzer.lastUpdated',
  '2026-01-07T00:00:00Z',
  'semantic_analyzer',
  'Last configuration update timestamp'
)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

-- =============================================
-- VERIFICATION QUERIES
-- =============================================

-- Check all semantic analyzer settings
-- SELECT key, LEFT(value, 100) as value_preview, description
-- FROM settings
-- WHERE key LIKE 'semanticAnalyzer.%'
-- ORDER BY key;

-- Count patterns
-- SELECT
--   (SELECT COUNT(*) FROM settings WHERE key = 'semanticAnalyzer.verdictPatterns') as verdict_count,
--   (SELECT COUNT(*) FROM settings WHERE key = 'semanticAnalyzer.forbiddenPatterns') as forbidden_count;

-- =============================================
-- ROLLBACK (if needed)
-- =============================================

-- DELETE FROM settings WHERE key LIKE 'semanticAnalyzer.%';
