"""
Document Optimization Router
=============================
FastAPI endpoints for analyzing and fixing OCR artifacts in document_embeddings.

Endpoints:
- POST /analyze/start     - Start analysis (dry-run scan)
- POST /optimize/start    - Start optimization (fix records)
- POST /re-embed/start    - Start re-embedding (regenerate vectors)
- GET  /status            - Get current operation status & progress
- POST /pause             - Pause current operation
- POST /resume            - Resume paused operation
- POST /stop              - Stop current operation
"""

from typing import Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from loguru import logger

from services.document_optimization_service import doc_optimization_service

router = APIRouter()


# =====================================================
# Request models
# =====================================================

class OptimizeRequest(BaseModel):
    use_llm: bool = Field(False, description="Enable LLM-assisted fixes (gpt-4o-mini)")
    batch_size: int = Field(100, description="Records per batch", ge=10, le=1000)


class ReEmbedRequest(BaseModel):
    batch_size: int = Field(10, description="Records per embedding API call", ge=1, le=100)
    since: Optional[str] = Field(None, description="Re-embed records updated since this ISO timestamp")


# =====================================================
# Endpoints
# =====================================================

@router.get("/status")
async def get_status():
    """Get current optimization status and progress."""
    return doc_optimization_service.get_status()


@router.post("/analyze/start")
async def start_analyze():
    """Start analysis: scan document_embeddings for OCR issues (read-only)."""
    result = await doc_optimization_service.start_analyze()
    if not result.get("success"):
        raise HTTPException(status_code=409, detail=result.get("error"))
    return result


@router.post("/optimize/start")
async def start_optimize(request: OptimizeRequest = OptimizeRequest()):
    """Start optimization: fix OCR artifacts in chunk_text and metadata."""
    result = await doc_optimization_service.start_optimize(
        use_llm=request.use_llm,
        batch_size=request.batch_size
    )
    if not result.get("success"):
        raise HTTPException(status_code=409, detail=result.get("error"))
    return result


@router.post("/re-embed/start")
async def start_reembed(request: ReEmbedRequest = ReEmbedRequest()):
    """Start re-embedding: regenerate vectors for records with NULL embeddings."""
    result = await doc_optimization_service.start_reembed(
        batch_size=request.batch_size,
        since=request.since
    )
    if not result.get("success"):
        raise HTTPException(status_code=409, detail=result.get("error"))
    return result


@router.post("/pause")
async def pause():
    """Pause the current operation."""
    return doc_optimization_service.pause()


@router.post("/resume")
async def resume():
    """Resume the paused operation."""
    return doc_optimization_service.resume()


@router.post("/stop")
async def stop():
    """Stop the current operation."""
    return doc_optimization_service.stop()
