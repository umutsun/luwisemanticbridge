-- Migration: Evidence Gate and Retrieval Penalties
-- Date: 2026-01-08
-- Description: Adds quality control (Evidence Gate) and penalty weight settings

-- =============================================
-- EVIDENCE GATE SETTINGS
-- =============================================

INSERT INTO settings (key, value, category, description)
VALUES (
  'ragSettings.evidenceGateEnabled',
  'true',
  'rag',
  'Enable Evidence Gate quality control - prevents showing irrelevant citations'
)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, description = EXCLUDED.description;

INSERT INTO settings (key, value, category, description)
VALUES (
  'ragSettings.evidenceGateMinScore',
  '0.55',
  'rag',
  'Minimum similarity score (0-1) for a result to be considered quality. Default 0.55 = 55%'
)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, description = EXCLUDED.description;

INSERT INTO settings (key, value, category, description)
VALUES (
  'ragSettings.evidenceGateMinChunks',
  '2',
  'rag',
  'Minimum number of quality chunks required to pass evidence gate'
)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, description = EXCLUDED.description;

INSERT INTO settings (key, value, category, description)
VALUES (
  'ragSettings.evidenceGateRefusalTr',
  'Bu konuda yeterince guvenilir kaynak bulunamadi. Sorunuzu farkli anahtar kelimelerle veya daha spesifik sekilde sormayi deneyin.',
  'rag',
  'Turkish refusal message when evidence gate fails'
)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, description = EXCLUDED.description;

INSERT INTO settings (key, value, category, description)
VALUES (
  'ragSettings.evidenceGateRefusalEn',
  'No sufficiently relevant sources found for this topic. Please try rephrasing your question or using different keywords.',
  'rag',
  'English refusal message when evidence gate fails'
)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, description = EXCLUDED.description;

-- =============================================
-- RETRIEVAL PENALTY SETTINGS
-- =============================================

INSERT INTO settings (key, value, category, description)
VALUES (
  'ragSettings.penalties.temporal_penalty_weight',
  '-0.15',
  'rag',
  'Penalty weight for year-specific content mismatch. Negative value reduces score.'
)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, description = EXCLUDED.description;

INSERT INTO settings (key, value, category, description)
VALUES (
  'ragSettings.penalties.toc_penalty_weight',
  '-0.25',
  'rag',
  'Penalty weight for table of contents / header-only content'
)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, description = EXCLUDED.description;

INSERT INTO settings (key, value, category, description)
VALUES (
  'ragSettings.penalties.toc_score_threshold',
  '0.5',
  'rag',
  'TOC detection score threshold to apply penalty (0-1)'
)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, description = EXCLUDED.description;

INSERT INTO settings (key, value, category, description)
VALUES (
  'ragSettings.penalties.toc_min_pattern_count',
  '2',
  'rag',
  'Minimum patterns required to flag content as TOC'
)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, description = EXCLUDED.description;

-- =============================================
-- SOURCE TYPE HIERARCHY (Murat's Legal Source Ranking)
-- =============================================
-- Config-driven hierarchy for legal/tax sources
-- Future-proof: When laws (kanun) are added, just update weights
-- No code changes needed - only config updates

-- Full hierarchy configuration (JSON)
-- Weights: Higher = More authoritative
INSERT INTO settings (key, value, category, description)
VALUES (
  'ragSettings.sourceTypeHierarchy',
  '{
    "law": {"weight": 100, "label": "Kanun/Mevzuat", "enabled": false, "note": "Asli kanun metinleri - henüz dataset''te yok, sonra eklenecek"},
    "regulation": {"weight": 95, "label": "Tebliğ/Yönetmelik", "enabled": true},
    "sirkuler": {"weight": 90, "label": "Sirküler", "enabled": true},
    "kararname": {"weight": 85, "label": "Kararname", "enabled": true},
    "court": {"weight": 80, "label": "Yargı Kararları", "enabled": true},
    "ozelge": {"weight": 75, "label": "Özelge", "enabled": true},
    "danistay": {"weight": 70, "label": "Danıştay Kararları", "enabled": true},
    "article": {"weight": 50, "label": "Makale", "enabled": true},
    "huk_dkk": {"weight": 45, "label": "HUK DKK", "enabled": true},
    "ebook": {"weight": 40, "label": "E-Kitap/PDF", "enabled": true},
    "qna": {"weight": 30, "label": "Soru-Cevap", "enabled": true},
    "document": {"weight": 20, "label": "Genel Doküman", "enabled": true}
  }',
  'rag',
  'Source type hierarchy with weights. Higher weight = more authoritative. Config-driven for future law integration.'
)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, description = EXCLUDED.description;

-- Simple priority list (for backward compatibility)
INSERT INTO settings (key, value, category, description)
VALUES (
  'ragSettings.sourceTypePriority',
  '["law", "regulation", "sirkuler", "kararname", "court", "ozelge", "danistay", "article", "huk_dkk", "ebook", "qna", "document"]',
  'rag',
  'JSON array of source types in priority order. First = highest priority.'
)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, description = EXCLUDED.description;

INSERT INTO settings (key, value, category, description)
VALUES (
  'ragSettings.sourceTypePriorityEnabled',
  'true',
  'rag',
  'Enable source type priority ordering'
)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, description = EXCLUDED.description;

-- Law Resolver Configuration (Stub for future)
-- When laws are added via scraping, this will control the resolver
INSERT INTO settings (key, value, category, description)
VALUES (
  'ragSettings.lawResolverEnabled',
  'false',
  'rag',
  'Enable law resolver for external law references. Set to true when law scraping is implemented.'
)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, description = EXCLUDED.description;

INSERT INTO settings (key, value, category, description)
VALUES (
  'ragSettings.lawResolverEndpoint',
  '',
  'rag',
  'External endpoint for law resolver API (future use). Leave empty to use internal resolver.'
)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, description = EXCLUDED.description;

-- =============================================
-- STRICT MODE CONFIGURATION
-- =============================================
-- Controls LLM behavior in strict mode

INSERT INTO settings (key, value, category, description)
VALUES (
  'ragSettings.strictModeTemperature',
  '0',
  'rag',
  'Temperature for strict mode LLM calls. 0 = fully deterministic. Range: 0-1'
)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, description = EXCLUDED.description;

INSERT INTO settings (key, value, category, description)
VALUES (
  'ragSettings.strictModeLevel',
  'medium',
  'rag',
  'Strictness level: strict (exact verdict sentence required, high refusal), medium (citation required, balanced), relaxed (citation preferred, low refusal). Default: medium'
)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, description = EXCLUDED.description;

-- =============================================
-- REFUSAL POLICY SETTINGS
-- =============================================
-- Controls how the system handles "not found" responses

INSERT INTO settings (key, value, category, description)
VALUES (
  'ragSettings.refusalPolicy.clearSourcesOnRefusal',
  'true',
  'rag',
  'Clear sources array when LLM response indicates refusal/not found'
)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, description = EXCLUDED.description;

INSERT INTO settings (key, value, category, description)
VALUES (
  'ragSettings.refusalPolicy.cleanResponseTextOnRefusal',
  'true',
  'rag',
  'Remove [Kaynak X] and ALINTI blocks from response when refusal detected'
)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, description = EXCLUDED.description;

INSERT INTO settings (key, value, category, description)
VALUES (
  'ragSettings.refusalPolicy.patterns',
  '["bulunamadı", "hüküm bulunamadı", "kesin hüküm.*bulunamadı", "yeterli.*kaynak.*yok", "yeterli bilgi bulunamadı", "bu konuda.*bilgi.*yok", "no.*relevant.*found", "could not find", "no definitive ruling"]',
  'rag',
  'JSON array of regex patterns that indicate a refusal response'
)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, description = EXCLUDED.description;

-- =============================================
-- VERIFICATION QUERY
-- =============================================
-- Run this to verify:
-- SELECT key, value, description FROM settings
-- WHERE key LIKE 'ragSettings.evidence%' OR key LIKE 'ragSettings.penalties.%'
-- ORDER BY key;

-- =============================================
-- ROLLBACK (if needed)
-- =============================================
-- DELETE FROM settings WHERE key LIKE 'ragSettings.evidence%';
-- DELETE FROM settings WHERE key LIKE 'ragSettings.penalties.%';
