"""
Embedding Service
Handles embedding generation for CSV tables and documents
Uses OpenAI text-embedding-3-small (1536 dimensions)
"""

import os
import asyncio
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


class EmbeddingWorker:
    """Background worker for embedding generation"""

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
                processed_ids = {str(row['source_id']) for row in rows}
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
                         if str(row['id']) not in processed_ids and row['text_content'].strip()]

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
                    (source_type, source_table, source_id, content, embedding, embedding_model, created_at)
                    VALUES ('csv', $1, $2, $3, $4, $5, NOW())
                    ON CONFLICT (source_type, source_table, source_id) DO UPDATE
                    SET content = EXCLUDED.content,
                        embedding = EXCLUDED.embedding,
                        updated_at = NOW()
                """, table_name, str(source_id), text[:10000], embedding, EMBEDDING_MODEL)

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
        """Start embedding generation for documents"""

        if self.is_running and not self.is_paused:
            return {
                "success": False,
                "error": "Another embedding job is already running"
            }

        self.is_running = True
        self.is_paused = False
        self.stats["started_at"] = datetime.utcnow().isoformat()
        self.stats["current_table"] = "documents"

        self.current_job = {
            "type": "document_embedding",
            "batch_size": batch_size,
            "started_at": datetime.utcnow().isoformat()
        }

        asyncio.create_task(self._process_documents(batch_size, resume))

        return {
            "success": True,
            "message": "Started document embedding job"
        }

    async def _process_documents(self, batch_size: int, resume: bool):
        """Process documents in batches"""

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
                        AND ue.source_id = d.id::text
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

            while self.is_running and not self.is_paused:
                rows = await pool.fetch(query, batch_size)

                if not rows:
                    logger.info("✅ Completed document embedding")
                    break

                batch = [(row['id'], f"{row['title'] or ''}\n{row['content']}") for row in rows]
                await self._embed_document_batch(batch)

                self.stats["current_progress"] += len(batch)
                self.stats["total_processed"] += len(batch)
                self.stats["last_activity"] = datetime.utcnow().isoformat()

                logger.info(f"Documents processed: {self.stats['current_progress']}")
                await asyncio.sleep(0.5)

        except Exception as e:
            logger.error(f"Error processing documents: {e}")
            self.stats["total_errors"] += 1
        finally:
            self.is_running = False
            self.current_job = None

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
                await pool.execute("""
                    INSERT INTO unified_embeddings
                    (source_type, source_table, source_id, content, embedding, embedding_model, created_at)
                    VALUES ('document', 'documents', $1, $2, $3, $4, NOW())
                    ON CONFLICT (source_type, source_table, source_id) DO UPDATE
                    SET content = EXCLUDED.content,
                        embedding = EXCLUDED.embedding,
                        updated_at = NOW()
                """, str(ids[i]), texts[i][:10000], embedding_data.embedding, EMBEDDING_MODEL)

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
        """Stop the current job"""
        self.is_running = False
        self.is_paused = False
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
