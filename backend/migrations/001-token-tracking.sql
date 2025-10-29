-- ============================================
-- TOKEN TRACKING MIGRATION
-- ============================================
-- Bu migration tüm LLM işlemlerinde (chat, embeddings, search, migrations, etc.)
-- kullanılan token'ları track eder ve maliyet hesaplar

-- ============================================
-- 1. TOKEN USAGE TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS token_usage (
  id SERIAL PRIMARY KEY,

  -- Session/User Context
  session_id VARCHAR(255),                 -- Chat session ID, migration job ID, etc.
  user_id VARCHAR(255),                    -- User ID (if applicable)

  -- Model Information
  model VARCHAR(100) NOT NULL,             -- 'gpt-4o-mini', 'claude-3-5-sonnet', etc.
  provider VARCHAR(50) NOT NULL,           -- 'openai', 'claude', 'gemini', 'deepseek'

  -- Token Counts
  prompt_tokens INTEGER NOT NULL DEFAULT 0,
  completion_tokens INTEGER NOT NULL DEFAULT 0,
  total_tokens INTEGER NOT NULL DEFAULT 0,

  -- Cost Calculation
  cost_usd DECIMAL(10, 6) DEFAULT 0,       -- Calculated cost in USD

  -- Operation Context
  operation_type VARCHAR(50),              -- 'chat', 'embedding', 'search', 'migration', 'document_processing', 'scrape_processing'
  operation_id VARCHAR(255),               -- Specific operation ID (message_id, document_id, scrape_id, etc.)

  -- Additional Context
  metadata JSONB,                          -- Extra context (e.g., document name, scrape URL, etc.)

  -- Timestamps
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  -- Indexes for fast queries
  CONSTRAINT token_usage_pkey PRIMARY KEY (id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_token_usage_session ON token_usage(session_id);
CREATE INDEX IF NOT EXISTS idx_token_usage_user ON token_usage(user_id);
CREATE INDEX IF NOT EXISTS idx_token_usage_model ON token_usage(model);
CREATE INDEX IF NOT EXISTS idx_token_usage_provider ON token_usage(provider);
CREATE INDEX IF NOT EXISTS idx_token_usage_operation_type ON token_usage(operation_type);
CREATE INDEX IF NOT EXISTS idx_token_usage_operation_id ON token_usage(operation_id);
CREATE INDEX IF NOT EXISTS idx_token_usage_created_at ON token_usage(created_at);

-- Comments
COMMENT ON TABLE token_usage IS 'Track token usage and costs for all LLM operations across the platform';
COMMENT ON COLUMN token_usage.session_id IS 'Chat session ID, migration job ID, batch ID, etc.';
COMMENT ON COLUMN token_usage.operation_type IS 'Type: chat, embedding, search, migration, document_processing, scrape_processing';
COMMENT ON COLUMN token_usage.operation_id IS 'Specific ID: message_id, document_id, scrape_id, migration_id, etc.';

-- ============================================
-- 2. MODEL PRICING TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS model_pricing (
  id SERIAL PRIMARY KEY,

  -- Model Information
  provider VARCHAR(50) NOT NULL,
  model VARCHAR(100) NOT NULL,

  -- Pricing (USD per 1M tokens)
  input_price_per_1m DECIMAL(10, 4) NOT NULL,
  output_price_per_1m DECIMAL(10, 4) NOT NULL,

  -- Metadata
  currency VARCHAR(10) DEFAULT 'USD',
  effective_date DATE DEFAULT CURRENT_DATE,
  is_active BOOLEAN DEFAULT true,

  -- Timestamps
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  -- Unique constraint
  UNIQUE(provider, model, effective_date)
);

CREATE INDEX IF NOT EXISTS idx_model_pricing_active ON model_pricing(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_model_pricing_provider_model ON model_pricing(provider, model);

COMMENT ON TABLE model_pricing IS 'Store pricing for different LLM models';
COMMENT ON COLUMN model_pricing.input_price_per_1m IS 'Price in USD per 1 million input tokens';
COMMENT ON COLUMN model_pricing.output_price_per_1m IS 'Price in USD per 1 million output tokens';

-- ============================================
-- 3. INSERT DEFAULT MODEL PRICING (2025)
-- ============================================

INSERT INTO model_pricing (provider, model, input_price_per_1m, output_price_per_1m) VALUES
  -- OpenAI Models
  ('openai', 'gpt-4', 30.00, 60.00),
  ('openai', 'gpt-4-turbo', 10.00, 30.00),
  ('openai', 'gpt-4-turbo-preview', 10.00, 30.00),
  ('openai', 'gpt-4o', 5.00, 15.00),
  ('openai', 'gpt-4o-mini', 0.15, 0.60),
  ('openai', 'gpt-3.5-turbo', 0.50, 1.50),
  ('openai', 'gpt-3.5-turbo-16k', 3.00, 4.00),

  -- OpenAI Embeddings
  ('openai', 'text-embedding-3-small', 0.02, 0.00),
  ('openai', 'text-embedding-3-large', 0.13, 0.00),
  ('openai', 'text-embedding-ada-002', 0.10, 0.00),

  -- Anthropic Claude
  ('claude', 'claude-3-opus', 15.00, 75.00),
  ('claude', 'claude-3-opus-20240229', 15.00, 75.00),
  ('claude', 'claude-3-sonnet', 3.00, 15.00),
  ('claude', 'claude-3-sonnet-20240229', 3.00, 15.00),
  ('claude', 'claude-3-5-sonnet', 3.00, 15.00),
  ('claude', 'claude-3-5-sonnet-20241022', 3.00, 15.00),
  ('claude', 'claude-3-haiku', 0.25, 1.25),
  ('claude', 'claude-3-haiku-20240307', 0.25, 1.25),

  -- Google Gemini
  ('gemini', 'gemini-1.5-pro', 3.50, 10.50),
  ('gemini', 'gemini-1.5-pro-latest', 3.50, 10.50),
  ('gemini', 'gemini-1.5-flash', 0.35, 1.05),
  ('gemini', 'gemini-1.5-flash-latest', 0.35, 1.05),
  ('gemini', 'gemini-pro', 0.50, 1.50),
  ('gemini', 'gemini-pro-vision', 0.50, 1.50),

  -- Google Embeddings
  ('gemini', 'text-embedding-004', 0.00, 0.00),
  ('google', 'text-embedding-004', 0.00, 0.00),

  -- DeepSeek
  ('deepseek', 'deepseek-chat', 0.14, 0.28),
  ('deepseek', 'deepseek-coder', 0.14, 0.28)
ON CONFLICT (provider, model, effective_date) DO NOTHING;

-- ============================================
-- 4. VIEWS FOR DASHBOARD ANALYTICS
-- ============================================

-- 4.1 Session/Operation Summary
CREATE OR REPLACE VIEW v_session_token_summary AS
SELECT
  session_id,
  user_id,
  operation_type,
  COUNT(*) as request_count,
  SUM(prompt_tokens) as total_prompt_tokens,
  SUM(completion_tokens) as total_completion_tokens,
  SUM(total_tokens) as total_tokens,
  SUM(cost_usd) as total_cost_usd,
  array_agg(DISTINCT model) as models_used,
  MIN(created_at) as started_at,
  MAX(created_at) as ended_at
FROM token_usage
WHERE session_id IS NOT NULL
GROUP BY session_id, user_id, operation_type;

COMMENT ON VIEW v_session_token_summary IS 'Token usage summary per session/operation';

-- 4.2 User Total Usage
CREATE OR REPLACE VIEW v_user_token_summary AS
SELECT
  user_id,
  COUNT(*) as total_requests,
  SUM(prompt_tokens) as total_prompt_tokens,
  SUM(completion_tokens) as total_completion_tokens,
  SUM(total_tokens) as total_tokens,
  SUM(cost_usd) as total_cost_usd,
  array_agg(DISTINCT model) as models_used,
  array_agg(DISTINCT operation_type) as operation_types,
  MIN(created_at) as first_request,
  MAX(created_at) as last_request
FROM token_usage
WHERE user_id IS NOT NULL
GROUP BY user_id;

COMMENT ON VIEW v_user_token_summary IS 'Total token usage per user across all operations';

-- 4.3 Daily Usage by Operation Type
CREATE OR REPLACE VIEW v_daily_usage_by_operation AS
SELECT
  DATE(created_at) as date,
  operation_type,
  provider,
  model,
  COUNT(*) as request_count,
  SUM(prompt_tokens) as total_prompt_tokens,
  SUM(completion_tokens) as total_completion_tokens,
  SUM(total_tokens) as total_tokens,
  SUM(cost_usd) as total_cost_usd,
  AVG(total_tokens) as avg_tokens_per_request,
  COUNT(DISTINCT user_id) as unique_users
FROM token_usage
GROUP BY DATE(created_at), operation_type, provider, model
ORDER BY date DESC, total_tokens DESC;

COMMENT ON VIEW v_daily_usage_by_operation IS 'Daily token usage breakdown by operation type';

-- 4.4 Model Usage Statistics
CREATE OR REPLACE VIEW v_model_usage_stats AS
SELECT
  provider,
  model,
  operation_type,
  COUNT(*) as request_count,
  SUM(total_tokens) as total_tokens,
  SUM(cost_usd) as total_cost_usd,
  AVG(total_tokens) as avg_tokens_per_request,
  AVG(cost_usd) as avg_cost_per_request,
  MIN(created_at) as first_used,
  MAX(created_at) as last_used
FROM token_usage
GROUP BY provider, model, operation_type
ORDER BY total_tokens DESC;

COMMENT ON VIEW v_model_usage_stats IS 'Usage statistics per model and operation type';

-- 4.5 Operation Type Summary
CREATE OR REPLACE VIEW v_operation_type_summary AS
SELECT
  operation_type,
  COUNT(*) as total_requests,
  SUM(total_tokens) as total_tokens,
  SUM(cost_usd) as total_cost_usd,
  AVG(total_tokens) as avg_tokens_per_request,
  COUNT(DISTINCT user_id) as unique_users,
  COUNT(DISTINCT session_id) as unique_sessions,
  array_agg(DISTINCT model) as models_used
FROM token_usage
WHERE operation_type IS NOT NULL
GROUP BY operation_type
ORDER BY total_tokens DESC;

COMMENT ON VIEW v_operation_type_summary IS 'Summary statistics per operation type (chat, embedding, migration, etc.)';

-- 4.6 Hourly Usage (for real-time monitoring)
CREATE OR REPLACE VIEW v_hourly_usage AS
SELECT
  DATE_TRUNC('hour', created_at) as hour,
  operation_type,
  COUNT(*) as request_count,
  SUM(total_tokens) as total_tokens,
  SUM(cost_usd) as total_cost_usd
FROM token_usage
WHERE created_at >= NOW() - INTERVAL '24 hours'
GROUP BY DATE_TRUNC('hour', created_at), operation_type
ORDER BY hour DESC;

COMMENT ON VIEW v_hourly_usage IS 'Hourly token usage for last 24 hours';

-- 4.7 Cost Analysis by User and Operation
CREATE OR REPLACE VIEW v_user_operation_costs AS
SELECT
  user_id,
  operation_type,
  COUNT(*) as request_count,
  SUM(total_tokens) as total_tokens,
  SUM(cost_usd) as total_cost_usd,
  AVG(cost_usd) as avg_cost_per_request,
  array_agg(DISTINCT model) as models_used
FROM token_usage
WHERE user_id IS NOT NULL AND operation_type IS NOT NULL
GROUP BY user_id, operation_type
ORDER BY total_cost_usd DESC;

COMMENT ON VIEW v_user_operation_costs IS 'Cost breakdown per user and operation type';

-- ============================================
-- 5. UTILITY FUNCTIONS
-- ============================================

-- 5.1 Function to get total cost for date range
CREATE OR REPLACE FUNCTION get_total_cost(
  start_date TIMESTAMP,
  end_date TIMESTAMP,
  p_user_id VARCHAR DEFAULT NULL,
  p_operation_type VARCHAR DEFAULT NULL
)
RETURNS TABLE (
  total_tokens BIGINT,
  total_cost_usd NUMERIC,
  request_count BIGINT,
  unique_models BIGINT,
  avg_tokens_per_request NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COALESCE(SUM(tu.total_tokens), 0)::BIGINT,
    COALESCE(SUM(tu.cost_usd), 0)::NUMERIC,
    COUNT(*)::BIGINT,
    COUNT(DISTINCT tu.model)::BIGINT,
    COALESCE(AVG(tu.total_tokens), 0)::NUMERIC
  FROM token_usage tu
  WHERE tu.created_at >= start_date
    AND tu.created_at < end_date
    AND (p_user_id IS NULL OR tu.user_id = p_user_id)
    AND (p_operation_type IS NULL OR tu.operation_type = p_operation_type);
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_total_cost IS 'Get total cost and statistics for a date range with optional filters';

-- 5.2 Function to calculate cost for specific token counts
CREATE OR REPLACE FUNCTION calculate_token_cost(
  p_provider VARCHAR,
  p_model VARCHAR,
  p_prompt_tokens INTEGER,
  p_completion_tokens INTEGER
)
RETURNS NUMERIC AS $$
DECLARE
  input_price NUMERIC;
  output_price NUMERIC;
  total_cost NUMERIC;
BEGIN
  -- Get latest pricing
  SELECT input_price_per_1m, output_price_per_1m
  INTO input_price, output_price
  FROM model_pricing
  WHERE provider = p_provider
    AND model = p_model
    AND is_active = true
  ORDER BY effective_date DESC
  LIMIT 1;

  -- If no pricing found, return 0
  IF input_price IS NULL THEN
    RETURN 0;
  END IF;

  -- Calculate cost (price per 1M tokens)
  total_cost := (p_prompt_tokens / 1000000.0) * input_price +
                (p_completion_tokens / 1000000.0) * output_price;

  RETURN total_cost;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION calculate_token_cost IS 'Calculate cost in USD for given token counts and model';

-- ============================================
-- 6. SAMPLE QUERIES (FOR TESTING)
-- ============================================

-- Get today's total cost
-- SELECT * FROM get_total_cost(CURRENT_DATE, CURRENT_DATE + INTERVAL '1 day');

-- Get cost for specific user
-- SELECT * FROM get_total_cost(CURRENT_DATE - INTERVAL '30 days', CURRENT_DATE, 'user_123');

-- Get cost by operation type
-- SELECT operation_type, total_cost_usd FROM v_operation_type_summary ORDER BY total_cost_usd DESC;

-- Get user's usage
-- SELECT * FROM v_user_token_summary WHERE user_id = 'user_123';

-- Get session details
-- SELECT * FROM v_session_token_summary WHERE session_id = 'chat_abc123';

-- Calculate cost manually
-- SELECT calculate_token_cost('openai', 'gpt-4o-mini', 1000, 500);

-- ============================================
-- MIGRATION COMPLETE
-- ============================================

-- Verify tables created
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE tablename = 'token_usage') THEN
    RAISE NOTICE '✅ token_usage table created successfully';
  END IF;

  IF EXISTS (SELECT FROM pg_tables WHERE tablename = 'model_pricing') THEN
    RAISE NOTICE '✅ model_pricing table created successfully';
  END IF;

  -- Count pricing rows
  RAISE NOTICE '✅ Loaded % model pricing entries', (SELECT COUNT(*) FROM model_pricing);
END $$;
