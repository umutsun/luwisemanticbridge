"""
Relationship Extraction API Router
Endpoints for entity extraction, cross-reference detection, and graph traversal.
"""

from fastapi import APIRouter, HTTPException
from loguru import logger

from services.relationship_extraction_service import get_relationship_extraction_service
from models.relationship_models import (
    ExtractRequest,
    BatchExtractRequest,
    ResolveRequest,
    ExtractionResult,
    BatchExtractResponse,
    BatchProgressResponse,
    ResolveResponse,
    ChunkRelationshipsResponse,
    RelatedChunksResponse,
    ExtractionStatsResponse,
)

router = APIRouter()


# ═══════════════════════════════════════════════════════════════════════════
# EXTRACTION ENDPOINTS
# ═══════════════════════════════════════════════════════════════════════════

@router.post("/extract")
async def extract_from_chunk(request: ExtractRequest):
    """
    Extract entities and relationships from a single chunk.
    Uses LLM-based extraction with regex fallback.
    """
    try:
        service = get_relationship_extraction_service()
        result = await service.extract_from_chunk(
            chunk_id=request.chunk_id,
            content=request.content,
            metadata=request.metadata,
        )
        return result
    except Exception as e:
        logger.error(f"[RelRouter] Extract failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/extract-batch", response_model=BatchExtractResponse)
async def start_batch_extraction(request: BatchExtractRequest):
    """
    Start a batch extraction job for multiple chunks.
    Runs in background. Use /extract-batch/status/{job_id} to track progress.
    """
    try:
        service = get_relationship_extraction_service()
        result = await service.extract_batch(
            source_table=request.source_table,
            source_type=request.source_type,
            limit=request.limit,
            offset=request.offset,
            force_reprocess=request.force_reprocess,
        )
        return result
    except Exception as e:
        logger.error(f"[RelRouter] Batch extract failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/extract-batch/status/{job_id}", response_model=BatchProgressResponse)
async def get_batch_progress(job_id: str):
    """Get progress of a batch extraction job."""
    try:
        service = get_relationship_extraction_service()
        result = await service.get_batch_progress(job_id)
        if not result:
            raise HTTPException(status_code=404, detail=f"Job {job_id} not found")
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[RelRouter] Get progress failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/extract-batch/cancel/{job_id}")
async def cancel_batch_extraction(job_id: str):
    """Cancel a running batch extraction job."""
    try:
        service = get_relationship_extraction_service()
        cancelled = await service.cancel_batch(job_id)
        if not cancelled:
            raise HTTPException(status_code=404, detail=f"Job {job_id} not found or not running")
        return {"message": f"Job {job_id} cancellation requested", "job_id": job_id}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[RelRouter] Cancel failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ═══════════════════════════════════════════════════════════════════════════
# REFERENCE RESOLUTION
# ═══════════════════════════════════════════════════════════════════════════

@router.post("/resolve", response_model=ResolveResponse)
async def resolve_references(request: ResolveRequest):
    """
    Resolve unresolved references by matching law_code + article_number
    to unified_embeddings metadata. Use dry_run=true to preview matches.
    """
    try:
        service = get_relationship_extraction_service()
        result = await service.resolve_references(dry_run=request.dry_run)
        return result
    except Exception as e:
        logger.error(f"[RelRouter] Resolve failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ═══════════════════════════════════════════════════════════════════════════
# QUERY ENDPOINTS
# ═══════════════════════════════════════════════════════════════════════════

@router.get("/chunk/{chunk_id}/relationships", response_model=ChunkRelationshipsResponse)
async def get_chunk_relationships(chunk_id: int):
    """Get all relationships for a specific chunk (both outgoing and incoming)."""
    try:
        service = get_relationship_extraction_service()
        result = await service.get_chunk_relationships(chunk_id)
        return result
    except Exception as e:
        logger.error(f"[RelRouter] Get relationships failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/chunk/{chunk_id}/related", response_model=RelatedChunksResponse)
async def get_related_chunks(chunk_id: int, max_hops: int = 1, max_results: int = 10):
    """
    Get related chunks via graph traversal.
    - max_hops=1: Direct references only
    - max_hops=2: Include references of references
    """
    if max_hops < 1 or max_hops > 2:
        raise HTTPException(status_code=400, detail="max_hops must be 1 or 2")
    if max_results < 1 or max_results > 50:
        raise HTTPException(status_code=400, detail="max_results must be between 1 and 50")

    try:
        service = get_relationship_extraction_service()
        result = await service.get_related_chunks(chunk_id, max_hops=max_hops, max_results=max_results)
        return result
    except Exception as e:
        logger.error(f"[RelRouter] Get related failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ═══════════════════════════════════════════════════════════════════════════
# STATISTICS
# ═══════════════════════════════════════════════════════════════════════════

@router.get("/stats", response_model=ExtractionStatsResponse)
async def get_extraction_stats():
    """Get overall extraction statistics: coverage, counts, types."""
    try:
        service = get_relationship_extraction_service()
        result = await service.get_stats()
        return result
    except Exception as e:
        logger.error(f"[RelRouter] Get stats failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))
