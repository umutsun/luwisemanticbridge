-- Check current settings status in database
-- This will show what's currently configured

-- 1. Check if activeChatModel is set
SELECT
  'activeChatModel Status' AS check_name,
  CASE
    WHEN value IS NULL THEN '❌ NOT SET - User must configure in Settings UI'
    WHEN value = '' THEN '❌ EMPTY - User must configure in Settings UI'
    ELSE '✅ SET: ' || value
  END AS status
FROM settings
WHERE key = 'llmSettings.activeChatModel'
UNION ALL
SELECT
  'activeChatModel Status' AS check_name,
  '❌ KEY DOES NOT EXIST - User must configure in Settings UI' AS status
WHERE NOT EXISTS (
  SELECT 1 FROM settings WHERE key = 'llmSettings.activeChatModel'
);

-- 2. Check all LLM-related settings
SELECT
  '=== LLM SETTINGS ===' AS section,
  '' AS key,
  '' AS value;

SELECT
  'LLM Settings' AS section,
  key,
  CASE
    WHEN key LIKE '%apiKey%' THEN LEFT(value, 20) || '...'
    ELSE value
  END AS value
FROM settings
WHERE key LIKE 'llmSettings.%'
   OR key LIKE '%.apiKey'
   OR key LIKE 'embedding_%'
ORDER BY key;

-- 3. Check which providers have API keys configured
SELECT
  '=== API KEYS STATUS ===' AS section,
  '' AS provider,
  '' AS status;

WITH api_keys AS (
  SELECT
    CASE
      WHEN key = 'google.apiKey' OR key = 'gemini.apiKey' THEN 'Google/Gemini'
      WHEN key = 'openai.apiKey' THEN 'OpenAI'
      WHEN key = 'anthropic.apiKey' OR key = 'claude.apiKey' THEN 'Anthropic/Claude'
      WHEN key = 'deepseek.apiKey' THEN 'DeepSeek'
    END AS provider,
    value
  FROM settings
  WHERE key IN ('google.apiKey', 'gemini.apiKey', 'openai.apiKey', 'anthropic.apiKey', 'claude.apiKey', 'deepseek.apiKey')
)
SELECT
  'API Keys' AS section,
  provider,
  CASE
    WHEN value IS NOT NULL AND value != '' THEN '✅ Configured'
    ELSE '❌ Not configured'
  END AS status
FROM (
  SELECT 'Google/Gemini' AS provider UNION ALL
  SELECT 'OpenAI' UNION ALL
  SELECT 'Anthropic/Claude' UNION ALL
  SELECT 'DeepSeek'
) providers
LEFT JOIN api_keys USING (provider)
ORDER BY provider;

-- 4. Check for model-specific settings
SELECT
  '=== PROVIDER MODELS ===' AS section,
  '' AS key,
  '' AS value;

SELECT
  'Provider Models' AS section,
  key,
  value
FROM settings
WHERE key IN (
  'llmSettings.geminiModel',
  'llmSettings.openaiModel',
  'llmSettings.claudeModel',
  'llmSettings.deepseekModel'
)
ORDER BY key;

-- 5. Check embedding configuration
SELECT
  '=== EMBEDDING SETTINGS ===' AS section,
  '' AS key,
  '' AS value;

SELECT
  'Embedding Config' AS section,
  key,
  value
FROM settings
WHERE key LIKE 'embedding%'
   OR key LIKE 'embeddings.%'
ORDER BY key;

-- 6. Summary and recommendations
SELECT
  '=== SUMMARY ===' AS section,
  '' AS message;

SELECT
  'Summary' AS section,
  CASE
    WHEN (SELECT COUNT(*) FROM settings WHERE key = 'llmSettings.activeChatModel' AND value IS NOT NULL AND value != '') > 0
    THEN '✅ System is properly configured. Chat should work.'
    ELSE '❌ CRITICAL: activeChatModel NOT configured. User MUST go to Settings UI → API tab and select a model.'
  END AS message;
