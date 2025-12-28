"""
Job Executor - Executes different job types
"""

import os
import sys
import asyncio
import subprocess
from datetime import datetime
from typing import Dict, Any, Optional
import logging
import json
import httpx

from .job_types import (
    JobType, ScheduledJobResponse,
    RagQueryConfig, CrawlerConfig, EmbeddingSyncConfig,
    CleanupConfig, CustomScriptConfig,
)

logger = logging.getLogger(__name__)


class JobExecutor:
    """
    Executes scheduled jobs based on their type.

    Each job type has a dedicated executor method that knows
    how to run that specific type of task.
    """

    def __init__(self, db_pool, redis_client=None):
        self.db_pool = db_pool
        self.redis_client = redis_client
        self.backend_url = os.getenv('BACKEND_URL', 'http://localhost:8083')
        self.python_services_url = os.getenv('PYTHON_SERVICES_URL', 'http://localhost:8089')

    async def execute(self, job: ScheduledJobResponse) -> Dict[str, Any]:
        """
        Execute a job based on its type.

        Args:
            job: The scheduled job to execute

        Returns:
            Dict containing execution results
        """
        executors = {
            JobType.RAG_QUERY: self._execute_rag_query,
            JobType.CRAWLER: self._execute_crawler,
            JobType.EMBEDDING_SYNC: self._execute_embedding_sync,
            JobType.CLEANUP: self._execute_cleanup,
            JobType.CUSTOM_SCRIPT: self._execute_custom_script,
        }

        executor = executors.get(job.job_type)
        if not executor:
            raise ValueError(f"Unknown job type: {job.job_type}")

        logger.info(f"Executing job: {job.name} (type: {job.job_type})")
        return await executor(job)

    # =====================================================
    # RAG Query Executor
    # =====================================================

    async def _execute_rag_query(self, job: ScheduledJobResponse) -> Dict[str, Any]:
        """
        Execute a RAG query job.

        Sends a prompt to the RAG API and optionally saves the result.
        """
        config = RagQueryConfig(**job.job_config)

        # Call the RAG API
        async with httpx.AsyncClient(timeout=120.0) as client:
            response = await client.post(
                f"{self.backend_url}/api/v2/ai/chat",
                json={
                    "prompt": config.prompt,
                    "model": config.model,
                    "temperature": config.temperature,
                    "maxTokens": config.max_tokens,
                    "conversationId": config.conversation_id,
                },
                headers={"Content-Type": "application/json"}
            )
            response.raise_for_status()
            result = response.json()

        # Notify user if requested
        if config.notify_user and config.notification_email:
            await self._send_notification(
                email=config.notification_email,
                subject=f"Scheduled RAG Query: {job.name}",
                body=f"Query: {config.prompt}\n\nResult: {result.get('response', 'No response')}"
            )

        return {
            "response": result.get("response", ""),
            "tokens_used": result.get("tokensUsed", 0),
            "model": config.model,
            "conversation_id": result.get("conversationId"),
        }

    # =====================================================
    # Crawler Executor
    # =====================================================

    async def _execute_crawler(self, job: ScheduledJobResponse) -> Dict[str, Any]:
        """
        Execute a crawler job.

        Runs the specified crawler script and optionally exports results to DB.
        """
        config = CrawlerConfig(**job.job_config)

        # Find crawler script
        crawlers_dir = os.path.join(os.path.dirname(__file__), '..', 'crawlers')
        script_path = os.path.join(crawlers_dir, f"{config.crawler_name}.py")

        if not os.path.exists(script_path):
            raise FileNotFoundError(f"Crawler script not found: {config.crawler_name}")

        # Run crawler as subprocess
        process = await asyncio.create_subprocess_exec(
            sys.executable,
            script_path,
            "--url", config.url,
            "--name", config.crawler_name,
            "--pages", str(config.pages),
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            cwd=crawlers_dir,
        )

        stdout, stderr = await asyncio.wait_for(
            process.communicate(),
            timeout=3600  # 1 hour max
        )

        if process.returncode != 0:
            raise RuntimeError(f"Crawler failed: {stderr.decode()}")

        # Parse results from stdout (expect JSON)
        result = {"output": stdout.decode(), "items_found": 0}
        try:
            # Try to extract item count from output
            for line in stdout.decode().split('\n'):
                if 'items' in line.lower() or 'found' in line.lower():
                    import re
                    numbers = re.findall(r'\d+', line)
                    if numbers:
                        result["items_found"] = int(numbers[0])
                        break
        except Exception:
            pass

        # Export to database if requested
        if config.export_to_db:
            async with httpx.AsyncClient(timeout=300.0) as client:
                await client.post(
                    f"{self.backend_url}/api/v2/crawler/crawler-directories/{config.crawler_name}/export-to-db",
                    json={"generateEmbeddings": config.generate_embeddings}
                )
            result["exported_to_db"] = True

        return result

    # =====================================================
    # Embedding Sync Executor
    # =====================================================

    async def _execute_embedding_sync(self, job: ScheduledJobResponse) -> Dict[str, Any]:
        """
        Execute an embedding sync job.

        Generates embeddings for new records in the specified table.
        """
        config = EmbeddingSyncConfig(**job.job_config)

        # Get count of records needing embeddings
        async with self.db_pool.acquire() as conn:
            if config.skip_existing:
                # Count records without embeddings
                total = await conn.fetchval(f"""
                    SELECT COUNT(*) FROM {config.source_table} s
                    WHERE NOT EXISTS (
                        SELECT 1 FROM unified_embeddings e
                        WHERE e.source_id = s.id::text
                        AND e.source_table = $1
                    )
                """, config.source_table)
            else:
                total = await conn.fetchval(f"SELECT COUNT(*) FROM {config.source_table}")

        if total == 0:
            return {"processed": 0, "skipped": 0, "message": "No records to process"}

        # Call embedding generation API
        async with httpx.AsyncClient(timeout=600.0) as client:
            response = await client.post(
                f"{self.python_services_url}/api/python/embeddings/generate",
                json={
                    "sourceTable": config.source_table,
                    "batchSize": config.batch_size,
                    "model": config.model,
                    "skipExisting": config.skip_existing,
                    "contentColumn": config.content_column,
                    "metadataColumns": config.metadata_columns,
                    "filters": config.filters,
                }
            )
            response.raise_for_status()
            result = response.json()

        return {
            "processed": result.get("processed", 0),
            "skipped": result.get("skipped", 0),
            "errors": result.get("errors", 0),
            "total_available": total,
        }

    # =====================================================
    # Cleanup Executor
    # =====================================================

    async def _execute_cleanup(self, job: ScheduledJobResponse) -> Dict[str, Any]:
        """
        Execute a cleanup job.

        Deletes old records based on retention policy.
        """
        config = CleanupConfig(**job.job_config)
        deleted_counts = {}

        async with self.db_pool.acquire() as conn:
            for table in config.tables:
                if config.dry_run:
                    # Just count what would be deleted
                    count = await conn.fetchval(f"""
                        SELECT COUNT(*) FROM {table}
                        WHERE created_at < NOW() - INTERVAL '{config.retention_days} days'
                    """)
                    deleted_counts[table] = {"would_delete": count}
                else:
                    # Actually delete
                    result = await conn.execute(f"""
                        DELETE FROM {table}
                        WHERE created_at < NOW() - INTERVAL '{config.retention_days} days'
                    """)
                    # Parse "DELETE X" result
                    count = int(result.split()[-1])
                    deleted_counts[table] = {"deleted": count}

            # Vacuum if requested and not dry run
            if config.vacuum_after and not config.dry_run:
                for table in config.tables:
                    await conn.execute(f"VACUUM ANALYZE {table}")
                deleted_counts["vacuum"] = True

        return {
            "retention_days": config.retention_days,
            "dry_run": config.dry_run,
            "tables": deleted_counts,
        }

    # =====================================================
    # Custom Script Executor
    # =====================================================

    async def _execute_custom_script(self, job: ScheduledJobResponse) -> Dict[str, Any]:
        """
        Execute a custom Python script.

        Runs user-defined scripts in a sandboxed manner.
        """
        config = CustomScriptConfig(**job.job_config)

        # Resolve script path (relative to python-services)
        base_dir = os.path.dirname(os.path.dirname(__file__))
        script_path = os.path.join(base_dir, config.script_path)

        if not os.path.exists(script_path):
            raise FileNotFoundError(f"Script not found: {config.script_path}")

        # Security check - ensure script is in allowed directory
        script_real = os.path.realpath(script_path)
        base_real = os.path.realpath(base_dir)
        if not script_real.startswith(base_real):
            raise PermissionError("Script path outside allowed directory")

        # Working directory
        work_dir = base_dir
        if config.working_directory:
            work_dir = os.path.join(base_dir, config.working_directory)

        # Build command
        cmd = [sys.executable, script_path] + config.args

        # Run script
        process = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            cwd=work_dir,
            env={**os.environ, 'PYTHONUNBUFFERED': '1'}
        )

        try:
            stdout, stderr = await asyncio.wait_for(
                process.communicate(),
                timeout=config.timeout_seconds
            )
        except asyncio.TimeoutError:
            process.kill()
            raise asyncio.TimeoutError(f"Script timed out after {config.timeout_seconds}s")

        if process.returncode != 0:
            raise RuntimeError(f"Script failed with code {process.returncode}: {stderr.decode()}")

        return {
            "exit_code": process.returncode,
            "stdout": stdout.decode()[-5000:],  # Limit output size
            "stderr": stderr.decode()[-1000:] if stderr else None,
        }

    # =====================================================
    # Helper Methods
    # =====================================================

    async def _send_notification(self, email: str, subject: str, body: str):
        """Send email notification (placeholder - implement based on your email service)"""
        logger.info(f"Notification to {email}: {subject}")
        # TODO: Implement actual email sending
        # Could use SendGrid, SES, SMTP, etc.

    async def _publish_status(self, job_id: str, status: str, data: Dict = None):
        """Publish job status update via Redis pub/sub"""
        if self.redis_client:
            message = json.dumps({
                "job_id": job_id,
                "status": status,
                "data": data or {},
                "timestamp": datetime.now().isoformat(),
            })
            await self.redis_client.publish(f"scheduler:job:{job_id}", message)
