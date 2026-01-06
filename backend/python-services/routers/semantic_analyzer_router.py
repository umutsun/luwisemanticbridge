"""
Semantic Analyzer Router
FastAPI endpoints for RAG quality control

Endpoints:
- POST /analyze/chunks - Analyze chunks for relevance and quality
- POST /validate/quote - Validate quote and answer combination
- POST /filter - Filter chunks before sending to LLM
"""

from typing import List, Optional, Dict, Any
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from loguru import logger

from services.semantic_analyzer_service import semantic_analyzer, ChunkAnalysis, QuoteValidation


router = APIRouter()


# === Request/Response Models ===

class ChunkInput(BaseModel):
    """Input model for a single chunk"""
    id: str = Field(..., description="Unique identifier for the chunk")
    text: str = Field(..., description="The chunk text content")
    source: Optional[str] = Field(None, description="Source identifier")
    metadata: Optional[Dict[str, Any]] = Field(None, description="Additional metadata")


class AnalyzeChunksRequest(BaseModel):
    """Request model for chunk analysis"""
    question: str = Field(..., description="The user's question", min_length=3)
    chunks: List[ChunkInput] = Field(..., description="Chunks to analyze", min_items=1)
    min_relevance: float = Field(0.3, description="Minimum relevance score", ge=0, le=1)

    class Config:
        json_schema_extra = {
            "example": {
                "question": "vergi levhası bulundurmak zorunlu mu?",
                "chunks": [
                    {
                        "id": "1",
                        "text": "Vergi levhası asmak zorunlu değildir...",
                        "source": "ozelge_123"
                    },
                    {
                        "id": "2",
                        "text": "Vergi levhası bulundurmak gerekmektedir...",
                        "source": "ozelge_456"
                    }
                ],
                "min_relevance": 0.3
            }
        }


class ChunkAnalysisResponse(BaseModel):
    """Response model for a single chunk analysis"""
    chunk_id: str
    relevance_score: float
    action_match: bool
    action_details: Optional[str]
    modality_match: bool
    modality_details: Optional[str]
    has_drift: bool
    drift_reason: Optional[str]
    has_forbidden_pattern: bool
    forbidden_pattern: Optional[str]
    has_verdict_sentence: bool
    verdict_sentence: Optional[str]
    issues: List[str]
    recommended: bool
    confidence: float


class AnalyzeChunksResponse(BaseModel):
    """Response model for chunk analysis"""
    analyses: List[ChunkAnalysisResponse]
    summary: Dict[str, Any]


class ValidateQuoteRequest(BaseModel):
    """Request model for quote validation"""
    question: str = Field(..., description="The user's question", min_length=3)
    quote: str = Field(..., description="The quoted text from source", min_length=5)
    answer: str = Field(..., description="The generated answer", min_length=3)

    class Config:
        json_schema_extra = {
            "example": {
                "question": "vergi levhası bulundurmak zorunlu mu?",
                "quote": "...mümkün olup olmadığı hk.",
                "answer": "zorunlu değildir"
            }
        }


class ValidateQuoteResponse(BaseModel):
    """Response model for quote validation"""
    valid: bool
    issues: List[Dict[str, str]]
    suggested_answer: Optional[str]
    confidence: float


class FilterChunksRequest(BaseModel):
    """Request model for filtering chunks"""
    question: str = Field(..., description="The user's question", min_length=3)
    chunks: List[ChunkInput] = Field(..., description="Chunks to filter", min_items=1)
    max_chunks: int = Field(5, description="Maximum chunks to return", ge=1, le=20)
    min_relevance: float = Field(0.3, description="Minimum relevance score", ge=0, le=1)


class FilterChunksResponse(BaseModel):
    """Response model for filtered chunks"""
    chunks: List[ChunkInput]
    analysis: Dict[str, Any]
    action: str = Field(..., description="Recommended action: 'proceed' or 'use_with_caution'")


# === Endpoints ===

@router.post(
    "/analyze/chunks",
    response_model=AnalyzeChunksResponse,
    summary="Analyze chunks for relevance and quality",
    description="""
    Analyzes multiple chunks against a question for:
    - Semantic relevance score
    - Forbidden patterns (KONU, İLGİ, sorulmaktadır, etc.)
    - Verdict sentence presence
    - Semantic drift detection

    Returns ranked chunks with quality indicators.
    """
)
async def analyze_chunks(request: AnalyzeChunksRequest) -> AnalyzeChunksResponse:
    """Analyze chunks for relevance and quality"""
    try:
        logger.info(f"Analyzing {len(request.chunks)} chunks for question: {request.question[:50]}...")

        chunks_data = [
            {"id": c.id, "text": c.text, "source": c.source}
            for c in request.chunks
        ]

        analyses = await semantic_analyzer.analyze_chunks(
            question=request.question,
            chunks=chunks_data,
            min_relevance=request.min_relevance
        )

        # Convert to response format
        analysis_responses = [
            ChunkAnalysisResponse(
                chunk_id=a.chunk_id,
                relevance_score=a.relevance_score,
                action_match=a.action_match,
                action_details=a.action_details,
                modality_match=a.modality_match,
                modality_details=a.modality_details,
                has_drift=a.has_drift,
                drift_reason=a.drift_reason,
                has_forbidden_pattern=a.has_forbidden_pattern,
                forbidden_pattern=a.forbidden_pattern,
                has_verdict_sentence=a.has_verdict_sentence,
                verdict_sentence=a.verdict_sentence,
                issues=a.issues,
                recommended=a.recommended,
                confidence=a.confidence
            )
            for a in analyses
        ]

        recommended_count = sum(1 for a in analyses if a.recommended)

        summary = {
            "total_chunks": len(analyses),
            "recommended_count": recommended_count,
            "avg_relevance": sum(a.relevance_score for a in analyses) / len(analyses) if analyses else 0,
            "issues_found": sum(len(a.issues) for a in analyses),
            "has_quality_source": recommended_count > 0
        }

        logger.info(f"Analysis complete: {recommended_count}/{len(analyses)} recommended")

        return AnalyzeChunksResponse(
            analyses=analysis_responses,
            summary=summary
        )

    except Exception as e:
        logger.error(f"Chunk analysis failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post(
    "/validate/quote",
    response_model=ValidateQuoteResponse,
    summary="Validate quote and answer combination",
    description="""
    Validates a quote and answer for quality issues:
    - Forbidden patterns in quote
    - Missing verdict sentence
    - Semantic drift between question and quote
    - Semantic mismatch between question type and answer

    Returns validation result with suggested corrections.
    """
)
async def validate_quote(request: ValidateQuoteRequest) -> ValidateQuoteResponse:
    """Validate a quote and answer combination"""
    try:
        logger.info(f"Validating quote for question: {request.question[:50]}...")

        validation = await semantic_analyzer.validate_quote(
            question=request.question,
            quote=request.quote,
            answer=request.answer
        )

        logger.info(f"Validation result: valid={validation.valid}, issues={len(validation.issues)}")

        return ValidateQuoteResponse(
            valid=validation.valid,
            issues=validation.issues,
            suggested_answer=validation.suggested_answer,
            confidence=validation.confidence
        )

    except Exception as e:
        logger.error(f"Quote validation failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post(
    "/filter",
    response_model=FilterChunksResponse,
    summary="Filter chunks before sending to LLM",
    description="""
    Main entry point for RAG integration.
    Filters and ranks chunks, returning only those that pass quality checks.

    Use this endpoint to pre-filter semantic search results before LLM processing.
    """
)
async def filter_chunks(request: FilterChunksRequest) -> FilterChunksResponse:
    """Filter chunks before sending to LLM"""
    try:
        logger.info(f"Filtering {len(request.chunks)} chunks for question: {request.question[:50]}...")

        chunks_data = [
            {"id": c.id, "text": c.text, "source": c.source, "metadata": c.metadata}
            for c in request.chunks
        ]

        result = await semantic_analyzer.filter_chunks_for_llm(
            question=request.question,
            chunks=chunks_data,
            max_chunks=request.max_chunks,
            min_relevance=request.min_relevance
        )

        # Convert back to ChunkInput format
        filtered_chunks = [
            ChunkInput(
                id=c.get("id", str(i)),
                text=c.get("text", ""),
                source=c.get("source"),
                metadata=c.get("metadata")
            )
            for i, c in enumerate(result["chunks"])
        ]

        logger.info(f"Filtered to {len(filtered_chunks)} chunks, action: {result['action']}")

        return FilterChunksResponse(
            chunks=filtered_chunks,
            analysis=result["analysis"],
            action=result["action"]
        )

    except Exception as e:
        logger.error(f"Chunk filtering failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get(
    "/health",
    summary="Check semantic analyzer health",
    description="Returns the initialization status of the semantic analyzer"
)
async def health_check():
    """Check semantic analyzer health"""
    status = semantic_analyzer.get_status()
    return {
        "status": "healthy" if status["initialized"] else "initializing",
        **status
    }
