"""
Semantic Search Router
High-performance semantic search API endpoints
"""

from typing import Optional, List
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field
from loguru import logger

from services.semantic_search_service import semantic_search_service


router = APIRouter()


class SearchRequest(BaseModel):
    """Semantic search request"""
    query: str = Field(..., min_length=1, max_length=8000, description="Search query text")
    limit: Optional[int] = Field(25, ge=1, le=100, description="Maximum results to return")
    use_cache: Optional[bool] = Field(True, description="Use Redis cache for results")


class EmbeddingRequest(BaseModel):
    """Embedding generation request"""
    text: str = Field(..., min_length=1, max_length=8000, description="Text to embed")
    use_cache: Optional[bool] = Field(True, description="Use Redis cache")


class BatchEmbeddingRequest(BaseModel):
    """Batch embedding request"""
    texts: List[str] = Field(..., min_items=1, max_items=100, description="Texts to embed")


class SearchResponse(BaseModel):
    """Semantic search response"""
    success: bool
    cached: Optional[bool] = False
    query: str
    results: List[dict]
    total: int
    timings: Optional[dict] = None
    settings: Optional[dict] = None
    error: Optional[str] = None


@router.post("/search", response_model=SearchResponse)
async def semantic_search(request: SearchRequest):
    """
    Perform semantic search

    High-performance semantic search using:
    - Redis L2 embedding cache (24h TTL)
    - Direct pgvector similarity search
    - Hybrid scoring with keyword boost

    Performance:
    - Cached queries: <50ms
    - New queries: 200-400ms
    """
    try:
        result = await semantic_search_service.semantic_search(
            query=request.query,
            limit=request.limit,
            use_cache=request.use_cache
        )
        return SearchResponse(**result)

    except Exception as e:
        logger.error(f"Semantic search error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/search")
async def semantic_search_get(
    query: str = Query(..., min_length=1, max_length=8000),
    limit: int = Query(25, ge=1, le=100),
    use_cache: bool = Query(True)
):
    """
    Semantic search via GET (for easy testing)
    """
    try:
        result = await semantic_search_service.semantic_search(
            query=query,
            limit=limit,
            use_cache=use_cache
        )
        return result

    except Exception as e:
        logger.error(f"Semantic search error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/embedding")
async def generate_embedding(request: EmbeddingRequest):
    """
    Generate embedding for a single text

    Uses Redis L2 cache (24h TTL) for fast repeated queries
    """
    try:
        embedding = await semantic_search_service.generate_embedding(
            text=request.text,
            use_cache=request.use_cache
        )
        return {
            "success": True,
            "text_length": len(request.text),
            "embedding_dimensions": len(embedding),
            "embedding": embedding
        }

    except Exception as e:
        logger.error(f"Embedding generation error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/embedding/batch")
async def generate_embeddings_batch(request: BatchEmbeddingRequest):
    """
    Generate embeddings for multiple texts in a single API call

    More efficient than sequential calls for multiple texts
    """
    try:
        embeddings = await semantic_search_service.generate_embeddings_batch(request.texts)
        return {
            "success": True,
            "count": len(embeddings),
            "embeddings": embeddings
        }

    except Exception as e:
        logger.error(f"Batch embedding error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/stats")
async def get_stats():
    """
    Get semantic search statistics

    Returns:
    - Total embeddings count
    - Embeddings by source table
    - Vector index status
    - Cache TTL settings
    """
    try:
        stats = await semantic_search_service.get_stats()
        return stats

    except Exception as e:
        logger.error(f"Stats error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/index-status")
async def check_index_status():
    """
    Check vector index status

    Returns warning if HNSW index is missing (10-100x slower without it)
    """
    try:
        status = await semantic_search_service.check_vector_index()
        return status

    except Exception as e:
        logger.error(f"Index check error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/settings")
async def get_rag_settings():
    """
    Get current RAG settings from database
    """
    try:
        settings = await semantic_search_service.get_rag_settings()
        return {
            "success": True,
            "settings": {
                "similarity_threshold": settings.similarity_threshold,
                "max_results": settings.max_results,
                "min_results": settings.min_results,
                "enable_hybrid_search": settings.enable_hybrid_search,
                "enable_keyword_boost": settings.enable_keyword_boost,
                "enable_unified_embeddings": settings.enable_unified_embeddings,
                "enable_document_embeddings": settings.enable_document_embeddings,
                "enable_scrape_embeddings": settings.enable_scrape_embeddings,
                "database_priority": settings.database_priority,
                "documents_priority": settings.documents_priority,
                "chat_priority": settings.chat_priority,
                "web_priority": settings.web_priority
            }
        }

    except Exception as e:
        logger.error(f"Settings error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/prompt-settings")
async def get_prompt_settings():
    """
    Get current prompt settings (system prompt, LLM guide, conversation tone)
    """
    try:
        settings = await semantic_search_service.get_prompt_settings()
        full_prompt = semantic_search_service.build_full_system_prompt(settings)

        return {
            "success": True,
            "prompt_settings": {
                "conversation_tone": settings.conversation_tone,
                "schema_name": settings.schema_name,
                "active_prompt_id": settings.active_prompt_id,
                "system_prompt_length": len(settings.system_prompt),
                "llm_guide_length": len(settings.llm_guide),
                "full_prompt_length": len(full_prompt),
                "system_prompt_preview": settings.system_prompt[:300] if settings.system_prompt else None,
                "llm_guide_preview": settings.llm_guide[:300] if settings.llm_guide else None
            }
        }

    except Exception as e:
        logger.error(f"Prompt settings error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/full-prompt")
async def get_full_system_prompt():
    """
    Get the complete built system prompt (for debugging/preview)
    """
    try:
        settings = await semantic_search_service.get_prompt_settings()
        full_prompt = semantic_search_service.build_full_system_prompt(settings)

        return {
            "success": True,
            "conversation_tone": settings.conversation_tone,
            "schema_name": settings.schema_name,
            "full_prompt": full_prompt,
            "total_length": len(full_prompt)
        }

    except Exception as e:
        logger.error(f"Full prompt error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/cache")
async def clear_cache(
    type: str = Query("all", description="Cache type: 'embedding', 'search', or 'all'")
):
    """
    Clear semantic search caches

    Types:
    - embedding: Clear embedding cache
    - search: Clear search result cache
    - all: Clear both caches
    """
    from services.redis_client import get_redis

    try:
        redis = await get_redis()
        if not redis:
            return {"success": False, "error": "Redis not available"}

        deleted = 0

        if type in ["embedding", "all"]:
            keys = []
            async for key in redis.scan_iter("embedding:v2:*"):
                keys.append(key)
            if keys:
                deleted += await redis.delete(*keys)

        if type in ["search", "all"]:
            keys = []
            async for key in redis.scan_iter("search:v2:*"):
                keys.append(key)
            if keys:
                deleted += await redis.delete(*keys)

        return {
            "success": True,
            "deleted_keys": deleted,
            "type": type
        }

    except Exception as e:
        logger.error(f"Cache clear error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
