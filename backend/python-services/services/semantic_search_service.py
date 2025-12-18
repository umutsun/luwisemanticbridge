"""
Semantic Search Service
High-performance semantic search using Python + asyncpg + pgvector
Replaces Node.js semantic search with faster Python implementation

Features:
- Redis L2 embedding cache (24h TTL)
- Direct asyncpg vector search (no ORM overhead)
- Hybrid search with keyword boost
- RAG settings integration
- Batch embedding support
"""

import os
import json
import hashlib
import asyncio
from typing import Optional, Dict, Any, List, Tuple
from datetime import datetime
from dataclasses import dataclass, asdict
from loguru import logger
import openai

from services.database import get_db
from services.redis_client import get_redis, cache_get, cache_set

# Configuration
EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "text-embedding-3-small")
EMBEDDING_DIMENSIONS = 1536
EMBEDDING_CACHE_TTL = 86400  # 24 hours
SEARCH_RESULT_CACHE_TTL = 600  # 10 minutes
MAX_QUERY_LENGTH = 8000


@dataclass
class SearchResult:
    """Search result data class"""
    id: str
    content: str
    title: Optional[str]
    source_table: str
    source_type: str
    similarity_score: float
    final_score: float
    keyword_boost: float
    metadata: Optional[Dict[str, Any]]


@dataclass
class RAGSettings:
    """RAG configuration settings"""
    similarity_threshold: float = 0.001
    max_results: int = 25
    min_results: int = 1
    enable_hybrid_search: bool = True
    enable_keyword_boost: bool = True
    enable_unified_embeddings: bool = True
    enable_document_embeddings: bool = True
    enable_scrape_embeddings: bool = True
    database_priority: float = 0.8
    documents_priority: float = 0.5
    chat_priority: float = 0.3
    web_priority: float = 0.4


class SemanticSearchService:
    """High-performance semantic search service"""

    def __init__(self):
        self.openai_client = None
        self._settings_cache: Optional[RAGSettings] = None
        self._settings_cache_time: Optional[float] = None
        self._settings_cache_ttl = 5  # 5 seconds

    async def _get_openai_client(self):
        """Get or create OpenAI client"""
        if self.openai_client is None:
            api_key = os.getenv("OPENAI_API_KEY")
            if not api_key:
                raise ValueError("OPENAI_API_KEY not configured")
            self.openai_client = openai.AsyncOpenAI(api_key=api_key)
        return self.openai_client

    async def get_rag_settings(self) -> RAGSettings:
        """Load RAG settings from database with caching"""
        import time
        current_time = time.time()

        # Check cache
        if (self._settings_cache is not None and
            self._settings_cache_time is not None and
            current_time - self._settings_cache_time < self._settings_cache_ttl):
            return self._settings_cache

        try:
            pool = await get_db()

            # Batch query for all RAG settings
            rows = await pool.fetch("""
                SELECT key, value FROM settings
                WHERE key LIKE 'ragSettings.%'
                   OR key LIKE 'search.%'
            """)

            settings_dict = {row['key']: row['value'] for row in rows}

            # Parse settings
            settings = RAGSettings(
                similarity_threshold=float(settings_dict.get('ragSettings.similarityThreshold', 0.001)),
                max_results=int(settings_dict.get('ragSettings.maxResults', 25)),
                min_results=int(settings_dict.get('ragSettings.minResults', 1)),
                enable_hybrid_search=settings_dict.get('ragSettings.enableHybridSearch', 'true').lower() == 'true',
                enable_keyword_boost=settings_dict.get('ragSettings.enableKeywordBoost', 'true').lower() == 'true',
                enable_unified_embeddings=settings_dict.get('ragSettings.enableUnifiedEmbeddings', 'true').lower() == 'true',
                enable_document_embeddings=settings_dict.get('ragSettings.enableDocumentEmbeddings', 'true').lower() == 'true',
                enable_scrape_embeddings=settings_dict.get('ragSettings.enableScrapeEmbeddings', 'true').lower() == 'true',
                database_priority=float(settings_dict.get('ragSettings.databasePriority', 8)) / 10,
                documents_priority=float(settings_dict.get('ragSettings.documentsPriority', 5)) / 10,
                chat_priority=float(settings_dict.get('ragSettings.chatPriority', 3)) / 10,
                web_priority=float(settings_dict.get('ragSettings.webPriority', 4)) / 10,
            )

            # Update cache
            self._settings_cache = settings
            self._settings_cache_time = current_time

            return settings

        except Exception as e:
            logger.error(f"Error loading RAG settings: {e}")
            return RAGSettings()  # Return defaults

    def _get_embedding_cache_key(self, text: str) -> str:
        """Generate cache key for embedding"""
        text_hash = hashlib.md5(text.encode()).hexdigest()
        return f"embedding:v2:{EMBEDDING_MODEL}:{text_hash}"

    def _get_search_cache_key(self, query: str, limit: int) -> str:
        """Generate cache key for search results"""
        query_hash = hashlib.md5(query.lower().strip().encode()).hexdigest()
        return f"search:v2:{query_hash}:{limit}"

    async def generate_embedding(self, text: str, use_cache: bool = True) -> List[float]:
        """
        Generate embedding for text with Redis L2 caching

        Performance:
        - Cached: ~1ms
        - API call: 50-200ms
        """
        if not text or not text.strip():
            raise ValueError("Empty text provided for embedding")

        # Truncate long texts
        text = text[:MAX_QUERY_LENGTH].strip()

        # Check Redis cache first
        if use_cache:
            cache_key = self._get_embedding_cache_key(text)
            cached = await cache_get(cache_key)
            if cached:
                logger.debug(f"Embedding cache HIT: {cache_key[:50]}...")
                return cached if isinstance(cached, list) else json.loads(cached)

        # Generate embedding via OpenAI API
        start_time = datetime.now()
        try:
            client = await self._get_openai_client()
            response = await client.embeddings.create(
                input=text,
                model=EMBEDDING_MODEL
            )
            embedding = response.data[0].embedding

            elapsed = (datetime.now() - start_time).total_seconds() * 1000
            logger.info(f"Embedding generated in {elapsed:.1f}ms ({len(text)} chars)")

            # Cache the embedding
            if use_cache:
                await cache_set(cache_key, embedding, EMBEDDING_CACHE_TTL)
                logger.debug(f"Embedding cached: {cache_key[:50]}...")

            return embedding

        except openai.RateLimitError:
            logger.warning("OpenAI rate limited, waiting 5 seconds...")
            await asyncio.sleep(5)
            return await self.generate_embedding(text, use_cache=False)

        except Exception as e:
            logger.error(f"Embedding generation error: {e}")
            raise

    async def generate_embeddings_batch(self, texts: List[str]) -> List[List[float]]:
        """
        Generate embeddings for multiple texts in a single API call

        Performance:
        - Single API call for up to 2048 texts
        - Much faster than sequential calls
        """
        if not texts:
            return []

        # Truncate and filter
        processed_texts = [t[:MAX_QUERY_LENGTH].strip() for t in texts if t and t.strip()]
        if not processed_texts:
            return []

        start_time = datetime.now()
        try:
            client = await self._get_openai_client()
            response = await client.embeddings.create(
                input=processed_texts,
                model=EMBEDDING_MODEL
            )

            embeddings = [item.embedding for item in response.data]
            elapsed = (datetime.now() - start_time).total_seconds() * 1000
            logger.info(f"Batch embeddings generated: {len(embeddings)} in {elapsed:.1f}ms")

            return embeddings

        except Exception as e:
            logger.error(f"Batch embedding error: {e}")
            raise

    async def vector_search(
        self,
        query_embedding: List[float],
        limit: int = 25,
        similarity_threshold: float = 0.001,
        source_tables: Optional[List[str]] = None
    ) -> List[Dict[str, Any]]:
        """
        Direct pgvector similarity search

        Performance:
        - With HNSW index: 10-50ms
        - Without index: 100-500ms (depends on table size)
        """
        start_time = datetime.now()

        try:
            pool = await get_db()

            # Build source table filter
            source_filter = ""
            if source_tables:
                tables_str = ", ".join([f"'{t}'" for t in source_tables])
                source_filter = f"AND source_table IN ({tables_str})"

            # Main vector search query using pgvector
            # Uses cosine distance operator <=>
            query = f"""
                WITH vector_results AS (
                    SELECT
                        id,
                        content,
                        source_table,
                        source_type,
                        source_id,
                        metadata,
                        1 - (embedding <=> $1::vector) as similarity_score
                    FROM unified_embeddings
                    WHERE embedding IS NOT NULL
                    {source_filter}
                    ORDER BY embedding <=> $1::vector
                    LIMIT $2 * 2
                )
                SELECT *
                FROM vector_results
                WHERE similarity_score >= $3
                ORDER BY similarity_score DESC
                LIMIT $2
            """

            # Convert embedding to pgvector format
            embedding_str = f"[{','.join(map(str, query_embedding))}]"

            rows = await pool.fetch(query, embedding_str, limit, similarity_threshold)

            results = []
            for row in rows:
                result = {
                    "id": str(row['id']),
                    "content": row['content'],
                    "source_table": row['source_table'],
                    "source_type": row['source_type'],
                    "source_id": str(row['source_id']) if row['source_id'] else None,
                    "similarity_score": float(row['similarity_score']),
                    "metadata": json.loads(row['metadata']) if row['metadata'] else {}
                }
                results.append(result)

            elapsed = (datetime.now() - start_time).total_seconds() * 1000
            logger.info(f"Vector search completed: {len(results)} results in {elapsed:.1f}ms")

            return results

        except Exception as e:
            logger.error(f"Vector search error: {e}")
            raise

    def _calculate_keyword_boost(
        self,
        query: str,
        content: str,
        title: Optional[str] = None
    ) -> float:
        """Calculate keyword boost for hybrid search"""
        boost = 0.0
        query_lower = query.lower()
        query_words = set(query_lower.split())

        # Content match
        if content:
            content_lower = content.lower()
            if query_lower in content_lower:
                boost += 0.15  # Exact phrase match
            else:
                # Word overlap
                content_words = set(content_lower.split())
                overlap = len(query_words & content_words) / len(query_words) if query_words else 0
                boost += overlap * 0.1

        # Title match (higher weight)
        if title:
            title_lower = title.lower()
            if query_lower in title_lower:
                boost += 0.1  # Exact phrase in title
            else:
                title_words = set(title_lower.split())
                overlap = len(query_words & title_words) / len(query_words) if query_words else 0
                boost += overlap * 0.05

        return min(boost, 0.25)  # Cap at 0.25

    def _get_source_priority(self, source_table: str, settings: RAGSettings) -> float:
        """Get priority multiplier for source table"""
        table_lower = source_table.lower()

        if 'document' in table_lower or 'pdf' in table_lower:
            return settings.documents_priority
        elif 'chat' in table_lower or 'message' in table_lower:
            return settings.chat_priority
        elif 'scrape' in table_lower or 'web' in table_lower or 'crawl' in table_lower:
            return settings.web_priority
        else:
            return settings.database_priority

    async def semantic_search(
        self,
        query: str,
        limit: Optional[int] = None,
        use_cache: bool = True
    ) -> Dict[str, Any]:
        """
        Full semantic search pipeline

        1. Check result cache
        2. Generate query embedding (with cache)
        3. Vector search
        4. Apply hybrid scoring
        5. Return ranked results

        Performance target: <300ms for cached queries, <500ms for new queries
        """
        start_time = datetime.now()
        timings = {}

        # Load settings
        settings = await self.get_rag_settings()
        limit = limit or settings.max_results

        # Check search result cache
        if use_cache:
            cache_key = self._get_search_cache_key(query, limit)
            cached_results = await cache_get(cache_key)
            if cached_results:
                logger.info(f"Search cache HIT for: {query[:50]}...")
                return {
                    "success": True,
                    "cached": True,
                    "query": query,
                    "results": cached_results.get("results", []),
                    "total": cached_results.get("total", 0),
                    "timings": {"total_ms": 1, "cache": "hit"}
                }

        try:
            # Generate query embedding
            embed_start = datetime.now()
            query_embedding = await self.generate_embedding(query)
            timings["embedding_ms"] = (datetime.now() - embed_start).total_seconds() * 1000

            # Vector search
            search_start = datetime.now()
            raw_results = await self.vector_search(
                query_embedding,
                limit=limit * 2,  # Get extra for filtering
                similarity_threshold=settings.similarity_threshold
            )
            timings["vector_search_ms"] = (datetime.now() - search_start).total_seconds() * 1000

            # Apply hybrid scoring
            score_start = datetime.now()
            scored_results = []

            for result in raw_results:
                # Get title from metadata
                title = result.get("metadata", {}).get("title") or result.get("metadata", {}).get("name")

                # Calculate keyword boost
                keyword_boost = 0.0
                if settings.enable_hybrid_search and settings.enable_keyword_boost:
                    keyword_boost = self._calculate_keyword_boost(
                        query,
                        result["content"],
                        title
                    )

                # Apply source priority
                source_priority = self._get_source_priority(result["source_table"], settings)

                # Calculate final score
                similarity = result["similarity_score"]
                final_score = (similarity * source_priority) + keyword_boost

                scored_results.append({
                    "id": result["id"],
                    "content": result["content"][:500] if result["content"] else "",
                    "full_content": result["content"],
                    "title": title,
                    "source_table": result["source_table"],
                    "source_type": result["source_type"],
                    "source_id": result["source_id"],
                    "similarity_score": round(similarity * 100, 2),
                    "keyword_boost": round(keyword_boost * 100, 2),
                    "source_priority": round(source_priority, 2),
                    "final_score": round(final_score * 100, 2),
                    "metadata": result["metadata"]
                })

            # Sort by final score and limit
            scored_results.sort(key=lambda x: x["final_score"], reverse=True)
            final_results = scored_results[:limit]

            timings["scoring_ms"] = (datetime.now() - score_start).total_seconds() * 1000
            timings["total_ms"] = (datetime.now() - start_time).total_seconds() * 1000

            # Cache results
            if use_cache and final_results:
                cache_data = {"results": final_results, "total": len(final_results)}
                await cache_set(
                    self._get_search_cache_key(query, limit),
                    cache_data,
                    SEARCH_RESULT_CACHE_TTL
                )

            logger.info(
                f"Semantic search completed: {len(final_results)} results in {timings['total_ms']:.1f}ms "
                f"(embed: {timings['embedding_ms']:.1f}ms, search: {timings['vector_search_ms']:.1f}ms)"
            )

            return {
                "success": True,
                "cached": False,
                "query": query,
                "results": final_results,
                "total": len(final_results),
                "timings": timings,
                "settings": {
                    "similarity_threshold": settings.similarity_threshold,
                    "hybrid_search": settings.enable_hybrid_search,
                    "keyword_boost": settings.enable_keyword_boost
                }
            }

        except Exception as e:
            logger.error(f"Semantic search error: {e}")
            return {
                "success": False,
                "error": str(e),
                "query": query,
                "results": [],
                "total": 0,
                "timings": {"total_ms": (datetime.now() - start_time).total_seconds() * 1000}
            }

    async def check_vector_index(self) -> Dict[str, Any]:
        """Check if vector index exists on unified_embeddings"""
        try:
            pool = await get_db()

            # Check for any vector index
            indices = await pool.fetch("""
                SELECT indexname, indexdef
                FROM pg_indexes
                WHERE tablename = 'unified_embeddings'
                AND indexdef LIKE '%vector%'
            """)

            has_hnsw = any('hnsw' in idx['indexdef'].lower() for idx in indices)
            has_ivfflat = any('ivfflat' in idx['indexdef'].lower() for idx in indices)

            # Get table size
            table_size = await pool.fetchval("""
                SELECT COUNT(*) FROM unified_embeddings WHERE embedding IS NOT NULL
            """)

            return {
                "has_vector_index": len(indices) > 0,
                "has_hnsw": has_hnsw,
                "has_ivfflat": has_ivfflat,
                "indices": [{"name": idx['indexname'], "definition": idx['indexdef'][:200]} for idx in indices],
                "table_size": table_size,
                "recommendation": (
                    "OK - Vector index exists" if has_hnsw else
                    "WARNING - No HNSW index. Run: CREATE INDEX ON unified_embeddings USING hnsw (embedding vector_cosine_ops)"
                )
            }

        except Exception as e:
            logger.error(f"Vector index check error: {e}")
            return {"error": str(e)}

    async def get_stats(self) -> Dict[str, Any]:
        """Get semantic search statistics"""
        try:
            pool = await get_db()

            # Total embeddings
            total = await pool.fetchval(
                "SELECT COUNT(*) FROM unified_embeddings WHERE embedding IS NOT NULL"
            )

            # By source
            by_source = await pool.fetch("""
                SELECT source_table, COUNT(*) as count
                FROM unified_embeddings
                WHERE embedding IS NOT NULL
                GROUP BY source_table
                ORDER BY count DESC
            """)

            # Index status
            index_info = await self.check_vector_index()

            return {
                "total_embeddings": total,
                "by_source": [{"table": row['source_table'], "count": row['count']} for row in by_source],
                "index_status": index_info,
                "cache_ttl": {
                    "embedding_cache_hours": EMBEDDING_CACHE_TTL / 3600,
                    "search_cache_minutes": SEARCH_RESULT_CACHE_TTL / 60
                }
            }

        except Exception as e:
            logger.error(f"Stats error: {e}")
            return {"error": str(e)}


# Global service instance
semantic_search_service = SemanticSearchService()
