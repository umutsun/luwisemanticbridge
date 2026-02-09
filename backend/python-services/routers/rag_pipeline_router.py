"""
RAG Pipeline Router - v12.44
Exposes pipeline steps as REST endpoints.

Endpoints:
  POST /analyze-query     - Query analysis only (domain, article, rate)
  POST /post-retrieval    - Post-retrieval pipeline (domain filter + rank + evidence gate)
  POST /validate-response - Response validation (P1-P3 fixes)
  POST /full-pipeline     - Complete pipeline (all steps combined)
"""

from typing import List, Optional, Dict, Any
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from loguru import logger

from services.rag_pipeline_service import rag_pipeline


router = APIRouter()


# ═══════════════════════════════════════════════════════════════════════════
# REQUEST / RESPONSE MODELS
# ═══════════════════════════════════════════════════════════════════════════

class AnalyzeQueryRequest(BaseModel):
    """Query analysis request."""
    query: str = Field(..., min_length=1, max_length=8000)
    debug: bool = False


class PostRetrievalRequest(BaseModel):
    """Post-retrieval pipeline request."""
    query: str = Field(..., min_length=1, max_length=8000)
    search_results: List[Dict[str, Any]] = Field(..., description="Results from semantic search")
    settings: Optional[Dict[str, Any]] = Field(None, description="RAG settings override")
    debug: bool = False


class ValidateResponseRequest(BaseModel):
    """Response validation request (P1-P3)."""
    query: str = Field(..., min_length=1, max_length=8000)
    llm_response: str = Field(..., min_length=1, description="LLM-generated response text")
    sources: List[Dict[str, Any]] = Field(..., description="Sources shown to user")
    language: str = Field("tr", description="Response language (tr/en)")
    debug: bool = False


class FullPipelineRequest(BaseModel):
    """Full pipeline request (all steps)."""
    query: str = Field(..., min_length=1, max_length=8000)
    search_results: List[Dict[str, Any]] = Field(..., description="Results from semantic search")
    llm_response: str = Field(..., min_length=1, description="LLM-generated response text")
    settings: Optional[Dict[str, Any]] = Field(None, description="RAG settings override")
    language: str = Field("tr", description="Response language (tr/en)")
    debug: bool = False


# ═══════════════════════════════════════════════════════════════════════════
# ENDPOINTS
# ═══════════════════════════════════════════════════════════════════════════

@router.post("/analyze-query")
async def analyze_query(request: AnalyzeQueryRequest):
    """
    Analyze query intent without running search.

    Returns:
    - Domain detection (VIVK, KDVK, GVK, etc.)
    - Article reference detection (VUK 114, KDVK m.29)
    - Rate question detection
    - Timing metrics

    Use case: Pre-flight check before semantic search.
    """
    try:
        result = await rag_pipeline.analyze_query(
            query=request.query,
            debug=request.debug,
        )
        return result
    except Exception as e:
        logger.error(f"[rag_pipeline] analyze_query error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/post-retrieval")
async def post_retrieval(request: PostRetrievalRequest):
    """
    Run post-retrieval pipeline on search results.

    Steps executed:
    1. Query Analysis (domain, article, rate detection)
    4. Domain Filter (P0 - cross-domain noise removal)
    5. Source Ranking (hierarchy scoring, diversification, threshold)
    6. Evidence Gate (quality check for LLM call)

    Input: Raw search results from semantic search service.
    Output: Ranked, filtered results ready for LLM context.
    """
    try:
        result = await rag_pipeline.run_post_retrieval(
            query=request.query,
            search_results=request.search_results,
            settings=request.settings,
            debug=request.debug,
        )
        return result
    except Exception as e:
        logger.error(f"[rag_pipeline] post_retrieval error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/validate-response")
async def validate_response(request: ValidateResponseRequest):
    """
    Validate and fix LLM response (P1-P3).

    Fixes applied:
    - P1: Escape pattern contradiction ("no regulation" + "must do X")
    - P2: Citation validation ([N] > source count)
    - P3: Summary citation enforcement

    Input: LLM response text + sources array.
    Output: Validated response with fix details.
    """
    try:
        result = await rag_pipeline.validate_response(
            query=request.query,
            llm_response=request.llm_response,
            sources=request.sources,
            language=request.language,
            debug=request.debug,
        )
        return result
    except Exception as e:
        logger.error(f"[rag_pipeline] validate_response error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/full-pipeline")
async def full_pipeline(request: FullPipelineRequest):
    """
    Run complete post-processing pipeline.

    Combines post-retrieval + response validation in single call:
    1. Query Analysis
    4. Domain Filter (P0)
    5. Source Ranking
    6. Evidence Gate
    7. Response Validation (P1-P3)

    Input: Search results + LLM response.
    Output: Ranked sources + validated response.
    """
    try:
        result = await rag_pipeline.full_pipeline(
            query=request.query,
            search_results=request.search_results,
            llm_response=request.llm_response,
            settings=request.settings,
            language=request.language,
            debug=request.debug,
        )
        return result
    except Exception as e:
        logger.error(f"[rag_pipeline] full_pipeline error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
