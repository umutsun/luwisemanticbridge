-- =====================================================
-- LSEMB Scheduler System - Database Migration
-- Date: 2025-12-29
-- Description: APScheduler-based job scheduling tables
-- =====================================================

-- =====================================================
-- Table: scheduled_jobs
-- Purpose: Stores job definitions and schedules
-- =====================================================
CREATE TABLE IF NOT EXISTS scheduled_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Job Identity
    name VARCHAR(100) NOT NULL,
    description TEXT,
    job_type VARCHAR(50) NOT NULL,
    -- Supported types: 'rag_query', 'crawler', 'embedding_sync', 'cleanup', 'custom_script'

    -- Schedule Configuration
    schedule_type VARCHAR(20) NOT NULL DEFAULT 'cron',
    -- Types: 'cron' (cron expression), 'interval' (every N seconds), 'date' (one-time)
    cron_expression VARCHAR(100),           -- e.g., '0 2 * * *' (daily 2 AM)
    interval_seconds INTEGER,               -- For interval type (minimum 60)
    run_date TIMESTAMP WITH TIME ZONE,      -- For one-time scheduled jobs
    timezone VARCHAR(50) DEFAULT 'Europe/Istanbul',

    -- Job Configuration (flexible JSONB per job type)
    job_config JSONB NOT NULL DEFAULT '{}',
    /*
    Examples:
    RAG Query:
      { "prompt": "...", "model": "gpt-4", "temperature": 0.7, "conversation_id": "uuid" }
    Crawler:
      { "crawler_name": "sahibinden_list_crawler", "url": "...", "pages": 100, "export_to_db": true }
    Embedding Sync:
      { "source_table": "csv_ozelge", "batch_size": 100, "model": "text-embedding-3-small" }
    Cleanup:
      { "retention_days": 90, "tables": ["message_embeddings", "activity_log"] }
    Custom Script:
      { "script_path": "scripts/custom/my_script.py", "args": ["--verbose"], "timeout": 300 }
    */

    -- State
    enabled BOOLEAN DEFAULT true,
    paused_at TIMESTAMP WITH TIME ZONE,     -- When job was paused (null if active)
    paused_reason TEXT,                      -- Why it was paused

    -- APScheduler Integration
    apscheduler_job_id VARCHAR(255),        -- APScheduler internal job ID

    -- Execution Statistics
    last_run_at TIMESTAMP WITH TIME ZONE,
    last_run_duration_ms INTEGER,
    last_run_status VARCHAR(20),            -- 'completed', 'failed', 'timeout'
    next_run_at TIMESTAMP WITH TIME ZONE,
    total_runs INTEGER DEFAULT 0,
    successful_runs INTEGER DEFAULT 0,
    failed_runs INTEGER DEFAULT 0,
    consecutive_failures INTEGER DEFAULT 0,
    last_error TEXT,

    -- Retry Configuration
    max_retries INTEGER DEFAULT 3,
    retry_delay_seconds INTEGER DEFAULT 60,

    -- Audit
    created_by UUID,                        -- User who created the job
    updated_by UUID,                        -- User who last updated
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

    -- Constraints
    CONSTRAINT valid_job_type CHECK (job_type IN ('rag_query', 'crawler', 'embedding_sync', 'cleanup', 'custom_script')),
    CONSTRAINT valid_schedule_type CHECK (schedule_type IN ('cron', 'interval', 'date')),
    CONSTRAINT valid_interval CHECK (interval_seconds IS NULL OR interval_seconds >= 60),
    CONSTRAINT schedule_config_required CHECK (
        (schedule_type = 'cron' AND cron_expression IS NOT NULL) OR
        (schedule_type = 'interval' AND interval_seconds IS NOT NULL) OR
        (schedule_type = 'date' AND run_date IS NOT NULL)
    )
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_scheduled_jobs_enabled ON scheduled_jobs(enabled) WHERE enabled = true;
CREATE INDEX IF NOT EXISTS idx_scheduled_jobs_next_run ON scheduled_jobs(next_run_at) WHERE enabled = true;
CREATE INDEX IF NOT EXISTS idx_scheduled_jobs_type ON scheduled_jobs(job_type);
CREATE INDEX IF NOT EXISTS idx_scheduled_jobs_apscheduler ON scheduled_jobs(apscheduler_job_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_jobs_created_by ON scheduled_jobs(created_by);

-- =====================================================
-- Table: job_execution_logs
-- Purpose: Tracks individual job executions with logs
-- =====================================================
CREATE TABLE IF NOT EXISTS job_execution_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID NOT NULL REFERENCES scheduled_jobs(id) ON DELETE CASCADE,

    -- Execution Details
    started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP WITH TIME ZONE,
    duration_ms INTEGER,
    status VARCHAR(20) NOT NULL DEFAULT 'running',
    -- Status: 'running', 'completed', 'failed', 'timeout', 'cancelled', 'skipped'

    -- Trigger Info
    trigger_type VARCHAR(20) DEFAULT 'scheduled',
    -- Types: 'scheduled', 'manual', 'retry'
    triggered_by UUID,                      -- User who triggered manually (null if scheduled)

    -- Results
    result JSONB,                           -- Job-specific results (varies by job type)
    /*
    Examples:
    RAG Query: { "response": "...", "tokens_used": 1500, "conversation_id": "uuid" }
    Crawler: { "items_found": 150, "items_new": 23, "items_updated": 5 }
    Embedding: { "processed": 100, "skipped": 5, "errors": 2 }
    Cleanup: { "deleted_rows": { "message_embeddings": 500, "activity_log": 200 } }
    */

    -- Error Handling
    error_message TEXT,
    error_stack TEXT,
    error_code VARCHAR(50),                 -- Categorized error code
    retry_count INTEGER DEFAULT 0,

    -- Logs (captured stdout/stderr)
    logs TEXT,                              -- Combined output
    logs_truncated BOOLEAN DEFAULT false,   -- True if logs were too long

    -- Performance Metrics
    memory_usage_mb INTEGER,
    cpu_time_ms INTEGER,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_job_logs_job_id ON job_execution_logs(job_id);
CREATE INDEX IF NOT EXISTS idx_job_logs_status ON job_execution_logs(status);
CREATE INDEX IF NOT EXISTS idx_job_logs_started ON job_execution_logs(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_job_logs_job_status ON job_execution_logs(job_id, status);

-- Partial index for failed jobs (quick failure analysis)
CREATE INDEX IF NOT EXISTS idx_job_logs_failed ON job_execution_logs(job_id, started_at DESC)
    WHERE status = 'failed';

-- =====================================================
-- Table: apscheduler_jobs (APScheduler internal storage)
-- Purpose: APScheduler uses this for persistent job storage
-- Note: APScheduler will create/manage this table automatically
--       but we pre-create it for documentation
-- =====================================================
CREATE TABLE IF NOT EXISTS apscheduler_jobs (
    id VARCHAR(255) PRIMARY KEY,
    next_run_time DOUBLE PRECISION,
    job_state BYTEA NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_apscheduler_next_run ON apscheduler_jobs(next_run_time);

-- =====================================================
-- Triggers
-- =====================================================

-- Auto-update updated_at on scheduled_jobs
CREATE OR REPLACE FUNCTION update_scheduled_jobs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_scheduled_jobs_updated_at ON scheduled_jobs;
CREATE TRIGGER trigger_scheduled_jobs_updated_at
    BEFORE UPDATE ON scheduled_jobs
    FOR EACH ROW
    EXECUTE FUNCTION update_scheduled_jobs_updated_at();

-- Auto-calculate duration on job completion
CREATE OR REPLACE FUNCTION calculate_job_duration()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.completed_at IS NOT NULL AND OLD.completed_at IS NULL THEN
        NEW.duration_ms = EXTRACT(EPOCH FROM (NEW.completed_at - NEW.started_at)) * 1000;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_job_duration ON job_execution_logs;
CREATE TRIGGER trigger_job_duration
    BEFORE UPDATE ON job_execution_logs
    FOR EACH ROW
    EXECUTE FUNCTION calculate_job_duration();

-- =====================================================
-- Comments
-- =====================================================
COMMENT ON TABLE scheduled_jobs IS 'Stores scheduled job definitions with APScheduler integration';
COMMENT ON TABLE job_execution_logs IS 'Tracks individual job executions with results and logs';
COMMENT ON TABLE apscheduler_jobs IS 'APScheduler internal job storage (managed by APScheduler)';

COMMENT ON COLUMN scheduled_jobs.job_config IS 'Flexible JSONB configuration specific to each job type';
COMMENT ON COLUMN scheduled_jobs.apscheduler_job_id IS 'Internal APScheduler job ID for sync';
COMMENT ON COLUMN job_execution_logs.result IS 'Job-specific results in JSONB format';
COMMENT ON COLUMN job_execution_logs.logs IS 'Captured stdout/stderr from job execution';

-- =====================================================
-- Sample Data (Development/Testing Only)
-- =====================================================
-- Uncomment to add sample scheduled jobs for testing

/*
INSERT INTO scheduled_jobs (name, description, job_type, schedule_type, cron_expression, job_config, enabled) VALUES
(
    'Daily Message Cleanup',
    'Her gun saat 02:00 de eski mesajlari temizle',
    'cleanup',
    'cron',
    '0 2 * * *',
    '{"retention_days": 90, "tables": ["message_embeddings"], "vacuum_after": true}',
    true
),
(
    'Hourly Embedding Sync',
    'Her saat yeni kayitlar icin embedding olustur',
    'embedding_sync',
    'interval',
    NULL,
    '{"source_table": "csv_ozelge", "batch_size": 50, "skip_existing": true}',
    false
);
*/

-- =====================================================
-- Migration Complete
-- =====================================================
