"""
Document Analyzer Router
FastAPI endpoints for batch PDF text extraction
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
import logging

from services.document_analyzer_service import document_analyzer

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/documents", tags=["Document Analyzer"])


class BatchAnalyzeRequest(BaseModel):
    batch_size: int = 10
    limit: int = 0  # 0 = no limit


@router.get("/pending")
async def get_pending_documents():
    """Get count and sample of pending documents"""
    try:
        total = await document_analyzer.get_total_pending()
        sample = await document_analyzer.get_pending_documents(limit=10)

        return {
            "success": True,
            "total_pending": total,
            "sample": sample
        }
    except Exception as e:
        logger.error(f"Error getting pending documents: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/analyze/start")
async def start_batch_analyze(request: BatchAnalyzeRequest = BatchAnalyzeRequest()):
    """
    Start batch PDF text extraction

    - batch_size: How many documents to process per batch (default 10)
    - limit: Maximum documents to process (0 = all)
    """
    try:
        result = await document_analyzer.start_batch_analyze(
            batch_size=request.batch_size,
            limit=request.limit
        )
        return result
    except Exception as e:
        logger.error(f"Error starting batch analyze: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/analyze/pause")
async def pause_analyze():
    """Pause ongoing analysis"""
    return document_analyzer.pause()


@router.post("/analyze/resume")
async def resume_analyze():
    """Resume paused analysis"""
    return document_analyzer.resume()


@router.post("/analyze/stop")
async def stop_analyze():
    """Stop ongoing analysis"""
    return document_analyzer.stop()


@router.get("/analyze/status")
async def get_analyze_status():
    """Get current analysis status"""
    return document_analyzer.get_status()


@router.post("/analyze/single/{document_id}")
async def analyze_single_document(document_id: int):
    """Analyze a single document by ID"""
    try:
        pool = await document_analyzer.get_pool()

        # Get document
        doc = await pool.fetchrow(
            "SELECT id, filename, title, file_path, file_type FROM documents WHERE id = $1",
            document_id
        )

        if not doc:
            raise HTTPException(status_code=404, detail="Document not found")

        result = await document_analyzer.analyze_document(dict(doc))
        return result

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error analyzing document {document_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))
