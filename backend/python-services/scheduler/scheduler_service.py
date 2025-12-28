"""
LSEMB Scheduler Service
APScheduler-based job scheduling with PostgreSQL persistence
"""

import os
import json
import asyncio
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any
from uuid import uuid4
import logging

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.jobstores.sqlalchemy import SQLAlchemyJobStore
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger
from apscheduler.triggers.date import DateTrigger
from apscheduler.events import (
    EVENT_JOB_EXECUTED,
    EVENT_JOB_ERROR,
    EVENT_JOB_MISSED,
    EVENT_JOB_SUBMITTED,
    JobExecutionEvent,
)
from sqlalchemy import create_engine

from .job_types import (
    JobType, ScheduleType, JobStatus, TriggerType,
    CreateScheduledJobRequest, UpdateScheduledJobRequest,
    ScheduledJobResponse, JobExecutionLogResponse, SchedulerStatsResponse,
    validate_job_config,
)

logger = logging.getLogger(__name__)

# Singleton instance
_scheduler_instance: Optional['SchedulerService'] = None


def get_scheduler() -> 'SchedulerService':
    """Get the singleton scheduler instance"""
    global _scheduler_instance
    if _scheduler_instance is None:
        _scheduler_instance = SchedulerService()
    return _scheduler_instance


async def _job_wrapper_func(job_id: str):
    """
    Module-level job wrapper function called by APScheduler.

    This must be a module-level function (not an instance method) because
    APScheduler serializes the function and its arguments. If we use an
    instance method, the entire object (including the scheduler) gets
    serialized, which causes errors.
    """
    from .job_types import JobStatus, TriggerType

    scheduler = get_scheduler()
    log_id = str(uuid4())
    now = datetime.now(timezone.utc)

    # Create execution log
    async with scheduler.db_pool.acquire() as conn:
        await conn.execute("""
            INSERT INTO job_execution_logs (
                id, job_id, started_at, status, trigger_type
            ) VALUES ($1, $2, $3, $4, $5)
        """, log_id, job_id, now, JobStatus.RUNNING.value, TriggerType.SCHEDULED.value)

    # Execute job
    await scheduler._execute_job(job_id, log_id)


class SchedulerService:
    """
    Main scheduler service using APScheduler with PostgreSQL backend.

    Features:
    - Persistent job storage in PostgreSQL
    - Cron, interval, and one-time scheduling
    - Job execution logging
    - Automatic retry on failure
    - Real-time status updates via Redis pub/sub
    """

    def __init__(self):
        self.scheduler: Optional[AsyncIOScheduler] = None
        self.db_pool = None
        self.redis_client = None
        self._initialized = False
        self._running = False

    async def initialize(self, db_pool, redis_client=None):
        """
        Initialize the scheduler with database and optional Redis

        Args:
            db_pool: asyncpg database pool
            redis_client: optional Redis client for pub/sub
        """
        if self._initialized:
            logger.warning("Scheduler already initialized")
            return

        self.db_pool = db_pool
        self.redis_client = redis_client

        # Get database URL from environment
        database_url = os.getenv('DATABASE_URL', 'postgresql://postgres:postgres@localhost:5432/lsemb')

        # Convert asyncpg URL to SQLAlchemy format if needed
        if database_url.startswith('postgresql://'):
            sqlalchemy_url = database_url.replace('postgresql://', 'postgresql+psycopg2://')
        else:
            sqlalchemy_url = database_url

        # Create SQLAlchemy engine for APScheduler job store
        engine = create_engine(sqlalchemy_url, pool_pre_ping=True)

        # Configure APScheduler
        jobstores = {
            'default': SQLAlchemyJobStore(engine=engine, tablename='apscheduler_jobs')
        }

        job_defaults = {
            'coalesce': True,           # Combine missed executions
            'max_instances': 1,         # Only one instance of each job at a time
            'misfire_grace_time': 3600, # 1 hour grace period for missed jobs
        }

        self.scheduler = AsyncIOScheduler(
            jobstores=jobstores,
            job_defaults=job_defaults,
            timezone='Europe/Istanbul',
        )

        # Add event listeners
        self.scheduler.add_listener(self._on_job_executed, EVENT_JOB_EXECUTED)
        self.scheduler.add_listener(self._on_job_error, EVENT_JOB_ERROR)
        self.scheduler.add_listener(self._on_job_missed, EVENT_JOB_MISSED)
        self.scheduler.add_listener(self._on_job_submitted, EVENT_JOB_SUBMITTED)

        self._initialized = True
        logger.info("Scheduler service initialized")

    async def start(self):
        """Start the scheduler and load jobs from database"""
        if not self._initialized:
            raise RuntimeError("Scheduler not initialized. Call initialize() first.")

        if self._running:
            logger.warning("Scheduler already running")
            return

        # Load existing jobs from scheduled_jobs table
        await self._load_jobs_from_db()

        # Start APScheduler
        self.scheduler.start()
        self._running = True
        logger.info("Scheduler started")

    async def stop(self):
        """Stop the scheduler gracefully"""
        if self.scheduler and self._running:
            self.scheduler.shutdown(wait=True)
            self._running = False
            logger.info("Scheduler stopped")

    @property
    def is_running(self) -> bool:
        """Check if scheduler is running"""
        return self._running and self.scheduler is not None

    # =====================================================
    # Job Management
    # =====================================================

    async def create_job(self, request: CreateScheduledJobRequest, user_id: Optional[str] = None) -> ScheduledJobResponse:
        """Create a new scheduled job"""
        job_id = str(uuid4())
        now = datetime.now(timezone.utc)

        # Validate job config
        validated_config = validate_job_config(request.job_type, request.job_config)

        # Create trigger based on schedule type
        trigger = self._create_trigger(request)
        next_run = trigger.get_next_fire_time(None, now)

        # Insert into database
        async with self.db_pool.acquire() as conn:
            await conn.execute("""
                INSERT INTO scheduled_jobs (
                    id, name, description, job_type, schedule_type,
                    cron_expression, interval_seconds, run_date, timezone,
                    job_config, enabled, max_retries, retry_delay_seconds,
                    next_run_at, created_by, created_at, updated_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11, $12, $13, $14, $15, $16, $16)
            """,
                job_id, request.name, request.description, request.job_type.value,
                request.schedule_type.value, request.cron_expression, request.interval_seconds,
                request.run_date, request.timezone, json.dumps(validated_config), request.enabled,
                request.max_retries, request.retry_delay_seconds, next_run, user_id, now
            )

        # Add to APScheduler if enabled
        if request.enabled:
            await self._add_to_apscheduler(job_id, request, trigger)

        logger.info(f"Created scheduled job: {job_id} ({request.name})")
        return await self.get_job(job_id)

    async def get_job(self, job_id: str) -> Optional[ScheduledJobResponse]:
        """Get a scheduled job by ID"""
        async with self.db_pool.acquire() as conn:
            row = await conn.fetchrow("""
                SELECT * FROM scheduled_jobs WHERE id = $1
            """, job_id)

        if not row:
            return None

        return self._row_to_response(row)

    async def list_jobs(
        self,
        job_type: Optional[JobType] = None,
        enabled: Optional[bool] = None,
        limit: int = 100,
        offset: int = 0
    ) -> List[ScheduledJobResponse]:
        """List scheduled jobs with optional filtering"""
        query = "SELECT * FROM scheduled_jobs WHERE 1=1"
        params = []
        param_count = 0

        if job_type is not None:
            param_count += 1
            query += f" AND job_type = ${param_count}"
            params.append(job_type.value)

        if enabled is not None:
            param_count += 1
            query += f" AND enabled = ${param_count}"
            params.append(enabled)

        query += f" ORDER BY created_at DESC LIMIT ${param_count + 1} OFFSET ${param_count + 2}"
        params.extend([limit, offset])

        async with self.db_pool.acquire() as conn:
            rows = await conn.fetch(query, *params)

        return [self._row_to_response(row) for row in rows]

    async def update_job(
        self,
        job_id: str,
        request: UpdateScheduledJobRequest,
        user_id: Optional[str] = None
    ) -> Optional[ScheduledJobResponse]:
        """Update an existing scheduled job"""
        existing = await self.get_job(job_id)
        if not existing:
            return None

        # Build update query dynamically
        updates = []
        params = []
        param_count = 0

        update_fields = {
            'name': request.name,
            'description': request.description,
            'cron_expression': request.cron_expression,
            'interval_seconds': request.interval_seconds,
            'run_date': request.run_date,
            'timezone': request.timezone,
            'job_config': request.job_config,
            'enabled': request.enabled,
            'max_retries': request.max_retries,
            'retry_delay_seconds': request.retry_delay_seconds,
        }

        for field, value in update_fields.items():
            if value is not None:
                param_count += 1
                updates.append(f"{field} = ${param_count}")
                # Serialize job_config as JSON for JSONB column
                if field == 'job_config' and isinstance(value, dict):
                    params.append(json.dumps(value))
                else:
                    params.append(value)

        if not updates:
            return existing

        # Add updated_by and updated_at
        param_count += 1
        updates.append(f"updated_by = ${param_count}")
        params.append(user_id)

        param_count += 1
        updates.append(f"updated_at = ${param_count}")
        params.append(datetime.now(timezone.utc))

        # Execute update
        param_count += 1
        query = f"UPDATE scheduled_jobs SET {', '.join(updates)} WHERE id = ${param_count}"
        params.append(job_id)

        async with self.db_pool.acquire() as conn:
            await conn.execute(query, *params)

        # Update APScheduler
        await self._sync_job_to_apscheduler(job_id)

        logger.info(f"Updated scheduled job: {job_id}")
        return await self.get_job(job_id)

    async def delete_job(self, job_id: str) -> bool:
        """Delete a scheduled job"""
        # Remove from APScheduler first
        await self._remove_from_apscheduler(job_id)

        # Delete from database
        async with self.db_pool.acquire() as conn:
            result = await conn.execute("""
                DELETE FROM scheduled_jobs WHERE id = $1
            """, job_id)

        deleted = result.split()[-1] != '0'
        if deleted:
            logger.info(f"Deleted scheduled job: {job_id}")
        return deleted

    async def toggle_job(self, job_id: str, user_id: Optional[str] = None) -> Optional[ScheduledJobResponse]:
        """Toggle job enabled/disabled state"""
        job = await self.get_job(job_id)
        if not job:
            return None

        new_enabled = not job.enabled
        now = datetime.now(timezone.utc)

        async with self.db_pool.acquire() as conn:
            await conn.execute("""
                UPDATE scheduled_jobs
                SET enabled = $1,
                    paused_at = $2,
                    paused_reason = $3,
                    updated_by = $4,
                    updated_at = $5
                WHERE id = $6
            """,
                new_enabled,
                None if new_enabled else now,
                None if new_enabled else 'Manually paused',
                user_id,
                now,
                job_id
            )

        # Sync with APScheduler
        await self._sync_job_to_apscheduler(job_id)

        logger.info(f"Toggled job {job_id}: enabled={new_enabled}")
        return await self.get_job(job_id)

    async def run_job_now(self, job_id: str, user_id: Optional[str] = None) -> str:
        """Trigger immediate job execution"""
        job = await self.get_job(job_id)
        if not job:
            raise ValueError(f"Job not found: {job_id}")

        # Create execution log
        log_id = str(uuid4())
        now = datetime.now(timezone.utc)

        async with self.db_pool.acquire() as conn:
            await conn.execute("""
                INSERT INTO job_execution_logs (
                    id, job_id, started_at, status, trigger_type, triggered_by
                ) VALUES ($1, $2, $3, $4, $5, $6)
            """, log_id, job_id, now, JobStatus.RUNNING.value, TriggerType.MANUAL.value, user_id)

        # Execute job asynchronously
        asyncio.create_task(self._execute_job(job_id, log_id))

        logger.info(f"Manually triggered job: {job_id}")
        return log_id

    # =====================================================
    # Execution Logs
    # =====================================================

    async def get_job_logs(
        self,
        job_id: str,
        limit: int = 50,
        offset: int = 0
    ) -> List[JobExecutionLogResponse]:
        """Get execution logs for a job"""
        async with self.db_pool.acquire() as conn:
            rows = await conn.fetch("""
                SELECT * FROM job_execution_logs
                WHERE job_id = $1
                ORDER BY started_at DESC
                LIMIT $2 OFFSET $3
            """, job_id, limit, offset)

        return [self._log_row_to_response(row) for row in rows]

    async def get_stats(self) -> SchedulerStatsResponse:
        """Get scheduler statistics"""
        async with self.db_pool.acquire() as conn:
            # Job counts
            total = await conn.fetchval("SELECT COUNT(*) FROM scheduled_jobs")
            enabled = await conn.fetchval("SELECT COUNT(*) FROM scheduled_jobs WHERE enabled = true")

            # Jobs by type
            type_counts = await conn.fetch("""
                SELECT job_type, COUNT(*) as count FROM scheduled_jobs GROUP BY job_type
            """)

            # Execution stats (last 24h)
            executions_24h = await conn.fetchval("""
                SELECT COUNT(*) FROM job_execution_logs
                WHERE started_at > NOW() - INTERVAL '24 hours'
            """)
            successful_24h = await conn.fetchval("""
                SELECT COUNT(*) FROM job_execution_logs
                WHERE started_at > NOW() - INTERVAL '24 hours' AND status = 'completed'
            """)
            failed_24h = await conn.fetchval("""
                SELECT COUNT(*) FROM job_execution_logs
                WHERE started_at > NOW() - INTERVAL '24 hours' AND status = 'failed'
            """)

            # Average duration
            avg_duration = await conn.fetchval("""
                SELECT AVG(duration_ms) FROM job_execution_logs
                WHERE duration_ms IS NOT NULL AND started_at > NOW() - INTERVAL '7 days'
            """)

            # Next scheduled job
            next_job = await conn.fetchrow("""
                SELECT id, name, next_run_at FROM scheduled_jobs
                WHERE enabled = true AND next_run_at IS NOT NULL
                ORDER BY next_run_at ASC LIMIT 1
            """)

        return SchedulerStatsResponse(
            total_jobs=total,
            enabled_jobs=enabled,
            disabled_jobs=total - enabled,
            jobs_by_type={row['job_type']: row['count'] for row in type_counts},
            executions_last_24h=executions_24h,
            successful_last_24h=successful_24h,
            failed_last_24h=failed_24h,
            average_duration_ms=float(avg_duration) if avg_duration else None,
            next_scheduled_job={
                'id': str(next_job['id']),
                'name': next_job['name'],
                'next_run_at': next_job['next_run_at'].isoformat()
            } if next_job else None,
            scheduler_running=self.is_running,
        )

    # =====================================================
    # Internal Methods
    # =====================================================

    def _create_trigger(self, request: CreateScheduledJobRequest):
        """Create APScheduler trigger from request"""
        if request.schedule_type == ScheduleType.CRON:
            return CronTrigger.from_crontab(request.cron_expression, timezone=request.timezone)
        elif request.schedule_type == ScheduleType.INTERVAL:
            return IntervalTrigger(seconds=request.interval_seconds, timezone=request.timezone)
        elif request.schedule_type == ScheduleType.DATE:
            return DateTrigger(run_date=request.run_date, timezone=request.timezone)
        else:
            raise ValueError(f"Unknown schedule type: {request.schedule_type}")

    async def _add_to_apscheduler(self, job_id: str, request: CreateScheduledJobRequest, trigger):
        """Add job to APScheduler"""
        if not self.scheduler:
            return

        self.scheduler.add_job(
            _job_wrapper_func,
            trigger=trigger,
            id=job_id,
            args=[job_id],
            name=request.name,
            replace_existing=True,
        )

        # Update apscheduler_job_id in database
        async with self.db_pool.acquire() as conn:
            await conn.execute("""
                UPDATE scheduled_jobs SET apscheduler_job_id = $1 WHERE id = $1
            """, job_id)

    async def _remove_from_apscheduler(self, job_id: str):
        """Remove job from APScheduler"""
        if not self.scheduler:
            return

        try:
            self.scheduler.remove_job(job_id)
        except Exception:
            pass  # Job might not exist in scheduler

    async def _sync_job_to_apscheduler(self, job_id: str):
        """Sync job state between database and APScheduler"""
        job = await self.get_job(job_id)
        if not job:
            await self._remove_from_apscheduler(job_id)
            return

        if job.enabled:
            # Recreate trigger and add/update job
            request = CreateScheduledJobRequest(
                name=job.name,
                description=job.description,
                job_type=job.job_type,
                schedule_type=job.schedule_type,
                cron_expression=job.cron_expression,
                interval_seconds=job.interval_seconds,
                run_date=job.run_date,
                timezone=job.timezone,
                job_config=job.job_config,
                enabled=job.enabled,
            )
            trigger = self._create_trigger(request)
            await self._add_to_apscheduler(job_id, request, trigger)
        else:
            await self._remove_from_apscheduler(job_id)

    async def _load_jobs_from_db(self):
        """Load all enabled jobs from database into APScheduler"""
        jobs = await self.list_jobs(enabled=True, limit=1000)
        for job in jobs:
            try:
                request = CreateScheduledJobRequest(
                    name=job.name,
                    description=job.description,
                    job_type=job.job_type,
                    schedule_type=job.schedule_type,
                    cron_expression=job.cron_expression,
                    interval_seconds=job.interval_seconds,
                    run_date=job.run_date,
                    timezone=job.timezone,
                    job_config=job.job_config,
                    enabled=job.enabled,
                )
                trigger = self._create_trigger(request)
                await self._add_to_apscheduler(job.id, request, trigger)
            except Exception as e:
                logger.error(f"Failed to load job {job.id}: {e}")

        logger.info(f"Loaded {len(jobs)} jobs from database")

    async def _execute_job(self, job_id: str, log_id: str):
        """Execute a job and update logs"""
        from .job_executor import JobExecutor

        job = await self.get_job(job_id)
        if not job:
            logger.error(f"Job not found for execution: {job_id}")
            return

        start_time = datetime.now(timezone.utc)
        executor = JobExecutor(self.db_pool, self.redis_client)

        try:
            # Execute based on job type
            result = await executor.execute(job)

            # Update log as completed
            duration_ms = int((datetime.now(timezone.utc) - start_time).total_seconds() * 1000)
            await self._update_execution_log(log_id, JobStatus.COMPLETED, result, duration_ms)

            # Update job stats
            await self._update_job_stats(job_id, JobStatus.COMPLETED, duration_ms)

            logger.info(f"Job {job_id} completed in {duration_ms}ms")

        except asyncio.TimeoutError:
            duration_ms = int((datetime.now(timezone.utc) - start_time).total_seconds() * 1000)
            await self._update_execution_log(
                log_id, JobStatus.TIMEOUT,
                error_message="Job execution timed out",
                duration_ms=duration_ms
            )
            await self._update_job_stats(job_id, JobStatus.TIMEOUT, duration_ms, error="Timeout")
            logger.error(f"Job {job_id} timed out")

        except Exception as e:
            duration_ms = int((datetime.now(timezone.utc) - start_time).total_seconds() * 1000)
            error_msg = str(e)
            await self._update_execution_log(
                log_id, JobStatus.FAILED,
                error_message=error_msg,
                duration_ms=duration_ms
            )
            await self._update_job_stats(job_id, JobStatus.FAILED, duration_ms, error=error_msg)
            logger.error(f"Job {job_id} failed: {error_msg}")

    async def _update_execution_log(
        self,
        log_id: str,
        status: JobStatus,
        result: Optional[Dict] = None,
        error_message: Optional[str] = None,
        duration_ms: Optional[int] = None
    ):
        """Update execution log with results"""
        async with self.db_pool.acquire() as conn:
            await conn.execute("""
                UPDATE job_execution_logs
                SET status = $1,
                    completed_at = NOW(),
                    duration_ms = $2,
                    result = $3::jsonb,
                    error_message = $4
                WHERE id = $5
            """, status.value, duration_ms, json.dumps(result) if result else None, error_message, log_id)

    async def _update_job_stats(
        self,
        job_id: str,
        status: JobStatus,
        duration_ms: int,
        error: Optional[str] = None
    ):
        """Update job statistics after execution"""
        now = datetime.now(timezone.utc)

        if status == JobStatus.COMPLETED:
            async with self.db_pool.acquire() as conn:
                await conn.execute("""
                    UPDATE scheduled_jobs
                    SET last_run_at = $1,
                        last_run_duration_ms = $2,
                        last_run_status = $3,
                        total_runs = total_runs + 1,
                        successful_runs = successful_runs + 1,
                        consecutive_failures = 0,
                        last_error = NULL
                    WHERE id = $4
                """, now, duration_ms, status.value, job_id)
        else:
            async with self.db_pool.acquire() as conn:
                await conn.execute("""
                    UPDATE scheduled_jobs
                    SET last_run_at = $1,
                        last_run_duration_ms = $2,
                        last_run_status = $3,
                        total_runs = total_runs + 1,
                        failed_runs = failed_runs + 1,
                        consecutive_failures = consecutive_failures + 1,
                        last_error = $4
                    WHERE id = $5
                """, now, duration_ms, status.value, error, job_id)

    # =====================================================
    # Event Handlers
    # =====================================================

    def _on_job_executed(self, event: JobExecutionEvent):
        """Handle successful job execution event"""
        logger.debug(f"Job executed: {event.job_id}")

    def _on_job_error(self, event: JobExecutionEvent):
        """Handle job error event"""
        logger.error(f"Job error: {event.job_id} - {event.exception}")

    def _on_job_missed(self, event):
        """Handle missed job event"""
        logger.warning(f"Job missed: {event.job_id}")

    def _on_job_submitted(self, event):
        """Handle job submitted event"""
        logger.debug(f"Job submitted: {event.job_id}")

    # =====================================================
    # Response Converters
    # =====================================================

    def _row_to_response(self, row) -> ScheduledJobResponse:
        """Convert database row to response model"""
        # Parse job_config if it's a string (JSONB should return dict, but handle both)
        job_config = row['job_config']
        if isinstance(job_config, str):
            job_config = json.loads(job_config)

        return ScheduledJobResponse(
            id=str(row['id']),
            name=row['name'],
            description=row['description'],
            job_type=JobType(row['job_type']),
            schedule_type=ScheduleType(row['schedule_type']),
            cron_expression=row['cron_expression'],
            interval_seconds=row['interval_seconds'],
            run_date=row['run_date'],
            timezone=row['timezone'],
            job_config=job_config,
            enabled=row['enabled'],
            paused_at=row['paused_at'],
            paused_reason=row['paused_reason'],
            last_run_at=row['last_run_at'],
            last_run_duration_ms=row['last_run_duration_ms'],
            last_run_status=row['last_run_status'],
            next_run_at=row['next_run_at'],
            total_runs=row['total_runs'],
            successful_runs=row['successful_runs'],
            failed_runs=row['failed_runs'],
            consecutive_failures=row['consecutive_failures'],
            last_error=row['last_error'],
            max_retries=row['max_retries'],
            retry_delay_seconds=row['retry_delay_seconds'],
            created_at=row['created_at'],
            updated_at=row['updated_at'],
        )

    def _log_row_to_response(self, row) -> JobExecutionLogResponse:
        """Convert log database row to response model"""
        # Parse result if it's a string
        result = row['result']
        if isinstance(result, str):
            result = json.loads(result)

        return JobExecutionLogResponse(
            id=str(row['id']),
            job_id=str(row['job_id']),
            started_at=row['started_at'],
            completed_at=row['completed_at'],
            duration_ms=row['duration_ms'],
            status=JobStatus(row['status']),
            trigger_type=TriggerType(row['trigger_type']),
            triggered_by=str(row['triggered_by']) if row['triggered_by'] else None,
            result=result,
            error_message=row['error_message'],
            error_code=row['error_code'],
            retry_count=row['retry_count'],
            logs=row['logs'],
            logs_truncated=row['logs_truncated'],
            created_at=row['created_at'],
        )
