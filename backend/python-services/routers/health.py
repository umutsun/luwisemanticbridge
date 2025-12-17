"""
Health check endpoints
Comprehensive status for all Python microservices
"""

from fastapi import APIRouter, HTTPException
from typing import Dict, Any, List
from datetime import datetime
import psutil
import os

from services.database import get_db
from services.redis_client import get_redis

router = APIRouter()


def check_tesseract_available() -> Dict:
    """Check if Tesseract OCR is available"""
    try:
        import pytesseract
        version = pytesseract.get_tesseract_version()
        return {"status": "available", "version": str(version)}
    except Exception as e:
        return {"status": "unavailable", "error": str(e)}


def check_ocr_available() -> Dict:
    """Check OCR services availability"""
    result = {"tesseract": check_tesseract_available()}

    # Check Google Vision
    try:
        from services.google_vision_ocr import google_vision_ocr
        result["google_vision"] = {"status": "configured"}
    except ImportError:
        result["google_vision"] = {"status": "not_configured"}

    return result


def check_embedding_available() -> Dict:
    """Check embedding services"""
    result = {}

    # Check OpenAI
    if os.getenv("OPENAI_API_KEY"):
        result["openai"] = {"status": "configured", "model": "text-embedding-3-small"}
    else:
        result["openai"] = {"status": "not_configured"}

    # Check Google
    if os.getenv("GOOGLE_API_KEY"):
        result["google"] = {"status": "configured", "model": "text-embedding-004"}
    else:
        result["google"] = {"status": "not_configured"}

    return result


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


@router.get("/health/services")
async def microservices_status() -> Dict[str, Any]:
    """
    Comprehensive Python microservices status
    Shows all available services and their current state
    """
    status = {
        "timestamp": datetime.now().isoformat(),
        "overall_status": "healthy",
        "microservices": []
    }

    # 1. Document Analyzer Service
    try:
        from services.document_analyzer_service import document_analyzer
        analyzer_status = document_analyzer.get_status()
        status["microservices"].append({
            "name": "Document Analyzer",
            "description": "PDF metin çıkarma ve OCR servisi",
            "status": "running" if analyzer_status["is_running"] else "idle",
            "details": {
                "is_running": analyzer_status["is_running"],
                "is_paused": analyzer_status["is_paused"],
                "stats": analyzer_status["stats"],
                "current_job": analyzer_status["current_job"]
            },
            "endpoints": [
                "/api/python/documents/analyze/start",
                "/api/python/documents/analyze/status",
                "/api/python/documents/stats"
            ]
        })
    except Exception as e:
        status["microservices"].append({
            "name": "Document Analyzer",
            "status": "error",
            "error": str(e)
        })

    # 2. OCR Services
    ocr_status = check_ocr_available()
    tesseract_ok = ocr_status.get("tesseract", {}).get("status") == "available"
    status["microservices"].append({
        "name": "OCR Service",
        "description": "Taranmış PDF'lerden metin çıkarma (Tesseract + Google Vision)",
        "status": "available" if tesseract_ok else "degraded",
        "details": ocr_status,
        "endpoints": []
    })

    # 3. Embedding Service
    embedding_status = check_embedding_available()
    embedding_ok = any(v.get("status") == "configured" for v in embedding_status.values())
    status["microservices"].append({
        "name": "Embedding Service",
        "description": "Metin embedding oluşturma (OpenAI/Google)",
        "status": "available" if embedding_ok else "not_configured",
        "details": embedding_status,
        "endpoints": [
            "/api/python/embedding/csv",
            "/api/python/embedding/documents",
            "/api/python/embedding/status"
        ]
    })

    # 4. CSV Transform Service
    try:
        from services.csv_transform_service import csv_transform_service
        status["microservices"].append({
            "name": "CSV Transform",
            "description": "Yüksek performanslı CSV import (COPY)",
            "status": "available",
            "details": {"engine": csv_transform_service.engine if hasattr(csv_transform_service, 'engine') else "native"},
            "endpoints": [
                "/api/python/csv/upload",
                "/api/python/csv/preview",
                "/api/python/csv/transform"
            ]
        })
    except Exception as e:
        status["microservices"].append({
            "name": "CSV Transform",
            "status": "error",
            "error": str(e)
        })

    # 5. Whisper Service (Speech-to-Text)
    try:
        from services.whisper_service import whisper_service
        whisper_mode = getattr(whisper_service, 'mode', 'api')
        status["microservices"].append({
            "name": "Whisper (Speech-to-Text)",
            "description": "Ses dosyalarından metin çıkarma",
            "status": "available",
            "details": {"mode": whisper_mode},
            "endpoints": [
                "/api/python/whisper/transcribe"
            ]
        })
    except Exception as e:
        status["microservices"].append({
            "name": "Whisper (Speech-to-Text)",
            "status": "unavailable",
            "error": str(e)
        })

    # 6. Crawler Service
    try:
        from crawlers.sahibinden_list_crawler import SahibindenCrawler
        status["microservices"].append({
            "name": "Crawler Service",
            "description": "Web veri çekme (Sahibinden, vs.)",
            "status": "available",
            "details": {"crawlers": ["sahibinden"]},
            "endpoints": [
                "/api/python/crawl/start",
                "/api/python/crawl/status"
            ]
        })
    except Exception as e:
        status["microservices"].append({
            "name": "Crawler Service",
            "status": "unavailable",
            "error": str(e)
        })

    # 7. PDF Service
    try:
        status["microservices"].append({
            "name": "PDF Service",
            "description": "PDF metin çıkarma (PyPDF2)",
            "status": "available",
            "details": {},
            "endpoints": [
                "/api/python/pdf/extract"
            ]
        })
    except Exception:
        pass

    # Calculate overall status
    service_statuses = [s.get("status", "unknown") for s in status["microservices"]]
    if "error" in service_statuses:
        status["overall_status"] = "degraded"
    elif all(s in ["available", "idle", "running"] for s in service_statuses):
        status["overall_status"] = "healthy"
    else:
        status["overall_status"] = "partial"

    # Add system metrics
    status["system"] = {
        "cpu_percent": psutil.cpu_percent(),
        "memory_percent": psutil.virtual_memory().percent,
        "memory_used_mb": round(psutil.virtual_memory().used / 1024 / 1024, 1),
        "disk_percent": psutil.disk_usage('/').percent
    }

    return status


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