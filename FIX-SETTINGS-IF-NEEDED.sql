-- Fix settings if activeChatModel is not configured
-- Run this ONLY if CHECK-SETTINGS-STATUS.sql shows activeChatModel is not set

-- IMPORTANT: Edit the values below to match your preferred configuration
-- Then run this script to set up initial settings

-- 1. Set active chat model (EDIT THIS to your preferred provider/model)
-- Options:
--   - 'google/gemini-1.5-pro' (recommended if you have Google API key)
--   - 'google/gemini-1.5-flash' (faster, cheaper alternative)
--   - 'openai/gpt-4o-mini' (if you have OpenAI API key)
--   - 'anthropic/claude-3-5-sonnet-20241022' (if you have Claude API key)
--   - 'deepseek/deepseek-chat' (if you have DeepSeek API key)

INSERT INTO settings (key, value, updated_at)
VALUES ('llmSettings.activeChatModel', 'google/gemini-1.5-pro', CURRENT_TIMESTAMP)
ON CONFLICT (key)
DO UPDATE SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP;

-- 2. Set provider-specific model (should match the model part above)
INSERT INTO settings (key, value, updated_at)
VALUES ('llmSettings.geminiModel', 'gemini-1.5-pro', CURRENT_TIMESTAMP)
ON CONFLICT (key)
DO UPDATE SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP;

-- 3. Set embedding provider and model
INSERT INTO settings (key, value, updated_at)
VALUES
  ('embedding_provider', 'google', CURRENT_TIMESTAMP),
  ('embedding_model', 'text-embedding-004', CURRENT_TIMESTAMP)
ON CONFLICT (key)
DO UPDATE SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP;

-- 4. Verify the changes
SELECT
  '✅ Settings have been updated!' AS message,
  '' AS key,
  '' AS value
UNION ALL
SELECT
  'Updated Settings:' AS message,
  '' AS key,
  '' AS value
UNION ALL
SELECT
  '' AS message,
  key,
  value
FROM settings
WHERE key IN (
  'llmSettings.activeChatModel',
  'llmSettings.geminiModel',
  'embedding_provider',
  'embedding_model'
)
ORDER BY key;

-- 5. Next steps
SELECT
  '🔄 NEXT STEPS:' AS message,
  '' AS step
UNION ALL
SELECT
  '' AS message,
  '1. Restart backend: npm run dev' AS step
UNION ALL
SELECT
  '' AS message,
  '2. Check backend logs - should show: "Active Chat Model: google/gemini-1.5-pro"' AS step
UNION ALL
SELECT
  '' AS message,
  '3. Go to Settings UI and verify the model is selected' AS step
UNION ALL
SELECT
  '' AS message,
  '4. Test chat - should use Gemini (not DeepSeek fallback)' AS step
UNION ALL
SELECT
  '' AS message,
  '5. Check System Status widget - should show "gemini-1.5-pro"' AS step;
