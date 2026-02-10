"""
Jina Reranker Service
Cross-encoder based reranking for improved RAG quality

Uses Jina AI Reranker v2 API for multilingual reranking.
Supports Turkish legal/tax documents with high accuracy.

Features:
- Async HTTP calls with httpx
- Redis caching for repeated queries
- Graceful fallback on API errors
- Configurable top_n and model selection
"""

import os
import json
import hashlib
import asyncio
from typing import List, Dict, Any, Optional
from datetime import datetime
from dataclasses import dataclass
from loguru import logger
import httpx

from services.redis_client import cache_get, cache_set


# Configuration
JINA_API_URL = "https://api.jina.ai/v1/rerank"
JINA_DEFAULT_MODEL = "jina-reranker-v2-base-multilingual"
RERANK_CACHE_TTL = 3600  # 1 hour cache for rerank results
RERANK_TIMEOUT = 10.0  # 10 second timeout for API calls


@dataclass
class RerankConfig:
    """Reranker configuration"""
    enabled: bool = False
    provider: str = "jina"  # jina, cohere, voyage
    model: str = JINA_DEFAULT_MODEL
    api_key: Optional[str] = None
    top_n: int = 10  # Number of results to return after reranking
    min_score: float = 0.0  # Minimum rerank score threshold
    use_cache: bool = True


@dataclass
class RerankResult:
    """Single reranked document"""
    index: int  # Original index in input list
    score: float  # Rerank relevance score (0-1)
    document: Dict[str, Any]  # Original document data


class RerankService:
    """
    Jina Reranker Service for semantic result reranking

    Usage:
        service = RerankService()
        config = await service.get_config()
        if config.enabled:
            reranked = await service.rerank(query, documents, config)
    """

    def __init__(self):
        self._config_cache: Optional[RerankConfig] = None
        self._config_cache_time: Optional[float] = None
        self._config_cache_ttl = 60  # 60 seconds
        self._http_client: Optional[httpx.AsyncClient] = None

    async def _get_http_client(self) -> httpx.AsyncClient:
        """Get or create async HTTP client"""
        if self._http_client is None or self._http_client.is_closed:
            self._http_client = httpx.AsyncClient(timeout=RERANK_TIMEOUT)
        return self._http_client

    async def close(self):
        """Close HTTP client"""
        if self._http_client and not self._http_client.is_closed:
            await self._http_client.aclose()

    async def get_config(self) -> RerankConfig:
        """
        Load rerank configuration from database settings.
        Falls back to environment variables if not in DB.
        Cached for 60 seconds.
        """
        import time
        from services.database import get_db

        current_time = time.time()

        # Check cache
        if (self._config_cache is not None and
            self._config_cache_time is not None and
            current_time - self._config_cache_time < self._config_cache_ttl):
            return self._config_cache

        config = RerankConfig()

        try:
            pool = await get_db()

            # Fetch rerank settings from database
            rows = await pool.fetch("""
                SELECT key, value FROM settings
                WHERE key LIKE 'ragSettings.rerank%'
                   OR key = 'jina.apiKey'
            """)

            settings_dict = {row['key']: row['value'] for row in rows}

            # Parse settings
            config.enabled = settings_dict.get('ragSettings.rerankEnabled', 'false').lower() == 'true'
            config.provider = settings_dict.get('ragSettings.rerankProvider', 'jina')
            config.model = settings_dict.get('ragSettings.rerankModel', JINA_DEFAULT_MODEL)
            config.top_n = int(settings_dict.get('ragSettings.rerankTopN', '10'))
            config.min_score = float(settings_dict.get('ragSettings.rerankMinScore', '0.0'))
            config.use_cache = settings_dict.get('ragSettings.rerankUseCache', 'true').lower() == 'true'

            # Get API key - try DB first, then env
            api_key = settings_dict.get('jina.apiKey')
            if not api_key:
                api_key = os.getenv('JINA_API_KEY')
            config.api_key = api_key

            # Validate configuration
            if config.enabled and not config.api_key:
                logger.warning("Rerank enabled but no Jina API key found. Disabling rerank.")
                config.enabled = False

            logger.info(f"Rerank config loaded: enabled={config.enabled}, provider={config.provider}, top_n={config.top_n}")

        except Exception as e:
            logger.error(f"Error loading rerank config: {e}")
            # Fallback to env-based config
            config.api_key = os.getenv('JINA_API_KEY')
            if config.api_key:
                config.enabled = os.getenv('RERANK_ENABLED', 'false').lower() == 'true'

        # Update cache
        self._config_cache = config
        self._config_cache_time = current_time

        return config

    def _get_cache_key(self, query: str, doc_ids: List[str]) -> str:
        """Generate cache key for rerank results"""
        content = f"{query}:{','.join(sorted(doc_ids))}"
        content_hash = hashlib.md5(content.encode()).hexdigest()
        return f"rerank:jina:{content_hash}"

    async def rerank(
        self,
        query: str,
        documents: List[Dict[str, Any]],
        config: Optional[RerankConfig] = None,
        content_field: str = "content"
    ) -> List[Dict[str, Any]]:
        """
        Rerank documents using Jina Reranker API.

        Args:
            query: Search query
            documents: List of documents with 'content' field
            config: Rerank configuration (loads from DB if not provided)
            content_field: Field name containing document text

        Returns:
            Reranked documents with added 'rerank_score' field
        """
        start_time = datetime.now()

        # Load config if not provided
        if config is None:
            config = await self.get_config()

        # Check if reranking is enabled
        if not config.enabled:
            logger.debug("Reranking disabled, returning original order")
            return documents

        # Validate inputs
        if not documents:
            return []

        if not query or not query.strip():
            logger.warning("Empty query provided for reranking")
            return documents

        # Check cache
        if config.use_cache:
            doc_ids = [str(d.get('id', i)) for i, d in enumerate(documents)]
            cache_key = self._get_cache_key(query, doc_ids)
            cached = await cache_get(cache_key)
            if cached:
                logger.info(f"Rerank cache HIT: {len(cached)} results")
                # Merge cached scores back to documents
                return self._merge_cached_results(documents, cached)

        # Extract document texts for reranking, filtering empty content
        doc_texts = []
        valid_indices = []  # Maps doc_texts index -> original documents index
        empty_count = 0
        for i, doc in enumerate(documents):
            text = doc.get(content_field, "") or ""
            # Also try full_content and excerpt as fallbacks
            if not text.strip():
                text = doc.get("full_content", "") or ""
            if not text.strip():
                text = doc.get("excerpt", "") or ""
            if not text.strip():
                text = doc.get("title", "") or ""
            # Skip documents with no meaningful content (Jina returns 0.0 for empty)
            if not text.strip() or len(text.strip()) < 10:
                empty_count += 1
                continue
            # Truncate long documents (Jina has 1024 token limit per doc)
            if len(text) > 4000:
                text = text[:4000]
            doc_texts.append(text)
            valid_indices.append(i)

        if empty_count > 0:
            logger.warning(f"Rerank: skipped {empty_count}/{len(documents)} documents with empty/short content")

        # If all documents were filtered out, return originals
        if not doc_texts:
            logger.warning("Rerank: all documents had empty content, returning original order")
            return documents

        # Call Jina API - send ALL documents to get scores for everything
        try:
            reranked = await self._call_jina_api(
                query=query,
                documents=doc_texts,
                model=config.model,
                api_key=config.api_key,
                top_n=len(doc_texts)  # Get scores for ALL docs, not just top_n
            )

            elapsed = (datetime.now() - start_time).total_seconds() * 1000
            logger.info(f"Jina rerank completed: {len(reranked)} results in {elapsed:.1f}ms (sent {len(doc_texts)}/{len(documents)} docs)")

            # Build result list with rerank scores
            # Map Jina indices back to original document indices via valid_indices
            result_docs = []
            for item in reranked:
                jina_idx = item['index']
                score = item['relevance_score']

                # Skip if below minimum score
                if score < config.min_score:
                    continue

                # Map back to original document index
                original_idx = valid_indices[jina_idx]
                doc = documents[original_idx].copy()
                doc['rerank_score'] = score
                doc['_original_index'] = original_idx
                result_docs.append(doc)

            # Add skipped (empty content) documents with fallback score
            # Instead of 0.0, use their pre-rerank similarity score normalized to 0-1 range
            reranked_original_indices = set()
            for item in reranked:
                if item['index'] < len(valid_indices):
                    reranked_original_indices.add(valid_indices[item['index']])

            for i, doc in enumerate(documents):
                if i not in reranked_original_indices:
                    doc_copy = doc.copy()
                    # Use pre-rerank similarity as fallback (already in 0-100 range, normalize to 0-1)
                    pre_score = doc.get('final_score', 0) or doc.get('similarity_score', 0) or 0
                    if pre_score > 1:
                        pre_score = pre_score / 100.0  # Convert percentage to 0-1
                    # Apply a penalty so reranked docs are preferred over fallback
                    doc_copy['rerank_score'] = max(0, pre_score * 0.5)  # 50% of original as fallback
                    doc_copy['_original_index'] = i
                    doc_copy['_rerank_skipped'] = True
                    result_docs.append(doc_copy)

            # Cache results
            if config.use_cache and result_docs:
                cache_data = [{'id': d.get('id'), 'rerank_score': d['rerank_score'], '_original_index': d['_original_index']}
                              for d in result_docs]
                await cache_set(cache_key, cache_data, RERANK_CACHE_TTL)

            return result_docs

        except Exception as e:
            logger.error(f"Jina rerank failed: {e}. Falling back to original order.")
            # Return empty list to signal failure - caller keeps original scored_results
            return []

    async def _call_jina_api(
        self,
        query: str,
        documents: List[str],
        model: str,
        api_key: str,
        top_n: int
    ) -> List[Dict[str, Any]]:
        """
        Call Jina Reranker API.

        Returns:
            List of {index, relevance_score, document} dicts
        """
        client = await self._get_http_client()

        payload = {
            "model": model,
            "query": query,
            "documents": documents,
            "top_n": top_n
        }

        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json"
        }

        response = await client.post(
            JINA_API_URL,
            json=payload,
            headers=headers
        )

        if response.status_code != 200:
            error_text = response.text
            logger.error(f"Jina API error {response.status_code}: {error_text[:500]}")
            raise Exception(f"Jina API error {response.status_code}: {error_text}")

        data = response.json()

        # Parse response
        results = data.get('results', [])

        # Log score distribution for debugging
        if results:
            scores = [r.get('relevance_score', 0) for r in results]
            zero_count = sum(1 for s in scores if s == 0.0)
            if zero_count > 0:
                logger.warning(f"Jina rerank: {zero_count}/{len(scores)} results have score=0.0")
            logger.debug(f"Jina score distribution: min={min(scores):.4f}, max={max(scores):.4f}, avg={sum(scores)/len(scores):.4f}")

        return results

    def _merge_cached_results(
        self,
        documents: List[Dict[str, Any]],
        cached: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        """Merge cached rerank scores back into documents"""
        # Build lookup by id
        id_to_cache = {str(c['id']): c for c in cached if 'id' in c}

        result_docs = []
        for i, doc in enumerate(documents):
            doc_id = str(doc.get('id', i))
            if doc_id in id_to_cache:
                doc_copy = doc.copy()
                doc_copy['rerank_score'] = id_to_cache[doc_id]['rerank_score']
                doc_copy['_original_index'] = id_to_cache[doc_id].get('_original_index', i)
                result_docs.append(doc_copy)

        # Sort by rerank score
        result_docs.sort(key=lambda x: x.get('rerank_score', 0), reverse=True)
        return result_docs


# Singleton instance
_rerank_service: Optional[RerankService] = None


def get_rerank_service() -> RerankService:
    """Get singleton rerank service instance"""
    global _rerank_service
    if _rerank_service is None:
        _rerank_service = RerankService()
    return _rerank_service


async def rerank_results(
    query: str,
    documents: List[Dict[str, Any]],
    content_field: str = "content"
) -> List[Dict[str, Any]]:
    """
    Convenience function for reranking search results.

    Usage:
        results = await rerank_results(query, search_results)
    """
    service = get_rerank_service()
    return await service.rerank(query, documents, content_field=content_field)
