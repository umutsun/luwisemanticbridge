"""
pgAI Service - Automatic Embedding Generation
Provides pgai-like functionality using Python
"""

import asyncio
import hashlib
import json
from typing import List, Dict, Any, Optional
from datetime import datetime
import asyncpg
import numpy as np
from openai import AsyncOpenAI
from redis import asyncio as aioredis
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class PgAIService:
    """
    Provides pgai-like automatic embedding generation
    """

    def __init__(self, db_config: dict, redis_config: dict, openai_config: dict):
        self.db_config = db_config
        self.redis_config = redis_config
        self.openai_config = openai_config
        self.db_pool: Optional[asyncpg.Pool] = None
        self.redis_client: Optional[aioredis.Redis] = None
        self.openai_client: Optional[AsyncOpenAI] = None
        self.processing = False

    async def initialize(self):
        """Initialize connections"""
        try:
            # Database connection
            self.db_pool = await asyncpg.create_pool(
                host=self.db_config['host'],
                port=self.db_config['port'],
                database=self.db_config['database'],
                user=self.db_config['user'],
                password=self.db_config['password'],
                min_size=5,
                max_size=20
            )

            # Redis connection
            self.redis_client = await aioredis.from_url(
                f"redis://{self.redis_config['host']}:{self.redis_config['port']}",
                db=self.redis_config.get('db', 0)
            )

            # OpenAI client
            self.openai_client = AsyncOpenAI(api_key=self.openai_config['api_key'])

            # Create pgai schema and tables
            await self.setup_database()

            logger.info("✅ pgAI Service initialized successfully")

        except Exception as e:
            logger.error(f"❌ Failed to initialize pgAI service: {e}")
            raise

    async def setup_database(self):
        """Setup pgai schema and tables"""
        async with self.db_pool.acquire() as conn:
            # Create schema
            await conn.execute("CREATE SCHEMA IF NOT EXISTS pgai")

            # Create embedding queue table
            await conn.execute("""
                CREATE TABLE IF NOT EXISTS pgai.embedding_queue (
                    id SERIAL PRIMARY KEY,
                    table_name VARCHAR(100),
                    record_id VARCHAR(100),
                    content TEXT,
                    content_hash VARCHAR(64),
                    status VARCHAR(20) DEFAULT 'pending',
                    embedding vector(3072),
                    model VARCHAR(100),
                    tokens_used INTEGER,
                    error_message TEXT,
                    retry_count INTEGER DEFAULT 0,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    processed_at TIMESTAMP,
                    UNIQUE(table_name, record_id)
                )
            """)

            # Create embedding cache table
            await conn.execute("""
                CREATE TABLE IF NOT EXISTS pgai.embedding_cache (
                    id SERIAL PRIMARY KEY,
                    content_hash VARCHAR(64) UNIQUE,
                    embedding vector(3072),
                    model VARCHAR(100),
                    tokens_used INTEGER,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)

            # Create indexes
            await conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_queue_status
                ON pgai.embedding_queue(status, created_at)
            """)

            await conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_cache_hash
                ON pgai.embedding_cache(content_hash)
            """)

            logger.info("✅ pgai database schema created")

    def hash_content(self, content: str) -> str:
        """Generate SHA256 hash of content"""
        return hashlib.sha256(content.encode()).hexdigest()

    async def queue_embedding(self, table_name: str, record_id: str, content: str) -> bool:
        """Queue content for embedding generation"""
        try:
            content_hash = self.hash_content(content)

            async with self.db_pool.acquire() as conn:
                # Check if already in cache
                cache_result = await conn.fetchrow(
                    "SELECT embedding FROM pgai.embedding_cache WHERE content_hash = $1",
                    content_hash
                )

                if cache_result:
                    # Use cached embedding
                    await self.apply_embedding(
                        table_name, record_id,
                        cache_result['embedding'],
                        from_cache=True
                    )
                    return True

                # Add to queue
                await conn.execute("""
                    INSERT INTO pgai.embedding_queue
                    (table_name, record_id, content, content_hash)
                    VALUES ($1, $2, $3, $4)
                    ON CONFLICT (table_name, record_id)
                    DO UPDATE SET
                        content = EXCLUDED.content,
                        content_hash = EXCLUDED.content_hash,
                        status = 'pending',
                        retry_count = 0
                """, table_name, record_id, content, content_hash)

                # Notify via Redis
                await self.redis_client.publish(
                    'pgai:queue',
                    json.dumps({
                        'table': table_name,
                        'record': record_id,
                        'action': 'queued'
                    })
                )

            return True

        except Exception as e:
            logger.error(f"Error queueing embedding: {e}")
            return False

    async def process_queue(self, batch_size: int = 10) -> int:
        """Process pending embeddings in queue"""
        if self.processing:
            return 0

        self.processing = True
        processed_count = 0

        try:
            async with self.db_pool.acquire() as conn:
                # Get batch of pending items
                rows = await conn.fetch("""
                    UPDATE pgai.embedding_queue
                    SET status = 'processing',
                        processed_at = CURRENT_TIMESTAMP
                    WHERE id IN (
                        SELECT id FROM pgai.embedding_queue
                        WHERE status = 'pending' AND retry_count < 3
                        ORDER BY created_at
                        LIMIT $1
                        FOR UPDATE SKIP LOCKED
                    )
                    RETURNING id, table_name, record_id, content, content_hash
                """, batch_size)

                if not rows:
                    return 0

                # Process in parallel
                tasks = []
                for row in rows:
                    tasks.append(self.generate_embedding(row))

                results = await asyncio.gather(*tasks, return_exceptions=True)

                # Process results
                for row, result in zip(rows, results):
                    if isinstance(result, Exception):
                        # Mark as failed
                        await conn.execute("""
                            UPDATE pgai.embedding_queue
                            SET status = 'failed',
                                error_message = $2,
                                retry_count = retry_count + 1
                            WHERE id = $1
                        """, row['id'], str(result))

                        logger.error(f"Failed to generate embedding: {result}")
                    else:
                        # Success - save embedding
                        embedding, tokens = result

                        # Update queue
                        await conn.execute("""
                            UPDATE pgai.embedding_queue
                            SET status = 'completed',
                                embedding = $2,
                                tokens_used = $3,
                                model = $4
                            WHERE id = $1
                        """, row['id'], embedding, tokens, self.openai_config.get('model', 'text-embedding-3-large'))

                        # Add to cache
                        await conn.execute("""
                            INSERT INTO pgai.embedding_cache
                            (content_hash, embedding, model, tokens_used)
                            VALUES ($1, $2, $3, $4)
                            ON CONFLICT (content_hash) DO NOTHING
                        """, row['content_hash'], embedding,
                           self.openai_config.get('model', 'text-embedding-3-large'), tokens)

                        # Apply to original table
                        await self.apply_embedding(
                            row['table_name'], row['record_id'],
                            embedding, from_cache=False
                        )

                        processed_count += 1

                logger.info(f"✅ Processed {processed_count} embeddings")

        except Exception as e:
            logger.error(f"Error processing queue: {e}")
        finally:
            self.processing = False

        return processed_count

    async def generate_embedding(self, row: dict) -> tuple:
        """Generate embedding for content"""
        try:
            response = await self.openai_client.embeddings.create(
                model=self.openai_config.get('model', 'text-embedding-3-large'),
                input=row['content'][:8000]  # Truncate if too long
            )

            embedding = response.data[0].embedding
            tokens = response.usage.total_tokens if response.usage else len(row['content']) // 4

            return (embedding, tokens)

        except Exception as e:
            raise Exception(f"Embedding generation failed: {e}")

    async def apply_embedding(self, table_name: str, record_id: str,
                             embedding: list, from_cache: bool = False):
        """Apply embedding to original table"""
        try:
            async with self.db_pool.acquire() as conn:
                # Update unified_embeddings table
                await conn.execute("""
                    UPDATE unified_embeddings
                    SET embedding = $3,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE source_table = $1 AND source_id = $2
                """, table_name, record_id, embedding)

                # Notify via Redis
                await self.redis_client.publish(
                    'pgai:embedded',
                    json.dumps({
                        'table': table_name,
                        'record': record_id,
                        'from_cache': from_cache,
                        'timestamp': datetime.now().isoformat()
                    })
                )

        except Exception as e:
            logger.error(f"Error applying embedding: {e}")

    async def start_worker(self, interval: int = 5):
        """Start background worker to process queue"""
        logger.info("🚀 Starting pgAI worker...")

        while True:
            try:
                # Process queue
                count = await self.process_queue()

                if count > 0:
                    logger.info(f"Processed {count} embeddings")

                # Wait before next batch
                await asyncio.sleep(interval)

            except Exception as e:
                logger.error(f"Worker error: {e}")
                await asyncio.sleep(interval * 2)

    async def get_status(self) -> dict:
        """Get pgai service status"""
        async with self.db_pool.acquire() as conn:
            status = await conn.fetchrow("""
                SELECT
                    (SELECT COUNT(*) FROM pgai.embedding_queue WHERE status = 'pending') as pending,
                    (SELECT COUNT(*) FROM pgai.embedding_queue WHERE status = 'processing') as processing,
                    (SELECT COUNT(*) FROM pgai.embedding_queue WHERE status = 'completed') as completed,
                    (SELECT COUNT(*) FROM pgai.embedding_queue WHERE status = 'failed') as failed,
                    (SELECT COUNT(*) FROM pgai.embedding_cache) as cached
            """)

            return {
                'status': 'running' if not self.processing else 'processing',
                'queue': {
                    'pending': status['pending'],
                    'processing': status['processing'],
                    'completed': status['completed'],
                    'failed': status['failed']
                },
                'cache': {
                    'total': status['cached']
                },
                'worker': {
                    'active': self.processing
                }
            }

    async def cleanup(self):
        """Cleanup connections"""
        if self.db_pool:
            await self.db_pool.close()
        if self.redis_client:
            await self.redis_client.close()