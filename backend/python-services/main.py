"""
Python Microservices
Main FastAPI Application
Multi-tenant architecture supporting EmlakAI, Bookie, Vergilex, LSEMB
"""

import os
import sys
from pathlib import Path
from typing import Optional
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Depends, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import uvicorn
from loguru import logger
from dotenv import load_dotenv

# Load environment variables from .env file
# Multi-tenant setup: Try .env.lsemb first (tenant-specific), fallback to backend/.env
env_lsemb_path = Path(__file__).parent.parent.parent / '.env.lsemb'
env_default_path = Path(__file__).parent.parent / '.env'

if env_lsemb_path.exists():
    load_dotenv(dotenv_path=env_lsemb_path)
    print(f"[INFO] Loaded environment from {env_lsemb_path}")
elif env_default_path.exists():
    load_dotenv(dotenv_path=env_default_path)
    print(f"[INFO] Loaded environment from {env_default_path}")
else:
    print("[WARNING] No .env file found")

# Get tenant-specific app name
APP_NAME = os.getenv("APP_NAME", "LSEMB")

# Configure logging
logger.remove()
logger.add(
    sys.stdout,
    level=os.getenv("LOG_LEVEL", "INFO").upper(),  # Ensure uppercase for loguru
    format="<green>{time:YYYY-MM-DD HH:mm:ss}</green> | <level>{level}</level> | <cyan>{name}</cyan>:<cyan>{function}</cyan>:<cyan>{line}</cyan> - <level>{message}</level>"
)

# Import routers
from routers import crawl_router, pgai_router, health_router, whisper_router, import_router, worker_router, pdf_router, csv_transform_router, embedding_router, document_analyzer_router, semantic_search_router, devops_router, semantic_analyzer_router, pdf_vision_router
from routers.scheduler_router import router as scheduler_router

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown events"""
    logger.info(f"🚀 Starting {APP_NAME} Python Services...")

    # Initialize services
    from services.database import init_db
    from services.redis_client import init_redis

    try:
        await init_db()
        await init_redis()
        logger.info("✅ All services initialized successfully")

        # Initialize and start scheduler
        from scheduler import get_scheduler
        from services.database import get_db
        from services.redis_client import get_redis
        scheduler = get_scheduler()
        await scheduler.initialize(await get_db(), await get_redis())
        await scheduler.start()
        logger.info("✅ Scheduler service started")

        # Auto-recovery: Check for crashed batch jobs and resume them
        await check_and_recover_crashed_jobs()

    except Exception as e:
        logger.error(f"❌ Failed to initialize services: {e}")
        raise

    yield

    # Cleanup
    logger.info(f"🔄 Shutting down {APP_NAME} Python Services...")

    # Stop scheduler first
    from scheduler import get_scheduler
    scheduler = get_scheduler()
    await scheduler.stop()
    logger.info("⏹️ Scheduler stopped")

    from services.database import close_db
    from services.redis_client import close_redis

    await close_db()
    await close_redis()
    logger.info("👋 Shutdown complete")


async def check_and_recover_crashed_jobs():
    """
    Auto-recovery: Check Redis for crashed batch jobs and resume them.
    This runs at startup to handle cases where the service crashed mid-processing.
    """
    logger.info("🔍 Checking for crashed batch jobs to recover...")

    recovered_count = 0

    try:
        # Check document analyzer for crashed state
        from services.document_analyzer_service import document_analyzer
        analyzer_result = await document_analyzer.check_and_recover()
        if analyzer_result and analyzer_result.get("recovered"):
            logger.info(f"📄 Recovered document analyzer job: {analyzer_result}")
            recovered_count += 1
    except Exception as e:
        logger.warning(f"Could not check document analyzer recovery: {e}")

    try:
        # Check embedding worker for crashed state
        from services.embedding_service import embedding_worker
        embedding_result = await embedding_worker.check_and_recover()
        if embedding_result and embedding_result.get("recovered"):
            logger.info(f"🔢 Recovered embedding job: {embedding_result}")
            recovered_count += 1
    except Exception as e:
        logger.warning(f"Could not check embedding recovery: {e}")

    if recovered_count > 0:
        logger.info(f"✅ Auto-recovered {recovered_count} crashed job(s)")
    else:
        logger.info("✅ No crashed jobs to recover")

# Create FastAPI app
app = FastAPI(
    title=f"{APP_NAME} Python Services",
    description="Python microservices for advanced AI capabilities",
    version="1.0.0",
    lifespan=lifespan
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("CORS_ORIGINS", "http://localhost:3000,http://localhost:3002,http://localhost:8083").split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Security dependency
async def verify_api_key(x_api_key: Optional[str] = Header(None)):
    """Verify internal API key for service-to-service communication"""
    if os.getenv("ENVIRONMENT") == "production":
        expected_key = os.getenv("INTERNAL_API_KEY")
        if not x_api_key or x_api_key != expected_key:
            raise HTTPException(status_code=401, detail="Invalid API Key")
    return True

# Include routers
app.include_router(health_router, tags=["health"])
app.include_router(
    crawl_router,
    prefix="/api/python/crawl",
    tags=["crawl4ai"]
    # API key check removed for internal crawl operations
)
app.include_router(
    pgai_router,
    prefix="/api/python/pgai",
    tags=["pgai"],
    dependencies=[Depends(verify_api_key)]
)
app.include_router(
    whisper_router,
    prefix="/api/python/whisper",
    tags=["whisper"],
    dependencies=[Depends(verify_api_key)]
)
app.include_router(
    import_router,
    prefix="/api/python/import",
    tags=["import"]
    # No API key required for internal service-to-service calls
)
app.include_router(
    worker_router,
    prefix="/api/python/worker",
    tags=["worker"]
    # Worker management endpoints
)
app.include_router(
    pdf_router,
    prefix="/api/python",
    tags=["pdf"]
    # PDF text extraction service
)
app.include_router(
    csv_transform_router,
    # Note: csv_transform_router has its own prefix /api/python/csv
    tags=["csv-transform"]
    # High-performance CSV import using PostgreSQL COPY
)
app.include_router(
    embedding_router,
    prefix="/api/python/embedding",
    tags=["embedding"]
    # Embedding generation service for CSV tables and documents
)
app.include_router(
    document_analyzer_router,
    prefix="/api/python",
    tags=["document-analyzer"]
    # PDF text extraction batch service
)
app.include_router(
    semantic_search_router,
    prefix="/api/python/semantic-search",
    tags=["semantic-search"]
    # High-performance semantic search service
)
app.include_router(
    scheduler_router,
    tags=["scheduler"]
    # APScheduler-based job scheduling service
)
app.include_router(
    devops_router,
    tags=["devops"]
    # DevOps Dashboard: SSH, security scanning, deployments
)
app.include_router(
    semantic_analyzer_router,
    prefix="/api/v2/semantic",
    tags=["semantic-analyzer"]
    # RAG quality control: quote validation, chunk analysis
)
app.include_router(
    pdf_vision_router,
    prefix="/api/python",
    tags=["pdf-vision"]
    # Intelligent PDF visual analysis: tapu, fatura, harita, etc.
)

# Global exception handler
@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    logger.error(f"Unhandled exception: {exc}")
    return JSONResponse(
        status_code=500,
        content={"error": "Internal server error", "detail": str(exc)}
    )

# Root endpoint
@app.get("/")
async def root():
    return {
        "service": f"{APP_NAME} Python Services",
        "tenant": os.getenv("TENANT_ID", "unknown"),
        "status": "running",
        "version": "1.0.0",
        "endpoints": {
            "health": "/health",
            "crawl": "/api/python/crawl",
            "pgai": "/api/python/pgai",
            "whisper": "/api/python/whisper",
            "import": "/api/python/import",
            "csv_transform": "/api/python/csv",
            "embedding": "/api/python/embedding",
            "documents": "/api/python/documents",
            "semantic_search": "/api/python/semantic-search",
            "semantic_analyzer": "/api/v2/semantic",
            "pdf_vision": "/api/python/pdf-vision",
            "scheduler": "/api/python/scheduler",
            "devops": "/api/python/devops",
            "docs": "/docs"
        }
    }

if __name__ == "__main__":
    port = int(os.getenv("PYTHON_SERVICE_PORT") or os.getenv("PYTHON_API_PORT") or 8002)
    host = os.getenv("PYTHON_API_HOST", "0.0.0.0")

    uvicorn.run(
        "main:app",
        host=host,
        port=port,
        reload=os.getenv("ENVIRONMENT") == "development",
        log_level=os.getenv("LOG_LEVEL", "info").lower()
    )