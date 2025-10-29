-- Check what model is actually configured in database

-- 1. Check activeChatModel
SELECT
  '=== ACTIVE CHAT MODEL ===' as section,
  key,
  value,
  updated_at
FROM settings
WHERE key = 'llmSettings.activeChatModel';

-- 2. Check all LLM settings
SELECT
  '=== ALL LLM SETTINGS ===' as section,
  key,
  value,
  updated_at
FROM settings
WHERE key LIKE 'llmSettings.%'
ORDER BY key;

-- 3. Check provider API keys
SELECT
  '=== PROVIDER API KEYS ===' as section,
  key,
  CASE
    WHEN value IS NOT NULL AND value != '' THEN LEFT(value, 20) || '...'
    ELSE '❌ NOT SET'
  END as value_preview,
  updated_at
FROM settings
WHERE key LIKE '%.apiKey'
ORDER BY key;

-- 4. Check API status
SELECT
  '=== API STATUS ===' as section,
  key,
  value,
  updated_at
FROM settings
WHERE key LIKE 'apiStatus.%'
ORDER BY key;

-- 5. Summary
SELECT
  CASE
    WHEN EXISTS (
      SELECT 1 FROM settings
      WHERE key = 'llmSettings.activeChatModel'
      AND value IS NOT NULL
      AND value != ''
    ) THEN '✅ activeChatModel is set: ' || (
      SELECT value FROM settings WHERE key = 'llmSettings.activeChatModel'
    )
    ELSE '❌ activeChatModel NOT SET - this is the problem!'
  END as status;
