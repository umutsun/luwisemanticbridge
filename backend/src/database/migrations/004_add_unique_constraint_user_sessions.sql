-- First, remove duplicate sessions, keeping only the most recent one for each user
DELETE FROM user_sessions WHERE id NOT IN (
  SELECT DISTINCT ON (user_id) id FROM user_sessions ORDER BY user_id, updated_at DESC, id DESC
);

-- Now add the unique constraint on user_id in user_sessions table
-- This allows ON CONFLICT clauses to work properly
ALTER TABLE user_sessions ADD CONSTRAINT user_sessions_user_id_unique UNIQUE (user_id);