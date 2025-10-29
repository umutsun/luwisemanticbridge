-- Token Usage Tracking Schema
-- Track token consumption per session, user, model for cost analysis

-- Token usage tracking table
CREATE TABLE IF NOT EXISTS token_usage (
  id SERIAL PRIMARY KEY,
  session_id VARCHAR(255),                 -- Chat session ID
  user_id VARCHAR(255),                    -- User ID
  model VARCHAR(100) NOT NULL,             -- Model name (e.g., 'gpt-4', 'claude-3-sonnet')
  provider VARCHAR(50) NOT NULL,           -- Provider (openai, claude, gemini, etc.)

  -- Token counts
  prompt_tokens INTEGER NOT NULL DEFAULT 0,
  completion_tokens INTEGER NOT NULL DEFAULT 0,
  total_tokens INTEGER NOT NULL DEFAULT 0,

  -- Cost calculation
  cost_usd DECIMAL(10, 6) DEFAULT 0,       -- Cost in USD

  -- Context
  operation_type VARCHAR(50),              -- 'chat', 'embedding', 'search', 'completion'
  metadata JSONB,                          -- Additional context

  -- Timestamps
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  -- Indexes
  INDEX idx_token_usage_session (session_id),
  INDEX idx_token_usage_user (user_id),
  INDEX idx_token_usage_model (model),
  INDEX idx_token_usage_created_at (created_at),
  INDEX idx_token_usage_operation (operation_type)
);

-- Model pricing table (for cost calculation)
CREATE TABLE IF NOT EXISTS model_pricing (
  id SERIAL PRIMARY KEY,
  provider VARCHAR(50) NOT NULL,
  model VARCHAR(100) NOT NULL,

  -- Pricing per 1M tokens (in USD)
  input_price_per_1m DECIMAL(10, 4) NOT NULL,
  output_price_per_1m DECIMAL(10, 4) NOT NULL,

  -- Metadata
  currency VARCHAR(10) DEFAULT 'USD',
  effective_date DATE DEFAULT CURRENT_DATE,
  is_active BOOLEAN DEFAULT true,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  UNIQUE(provider, model, effective_date)
);

-- Insert default model pricing (as of 2025)
INSERT INTO model_pricing (provider, model, input_price_per_1m, output_price_per_1m) VALUES
  -- OpenAI
  ('openai', 'gpt-4', 30.00, 60.00),
  ('openai', 'gpt-4-turbo', 10.00, 30.00),
  ('openai', 'gpt-4o', 5.00, 15.00),
  ('openai', 'gpt-4o-mini', 0.15, 0.60),
  ('openai', 'gpt-3.5-turbo', 0.50, 1.50),
  ('openai', 'text-embedding-3-small', 0.02, 0.00),
  ('openai', 'text-embedding-3-large', 0.13, 0.00),
  ('openai', 'text-embedding-ada-002', 0.10, 0.00),

  -- Anthropic Claude
  ('claude', 'claude-3-opus', 15.00, 75.00),
  ('claude', 'claude-3-sonnet', 3.00, 15.00),
  ('claude', 'claude-3-haiku', 0.25, 1.25),
  ('claude', 'claude-3-5-sonnet', 3.00, 15.00),

  -- Google Gemini
  ('gemini', 'gemini-1.5-pro', 3.50, 10.50),
  ('gemini', 'gemini-1.5-flash', 0.35, 1.05),
  ('gemini', 'gemini-pro', 0.50, 1.50),
  ('gemini', 'text-embedding-004', 0.00, 0.00),

  -- DeepSeek
  ('deepseek', 'deepseek-chat', 0.14, 0.28),
  ('deepseek', 'deepseek-coder', 0.14, 0.28)
ON CONFLICT (provider, model, effective_date) DO NOTHING;

-- Session summary view (for dashboard)
CREATE OR REPLACE VIEW session_token_summary AS
SELECT
  session_id,
  user_id,
  COUNT(*) as message_count,
  SUM(prompt_tokens) as total_prompt_tokens,
  SUM(completion_tokens) as total_completion_tokens,
  SUM(total_tokens) as total_tokens,
  SUM(cost_usd) as total_cost_usd,
  array_agg(DISTINCT model) as models_used,
  MIN(created_at) as session_start,
  MAX(created_at) as session_end
FROM token_usage
WHERE session_id IS NOT NULL
GROUP BY session_id, user_id;

-- Daily usage summary view
CREATE OR REPLACE VIEW daily_token_summary AS
SELECT
  DATE(created_at) as date,
  user_id,
  provider,
  model,
  operation_type,
  COUNT(*) as request_count,
  SUM(prompt_tokens) as total_prompt_tokens,
  SUM(completion_tokens) as total_completion_tokens,
  SUM(total_tokens) as total_tokens,
  SUM(cost_usd) as total_cost_usd,
  AVG(total_tokens) as avg_tokens_per_request
FROM token_usage
GROUP BY DATE(created_at), user_id, provider, model, operation_type;

-- User total usage view
CREATE OR REPLACE VIEW user_token_summary AS
SELECT
  user_id,
  COUNT(*) as total_requests,
  SUM(prompt_tokens) as total_prompt_tokens,
  SUM(completion_tokens) as total_completion_tokens,
  SUM(total_tokens) as total_tokens,
  SUM(cost_usd) as total_cost_usd,
  array_agg(DISTINCT model) as models_used,
  MIN(created_at) as first_request,
  MAX(created_at) as last_request
FROM token_usage
WHERE user_id IS NOT NULL
GROUP BY user_id;

-- Model usage summary view
CREATE OR REPLACE VIEW model_usage_summary AS
SELECT
  provider,
  model,
  COUNT(*) as request_count,
  SUM(total_tokens) as total_tokens,
  SUM(cost_usd) as total_cost_usd,
  AVG(total_tokens) as avg_tokens_per_request,
  MIN(created_at) as first_used,
  MAX(created_at) as last_used
FROM token_usage
GROUP BY provider, model
ORDER BY total_tokens DESC;

-- Comments
COMMENT ON TABLE token_usage IS 'Track token usage and costs for all LLM operations';
COMMENT ON TABLE model_pricing IS 'Store current pricing for different models';
COMMENT ON VIEW session_token_summary IS 'Aggregated token usage per session';
COMMENT ON VIEW daily_token_summary IS 'Daily token usage breakdown';
COMMENT ON VIEW user_token_summary IS 'Total usage per user';
COMMENT ON VIEW model_usage_summary IS 'Usage statistics per model';
