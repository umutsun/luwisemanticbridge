"""
Embedding Service
Handles embedding generation for CSV tables and documents
Uses OpenAI text-embedding-3-small (1536 dimensions)

Features:
- Redis-based auto-recovery: if process crashes, automatically resumes on restart
- Heartbeat mechanism: detects crashed states
- Minimal Redis usage: only stores flags, not arrays
"""

import os
import asyncio
import redis
import time
from typing import Optional, Dict, Any, List
from datetime import datetime
from loguru import logger
import openai
from services.database import get_db, execute_query, execute_update

# Configuration
EMBEDDING_MODEL = "text-embedding-3-small"
EMBEDDING_DIMENSIONS = 1536
DEFAULT_BATCH_SIZE = 100
MAX_RETRIES = 3
RETRY_DELAY = 5  # seconds

# Redis configuration for auto-recovery (minimal state only)
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")
REDIS_DB = int(os.getenv("REDIS_DB", "2"))  # Vergilex uses DB 2
REDIS_KEY_PREFIX = "embedding_worker"
HEARTBEAT_INTERVAL = 10  # seconds
HEARTBEAT_TIMEOUT = 30  # seconds - if no heartbeat, consider crashed


class EmbeddingWorker:
    """Background worker for embedding generation with Redis auto-recovery"""

    def __init__(self):
        self.is_running = False
        self.is_paused = False
        self.current_job: Optional[Dict[str, Any]] = None
        self.stats = {
            "total_processed": 0,
            "total_errors": 0,
            "started_at": None,
            "last_activity": None,
            "current_table": None,
            "current_progress": 0,
            "current_total": 0
        }
        self._redis: Optional[redis.Redis] = None
        self._heartbeat_task: Optional[asyncio.Task] = None

    def _get_redis(self) -> redis.Redis:
        """Get Redis connection (lazy initialization)"""
        if self._redis is None:
            try:
                self._redis = redis.from_url(REDIS_URL, db=REDIS_DB, decode_responses=True)
                self._redis.ping()
                logger.info(f"Redis connected for embedding worker: {REDIS_URL} DB {REDIS_DB}")
            except Exception as e:
                logger.warning(f"Redis connection failed: {e} - auto-recovery disabled")
                self._redis = None
        return self._redis

    def _redis_key(self, suffix: str) -> str:
        """Generate Redis key with prefix"""
        return f"{REDIS_KEY_PREFIX}:{suffix}"

    def _save_state_to_redis(self):
        """Save minimal state to Redis (just flags, no arrays)"""
        r = self._get_redis()
        if not r:
            return

        try:
            # Only save essential flags - NO arrays or heavy data
            state = {
                "is_running": "1" if self.is_running else "0",
                "job_type": self.current_job.get("type", "") if self.current_job else "",
                "table_name": self.current_job.get("table_name", "") if self.current_job else "",
                "batch_size": str(self.current_job.get("batch_size", DEFAULT_BATCH_SIZE)) if self.current_job else str(DEFAULT_BATCH_SIZE),
                "started_at": self.stats.get("started_at", ""),
                "processed": str(self.stats.get("total_processed", 0)),
                "errors": str(self.stats.get("total_errors", 0))
            }
            r.hset(self._redis_key("state"), mapping=state)
            r.set(self._redis_key("heartbeat"), str(int(time.time())))
            logger.debug("Embedding state saved to Redis")
        except Exception as e:
            logger.warning(f"Failed to save embedding state to Redis: {e}")

    def _clear_redis_state(self):
        """Clear Redis state when stopping"""
        r = self._get_redis()
        if not r:
            return

        try:
            r.delete(self._redis_key("state"))
            r.delete(self._redis_key("heartbeat"))
            logger.info("Embedding Redis state cleared")
        except Exception as e:
            logger.warning(f"Failed to clear embedding Redis state: {e}")

    def _check_crashed_state(self) -> Optional[Dict]:
        """Check if there's a crashed state that needs recovery"""
        r = self._get_redis()
        if not r:
            return None

        try:
            state = r.hgetall(self._redis_key("state"))
            if not state or state.get("is_running") != "1":
                return None

            # Check heartbeat
            heartbeat = r.get(self._redis_key("heartbeat"))
            if not heartbeat:
                return None

            last_heartbeat = int(heartbeat)
            elapsed = int(time.time()) - last_heartbeat

            if elapsed > HEARTBEAT_TIMEOUT:
                logger.warning(f"Found crashed embedding state! Last heartbeat {elapsed}s ago")
                return {
                    "job_type": state.get("job_type", ""),
                    "table_name": state.get("table_name", ""),
                    "batch_size": int(state.get("batch_size", DEFAULT_BATCH_SIZE)),
                    "started_at": state.get("started_at", ""),
                    "processed": int(state.get("processed", 0)),
                    "errors": int(state.get("errors", 0))
                }

            return None
        except Exception as e:
            logger.warning(f"Failed to check crashed embedding state: {e}")
            return None

    async def check_and_recover(self) -> Optional[Dict]:
        """Check for crashed state and auto-recover if found"""
        crashed = self._check_crashed_state()
        if not crashed:
            return None

        logger.info(f"Auto-recovering embedding from crashed state: {crashed}")

        # Clear old state first
        self._clear_redis_state()

        job_type = crashed.get("job_type", "")
        batch_size = crashed.get("batch_size", DEFAULT_BATCH_SIZE)

        if job_type == "document_embedding":
            # Resume document embedding
            result = await self.start_document_embedding(batch_size=batch_size)
            return {
                "recovered": True,
                "job_type": "document_embedding",
                "previous_processed": crashed.get("processed", 0),
                "start_result": result
            }
        elif job_type == "csv_embedding" and crashed.get("table_name"):
            # For CSV embedding, we can't easily resume without column info
            # Just log and return info
            return {
                "recovered": False,
                "reason": "csv_embedding_needs_columns",
                "table_name": crashed.get("table_name"),
                "message": "CSV embedding needs to be restarted with column info"
            }

        return {"recovered": False, "reason": "unknown_job_type"}

    async def _heartbeat_loop(self):
        """Background heartbeat to Redis"""
        while self.is_running:
            try:
                r = self._get_redis()
                if r:
                    r.set(self._redis_key("heartbeat"), str(int(time.time())))
                await asyncio.sleep(HEARTBEAT_INTERVAL)
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.warning(f"Embedding heartbeat error: {e}")
                await asyncio.sleep(HEARTBEAT_INTERVAL)

    async def start_csv_embedding(
        self,
        table_name: str,
        text_columns: List[str],
        id_column: str = "id",
        batch_size: int = DEFAULT_BATCH_SIZE,
        resume: bool = True
    ) -> Dict[str, Any]:
        """Start embedding generation for a CSV table"""

        if self.is_running and not self.is_paused:
            return {
                "success": False,
                "error": "Another embedding job is already running",
                "current_job": self.current_job
            }

        self.is_running = True
        self.is_paused = False
        self.stats["started_at"] = datetime.utcnow().isoformat()
        self.stats["current_table"] = table_name

        self.current_job = {
            "type": "csv_embedding",
            "table_name": table_name,
            "text_columns": text_columns,
            "id_column": id_column,
            "batch_size": batch_size,
            "started_at": datetime.utcnow().isoformat()
        }

        # Start background task
        asyncio.create_task(self._process_csv_table(
            table_name, text_columns, id_column, batch_size, resume
        ))

        return {
            "success": True,
            "message": f"Started embedding job for {table_name}",
            "job": self.current_job
        }

    async def _process_csv_table(
        self,
        table_name: str,
        text_columns: List[str],
        id_column: str,
        batch_size: int,
        resume: bool
    ):
        """Process CSV table in batches"""

        try:
            pool = await get_db()

            # Get total count
            total_count = await pool.fetchval(f"SELECT COUNT(*) FROM {table_name}")
            self.stats["current_total"] = total_count

            # Get already processed IDs if resuming
            processed_ids = set()
            if resume:
                rows = await pool.fetch("""
                    SELECT source_id FROM unified_embeddings
                    WHERE source_type = 'csv' AND source_table = $1
                """, table_name)
                processed_ids = {int(row['source_id']) for row in rows}
                logger.info(f"Resuming: {len(processed_ids)} already processed")

            self.stats["current_progress"] = len(processed_ids)

            # Build text column concatenation
            text_concat = " || ' ' || ".join([f"COALESCE({col}::text, '')" for col in text_columns])

            # Process in batches
            offset = 0
            while self.is_running and not self.is_paused:
                # Fetch batch
                rows = await pool.fetch(f"""
                    SELECT {id_column} as id, {text_concat} as text_content
                    FROM {table_name}
                    ORDER BY {id_column}
                    LIMIT {batch_size} OFFSET {offset}
                """)

                if not rows:
                    logger.info(f"✅ Completed embedding for {table_name}")
                    break

                # Filter out already processed
                batch = [(row['id'], row['text_content']) for row in rows
                         if int(row['id']) not in processed_ids and row['text_content'] and row['text_content'].strip()]

                if batch:
                    await self._embed_batch(batch, table_name)
                    self.stats["current_progress"] += len(batch)
                    self.stats["total_processed"] += len(batch)
                    self.stats["last_activity"] = datetime.utcnow().isoformat()

                    logger.info(f"Progress: {self.stats['current_progress']}/{total_count} ({table_name})")

                offset += batch_size

                # Small delay to prevent overwhelming the API
                await asyncio.sleep(0.5)

        except Exception as e:
            logger.error(f"Error processing {table_name}: {e}")
            self.stats["total_errors"] += 1
        finally:
            self.is_running = False
            self.current_job = None

    async def _embed_batch(
        self,
        batch: List[tuple],
        table_name: str
    ):
        """Generate embeddings for a batch of texts"""

        try:
            client = openai.AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY"))

            texts = [text for _, text in batch]
            ids = [id for id, _ in batch]

            # Call OpenAI API
            response = await client.embeddings.create(
                input=texts,
                model=EMBEDDING_MODEL
            )

            # Insert into unified_embeddings
            pool = await get_db()

            for i, embedding_data in enumerate(response.data):
                embedding = embedding_data.embedding
                source_id = ids[i]
                text = texts[i]

                await pool.execute("""
                    INSERT INTO unified_embeddings
                    (source_type, source_table, source_id, content, embedding, model_used, created_at)
                    VALUES ('csv', $1, $2, $3, $4, $5, NOW())
                    ON CONFLICT (source_type, source_table, source_id) DO UPDATE
                    SET content = EXCLUDED.content,
                        embedding = EXCLUDED.embedding,
                        updated_at = NOW()
                """, table_name, int(source_id), text[:10000], embedding, EMBEDDING_MODEL)

        except openai.RateLimitError:
            logger.warning("Rate limited, waiting 60 seconds...")
            await asyncio.sleep(60)
        except Exception as e:
            logger.error(f"Batch embedding error: {e}")
            self.stats["total_errors"] += 1
            await asyncio.sleep(RETRY_DELAY)

    async def start_document_embedding(
        self,
        batch_size: int = DEFAULT_BATCH_SIZE,
        resume: bool = True
    ) -> Dict[str, Any]:
        """Start embedding generation for documents with auto-recovery support"""

        if self.is_running and not self.is_paused:
            return {
                "success": False,
                "error": "Another embedding job is already running"
            }

        self.is_running = True
        self.is_paused = False
        self.stats["started_at"] = datetime.utcnow().isoformat()
        self.stats["current_table"] = "documents"
        self.stats["total_processed"] = 0
        self.stats["total_errors"] = 0
        self.stats["current_progress"] = 0

        self.current_job = {
            "type": "document_embedding",
            "batch_size": batch_size,
            "started_at": datetime.utcnow().isoformat()
        }

        # Save initial state to Redis for recovery
        self._save_state_to_redis()

        # Start heartbeat task
        self._heartbeat_task = asyncio.create_task(self._heartbeat_loop())

        asyncio.create_task(self._process_documents(batch_size, resume))

        logger.info(f"Started document embedding with batch_size={batch_size}")

        return {
            "success": True,
            "message": "Started document embedding job"
        }

    async def _process_documents(self, batch_size: int, resume: bool):
        """Process documents in batches with Redis state persistence"""

        try:
            pool = await get_db()

            # Get documents with content
            if resume:
                query = """
                    SELECT d.id, d.title, d.content
                    FROM documents d
                    WHERE d.content IS NOT NULL AND d.content != ''
                    AND NOT EXISTS (
                        SELECT 1 FROM unified_embeddings ue
                        WHERE ue.source_type = 'document'
                        AND ue.source_id = d.id
                    )
                    ORDER BY d.id
                    LIMIT $1
                """
            else:
                query = """
                    SELECT d.id, d.title, d.content
                    FROM documents d
                    WHERE d.content IS NOT NULL AND d.content != ''
                    ORDER BY d.id
                    LIMIT $1
                """

            # Get total count for progress
            total_count = await pool.fetchval("""
                SELECT COUNT(*) FROM documents
                WHERE content IS NOT NULL AND content != ''
            """)
            self.stats["current_total"] = total_count

            while self.is_running and not self.is_paused:
                rows = await pool.fetch(query, batch_size)

                if not rows:
                    logger.info("✅ Completed document embedding")
                    break

                try:
                    batch = [(row['id'], f"{row['title'] or ''}\n{row['content']}") for row in rows]
                    await self._embed_document_batch(batch)

                    self.stats["current_progress"] += len(batch)
                    self.stats["total_processed"] += len(batch)
                    self.stats["last_activity"] = datetime.utcnow().isoformat()

                    # Save state to Redis every 5 batches (minimal overhead)
                    if self.stats["total_processed"] % (batch_size * 5) == 0:
                        self._save_state_to_redis()

                    logger.info(f"Documents embedded: {self.stats['current_progress']}/{total_count}")

                except Exception as batch_error:
                    logger.error(f"Batch error: {batch_error}")
                    self.stats["total_errors"] += 1
                    # Continue with next batch, don't crash entire job

                await asyncio.sleep(0.5)

        except Exception as e:
            logger.error(f"Error processing documents: {e}")
            self.stats["total_errors"] += 1
        finally:
            # Cleanup
            self.is_running = False
            self.current_job = None

            # Cancel heartbeat task
            if self._heartbeat_task:
                self._heartbeat_task.cancel()
                try:
                    await self._heartbeat_task
                except asyncio.CancelledError:
                    pass
                self._heartbeat_task = None

            # Clear Redis state (job completed or stopped)
            self._clear_redis_state()

            logger.info("Document embedding finished, Redis state cleared")

    async def _embed_document_batch(self, batch: List[tuple]):
        """Generate embeddings for document batch"""

        try:
            client = openai.AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY"))

            texts = [text[:8000] for _, text in batch]  # Truncate long documents
            ids = [id for id, _ in batch]

            response = await client.embeddings.create(
                input=texts,
                model=EMBEDDING_MODEL
            )

            pool = await get_db()

            for i, embedding_data in enumerate(response.data):
                # Convert embedding list to pgvector string format: [1.0, 2.0, 3.0]
                embedding_vector = '[' + ','.join(str(x) for x in embedding_data.embedding) + ']'
                await pool.execute("""
                    INSERT INTO unified_embeddings
                    (source_type, source_table, source_id, content, embedding, model_used, created_at)
                    VALUES ('document', 'documents', $1, $2, $3::vector, $4, NOW())
                    ON CONFLICT (source_type, source_table, source_id) DO UPDATE
                    SET content = EXCLUDED.content,
                        embedding = EXCLUDED.embedding,
                        updated_at = NOW()
                """, ids[i], texts[i][:10000], embedding_vector, EMBEDDING_MODEL)

        except openai.RateLimitError:
            logger.warning("Rate limited, waiting 60 seconds...")
            await asyncio.sleep(60)
        except Exception as e:
            logger.error(f"Document batch error: {e}")
            self.stats["total_errors"] += 1
            await asyncio.sleep(RETRY_DELAY)

    def pause(self):
        """Pause the current job"""
        self.is_paused = True
        return {"success": True, "message": "Job paused"}

    def resume(self):
        """Resume the paused job"""
        self.is_paused = False
        return {"success": True, "message": "Job resumed"}

    def stop(self):
        """Stop the current job and clear Redis state"""
        self.is_running = False
        self.is_paused = False
        self._clear_redis_state()
        logger.info("Embedding job stopped by user")
        return {"success": True, "message": "Job stopped"}

    def get_status(self) -> Dict[str, Any]:
        """Get current worker status"""
        return {
            "is_running": self.is_running,
            "is_paused": self.is_paused,
            "current_job": self.current_job,
            "stats": self.stats
        }


# Global worker instance
embedding_worker = EmbeddingWorker()


async def get_csv_tables() -> List[Dict[str, Any]]:
    """Get list of CSV tables with their row counts"""

    pool = await get_db()

    tables = await pool.fetch("""
        SELECT tablename FROM pg_tables
        WHERE schemaname = 'public' AND tablename LIKE 'csv_%'
        ORDER BY tablename
    """)

    result = []
    for table in tables:
        table_name = table['tablename']
        count = await pool.fetchval(f"SELECT COUNT(*) FROM {table_name}")

        # Get embedded count
        embedded = await pool.fetchval("""
            SELECT COUNT(*) FROM unified_embeddings
            WHERE source_type = 'csv' AND source_table = $1
        """, table_name)

        result.append({
            "table_name": table_name,
            "total_rows": count,
            "embedded_rows": embedded,
            "progress_percent": round((embedded / count * 100) if count > 0 else 0, 2)
        })

    return result


async def get_embedding_stats() -> Dict[str, Any]:
    """Get overall embedding statistics"""

    pool = await get_db()

    stats = await pool.fetch("""
        SELECT
            source_type,
            source_table,
            COUNT(*) as count,
            MAX(created_at) as last_created
        FROM unified_embeddings
        GROUP BY source_type, source_table
        ORDER BY count DESC
    """)

    total = await pool.fetchval("SELECT COUNT(*) FROM unified_embeddings")

    return {
        "total_embeddings": total,
        "by_source": [dict(row) for row in stats],
        "worker_status": embedding_worker.get_status()
    }
