-- Add payload limit settings to settings table
-- Run this in your PostgreSQL database (lsemb)

-- Insert upload payload limits into settings
-- Note: settings table doesn't have 'type' column, removed it
INSERT INTO settings (category, key, value, description, created_at, updated_at)
VALUES
  ('advanced', 'upload_json_limit_mb', '100', 'Maximum JSON payload size in MB (for large CSV uploads)', NOW(), NOW()),
  ('advanced', 'upload_file_limit_mb', '100', 'Maximum file upload size in MB', NOW(), NOW()),
  ('advanced', 'upload_text_limit_mb', '1', 'Maximum text payload size in MB', NOW(), NOW())
ON CONFLICT (key) DO UPDATE SET
  value = EXCLUDED.value,
  description = EXCLUDED.description,
  updated_at = NOW();

-- Verify
SELECT category, key, value, description
FROM settings
WHERE category = 'advanced'
  AND key LIKE '%upload%limit%'
ORDER BY key;
