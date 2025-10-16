-- Add updated_at column to user_sessions table
ALTER TABLE user_sessions ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- Create trigger for updating updated_at column
CREATE TRIGGER update_user_sessions_updated_at BEFORE UPDATE ON user_sessions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Update existing records to have initial updated_at
UPDATE user_sessions SET updated_at = created_at WHERE updated_at IS NULL;