-- Update deprecated Claude model to newer version
UPDATE chatbot_settings
SET setting_value = 'anthropic/claude-3-5-sonnet'
WHERE setting_key = 'llmSettings.activeChatModel'
AND setting_value = 'anthropic/claude-3-sonnet-20240229';

-- Also check and update settings table if needed
UPDATE settings
SET value = 'anthropic/claude-3-5-sonnet'
WHERE key = 'llmSettings.activeChatModel'
AND value = 'anthropic/claude-3-sonnet-20240229';

-- Verify the update
SELECT setting_key, setting_value
FROM chatbot_settings
WHERE setting_key LIKE '%model%' OR setting_key LIKE '%claude%';

SELECT key, value
FROM settings
WHERE key LIKE '%model%' OR key LIKE '%claude%';