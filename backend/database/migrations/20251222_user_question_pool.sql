-- User Question Pool Table
-- Stores quality user questions for suggestion pool enrichment
-- Created: 2025-12-22

-- Create table for storing quality user questions
CREATE TABLE IF NOT EXISTS user_question_pool (
    id SERIAL PRIMARY KEY,
    question TEXT NOT NULL,
    question_hash VARCHAR(64) NOT NULL UNIQUE, -- MD5 hash for deduplication
    source VARCHAR(50) DEFAULT 'user_chat',    -- Source: user_chat, admin, llm_generated
    quality_score DECIMAL(3,2) DEFAULT 0.5,    -- 0.00-1.00 quality score
    usage_count INTEGER DEFAULT 0,             -- How many times shown as suggestion
    click_count INTEGER DEFAULT 0,             -- How many times clicked
    language VARCHAR(5) DEFAULT 'tr',          -- Language code
    category VARCHAR(100),                     -- Optional category
    is_active BOOLEAN DEFAULT true,            -- Active/inactive flag
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_user_question_pool_active ON user_question_pool(is_active);
CREATE INDEX IF NOT EXISTS idx_user_question_pool_quality ON user_question_pool(quality_score DESC);
CREATE INDEX IF NOT EXISTS idx_user_question_pool_language ON user_question_pool(language);
CREATE INDEX IF NOT EXISTS idx_user_question_pool_hash ON user_question_pool(question_hash);

-- Add comment
COMMENT ON TABLE user_question_pool IS 'Stores quality user questions for suggestion pool enrichment';

-- Insert some seed questions from existing user queries (if messages table exists)
INSERT INTO user_question_pool (question, question_hash, source, quality_score, language)
SELECT DISTINCT
    content,
    MD5(LOWER(TRIM(content))),
    'user_chat',
    0.7,
    'tr'
FROM messages
WHERE role = 'user'
    AND content LIKE '%?%'
    AND LENGTH(content) BETWEEN 20 AND 200
    AND content NOT LIKE '%http%'
    AND content NOT LIKE '%www.%'
    AND content NOT LIKE '%.pdf%'
    AND content NOT LIKE '%@%'
ORDER BY created_at DESC
LIMIT 50
ON CONFLICT (question_hash) DO NOTHING;
