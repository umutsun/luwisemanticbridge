"""
pgai Worker Service
Manages automatic embedding generation without server-side pgai extension
"""

import asyncio
import json
from typing import List, Dict, Any, Optional
from datetime import datetime
import hashlib
from loguru import logger
import asyncpg
import openai
from tenacity import retry, stop_after_attempt, wait_fixed
import numpy as np

from .database import get_db
from .redis_client import cache_get, cache_set

class PgaiWorker:
    """Worker for automatic embedding generation"""

    def __init__(self):
        self.pool: Optional[asyncpg.Pool] = None
        self.is_running = False
        self.processed_count = 0
        self.last_run = None

    async def init(self):
        """Initialize worker connections"""
        self.pool = await get_db()
        logger.info("pgai worker initialized")

    async def close(self):
        """Close worker connections"""
        self.is_running = False
        if self.pool:
            await self.pool.close()

    @retry(stop=stop_after_attempt(3), wait=wait_fixed(2))
    async def generate_embedding(self, text: str, model: str = "text-embedding-3-large") -> List[float]:
        """Generate embedding using OpenAI API"""
        try:
            response = await asyncio.to_thread(
                openai.embeddings.create,
                input=text,
                model=model
            )
            return response.data[0].embedding
        except Exception as e:
            logger.error(f"Failed to generate embedding: {e}")
            raise

    async def process_documents(self):
        """Process documents without embeddings in unified_embeddings"""
        if not self.pool:
            logger.error("Database pool not initialized")
            return

        try:
            # Find documents without embeddings
            async with self.pool.acquire() as conn:
                # Get documents that don't have embeddings yet
                documents = await conn.fetch("""
                    SELECT d.id, d.title, d.description, d.content
                    FROM documents d
                    LEFT JOIN unified_embeddings ue
                        ON ue.source_table = 'documents'
                        AND ue.source_id = d.id
                    WHERE ue.id IS NULL
                    AND d.content IS NOT NULL
                    AND LENGTH(d.content) > 0
                    LIMIT 10
                """)

                if not documents:
                    logger.debug("No documents to process")
                    return

                logger.info(f"Processing {len(documents)} documents")

                for doc in documents:
                    try:
                        # Prepare text for embedding
                        text = f"{doc['title'] or ''}\n{doc['description'] or ''}\n{doc['content'] or ''}"
                        text = text[:8000]  # Limit text length

                        # Generate embedding
                        embedding = await self.generate_embedding(text)

                        # Store embedding in unified_embeddings
                        await conn.execute("""
                            INSERT INTO unified_embeddings (
                                source_table,
                                source_type,
                                source_id,
                                source_name,
                                content,
                                embedding,
                                metadata,
                                tokens_used,
                                model_used,
                                created_at,
                                updated_at
                            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
                        """,
                        'documents',
                        'document',
                        doc['id'],
                        doc['title'],
                        text[:1000],  # Store first 1000 chars as content preview
                        json.dumps(embedding),  # Store as JSON
                        json.dumps({
                            "dimensions": len(embedding),
                            "generated_by": "pgai_worker"
                        }),
                        len(text) // 4,  # Approximate tokens
                        "text-embedding-3-large",
                        datetime.now(),
                        datetime.now()
                        )

                        self.processed_count += 1
                        logger.info(f"Processed document {doc['id']}: {doc['title']}")

                        # Small delay to avoid rate limiting
                        await asyncio.sleep(0.5)

                    except Exception as e:
                        logger.error(f"Failed to process document {doc['id']}: {e}")
                        continue

        except Exception as e:
            logger.error(f"Error in process_documents: {e}")

    async def process_messages(self):
        """Process chat messages without embeddings in unified_embeddings"""
        if not self.pool:
            logger.error("Database pool not initialized")
            return

        try:
            async with self.pool.acquire() as conn:
                # Get recent messages without embeddings
                messages = await conn.fetch("""
                    SELECT m.id, m.content, m.conversation_id
                    FROM messages m
                    LEFT JOIN unified_embeddings ue
                        ON ue.source_table = 'messages'
                        AND ue.source_id = m.id
                    WHERE ue.id IS NULL
                    AND m.content IS NOT NULL
                    AND LENGTH(m.content) > 10
                    AND m.created_at > NOW() - INTERVAL '7 days'
                    LIMIT 20
                """)

                if not messages:
                    logger.debug("No messages to process")
                    return

                logger.info(f"Processing {len(messages)} messages")

                for msg in messages:
                    try:
                        # Generate embedding
                        embedding = await self.generate_embedding(msg['content'])

                        # Store embedding in unified_embeddings
                        await conn.execute("""
                            INSERT INTO unified_embeddings (
                                source_table,
                                source_type,
                                source_id,
                                source_name,
                                content,
                                embedding,
                                metadata,
                                tokens_used,
                                model_used,
                                created_at,
                                updated_at
                            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
                        """,
                        'messages',
                        'message',
                        msg['id'],
                        f"Message {msg['id']}",
                        msg['content'][:1000],
                        json.dumps(embedding),
                        json.dumps({
                            "conversation_id": msg['conversation_id'],
                            "dimensions": len(embedding),
                            "generated_by": "pgai_worker"
                        }),
                        len(msg['content']) // 4,
                        "text-embedding-3-large",
                        datetime.now(),
                        datetime.now()
                        )

                        self.processed_count += 1

                        # Small delay
                        await asyncio.sleep(0.3)

                    except Exception as e:
                        logger.error(f"Failed to process message {msg['id']}: {e}")
                        continue

        except Exception as e:
            logger.error(f"Error in process_messages: {e}")

    async def run_once(self):
        """Run one iteration of processing"""
        logger.info("pgai worker running iteration...")

        # Process documents
        await self.process_documents()

        # Process messages
        await self.process_messages()

        self.last_run = datetime.now()

        # Cache status - cache_set already handles JSON serialization
        await cache_set(
            "pgai:worker:status",
            {
                "running": self.is_running,
                "processed_count": self.processed_count,
                "last_run": self.last_run.isoformat() if self.last_run else None
            },
            expire=60  # Use 'expire' parameter name
        )

        logger.info(f"pgai worker iteration complete. Processed: {self.processed_count}")

    async def start(self, interval_seconds: int = 60):
        """Start the worker with specified interval"""
        if self.is_running:
            logger.warning("Worker already running")
            return

        self.is_running = True
        await self.init()

        logger.info(f"Starting pgai worker with {interval_seconds}s interval")

        while self.is_running:
            try:
                await self.run_once()
                await asyncio.sleep(interval_seconds)
            except Exception as e:
                logger.error(f"Worker error: {e}")
                await asyncio.sleep(5)  # Short delay on error

    async def stop(self):
        """Stop the worker"""
        logger.info("Stopping pgai worker...")
        self.is_running = False
        await self.close()

# Global worker instance
worker = PgaiWorker()

async def get_worker_status() -> Dict[str, Any]:
    """Get current worker status from remote server via SSH"""
    try:
        # Check if pgai worker is running on the remote server via systemd
        import subprocess
        result = subprocess.run(
            ["ssh", "root@91.99.229.96", "systemctl is-active pgai-worker"],
            capture_output=True,
            text=True,
            timeout=5
        )

        is_running = result.stdout.strip() == "active"

        return {
            "running": is_running,
            "processed_count": 0,  # Will be updated when we implement counter
            "last_run": None,  # Will be updated when we implement tracking
            "service": "pgai-worker (systemd)",
            "status": "active" if is_running else "inactive"
        }
    except Exception as e:
        logger.error(f"Failed to check pgai worker status: {e}")
        # Fallback to local worker status
        return {
            "running": False,
            "processed_count": 0,
            "last_run": None,
            "error": str(e)
        }