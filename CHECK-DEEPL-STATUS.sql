-- Check DeepL verified status in database

-- 1. Check all DeepL-related settings
SELECT
  '=== DEEPL SETTINGS ===' AS section,
  '' AS key,
  '' AS value;

SELECT
  'DeepL Settings' AS section,
  key,
  CASE
    WHEN key LIKE '%apiKey%' THEN LEFT(value, 20) || '...'
    ELSE value
  END AS value
FROM settings
WHERE key LIKE 'deepl.%' OR key LIKE '%deepl%' OR key LIKE 'apiStatus.deepl%'
ORDER BY key;

-- 2. Check if verifiedDate exists
SELECT
  '=== VERIFIED DATE STATUS ===' AS section,
  '' AS key,
  '' AS value;

SELECT
  'Verified Date Check' AS section,
  CASE
    WHEN EXISTS (SELECT 1 FROM settings WHERE key = 'deepl.verifiedDate') THEN 'deepl.verifiedDate'
    WHEN EXISTS (SELECT 1 FROM settings WHERE key = 'apiStatus.deepl.verifiedDate') THEN 'apiStatus.deepl.verifiedDate'
    ELSE '❌ NO verifiedDate found'
  END AS key,
  CASE
    WHEN EXISTS (SELECT 1 FROM settings WHERE key = 'deepl.verifiedDate') THEN (SELECT value FROM settings WHERE key = 'deepl.verifiedDate')
    WHEN EXISTS (SELECT 1 FROM settings WHERE key = 'apiStatus.deepl.verifiedDate') THEN (SELECT value FROM settings WHERE key = 'apiStatus.deepl.verifiedDate')
    ELSE 'NOT FOUND'
  END AS value;

-- 3. Check API status structure
SELECT
  '=== API STATUS STRUCTURE ===' AS section,
  '' AS key,
  '' AS value;

SELECT
  'API Status Keys' AS section,
  key,
  value
FROM settings
WHERE key LIKE 'apiStatus.deepl.%'
ORDER BY key;

-- 4. Recommendation
SELECT
  '=== RECOMMENDATION ===' AS section,
  '' AS message;

SELECT
  'Recommendation' AS section,
  CASE
    WHEN EXISTS (SELECT 1 FROM settings WHERE key = 'deepl.verifiedDate' AND value IS NOT NULL)
    THEN '✅ deepl.verifiedDate exists - backend should read it'
    WHEN EXISTS (SELECT 1 FROM settings WHERE key = 'apiStatus.deepl.verifiedDate' AND value IS NOT NULL)
    THEN '✅ apiStatus.deepl.verifiedDate exists - backend should read it'
    ELSE '❌ NO verifiedDate found - user needs to validate DeepL API in Settings UI'
  END AS message;
