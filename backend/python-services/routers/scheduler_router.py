"""
LSEMB Scheduler API Router
FastAPI endpoints for job scheduling management
"""

from typing import Optional, List
from fastapi import APIRouter, HTTPException, Query, Depends
from pydantic import BaseModel
import logging

from scheduler import (
    SchedulerService, get_scheduler,
    JobType, ScheduleType,
)
from scheduler.job_types import (
    CreateScheduledJobRequest,
    UpdateScheduledJobRequest,
    ScheduledJobResponse,
    JobExecutionLogResponse,
    SchedulerStatsResponse,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/python/scheduler", tags=["Scheduler"])


# =====================================================
# Dependency
# =====================================================

async def get_scheduler_service() -> SchedulerService:
    """Get the singleton scheduler service"""
    return get_scheduler()


# =====================================================
# Health & Stats
# =====================================================

@router.get("/health")
async def health_check(scheduler: SchedulerService = Depends(get_scheduler_service)):
    """Check scheduler health"""
    return {
        "status": "healthy" if scheduler.is_running else "stopped",
        "running": scheduler.is_running,
    }


@router.get("/stats", response_model=SchedulerStatsResponse)
async def get_stats(scheduler: SchedulerService = Depends(get_scheduler_service)):
    """Get scheduler statistics"""
    return await scheduler.get_stats()


# =====================================================
# Job CRUD
# =====================================================

@router.get("/jobs", response_model=List[ScheduledJobResponse])
async def list_jobs(
    job_type: Optional[JobType] = Query(None, description="Filter by job type"),
    enabled: Optional[bool] = Query(None, description="Filter by enabled status"),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    scheduler: SchedulerService = Depends(get_scheduler_service)
):
    """List all scheduled jobs"""
    return await scheduler.list_jobs(
        job_type=job_type,
        enabled=enabled,
        limit=limit,
        offset=offset
    )


@router.post("/jobs", response_model=ScheduledJobResponse, status_code=201)
async def create_job(
    request: CreateScheduledJobRequest,
    scheduler: SchedulerService = Depends(get_scheduler_service)
):
    """Create a new scheduled job"""
    try:
        return await scheduler.create_job(request)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Failed to create job: {e}")
        raise HTTPException(status_code=500, detail="Failed to create job")


@router.get("/jobs/{job_id}", response_model=ScheduledJobResponse)
async def get_job(
    job_id: str,
    scheduler: SchedulerService = Depends(get_scheduler_service)
):
    """Get a specific scheduled job"""
    job = await scheduler.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


@router.patch("/jobs/{job_id}", response_model=ScheduledJobResponse)
async def update_job(
    job_id: str,
    request: UpdateScheduledJobRequest,
    scheduler: SchedulerService = Depends(get_scheduler_service)
):
    """Update a scheduled job"""
    job = await scheduler.update_job(job_id, request)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


@router.delete("/jobs/{job_id}", status_code=204)
async def delete_job(
    job_id: str,
    scheduler: SchedulerService = Depends(get_scheduler_service)
):
    """Delete a scheduled job"""
    deleted = await scheduler.delete_job(job_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Job not found")


# =====================================================
# Job Actions
# =====================================================

@router.post("/jobs/{job_id}/toggle", response_model=ScheduledJobResponse)
async def toggle_job(
    job_id: str,
    scheduler: SchedulerService = Depends(get_scheduler_service)
):
    """Enable or disable a scheduled job"""
    job = await scheduler.toggle_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


class RunNowResponse(BaseModel):
    execution_id: str
    message: str


@router.post("/jobs/{job_id}/run-now", response_model=RunNowResponse)
async def run_job_now(
    job_id: str,
    scheduler: SchedulerService = Depends(get_scheduler_service)
):
    """Trigger immediate job execution"""
    try:
        log_id = await scheduler.run_job_now(job_id)
        return RunNowResponse(
            execution_id=log_id,
            message="Job execution started"
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Failed to run job: {e}")
        raise HTTPException(status_code=500, detail="Failed to run job")


# =====================================================
# Execution Logs
# =====================================================

@router.get("/jobs/{job_id}/logs", response_model=List[JobExecutionLogResponse])
async def get_job_logs(
    job_id: str,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    scheduler: SchedulerService = Depends(get_scheduler_service)
):
    """Get execution logs for a job"""
    # Verify job exists
    job = await scheduler.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    return await scheduler.get_job_logs(job_id, limit=limit, offset=offset)


# =====================================================
# Quick Create Endpoints (Convenience)
# =====================================================

class QuickCrawlerRequest(BaseModel):
    """Quick create for crawler job"""
    name: str
    crawler_name: str
    url: str
    cron_expression: str = "0 3 * * *"  # Default: 3 AM daily
    pages: int = 100
    export_to_db: bool = True


@router.post("/quick/crawler", response_model=ScheduledJobResponse, status_code=201)
async def quick_create_crawler(
    request: QuickCrawlerRequest,
    scheduler: SchedulerService = Depends(get_scheduler_service)
):
    """Quick create a crawler scheduled job"""
    job_request = CreateScheduledJobRequest(
        name=request.name,
        description=f"Scheduled crawler: {request.crawler_name}",
        job_type=JobType.CRAWLER,
        schedule_type=ScheduleType.CRON,
        cron_expression=request.cron_expression,
        job_config={
            "crawler_name": request.crawler_name,
            "url": request.url,
            "pages": request.pages,
            "export_to_db": request.export_to_db,
        }
    )
    return await scheduler.create_job(job_request)


class QuickCleanupRequest(BaseModel):
    """Quick create for cleanup job"""
    name: str = "Daily Cleanup"
    retention_days: int = 90
    cron_expression: str = "0 2 * * *"  # Default: 2 AM daily
    tables: List[str] = ["message_embeddings", "job_execution_logs", "activity_log"]


@router.post("/quick/cleanup", response_model=ScheduledJobResponse, status_code=201)
async def quick_create_cleanup(
    request: QuickCleanupRequest,
    scheduler: SchedulerService = Depends(get_scheduler_service)
):
    """Quick create a cleanup scheduled job"""
    job_request = CreateScheduledJobRequest(
        name=request.name,
        description=f"Cleanup records older than {request.retention_days} days",
        job_type=JobType.CLEANUP,
        schedule_type=ScheduleType.CRON,
        cron_expression=request.cron_expression,
        job_config={
            "retention_days": request.retention_days,
            "tables": request.tables,
            "vacuum_after": False,
        }
    )
    return await scheduler.create_job(job_request)


class QuickEmbeddingSyncRequest(BaseModel):
    """Quick create for embedding sync job"""
    name: str
    source_table: str
    interval_hours: int = 1
    batch_size: int = 100


@router.post("/quick/embedding-sync", response_model=ScheduledJobResponse, status_code=201)
async def quick_create_embedding_sync(
    request: QuickEmbeddingSyncRequest,
    scheduler: SchedulerService = Depends(get_scheduler_service)
):
    """Quick create an embedding sync scheduled job"""
    job_request = CreateScheduledJobRequest(
        name=request.name,
        description=f"Sync embeddings for {request.source_table}",
        job_type=JobType.EMBEDDING_SYNC,
        schedule_type=ScheduleType.INTERVAL,
        interval_seconds=request.interval_hours * 3600,
        job_config={
            "source_table": request.source_table,
            "batch_size": request.batch_size,
            "skip_existing": True,
        }
    )
    return await scheduler.create_job(job_request)


# =====================================================
# Cron Expression Helper
# =====================================================

class CronExpressionExamples(BaseModel):
    """Common cron expression examples"""
    every_minute: str = "* * * * *"
    every_5_minutes: str = "*/5 * * * *"
    every_hour: str = "0 * * * *"
    every_day_2am: str = "0 2 * * *"
    every_day_3am: str = "0 3 * * *"
    every_monday_9am: str = "0 9 * * 1"
    every_weekday_9am: str = "0 9 * * 1-5"
    first_of_month: str = "0 0 1 * *"


@router.get("/cron-examples", response_model=CronExpressionExamples)
async def get_cron_examples():
    """Get common cron expression examples"""
    return CronExpressionExamples()


class CronValidateRequest(BaseModel):
    expression: str


class CronValidateResponse(BaseModel):
    valid: bool
    error: Optional[str] = None
    next_runs: List[str] = []


@router.post("/cron-validate", response_model=CronValidateResponse)
async def validate_cron(request: CronValidateRequest):
    """Validate a cron expression and show next run times"""
    from croniter import croniter
    from datetime import datetime

    try:
        cron = croniter(request.expression, datetime.now())
        next_runs = []
        for _ in range(5):
            next_runs.append(cron.get_next(datetime).isoformat())

        return CronValidateResponse(
            valid=True,
            next_runs=next_runs
        )
    except Exception as e:
        return CronValidateResponse(
            valid=False,
            error=str(e)
        )
