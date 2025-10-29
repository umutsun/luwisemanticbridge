"""
Redis client for caching and queuing
"""

import os
import json
from typing import Optional, Any
import redis.asyncio as redis
from loguru import logger

# Global Redis client
_redis_client: Optional[redis.Redis] = None

async def init_redis() -> redis.Redis:
    """Initialize Redis connection"""
    global _redis_client

    if _redis_client is not None:
        return _redis_client

    try:
        _redis_client = redis.Redis(
            host=os.getenv("REDIS_HOST", "localhost"),
            port=int(os.getenv("REDIS_PORT", 6379)),
            db=int(os.getenv("REDIS_DB", 2)),
            password=os.getenv("REDIS_PASSWORD") or None,
            decode_responses=True,
            socket_connect_timeout=5,
            socket_timeout=5,
        )

        # Test connection
        await _redis_client.ping()
        logger.info("✅ Redis connected successfully")

        return _redis_client

    except Exception as e:
        logger.warning(f"⚠️ Redis connection failed (non-critical): {e}")
        # Redis is optional, don't fail startup
        _redis_client = None
        return None

async def get_redis() -> Optional[redis.Redis]:
    """Get Redis client"""
    global _redis_client
    if _redis_client is None:
        _redis_client = await init_redis()
    return _redis_client

async def close_redis():
    """Close Redis connection"""
    global _redis_client
    if _redis_client:
        await _redis_client.close()
        _redis_client = None
        logger.info("Redis connection closed")

async def cache_get(key: str) -> Optional[Any]:
    """Get value from cache"""
    client = await get_redis()
    if not client:
        return None

    try:
        value = await client.get(key)
        if value:
            return json.loads(value) if value.startswith('{') or value.startswith('[') else value
        return None
    except Exception as e:
        logger.error(f"Cache get error: {e}")
        return None

async def cache_set(key: str, value: Any, expire: int = 3600):
    """Set value in cache with expiration"""
    client = await get_redis()
    if not client:
        return False

    try:
        if isinstance(value, (dict, list)):
            value = json.dumps(value)
        await client.setex(key, expire, value)
        return True
    except Exception as e:
        logger.error(f"Cache set error: {e}")
        return False

async def queue_push(queue_name: str, data: dict):
    """Push data to Redis queue"""
    client = await get_redis()
    if not client:
        return False

    try:
        await client.lpush(queue_name, json.dumps(data))
        return True
    except Exception as e:
        logger.error(f"Queue push error: {e}")
        return False

async def queue_pop(queue_name: str) -> Optional[dict]:
    """Pop data from Redis queue"""
    client = await get_redis()
    if not client:
        return None

    try:
        data = await client.rpop(queue_name)
        if data:
            return json.loads(data)
        return None
    except Exception as e:
        logger.error(f"Queue pop error: {e}")
        return None