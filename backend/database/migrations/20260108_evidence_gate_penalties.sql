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
