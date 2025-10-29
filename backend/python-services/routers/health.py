"""
Health check endpoints
"""

from fastapi import APIRouter, HTTPException
from typing import Dict, Any
from datetime import datetime
import psutil

from services.database import get_db
from services.redis_client import get_redis

router = APIRouter()

@router.get("/health")
async def health_check() -> Dict[str, Any]:
    """Basic health check"""
    return {
        "status": "healthy",
        "service": "LSEMB Python Services",
        "timestamp": datetime.now().isoformat()
    }

@router.get("/health/detailed")
async def detailed_health_check() -> Dict[str, Any]:
    """Detailed health check with service status"""
    health = {
        "status": "healthy",
        "timestamp": datetime.now().isoformat(),
        "services": {}
    }

    # Check database
    try:
        pool = await get_db()
        async with pool.acquire() as conn:
            await conn.fetchval("SELECT 1")
        health["services"]["database"] = {"status": "connected", "pool_size": pool.get_size()}
    except Exception as e:
        health["services"]["database"] = {"status": "error", "error": str(e)}
        health["status"] = "degraded"

    # Check Redis
    try:
        redis = await get_redis()
        if redis:
            await redis.ping()
            health["services"]["redis"] = {"status": "connected"}
        else:
            health["services"]["redis"] = {"status": "not configured"}
    except Exception as e:
        health["services"]["redis"] = {"status": "error", "error": str(e)}
        # Redis is optional, don't degrade overall status

    # System metrics
    health["system"] = {
        "cpu_percent": psutil.cpu_percent(),
        "memory_percent": psutil.virtual_memory().percent,
        "disk_percent": psutil.disk_usage('/').percent
    }

    return health

@router.get("/health/ready")
async def readiness_check() -> Dict[str, str]:
    """Kubernetes readiness probe"""
    try:
        pool = await get_db()
        async with pool.acquire() as conn:
            await conn.fetchval("SELECT 1")
        return {"status": "ready"}
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Service not ready: {str(e)}")

@router.get("/health/live")
async def liveness_check() -> Dict[str, str]:
    """Kubernetes liveness probe"""
    return {"status": "alive"}