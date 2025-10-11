-- Fix activity_log table to accept UUID instead of INTEGER for user_id

-- First, create backup if table exists
CREATE TABLE IF NOT EXISTS activity_log_backup AS TABLE activity_log;

-- Drop the existing table (it will be recreated with correct schema on next startup)
DROP TABLE IF EXISTS activity_log;

-- The table will be recreated automatically when the backend starts up