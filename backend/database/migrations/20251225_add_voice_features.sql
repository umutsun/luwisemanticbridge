-- Migration: Add Voice Features Settings (TTS & STT)
-- Date: 2025-12-25
-- Feature: 004-voice-features
-- Description: Adds settings for voice input (STT) and voice output (TTS) in chat interface

-- =============================================
-- Add Voice Features Settings
-- =============================================

-- Enable/disable voice input (STT - Speech to Text)
INSERT INTO settings (key, value)
VALUES ('voiceSettings.enableVoiceInput', 'false')
ON CONFLICT (key) DO NOTHING;

-- Enable/disable voice output (TTS - Text to Speech)
INSERT INTO settings (key, value)
VALUES ('voiceSettings.enableVoiceOutput', 'false')
ON CONFLICT (key) DO NOTHING;

-- TTS Provider (openai is the default)
INSERT INTO settings (key, value)
VALUES ('voiceSettings.ttsProvider', 'openai')
ON CONFLICT (key) DO NOTHING;

-- TTS Voice (alloy, echo, fable, onyx, nova, shimmer)
INSERT INTO settings (key, value)
VALUES ('voiceSettings.ttsVoice', 'alloy')
ON CONFLICT (key) DO NOTHING;

-- TTS Speed (0.25 to 4.0, default 1.0)
INSERT INTO settings (key, value)
VALUES ('voiceSettings.ttsSpeed', '1.0')
ON CONFLICT (key) DO NOTHING;

-- Maximum recording duration in seconds
INSERT INTO settings (key, value)
VALUES ('voiceSettings.maxRecordingSeconds', '60')
ON CONFLICT (key) DO NOTHING;

-- =============================================
-- Verification
-- =============================================

-- Check if settings were added
-- SELECT key, value FROM settings WHERE key LIKE 'voiceSettings.%';

-- =============================================
-- Rollback (if needed)
-- =============================================

-- DELETE FROM settings WHERE key IN (
--   'voiceSettings.enableVoiceInput',
--   'voiceSettings.enableVoiceOutput',
--   'voiceSettings.ttsProvider',
--   'voiceSettings.ttsVoice',
--   'voiceSettings.ttsSpeed',
--   'voiceSettings.maxRecordingSeconds'
-- );
