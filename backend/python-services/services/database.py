"""
Database connection and pool management
"""

import os
from typing import Optional
import asyncpg
from loguru import logger

# Global connection pool
_pool: Optional[asyncpg.Pool] = None

async def init_db() -> asyncpg.Pool:
    """Initialize database connection pool"""
    global _pool

    if _pool is not None:
        return _pool

    try:
        database_url = os.getenv("DATABASE_URL")
        if not database_url:
            raise ValueError("DATABASE_URL not configured")

        async def _init_connection(conn):
            """Set session-level parameters for each new connection"""
            # HNSW ef_search controls recall quality for vector similarity search
            # Default (40) misses results in large tables (200K+ rows)
            # 200 provides good recall without significant performance cost
            await conn.execute("SET hnsw.ef_search = 200")

        _pool = await asyncpg.create_pool(
            database_url,
            min_size=5,
            max_size=20,
            command_timeout=60,
            max_queries=50000,
            max_cached_statement_lifetime=300,
            init=_init_connection,
        )

        # Test connection
        async with _pool.acquire() as conn:
            version = await conn.fetchval("SELECT version()")
            logger.info(f"✅ PostgreSQL connected: {version[:50]}...")

            # Check pgvector extension
            pgvector = await conn.fetchval(
                "SELECT COUNT(*) FROM pg_extension WHERE extname = 'vector'"
            )
            if pgvector:
                logger.info("✅ pgvector extension is installed")
            else:
                logger.warning("⚠️ pgvector extension not found")

        return _pool

    except Exception as e:
        logger.error(f"❌ Database connection failed: {e}")
        raise

async def get_db() -> asyncpg.Pool:
    """Get database connection pool"""
    global _pool
    if _pool is None:
        _pool = await init_db()
    return _pool

async def close_db():
    """Close database connection pool"""
    global _pool
    if _pool:
        await _pool.close()
        _pool = None
        logger.info("Database connection pool closed")

async def execute_query(query: str, *args):
    """Execute a database query"""
    pool = await get_db()
    async with pool.acquire() as conn:
        return await conn.fetch(query, *args)

async def execute_update(query: str, *args):
    """Execute an update/insert query"""
    pool = await get_db()
    async with pool.acquire() as conn:
        return await conn.execute(query, *args)