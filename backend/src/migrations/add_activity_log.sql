-- Create activity_log table for dashboard monitoring
CREATE TABLE IF NOT EXISTS activity_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR(255) NOT NULL,
    activity_type VARCHAR(50) NOT NULL CHECK (activity_type IN ('model_change', 'chat_start', 'chat_message', 'settings_change')),
    details JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_activity_log_user_id ON activity_log(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_activity_type ON activity_log(activity_type);
CREATE INDEX IF NOT EXISTS idx_activity_log_created_at ON activity_log(created_at DESC);

-- Add model column to messages table if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'messages' AND column_name = 'model') THEN
        ALTER TABLE messages ADD COLUMN model VARCHAR(255);
        CREATE INDEX IF NOT EXISTS idx_messages_model ON messages(model);
    END IF;
END $$;

-- Create view for model usage statistics
CREATE OR REPLACE VIEW model_usage_stats AS
SELECT
    model,
    COUNT(*) as message_count,
    COUNT(DISTINCT conversation_id) as conversation_count,
    DATE(created_at) as date_used
FROM messages
WHERE model IS NOT NULL
GROUP BY model, DATE(created_at)
ORDER BY date_used DESC, message_count DESC;

-- Create view for user activity summary
CREATE OR REPLACE VIEW user_activity_summary AS
SELECT
    al.user_id,
    al.activity_type,
    COUNT(*) as activity_count,
    DATE(al.created_at) as activity_date
FROM activity_log al
GROUP BY al.user_id, al.activity_type, DATE(al.created_at)
ORDER BY activity_date DESC, activity_count DESC;