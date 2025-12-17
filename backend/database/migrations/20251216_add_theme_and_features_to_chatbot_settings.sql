-- Migration: Add theme and features to chatbot_settings
-- Date: 2025-12-16
-- Description: Adds theme selection and feature flags to chatbot_settings table

-- Add theme column (default: modern)
ALTER TABLE chatbot_settings
ADD COLUMN IF NOT EXISTS theme VARCHAR(20) DEFAULT 'modern'
CHECK (theme IN ('base', 'modern', 'spark', 'unified'));

-- Add features column (JSONB for flexibility)
ALTER TABLE chatbot_settings
ADD COLUMN IF NOT EXISTS features JSONB DEFAULT '{
  "enableSourcesSection": true,
  "enableKeywordHighlighting": true,
  "enableSourceExpansion": true,
  "sourceDisplayStyle": "detailed",
  "enableResponseTime": true,
  "enableTokenCount": true,
  "enableConfidenceScore": true,
  "enableFollowUpQuestions": false,
  "enableActionButtons": false,
  "enableSourceClick": true,
  "inputStyle": "inline",
  "headerStyle": "modern",
  "messageStyle": "card",
  "enableWelcomeMessage": true,
  "enableSuggestions": true,
  "suggestionsCount": 4,
  "enableStreaming": true,
  "enableTypingIndicator": true,
  "enableAutoScroll": true
}'::jsonb;

-- Update existing rows with default values if they exist
UPDATE chatbot_settings
SET theme = 'modern'
WHERE theme IS NULL;

UPDATE chatbot_settings
SET features = '{
  "enableSourcesSection": true,
  "enableKeywordHighlighting": true,
  "enableSourceExpansion": true,
  "sourceDisplayStyle": "detailed",
  "enableResponseTime": true,
  "enableTokenCount": true,
  "enableConfidenceScore": true,
  "enableFollowUpQuestions": false,
  "enableActionButtons": false,
  "enableSourceClick": true,
  "inputStyle": "inline",
  "headerStyle": "modern",
  "messageStyle": "card",
  "enableWelcomeMessage": true,
  "enableSuggestions": true,
  "suggestionsCount": 4,
  "enableStreaming": true,
  "enableTypingIndicator": true,
  "enableAutoScroll": true
}'::jsonb
WHERE features IS NULL;

-- Add comment for documentation
COMMENT ON COLUMN chatbot_settings.theme IS 'Visual theme: base (classic), modern (zen), spark (AI-inspired), unified (modular)';
COMMENT ON COLUMN chatbot_settings.features IS 'Feature flags configuration (JSONB) - controls UI behavior and features';

-- Create index for theme queries (optional, for performance)
CREATE INDEX IF NOT EXISTS idx_chatbot_settings_theme ON chatbot_settings(theme);

-- Rollback script (if needed):
-- ALTER TABLE chatbot_settings DROP COLUMN IF EXISTS theme;
-- ALTER TABLE chatbot_settings DROP COLUMN IF EXISTS features;
-- DROP INDEX IF EXISTS idx_chatbot_settings_theme;
