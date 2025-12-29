"""
Job Type Definitions and Enums for LSEMB Scheduler
"""

from enum import Enum
from typing import Optional, Dict, Any, List
from datetime import datetime
from pydantic import BaseModel, Field, validator
import re


class JobType(str, Enum):
    """Supported job types"""
    RAG_QUERY = "rag_query"
    CRAWLER = "crawler"
    EMBEDDING_SYNC = "embedding_sync"
    CLEANUP = "cleanup"
    CUSTOM_SCRIPT = "custom_script"
    SCRAPE_AND_EMBED = "scrape_and_embed"  # Full pipeline: scrape → redis → db → embeddings


class ScheduleType(str, Enum):
    """Schedule trigger types"""
    CRON = "cron"
    INTERVAL = "interval"
    DATE = "date"


class JobStatus(str, Enum):
    """Job execution status"""
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    TIMEOUT = "timeout"
    CANCELLED = "cancelled"
    SKIPPED = "skipped"


class TriggerType(str, Enum):
    """How the job was triggered"""
    SCHEDULED = "scheduled"
    MANUAL = "manual"
    RETRY = "retry"


# =====================================================
# Job Configuration Models (per job type)
# =====================================================

class RagQueryConfig(BaseModel):
    """Configuration for RAG Query jobs"""
    prompt: str = Field(..., min_length=1, max_length=10000)
    model: str = Field(default="gpt-4")
    temperature: float = Field(default=0.7, ge=0, le=2)
    max_tokens: int = Field(default=2000, ge=100, le=16000)
    conversation_id: Optional[str] = None
    save_to_conversation: bool = Field(default=True)
    notify_user: bool = Field(default=False)
    notification_email: Optional[str] = None


class CrawlerConfig(BaseModel):
    """Configuration for Crawler jobs"""
    crawler_name: str = Field(..., min_length=1)
    url: str = Field(..., min_length=1)
    pages: int = Field(default=10, ge=1, le=1000)
    export_to_db: bool = Field(default=True)
    generate_embeddings: bool = Field(default=False)
    notify_on_new_items: bool = Field(default=False)

    @validator('url')
    def validate_url(cls, v):
        if not v.startswith(('http://', 'https://')):
            raise ValueError('URL must start with http:// or https://')
        return v


class EmbeddingSyncConfig(BaseModel):
    """Configuration for Embedding Sync jobs"""
    source_table: str = Field(..., min_length=1)
    batch_size: int = Field(default=100, ge=10, le=1000)
    model: str = Field(default="text-embedding-3-small")
    skip_existing: bool = Field(default=True)
    content_column: str = Field(default="content")
    metadata_columns: List[str] = Field(default_factory=list)
    filters: Optional[Dict[str, Any]] = None


class CleanupConfig(BaseModel):
    """Configuration for Cleanup jobs"""
    retention_days: int = Field(default=90, ge=1, le=365)
    tables: List[str] = Field(default_factory=lambda: ["message_embeddings", "job_execution_logs"])
    vacuum_after: bool = Field(default=False)
    dry_run: bool = Field(default=False)


class CustomScriptConfig(BaseModel):
    """Configuration for Custom Script jobs"""
    script_path: str = Field(..., min_length=1)
    args: List[str] = Field(default_factory=list)
    timeout_seconds: int = Field(default=300, ge=30, le=3600)
    working_directory: Optional[str] = None

    @validator('script_path')
    def validate_script_path(cls, v):
        # Security: Only allow scripts in specific directories
        allowed_prefixes = ['scripts/', 'crawlers/']
        if not any(v.startswith(prefix) for prefix in allowed_prefixes):
            raise ValueError(f'Script must be in allowed directories: {allowed_prefixes}')
        # Prevent path traversal
        if '..' in v:
            raise ValueError('Path traversal not allowed')
        return v


class ScrapeAndEmbedConfig(BaseModel):
    """
    Configuration for Scrape and Embed pipeline jobs.

    Pipeline:
    1. Run crawler/scraper → data to Redis
    2. Export Redis data to PostgreSQL table
    3. Generate embeddings for new records
    """
    # Scraper settings
    scraper_type: str = Field(..., description="Type: sahibinden, hepsiburada, generic, custom")
    scraper_url: str = Field(..., min_length=1)
    scraper_name: str = Field(..., min_length=1, description="Unique name for Redis key prefix")
    max_pages: int = Field(default=10, ge=1, le=500)

    # Redis settings
    redis_db: int = Field(default=1, ge=0, le=15)
    redis_key_prefix: Optional[str] = None  # If None, uses scraper_name
    check_existing: bool = Field(default=True, description="Skip items already in Redis")

    # Export settings
    export_to_table: str = Field(..., min_length=1, description="Target PostgreSQL table")
    export_mode: str = Field(default="upsert", description="insert, upsert, replace")
    id_column: str = Field(default="source_id", description="Column for deduplication")

    # Embedding settings
    generate_embeddings: bool = Field(default=True)
    embedding_model: str = Field(default="text-embedding-3-small")
    embedding_content_column: str = Field(default="content")
    embedding_batch_size: int = Field(default=100, ge=10, le=500)

    # Pipeline control
    skip_scrape_if_recent: bool = Field(default=False, description="Skip scraping if data is recent")
    recent_threshold_hours: int = Field(default=6, ge=1, le=168)
    notify_on_new_items: bool = Field(default=False)
    min_new_items_to_notify: int = Field(default=10, ge=1)

    @validator('scraper_url')
    def validate_url(cls, v):
        if not v.startswith(('http://', 'https://')):
            raise ValueError('URL must start with http:// or https://')
        return v

    @validator('scraper_type')
    def validate_scraper_type(cls, v):
        allowed = ['sahibinden', 'hepsiburada', 'trendyol', 'generic', 'custom', 'rss', 'sitemap']
        if v not in allowed:
            raise ValueError(f'scraper_type must be one of: {allowed}')
        return v

    @validator('export_mode')
    def validate_export_mode(cls, v):
        allowed = ['insert', 'upsert', 'replace']
        if v not in allowed:
            raise ValueError(f'export_mode must be one of: {allowed}')
        return v


# =====================================================
# API Request/Response Models
# =====================================================

class CreateScheduledJobRequest(BaseModel):
    """Request model for creating a scheduled job"""
    name: str = Field(..., min_length=1, max_length=100)
    description: Optional[str] = Field(None, max_length=500)
    job_type: JobType
    schedule_type: ScheduleType = ScheduleType.CRON
    cron_expression: Optional[str] = None
    interval_seconds: Optional[int] = Field(None, ge=60)
    run_date: Optional[datetime] = None
    timezone: str = Field(default="Europe/Istanbul")
    job_config: Dict[str, Any]
    enabled: bool = Field(default=True)
    max_retries: int = Field(default=3, ge=0, le=10)
    retry_delay_seconds: int = Field(default=60, ge=10, le=3600)

    @validator('cron_expression')
    def validate_cron(cls, v, values):
        if values.get('schedule_type') == ScheduleType.CRON:
            if not v:
                raise ValueError('cron_expression is required for cron schedule type')
            # Basic cron validation (5 fields: min hour day month weekday)
            parts = v.split()
            if len(parts) != 5:
                raise ValueError('Cron expression must have 5 fields: minute hour day month weekday')
        return v

    @validator('interval_seconds')
    def validate_interval(cls, v, values):
        if values.get('schedule_type') == ScheduleType.INTERVAL:
            if not v:
                raise ValueError('interval_seconds is required for interval schedule type')
        return v

    @validator('run_date')
    def validate_run_date(cls, v, values):
        if values.get('schedule_type') == ScheduleType.DATE:
            if not v:
                raise ValueError('run_date is required for date schedule type')
            if v < datetime.now():
                raise ValueError('run_date must be in the future')
        return v


class UpdateScheduledJobRequest(BaseModel):
    """Request model for updating a scheduled job"""
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    description: Optional[str] = Field(None, max_length=500)
    cron_expression: Optional[str] = None
    interval_seconds: Optional[int] = Field(None, ge=60)
    run_date: Optional[datetime] = None
    timezone: Optional[str] = None
    job_config: Optional[Dict[str, Any]] = None
    enabled: Optional[bool] = None
    max_retries: Optional[int] = Field(None, ge=0, le=10)
    retry_delay_seconds: Optional[int] = Field(None, ge=10, le=3600)


class ScheduledJobResponse(BaseModel):
    """Response model for scheduled job"""
    id: str
    name: str
    description: Optional[str]
    job_type: JobType
    schedule_type: ScheduleType
    cron_expression: Optional[str]
    interval_seconds: Optional[int]
    run_date: Optional[datetime]
    timezone: str
    job_config: Dict[str, Any]
    enabled: bool
    paused_at: Optional[datetime]
    paused_reason: Optional[str]
    last_run_at: Optional[datetime]
    last_run_duration_ms: Optional[int]
    last_run_status: Optional[str]
    next_run_at: Optional[datetime]
    total_runs: int
    successful_runs: int
    failed_runs: int
    consecutive_failures: int
    last_error: Optional[str]
    max_retries: int
    retry_delay_seconds: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class JobExecutionLogResponse(BaseModel):
    """Response model for job execution log"""
    id: str
    job_id: str
    started_at: datetime
    completed_at: Optional[datetime]
    duration_ms: Optional[int]
    status: JobStatus
    trigger_type: TriggerType
    triggered_by: Optional[str]
    result: Optional[Dict[str, Any]]
    error_message: Optional[str]
    error_code: Optional[str]
    retry_count: int
    logs: Optional[str]
    logs_truncated: bool
    created_at: datetime

    class Config:
        from_attributes = True


class SchedulerStatsResponse(BaseModel):
    """Response model for scheduler statistics"""
    total_jobs: int
    enabled_jobs: int
    disabled_jobs: int
    jobs_by_type: Dict[str, int]
    executions_last_24h: int
    successful_last_24h: int
    failed_last_24h: int
    average_duration_ms: Optional[float]
    next_scheduled_job: Optional[Dict[str, Any]]
    scheduler_running: bool


# =====================================================
# Helper Functions
# =====================================================

def get_config_model(job_type: JobType):
    """Get the configuration model for a job type"""
    config_models = {
        JobType.RAG_QUERY: RagQueryConfig,
        JobType.CRAWLER: CrawlerConfig,
        JobType.EMBEDDING_SYNC: EmbeddingSyncConfig,
        JobType.CLEANUP: CleanupConfig,
        JobType.CUSTOM_SCRIPT: CustomScriptConfig,
        JobType.SCRAPE_AND_EMBED: ScrapeAndEmbedConfig,
    }
    return config_models.get(job_type)


def validate_job_config(job_type: JobType, config: Dict[str, Any]) -> Dict[str, Any]:
    """Validate and parse job configuration"""
    model = get_config_model(job_type)
    if model:
        validated = model(**config)
        return validated.model_dump()
    return config
