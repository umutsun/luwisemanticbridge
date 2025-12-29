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
    CleanupConfig, CustomScriptConfig, ScrapeAndEmbedConfig,
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
            JobType.SCRAPE_AND_EMBED: self._execute_scrape_and_embed,
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
    # Scrape and Embed Pipeline Executor
    # =====================================================

    async def _execute_scrape_and_embed(self, job: ScheduledJobResponse) -> Dict[str, Any]:
        """
        Execute a full scrape → Redis → DB → Embed pipeline.

        Pipeline steps:
        1. Check if scraping is needed (optional: skip if data is recent)
        2. Run scraper to collect data into Redis
        3. Export Redis data to PostgreSQL table
        4. Generate embeddings for new records
        """
        import redis.asyncio as aioredis

        config = ScrapeAndEmbedConfig(**job.job_config)
        result = {
            "scraper_type": config.scraper_type,
            "scraper_name": config.scraper_name,
            "steps_completed": [],
            "items_scraped": 0,
            "items_exported": 0,
            "embeddings_generated": 0,
            "skipped_reason": None,
        }

        redis_key_prefix = config.redis_key_prefix or f"crawl4ai:{config.scraper_name}"

        # Step 0: Check if scraping should be skipped
        if config.skip_scrape_if_recent:
            skip, reason = await self._check_recent_scrape(
                redis_key_prefix, config.redis_db, config.recent_threshold_hours
            )
            if skip:
                result["skipped_reason"] = reason
                result["steps_completed"].append("skipped_scrape")
                logger.info(f"Skipping scrape: {reason}")
                # Still proceed with export and embedding if there's data
            else:
                # Run scraper
                scrape_result = await self._run_scraper(config)
                result["items_scraped"] = scrape_result.get("items_found", 0)
                result["steps_completed"].append("scrape")
        else:
            # Always run scraper
            scrape_result = await self._run_scraper(config)
            result["items_scraped"] = scrape_result.get("items_found", 0)
            result["steps_completed"].append("scrape")

        # Step 2: Export from Redis to PostgreSQL
        export_result = await self._export_redis_to_db(config)
        result["items_exported"] = export_result.get("exported", 0)
        result["steps_completed"].append("export")

        # Step 3: Generate embeddings if enabled
        if config.generate_embeddings and result["items_exported"] > 0:
            embed_result = await self._generate_embeddings_for_table(config)
            result["embeddings_generated"] = embed_result.get("processed", 0)
            result["steps_completed"].append("embed")

        # Notify if configured
        if config.notify_on_new_items and result["items_exported"] >= config.min_new_items_to_notify:
            await self._publish_status(
                job.id,
                "new_items",
                {"count": result["items_exported"], "table": config.export_to_table}
            )

        logger.info(
            f"Scrape and embed completed: {result['items_scraped']} scraped, "
            f"{result['items_exported']} exported, {result['embeddings_generated']} embedded"
        )
        return result

    async def _check_recent_scrape(
        self, redis_key_prefix: str, redis_db: int, threshold_hours: int
    ) -> tuple[bool, str]:
        """Check if there was a recent scrape to avoid redundant work."""
        import redis.asyncio as aioredis
        from datetime import timedelta

        try:
            redis_url = os.getenv('REDIS_URL', 'redis://localhost:6379')
            redis = aioredis.from_url(f"{redis_url}/{redis_db}")

            # Check for metadata key with last scrape time
            meta_key = f"{redis_key_prefix}:_meta"
            meta = await redis.hgetall(meta_key)
            await redis.close()

            if meta and b'last_scrape' in meta:
                last_scrape = datetime.fromisoformat(meta[b'last_scrape'].decode())
                age = datetime.now() - last_scrape
                if age < timedelta(hours=threshold_hours):
                    return True, f"Last scrape was {age.total_seconds() / 3600:.1f}h ago (threshold: {threshold_hours}h)"

            return False, None
        except Exception as e:
            logger.warning(f"Could not check recent scrape: {e}")
            return False, None

    async def _run_scraper(self, config: ScrapeAndEmbedConfig) -> Dict[str, Any]:
        """Run the appropriate scraper based on scraper_type."""
        scraper_map = {
            "sahibinden": "sahibinden_list_crawler",
            "hepsiburada": "hepsiburada_crawler",
            "trendyol": "trendyol_crawler",
            "generic": "generic_crawler",
            "rss": "rss_crawler",
            "sitemap": "sitemap_crawler",
        }

        crawler_script = scraper_map.get(config.scraper_type, config.scraper_type)
        crawlers_dir = os.path.join(os.path.dirname(__file__), '..', 'crawlers')
        script_path = os.path.join(crawlers_dir, f"{crawler_script}.py")

        if not os.path.exists(script_path):
            # Try custom script path
            script_path = os.path.join(crawlers_dir, f"{config.scraper_type}.py")
            if not os.path.exists(script_path):
                raise FileNotFoundError(f"Crawler script not found: {crawler_script}")

        # Build command args
        cmd_args = [
            sys.executable, script_path,
            "--url", config.scraper_url,
            "--name", config.scraper_name,
            "--pages", str(config.max_pages),
        ]

        if config.redis_db != 1:  # If not default
            cmd_args.extend(["--redis-db", str(config.redis_db)])

        logger.info(f"Running scraper: {crawler_script} for {config.scraper_name}")

        process = await asyncio.create_subprocess_exec(
            *cmd_args,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            cwd=crawlers_dir,
        )

        try:
            stdout, stderr = await asyncio.wait_for(
                process.communicate(),
                timeout=3600  # 1 hour max
            )
        except asyncio.TimeoutError:
            process.kill()
            raise asyncio.TimeoutError("Scraper timed out after 1 hour")

        output = stdout.decode()

        # Update metadata in Redis
        await self._update_scrape_metadata(config)

        # Parse results
        items_found = 0
        for line in output.split('\n'):
            if 'items' in line.lower() or 'found' in line.lower() or 'scraped' in line.lower():
                import re
                numbers = re.findall(r'\d+', line)
                if numbers:
                    items_found = max(items_found, int(numbers[0]))

        return {
            "items_found": items_found,
            "output": output[-2000:],  # Last 2000 chars
            "return_code": process.returncode,
        }

    async def _update_scrape_metadata(self, config: ScrapeAndEmbedConfig):
        """Update Redis metadata with scrape info."""
        import redis.asyncio as aioredis

        try:
            redis_url = os.getenv('REDIS_URL', 'redis://localhost:6379')
            redis = aioredis.from_url(f"{redis_url}/{config.redis_db}")

            meta_key = f"crawl4ai:{config.scraper_name}:_meta"
            await redis.hset(meta_key, mapping={
                "last_scrape": datetime.now().isoformat(),
                "scraper_type": config.scraper_type,
                "url": config.scraper_url,
                "max_pages": str(config.max_pages),
            })
            await redis.close()
        except Exception as e:
            logger.warning(f"Could not update scrape metadata: {e}")

    async def _export_redis_to_db(self, config: ScrapeAndEmbedConfig) -> Dict[str, Any]:
        """Export scraped data from Redis to PostgreSQL."""
        async with httpx.AsyncClient(timeout=300.0) as client:
            response = await client.post(
                f"{self.backend_url}/api/v2/crawler/crawler-directories/{config.scraper_name}/export-to-db",
                json={
                    "tableName": config.export_to_table,
                    "mode": config.export_mode,
                    "generateEmbeddings": False,  # We'll do this separately
                    "idColumn": config.id_column,
                }
            )

            if response.status_code == 200:
                result = response.json()
                return {
                    "exported": result.get("exportedCount", result.get("count", 0)),
                    "table": config.export_to_table,
                }
            else:
                logger.warning(f"Export failed: {response.status_code} - {response.text}")
                return {"exported": 0, "error": response.text}

    async def _generate_embeddings_for_table(self, config: ScrapeAndEmbedConfig) -> Dict[str, Any]:
        """Generate embeddings for newly exported records."""
        async with httpx.AsyncClient(timeout=600.0) as client:
            response = await client.post(
                f"{self.python_services_url}/api/python/embeddings/generate",
                json={
                    "sourceTable": config.export_to_table,
                    "batchSize": config.embedding_batch_size,
                    "model": config.embedding_model,
                    "skipExisting": True,
                    "contentColumn": config.embedding_content_column,
                }
            )

            if response.status_code == 200:
                result = response.json()
                return {
                    "processed": result.get("processed", 0),
                    "skipped": result.get("skipped", 0),
                    "errors": result.get("errors", 0),
                }
            else:
                logger.warning(f"Embedding generation failed: {response.status_code}")
                return {"processed": 0, "error": response.text}

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
