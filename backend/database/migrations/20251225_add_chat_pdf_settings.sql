-- Migration: Add Chat PDF Upload Settings
-- Date: 2025-12-25
-- Feature: 003-chat-pdf-upload
-- Description: Adds settings for PDF upload in chat interface

-- =============================================
-- Add PDF Upload Settings
-- =============================================

-- Enable/disable PDF upload in chat
INSERT INTO settings (key, value)
VALUES ('ragSettings.enablePdfUpload', 'false')
ON CONFLICT (key) DO NOTHING;

-- Maximum PDF file size in MB
INSERT INTO settings (key, value)
VALUES ('ragSettings.maxPdfSizeMB', '10')
ON CONFLICT (key) DO NOTHING;

-- Maximum number of pages in PDF
INSERT INTO settings (key, value)
VALUES ('ragSettings.maxPdfPages', '30')
ON CONFLICT (key) DO NOTHING;

-- =============================================
-- Verification
-- =============================================

-- Check if settings were added
-- SELECT key, value FROM settings WHERE key LIKE 'ragSettings.%Pdf%';

-- =============================================
-- Rollback (if needed)
-- =============================================

-- DELETE FROM settings WHERE key IN (
--   'ragSettings.enablePdfUpload',
--   'ragSettings.maxPdfSizeMB',
--   'ragSettings.maxPdfPages'
-- );
