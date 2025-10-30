-- ========================================
-- QUICK PERFORMANCE FIX
-- ========================================
-- Disable LLM summaries to restore speed
-- Run this NOW to fix 2-minute delay!

-- Disable LLM summaries (causes 2 min delay per search!)
INSERT INTO settings (key, value, category, description)
VALUES (
  'ragSettings.enableLLMSummaries',
  'false',
  'rag',
  'Disable LLM summary generation for faster search (no natural language processing)'
)
ON CONFLICT (key) DO UPDATE SET value = 'false';

-- Verify it's disabled
SELECT key, value FROM settings WHERE key = 'ragSettings.enableLLMSummaries';

-- You should see: value = 'false'
