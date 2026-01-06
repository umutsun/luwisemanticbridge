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
    """Response model for a single chunk analysis

    Score breakdown:
    - base_score: Core quality score (0-1) with penalties
    - bonus: Extra points (0-0.5) for modality match with anchor
    - confidence: final_score = base_score + bonus (may exceed 1.0)
    """
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
    object_anchor_match: bool = True  # New: object/keyword anchor match
    object_anchor_details: Optional[str] = None  # New: anchor match details
    partial_relevance: bool = False  # NEW: dual-action partial match
    partial_relevance_details: Optional[str] = None  # NEW: partial match explanation
    partial_relevance_reason_code: Optional[str] = None  # NEW: enum code for telemetry
    issues: List[str]
    recommended: bool
    base_score: float = 1.0  # Core quality (0-1)
    bonus: float = 0.0  # Extra bonus (0-0.5)
    confidence: float  # Legacy: final_score = base + bonus


class AnalyzeChunksResponse(BaseModel):
    """Response model for chunk analysis"""
    analyses: List[ChunkAnalysisResponse]
    summary: Dict[str, Any]


class ValidateQuoteRequest(BaseModel):
    """Request model for quote validation"""
    question: str = Field(..., description="The user's question", min_length=3)
    quote: str = Field(..., description="The quoted text from source", min_length=5)
    answer: str = Field(..., description="The generated answer", min_length=3)
    source_text: Optional[str] = Field(None, description="Original source chunk for verbatim verification")

    class Config:
        json_schema_extra = {
            "example": {
                "question": "vergi levhası bulundurmak zorunlu mu?",
                "quote": "Vergi levhası bulundurma zorunluluğu kaldırılmıştır.",
                "answer": "zorunlu değildir",
                "source_text": "Vergi levhası bulundurma zorunluluğu kaldırılmıştır. 2012 yılından itibaren işyerinde vergi levhası bulundurulması zorunlu değildir."
            }
        }


class ValidateQuoteResponse(BaseModel):
    """Response model for quote validation

    When quote_is_system_message is detected, suggested_quote provides
    a steril ALINTI replacement (e.g., "—" for "no quote available").
    """
    valid: bool
    issues: List[Dict[str, str]]
    suggested_answer: Optional[str]
    suggested_quote: Optional[str] = None  # NEW: steril ALINTI when system message detected
    confidence: float
    config_version: Optional[str] = None  # Track which config was used


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
                object_anchor_match=a.object_anchor_match,
                object_anchor_details=a.object_anchor_details,
                partial_relevance=a.partial_relevance,
                partial_relevance_details=a.partial_relevance_details,
                partial_relevance_reason_code=a.partial_relevance_reason_code,
                issues=a.issues,
                recommended=a.recommended,
                base_score=a.base_score,
                bonus=a.bonus,
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
    - **Verbatim verification**: Quote must exist in source (if provided)
    - **Modality inference**: Can't infer "zorunlu değildir" from "mümkündür"
    - **Forbidden patterns**: KONU, İLGİ, sorulmaktadır
    - **Action mismatch**: asmak ≠ bulundurmak
    - **Modality mismatch**: zorunlu mu? → mümkündür
    - **Missing verdict sentence**

    Returns validation result with suggested corrections.
    """
)
async def validate_quote(request: ValidateQuoteRequest) -> ValidateQuoteResponse:
    """Validate a quote and answer combination"""
    try:
        logger.info(f"Validating quote for question: {request.question[:50]}...")
        if request.source_text:
            logger.info(f"  Source text provided for verbatim verification")

        validation = await semantic_analyzer.validate_quote(
            question=request.question,
            quote=request.quote,
            answer=request.answer,
            source_text=request.source_text  # NEW: pass source for verbatim check
        )

        logger.info(f"Validation result: valid={validation.valid}, issues={len(validation.issues)}")

        return ValidateQuoteResponse(
            valid=validation.valid,
            issues=validation.issues,
            suggested_answer=validation.suggested_answer,
            suggested_quote=validation.suggested_quote,  # NEW: steril ALINTI replacement
            confidence=validation.confidence,
            config_version=validation.config_version
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


class ConfigUpdateRequest(BaseModel):
    """Request model for config update from schema"""
    action_groups: Optional[Dict[str, List[str]]] = Field(None, description="Action verb groups")
    object_anchors: Optional[Dict[str, List[str]]] = Field(None, description="Object keyword anchors")
    forbidden_patterns: Optional[List[Dict[str, str]]] = Field(None, description="Forbidden patterns [{'pattern': '...', 'description': '...'}]")
    verdict_patterns: Optional[List[str]] = Field(None, description="Verdict sentence patterns")
    fail_messages: Optional[Dict[str, str]] = Field(None, description="Fail-closed messages")
    verbatim_tolerance: Optional[float] = Field(None, description="Quote verbatim verification tolerance (0-1)", ge=0, le=1)

    class Config:
        json_schema_extra = {
            "example": {
                "action_groups": {
                    "keep": ["bulundur", "bulundurmak", "taşı"],
                    "hang": ["as", "asmak", "asma"]
                },
                "object_anchors": {
                    "vergi_levhası": ["vergi levhası", "levha"],
                    "fatura": ["fatura", "e-fatura"]
                },
                "verbatim_tolerance": 0.85
            }
        }


@router.post(
    "/config",
    summary="Update analyzer configuration from schema",
    description="""
    Updates the semantic analyzer configuration from database schema.
    All fields are optional - only provided fields will be updated.

    This allows dynamic configuration without restarting the service.
    Configuration is cached in Redis for persistence.
    """
)
async def update_config(request: ConfigUpdateRequest):
    """Update analyzer configuration from schema"""
    try:
        config = request.model_dump(exclude_none=True)
        if not config:
            return {"status": "no_changes", "message": "No configuration provided"}

        logger.info(f"Updating config from schema: {list(config.keys())}")

        await semantic_analyzer.load_config_from_schema(config)

        return {
            "status": "updated",
            "updated_fields": list(config.keys()),
            "config_version": semantic_analyzer._config_version,
            "config_timestamp": semantic_analyzer._config_timestamp,
            "message": "Configuration updated and cached in Redis"
        }

    except Exception as e:
        logger.error(f"Config update failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get(
    "/config",
    summary="Get current analyzer configuration",
    description="Returns the current configuration of action groups, object anchors, and patterns"
)
async def get_config():
    """Get current analyzer configuration"""
    return {
        "config_version": semantic_analyzer._config_version,
        "config_timestamp": semantic_analyzer._config_timestamp,
        "action_groups": semantic_analyzer.action_groups,
        "object_anchors": semantic_analyzer.object_anchors,
        "forbidden_patterns": [
            {"pattern": p, "description": d}
            for p, d in semantic_analyzer.forbidden_patterns
        ],
        "verdict_patterns": semantic_analyzer.verdict_patterns,
        "verbatim_tolerance": semantic_analyzer._verbatim_tolerance,
        "fail_messages": semantic_analyzer.fail_messages,
        "verdict_token_categories": {
            "strong": semantic_analyzer.STRONG_VERDICT_TOKENS,
            "weak": semantic_analyzer.WEAK_VERDICT_TOKENS
        }
    }


class ValidateSourceTextRequest(BaseModel):
    """Request model for source_text validation"""
    source_text: str = Field(..., description="The source_text to validate")
    chunk_sent_to_llm: str = Field(..., description="The actual chunk text sent to LLM")


@router.post(
    "/validate/source-text",
    summary="Validate source_text matches LLM chunk",
    description="""
    CRITICAL: Validates that source_text parameter matches the chunk sent to LLM.

    This ensures verbatim verification works correctly. Call this before validate_quote
    to catch integration errors where source_text might be different from what was sent to LLM.
    """
)
async def validate_source_text(request: ValidateSourceTextRequest):
    """Validate source_text matches the chunk sent to LLM"""
    is_valid, warning = semantic_analyzer.validate_source_text(
        source_text=request.source_text,
        chunk_sent_to_llm=request.chunk_sent_to_llm
    )
    return {
        "valid": is_valid,
        "warning": warning,
        "recommendation": "source_text MUST be the exact text sent to LLM for verbatim verification to work"
    }


class InspectTextRequest(BaseModel):
    """Request model for text inspection"""
    text: str = Field(..., description="Text to inspect for verdict tokens")


@router.post(
    "/inspect/verdict-tokens",
    summary="Inspect text for verdict tokens",
    description="Returns categorized verdict tokens (STRONG vs WEAK) found in the text"
)
async def inspect_verdict_tokens(request: InspectTextRequest):
    """Inspect text for verdict tokens"""
    strong, weak = semantic_analyzer.get_verdict_token_category(request.text)
    return {
        "strong_tokens": strong,
        "weak_tokens": weak,
        "has_strong": len(strong) > 0,
        "has_weak": len(weak) > 0,
        "can_answer_obligation": len(strong) > 0,  # Only STRONG tokens can answer "zorunlu mu?"
        "explanation": {
            "strong": "Kesin zorunluluk/yasak bildiren ifadeler (zorunludur, gerekmektedir, mecburidir)",
            "weak": "İmkan/uygunluk bildiren ifadeler (mümkündür, uygundur, yapılabilir)"
        }
    }
