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

# Load environment variables from backend/.env
# This works for all projects (emlakai, bookie, vergilex, lsemb)
env_path = Path(__file__).parent.parent / '.env'
load_dotenv(dotenv_path=env_path)

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
from routers import crawl_router, pgai_router, health_router, whisper_router, import_router

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
    except Exception as e:
        logger.error(f"❌ Failed to initialize services: {e}")
        raise

    yield

    # Cleanup
    logger.info(f"🔄 Shutting down {APP_NAME} Python Services...")
    from services.database import close_db
    from services.redis_client import close_redis

    await close_db()
    await close_redis()
    logger.info("👋 Shutdown complete")

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