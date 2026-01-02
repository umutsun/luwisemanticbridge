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
- Multi-provider embedding support (OpenAI, Google Gemini)
"""

import os
import re
import json
import hashlib
import asyncio
import numpy as np
from typing import Optional, Dict, Any, List, Tuple
from datetime import datetime
from dataclasses import dataclass, asdict
from urllib.parse import urlparse
from loguru import logger
import openai

from services.database import get_db
from services.redis_client import get_redis, cache_get, cache_set

# Configuration
EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "text-embedding-3-small")
EMBEDDING_DIMENSIONS = 1536  # Standard dimension for unified_embeddings
GEMINI_EMBEDDING_MODEL = "text-embedding-004"
GEMINI_DIMENSIONS = 768
EMBEDDING_CACHE_TTL = 86400  # 24 hours
SEARCH_RESULT_CACHE_TTL = 600  # 10 minutes
MAX_QUERY_LENGTH = 8000


@dataclass
class EmbeddingConfig:
    """Embedding provider configuration"""
    provider: str = "openai"  # openai, gemini
    model: str = "text-embedding-3-small"
    dimensions: int = 1536
    api_key: Optional[str] = None


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
    enable_message_embeddings: bool = True
    database_priority: float = 0.8
    documents_priority: float = 0.5
    chat_priority: float = 0.3
    web_priority: float = 0.4
    unified_embeddings_priority: int = 1
    source_table_weights: Dict[str, float] = None  # Individual table weights


@dataclass
class PromptSettings:
    """System prompt and LLM guide settings"""
    system_prompt: str = ""
    llm_guide: str = ""
    conversation_tone: str = "professional"
    active_prompt_id: Optional[str] = None
    schema_name: Optional[str] = None


class SemanticSearchService:
    """High-performance semantic search service with multi-provider support"""

    # Tone instructions for different conversation styles
    TONE_INSTRUCTIONS = {
        "professional": "Yanıtlarınızda profesyonel ve resmi bir dil kullanın. Net, özlü ve bilgilendirici olun.",
        "friendly": "Samimi ve sıcak bir dil kullanın. Konuşma tarzında, anlaşılır açıklamalar yapın.",
        "academic": "Akademik ve detaylı bir dil kullanın. Kaynaklara atıf yapın ve teknik terimleri açıklayın.",
        "casual": "Günlük konuşma dili kullanın. Basit ve anlaşılır ifadeler tercih edin.",
        "formal": "Çok resmi bir dil kullanın. Kısa ve öz cümleler kurun."
    }

    def __init__(self):
        self.openai_client = None
        self.gemini_client = None
        self._embedding_config: Optional[EmbeddingConfig] = None
        self._embedding_config_time: Optional[float] = None
        self._embedding_config_ttl = 60  # 60 seconds
        self._settings_cache: Optional[RAGSettings] = None
        self._settings_cache_time: Optional[float] = None
        self._settings_cache_ttl = 5  # 5 seconds
        self._prompt_cache: Optional[PromptSettings] = None
        self._prompt_cache_time: Optional[float] = None
        self._prompt_cache_ttl = 10  # 10 seconds

    async def _get_embedding_config(self) -> EmbeddingConfig:
        """Load embedding provider configuration from database settings"""
        import time
        current_time = time.time()

        # Check cache
        if (self._embedding_config is not None and
            self._embedding_config_time is not None and
            current_time - self._embedding_config_time < self._embedding_config_ttl):
            return self._embedding_config

        try:
            pool = await get_db()

            # Query embedding settings from database
            rows = await pool.fetch("""
                SELECT key, value FROM settings
                WHERE key IN (
                    'embeddingProvider', 'embedding_provider', 'llmSettings.embeddingProvider',
                    'embeddingModel', 'embedding_model', 'llmSettings.embeddingModel',
                    'openai.apiKey', 'google.apiKey', 'OPENAI_API_KEY', 'GOOGLE_API_KEY'
                )
            """)

            settings_dict = {row['key']: row['value'] for row in rows}

            # Determine provider (priority: embeddingProvider > llmSettings.embeddingProvider)
            provider = (
                settings_dict.get('embeddingProvider') or
                settings_dict.get('embedding_provider') or
                settings_dict.get('llmSettings.embeddingProvider') or
                'openai'
            ).lower()

            # Get model
            model = (
                settings_dict.get('embeddingModel') or
                settings_dict.get('embedding_model') or
                settings_dict.get('llmSettings.embeddingModel') or
                EMBEDDING_MODEL
            )

            # Get API key from database or environment
            api_key = None
            if provider == 'gemini' or provider == 'google':
                provider = 'gemini'
                api_key = settings_dict.get('google.apiKey') or os.getenv('GOOGLE_API_KEY')
                model = model if 'embedding' in model else GEMINI_EMBEDDING_MODEL
                dimensions = GEMINI_DIMENSIONS
            else:
                provider = 'openai'
                api_key = settings_dict.get('openai.apiKey') or os.getenv('OPENAI_API_KEY')
                dimensions = EMBEDDING_DIMENSIONS

            config = EmbeddingConfig(
                provider=provider,
                model=model,
                dimensions=dimensions,
                api_key=api_key
            )

            # Update cache
            self._embedding_config = config
            self._embedding_config_time = current_time

            logger.info(f"Embedding config loaded: provider={provider}, model={model}, has_key={bool(api_key)}")
            return config

        except Exception as e:
            logger.error(f"Error loading embedding config: {e}")
            # Return default config with env vars
            return EmbeddingConfig(
                provider='openai',
                model=EMBEDDING_MODEL,
                dimensions=EMBEDDING_DIMENSIONS,
                api_key=os.getenv('OPENAI_API_KEY')
            )

    async def _get_openai_client(self, api_key: Optional[str] = None):
        """Get or create OpenAI client"""
        key = api_key or os.getenv("OPENAI_API_KEY")
        if not key:
            raise ValueError("OPENAI_API_KEY not configured")

        if self.openai_client is None or api_key:
            self.openai_client = openai.AsyncOpenAI(api_key=key)
        return self.openai_client

    async def _get_gemini_embedding(self, text: str, api_key: str, model: str = GEMINI_EMBEDDING_MODEL) -> List[float]:
        """Generate embedding using Google Gemini API with 1536 dimensions (OpenAI-compatible)"""
        try:
            import aiohttp

            # Use direct REST API to support outputDimensionality parameter
            # Google SDK doesn't expose this parameter, but the API supports it
            url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:embedContent"
            headers = {"Content-Type": "application/json"}

            payload = {
                "model": f"models/{model}",
                "content": {"parts": [{"text": text}]},
                "outputDimensionality": EMBEDDING_DIMENSIONS  # 1536 - OpenAI-compatible
            }

            async with aiohttp.ClientSession() as session:
                async with session.post(
                    f"{url}?key={api_key}",
                    headers=headers,
                    json=payload,
                    timeout=aiohttp.ClientTimeout(total=30)
                ) as response:
                    if not response.ok:
                        error_text = await response.text()
                        logger.error(f"Gemini API error: {response.status} - {error_text}")
                        raise ValueError(f"Gemini embedding API error: {response.status}")

                    data = await response.json()
                    embedding = data.get("embedding", {}).get("values", [])

                    if not embedding:
                        raise ValueError("Gemini embedding response did not include values")

                    logger.info(f"Gemini embedding generated: {len(embedding)} dimensions (native, not scaled)")
                    return embedding

        except ImportError as e:
            logger.error(f"Required package not installed: {e}")
            raise ValueError("aiohttp package not installed")

    def _scale_embedding(self, embedding: List[float], target_dims: int = EMBEDDING_DIMENSIONS) -> List[float]:
        """Scale embedding to target dimensions using interpolation or padding"""
        current_dims = len(embedding)

        if current_dims == target_dims:
            return embedding

        if current_dims < target_dims:
            # Upsample: Use linear interpolation to expand dimensions
            arr = np.array(embedding)
            indices = np.linspace(0, current_dims - 1, target_dims)
            scaled = np.interp(indices, np.arange(current_dims), arr)

            # Normalize to preserve magnitude
            original_norm = np.linalg.norm(arr)
            scaled_norm = np.linalg.norm(scaled)
            if scaled_norm > 0:
                scaled = scaled * (original_norm / scaled_norm)

            logger.debug(f"Scaled embedding from {current_dims} to {target_dims} dims")
            return scaled.tolist()
        else:
            # Downsample: Take every nth element or average pools
            ratio = current_dims / target_dims
            arr = np.array(embedding)
            indices = np.linspace(0, current_dims - 1, target_dims).astype(int)
            scaled = arr[indices]
            return scaled.tolist()

    async def get_prompt_settings(self) -> PromptSettings:
        """Load system prompt and LLM guide from database with caching"""
        import time
        current_time = time.time()

        # Check cache
        if (self._prompt_cache is not None and
            self._prompt_cache_time is not None and
            current_time - self._prompt_cache_time < self._prompt_cache_ttl):
            return self._prompt_cache

        try:
            pool = await get_db()
            settings = PromptSettings()

            # 1. Get active prompt from settings table
            active_prompt_row = await pool.fetchrow("""
                SELECT key, value FROM settings
                WHERE key LIKE 'prompts.%.active' AND value = 'true'
                LIMIT 1
            """)

            if active_prompt_row:
                # Extract prompt ID (e.g., 'prompts.abc123.active' -> 'abc123')
                active_key = active_prompt_row['key']
                prompt_id = active_key.split('.')[1]
                settings.active_prompt_id = prompt_id

                # Get prompt content
                content_row = await pool.fetchrow(
                    "SELECT value FROM settings WHERE key = $1",
                    f"prompts.{prompt_id}.content"
                )
                if content_row:
                    settings.system_prompt = content_row['value'] or ""

                # Get conversation tone
                tone_row = await pool.fetchrow(
                    "SELECT value FROM settings WHERE key = $1",
                    f"prompts.{prompt_id}.tone"
                )
                if tone_row:
                    settings.conversation_tone = tone_row['value'] or "professional"

            # 2. Fallback: Try old chatbot_settings table
            if not settings.system_prompt:
                old_prompt_row = await pool.fetchrow("""
                    SELECT setting_value FROM chatbot_settings
                    WHERE setting_key = 'system_prompt'
                """)
                if old_prompt_row and old_prompt_row['setting_value']:
                    settings.system_prompt = old_prompt_row['setting_value']

            # 3. Get LLM Guide from active schema (industry_presets or user_schemas)
            # First try to get active schema from user_schema_settings
            active_schema_row = await pool.fetchrow("""
                SELECT active_schema_id, active_schema_type
                FROM user_schema_settings
                WHERE active_schema_id IS NOT NULL
                LIMIT 1
            """)

            if active_schema_row:
                schema_id = active_schema_row['active_schema_id']
                schema_type = active_schema_row['active_schema_type']

                if schema_type == 'preset':
                    llm_guide_row = await pool.fetchrow(
                        "SELECT llm_guide, schema_name FROM industry_presets WHERE id = $1",
                        schema_id
                    )
                else:
                    llm_guide_row = await pool.fetchrow(
                        "SELECT llm_guide, name as schema_name FROM user_schemas WHERE id = $1",
                        schema_id
                    )

                if llm_guide_row:
                    settings.llm_guide = llm_guide_row['llm_guide'] or ""
                    settings.schema_name = llm_guide_row['schema_name']

            # Fallback: Get default schema (genel_dokuman)
            if not settings.llm_guide:
                default_schema_row = await pool.fetchrow("""
                    SELECT llm_guide, schema_name FROM industry_presets
                    WHERE schema_name = 'genel_dokuman' AND is_active = true
                    LIMIT 1
                """)
                if default_schema_row:
                    settings.llm_guide = default_schema_row['llm_guide'] or ""
                    settings.schema_name = default_schema_row['schema_name']

            # Update cache
            self._prompt_cache = settings
            self._prompt_cache_time = current_time

            logger.info(f"Prompt settings loaded: tone={settings.conversation_tone}, prompt_len={len(settings.system_prompt)}, guide_len={len(settings.llm_guide)}")
            return settings

        except Exception as e:
            logger.error(f"Error loading prompt settings: {e}")
            return PromptSettings()

    def build_full_system_prompt(self, prompt_settings: PromptSettings) -> str:
        """Build complete system prompt with tone instruction and LLM guide"""
        parts = []

        # Add tone instruction
        tone = prompt_settings.conversation_tone.lower()
        tone_instruction = self.TONE_INSTRUCTIONS.get(tone, self.TONE_INSTRUCTIONS["professional"])
        parts.append(tone_instruction)

        # Add base system prompt
        if prompt_settings.system_prompt:
            parts.append(prompt_settings.system_prompt)

        # Add LLM guide if available
        if prompt_settings.llm_guide:
            parts.append(f"\n--- VERİ BAĞLAMI ---\n{prompt_settings.llm_guide}")

        return "\n\n".join(parts)

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

            # Parse source table weights JSON
            source_table_weights = {}
            weights_str = settings_dict.get('search.sourceTableWeights', '{}')
            try:
                source_table_weights = json.loads(weights_str) if weights_str else {}
            except (json.JSONDecodeError, TypeError):
                source_table_weights = {}

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
                enable_message_embeddings=settings_dict.get('ragSettings.enableMessageEmbeddings', 'true').lower() == 'true',
                database_priority=float(settings_dict.get('ragSettings.databasePriority', 8)) / 10,
                documents_priority=float(settings_dict.get('ragSettings.documentsPriority', 5)) / 10,
                chat_priority=float(settings_dict.get('ragSettings.chatPriority', 3)) / 10,
                web_priority=float(settings_dict.get('ragSettings.webPriority', 4)) / 10,
                unified_embeddings_priority=int(settings_dict.get('ragSettings.unifiedEmbeddingsPriority', 1)),
                source_table_weights=source_table_weights,
            )

            # Update cache
            self._settings_cache = settings
            self._settings_cache_time = current_time

            logger.info(f"RAG settings loaded: threshold={settings.similarity_threshold}, max={settings.max_results}, weights={len(source_table_weights)} tables")
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
        Generate embedding for text with Redis L2 caching and multi-provider support

        Supports:
        - OpenAI (text-embedding-3-small, 1536 dims)
        - Google Gemini (text-embedding-004, 768 dims -> scaled to 1536)

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

        # Load embedding configuration
        config = await self._get_embedding_config()
        start_time = datetime.now()
        embedding = None
        provider_used = None

        # Try primary provider
        try:
            if config.provider == 'gemini' and config.api_key:
                # Use Google Gemini
                embedding = await self._get_gemini_embedding(text, config.api_key, config.model)
                provider_used = 'gemini'

                # Scale to 1536 dims for compatibility with existing embeddings
                if len(embedding) != EMBEDDING_DIMENSIONS:
                    embedding = self._scale_embedding(embedding, EMBEDDING_DIMENSIONS)

            elif config.provider == 'openai' and config.api_key:
                # Use OpenAI
                client = await self._get_openai_client(config.api_key)
                response = await client.embeddings.create(
                    input=text,
                    model=config.model
                )
                embedding = response.data[0].embedding
                provider_used = 'openai'

        except openai.RateLimitError as rate_err:
            logger.warning(f"{config.provider} rate limited: {rate_err}. Trying fallback...")
            embedding = None  # Force fallback instead of infinite retry

        except openai.AuthenticationError as auth_err:
            logger.warning(f"OpenAI auth error: {auth_err}. Trying fallback...")
            embedding = None

        except openai.APIStatusError as api_err:
            # Catch 403 leaked key and other API errors
            logger.warning(f"OpenAI API error (status {api_err.status_code}): {api_err.message}. Trying fallback...")
            embedding = None

        except Exception as primary_error:
            logger.warning(f"Primary provider ({config.provider}) failed: {primary_error}")
            embedding = None

        # Fallback to alternative provider
        if embedding is None:
            try:
                # If OpenAI failed, try Gemini
                if config.provider == 'openai':
                    gemini_key = await self._get_api_key_from_db('google.apiKey') or os.getenv('GEMINI_API_KEY') or os.getenv('GOOGLE_API_KEY')
                    if gemini_key:
                        logger.info("Falling back to Gemini embedding...")
                        embedding = await self._get_gemini_embedding(text, gemini_key)
                        embedding = self._scale_embedding(embedding, EMBEDDING_DIMENSIONS)
                        provider_used = 'gemini_fallback'

                # If Gemini failed, try OpenAI
                elif config.provider == 'gemini':
                    openai_key = await self._get_api_key_from_db('openai.apiKey') or os.getenv('OPENAI_API_KEY')
                    if openai_key:
                        logger.info("Falling back to OpenAI embedding...")
                        client = await self._get_openai_client(openai_key)
                        response = await client.embeddings.create(
                            input=text,
                            model=EMBEDDING_MODEL
                        )
                        embedding = response.data[0].embedding
                        provider_used = 'openai_fallback'

            except Exception as fallback_error:
                logger.error(f"Fallback provider also failed: {fallback_error}")
                raise ValueError(f"All embedding providers failed. Primary: {config.provider}, Error: {fallback_error}")

        if embedding is None:
            raise ValueError(f"No embedding provider available. Check API keys in database settings or environment.")

        elapsed = (datetime.now() - start_time).total_seconds() * 1000
        logger.info(f"Embedding generated via {provider_used} in {elapsed:.1f}ms ({len(text)} chars, {len(embedding)} dims)")

        # Cache the embedding
        if use_cache:
            cache_key = self._get_embedding_cache_key(text)
            await cache_set(cache_key, embedding, EMBEDDING_CACHE_TTL)
            logger.debug(f"Embedding cached: {cache_key[:50]}...")

        return embedding

    async def _get_api_key_from_db(self, key_name: str) -> Optional[str]:
        """Get API key from database settings"""
        try:
            pool = await get_db()
            row = await pool.fetchrow(
                "SELECT value FROM settings WHERE key = $1",
                key_name
            )
            return row['value'] if row else None
        except Exception as e:
            logger.error(f"Error fetching API key {key_name}: {e}")
            return None

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
        settings: Optional[RAGSettings] = None
    ) -> List[Dict[str, Any]]:
        """
        Optimized multi-source pgvector similarity search

        Queries tables sequentially (not UNION ALL) for better index utilization:
        - unified_embeddings (main database tables)
        - document_embeddings (PDFs, Word docs)
        - scrape_embeddings (web content)
        - message_embeddings (chat history)

        Results merged in Python with priority weighting.

        Performance:
        - With HNSW index: 50-200ms total
        - Without index: 1-5s (depends on table sizes)
        """
        start_time = datetime.now()

        try:
            pool = await get_db()
            settings = settings or RAGSettings()

            # Convert embedding to pgvector format
            embedding_str = f"[{','.join(map(str, query_embedding))}]"
            all_results = []

            # 1. Query unified_embeddings (main source)
            if settings.enable_unified_embeddings:
                try:
                    unified_query = """
                        SELECT
                            id, content, source_table, source_type, source_id, metadata,
                            1 - (embedding <=> $1::vector) as similarity_score,
                            'unified' as search_source
                        FROM unified_embeddings
                        WHERE embedding IS NOT NULL
                        ORDER BY embedding <=> $1::vector
                        LIMIT $2
                    """
                    rows = await pool.fetch(unified_query, embedding_str, limit)
                    for row in rows:
                        if float(row['similarity_score']) >= similarity_threshold:
                            all_results.append(dict(row))
                except Exception as e:
                    logger.warning(f"unified_embeddings query error: {e}")

            # 2. Query document_embeddings (PDFs, Word docs)
            if settings.enable_document_embeddings:
                try:
                    doc_query = """
                        SELECT
                            id, chunk_text as content,
                            'document_embeddings' as source_table,
                            'document' as source_type,
                            document_id as source_id, metadata,
                            1 - (embedding <=> $1::vector) as similarity_score,
                            'documents' as search_source
                        FROM document_embeddings
                        WHERE embedding IS NOT NULL
                        ORDER BY embedding <=> $1::vector
                        LIMIT $2
                    """
                    rows = await pool.fetch(doc_query, embedding_str, limit // 2 + 5)
                    for row in rows:
                        if float(row['similarity_score']) >= similarity_threshold:
                            all_results.append(dict(row))
                except Exception as e:
                    logger.debug(f"document_embeddings query skipped: {e}")

            # 3. Query scrape_embeddings (web content)
            if settings.enable_scrape_embeddings:
                try:
                    scrape_query = """
                        SELECT
                            id, content,
                            'scrape_embeddings' as source_table,
                            'web' as source_type,
                            id::text as source_id, metadata,
                            1 - (embedding <=> $1::vector) as similarity_score,
                            'scrapes' as search_source
                        FROM scrape_embeddings
                        WHERE embedding IS NOT NULL
                        ORDER BY embedding <=> $1::vector
                        LIMIT $2
                    """
                    rows = await pool.fetch(scrape_query, embedding_str, limit // 2 + 5)
                    for row in rows:
                        if float(row['similarity_score']) >= similarity_threshold:
                            all_results.append(dict(row))
                except Exception as e:
                    logger.debug(f"scrape_embeddings query skipped: {e}")

            # 4. Query message_embeddings (chat history)
            if settings.enable_message_embeddings:
                try:
                    msg_query = """
                        SELECT
                            id, content,
                            'message_embeddings' as source_table,
                            'chat' as source_type,
                            message_id::text as source_id, metadata,
                            1 - (embedding <=> $1::vector) as similarity_score,
                            'messages' as search_source
                        FROM message_embeddings
                        WHERE embedding IS NOT NULL
                        ORDER BY embedding <=> $1::vector
                        LIMIT $2
                    """
                    rows = await pool.fetch(msg_query, embedding_str, limit // 4 + 3)
                    for row in rows:
                        if float(row['similarity_score']) >= similarity_threshold:
                            all_results.append(dict(row))
                except Exception as e:
                    logger.debug(f"message_embeddings query skipped: {e}")

            # Sort all results by similarity and limit
            all_results.sort(key=lambda x: float(x['similarity_score']), reverse=True)
            rows = all_results[:limit]

            elapsed = (datetime.now() - start_time).total_seconds() * 1000
            logger.info(f"Multi-source vector search: {len(rows)} results in {elapsed:.1f}ms")

            results = []
            for row in rows:
                # Parse metadata safely
                metadata = {}
                if row['metadata']:
                    try:
                        metadata = json.loads(row['metadata']) if isinstance(row['metadata'], str) else dict(row['metadata'])
                    except (json.JSONDecodeError, TypeError):
                        metadata = {}

                result = {
                    "id": str(row['id']),
                    "content": row['content'],
                    "source_table": row['source_table'],
                    "source_type": row['source_type'],
                    "source_id": str(row['source_id']) if row['source_id'] else None,
                    "similarity_score": float(row['similarity_score']),
                    "metadata": metadata,
                    "search_source": row['search_source']
                }
                results.append(result)

            elapsed = (datetime.now() - start_time).total_seconds() * 1000
            logger.info(f"Multi-source vector search: {len(results)} results in {elapsed:.1f}ms")

            return results

        except Exception as e:
            logger.error(f"Vector search error: {e}")
            raise

    async def keyword_search(
        self,
        query: str,
        limit: int = 25
    ) -> List[Dict[str, Any]]:
        """
        Fallback keyword search when embedding fails

        Uses PostgreSQL ILIKE for text matching across ALL sources
        """
        try:
            pool = await get_db()
            results = []
            per_source_limit = max(5, limit // 3)

            # 1. Search unified_embeddings
            unified_query = """
                SELECT
                    id::text as id,
                    CASE
                        WHEN content ILIKE '%' || $1 || '%' THEN
                            LEFT(SUBSTRING(content, POSITION($1 IN content) - 50, 200), 150)
                        ELSE LEFT(content, 150)
                    END as title,
                    source_table,
                    source_id,
                    CASE
                        WHEN content ILIKE '%' || $1 || '%' THEN
                            LEFT(SUBSTRING(content, POSITION($1 IN content) - 50, 300), 250)
                        ELSE LEFT(content, 250)
                    END as content,
                    metadata,
                    CASE
                        WHEN content ILIKE '%' || $1 || '%' THEN 0.90
                        WHEN source_table ILIKE '%' || $1 || '%' THEN 0.70
                        ELSE 0.50
                    END as similarity_score
                FROM unified_embeddings
                WHERE content ILIKE '%' || $1 || '%'
                   OR source_table ILIKE '%' || $1 || '%'
                ORDER BY
                    CASE
                        WHEN content ILIKE '%' || $1 || '%' THEN 0.90
                        WHEN source_table ILIKE '%' || $1 || '%' THEN 0.70
                        ELSE 0.50
                    END DESC,
                    id DESC
                LIMIT $2
            """

            try:
                rows = await pool.fetch(unified_query, query, per_source_limit)
                for row in rows:
                    metadata = {}
                    if row['metadata']:
                        try:
                            metadata = json.loads(row['metadata']) if isinstance(row['metadata'], str) else dict(row['metadata'])
                        except (json.JSONDecodeError, TypeError):
                            metadata = {}

                    results.append({
                        "id": str(row['id']),
                        "content": row['content'],
                        "title": row['title'],
                        "source_table": row['source_table'],
                        "source_id": str(row['source_id']) if row['source_id'] else None,
                        "similarity_score": float(row['similarity_score']),
                        "metadata": metadata,
                        "search_source": "keyword"
                    })
            except Exception as e:
                logger.debug(f"unified_embeddings keyword search skipped: {e}")

            # 2. Search document_embeddings (PDFs, Word docs)
            doc_query = """
                SELECT
                    id::text as id,
                    LEFT(chunk_text, 150) as title,
                    'document_embeddings' as source_table,
                    document_id::text as source_id,
                    LEFT(chunk_text, 500) as content,
                    metadata,
                    0.92 as similarity_score  -- High score for exact keyword match in documents
                FROM document_embeddings
                WHERE chunk_text ILIKE '%' || $1 || '%'
                LIMIT $2
            """

            try:
                rows = await pool.fetch(doc_query, query, per_source_limit)
                for row in rows:
                    metadata = {}
                    if row['metadata']:
                        try:
                            metadata = json.loads(row['metadata']) if isinstance(row['metadata'], str) else dict(row['metadata'])
                        except (json.JSONDecodeError, TypeError):
                            metadata = {}

                    results.append({
                        "id": str(row['id']),
                        "content": row['content'],
                        "title": row['title'],
                        "source_table": 'document_embeddings',
                        "source_id": str(row['source_id']) if row['source_id'] else None,
                        "similarity_score": float(row['similarity_score']),
                        "metadata": metadata,
                        "search_source": "keyword"
                    })
            except Exception as e:
                logger.debug(f"document_embeddings keyword search skipped: {e}")

            logger.info(f"Keyword search: {len(results)} results for '{query[:30]}...'")
            return results

        except Exception as e:
            logger.error(f"Keyword search error: {e}")
            return []

    async def keyword_augment_search(
        self,
        query: str,
        limit: int = 10
    ) -> List[Dict[str, Any]]:
        """
        Find additional results via keyword matching to augment vector search.

        Called during hybrid search to ensure keyword-relevant results
        are included even if they don't rank high in vector similarity.
        """
        try:
            pool = await get_db()
            results = []

            # Extract significant keywords (>3 chars, not stopwords)
            turkish_stopwords = {'ve', 'ile', 'bu', 'bir', 'için', 'da', 'de', 'mi', 'ne', 'var', 'yok', 'ise', 'gibi', 'kadar', 'daha', 'olan', 'olan', 'veya', 'çok', 'sonra', 'önce'}
            keywords = [w for w in query.lower().split() if len(w) > 3 and w not in turkish_stopwords]

            if not keywords:
                return []

            # Build keyword pattern for ILIKE
            # Try exact phrase first, then individual keywords
            patterns = [query]  # Full phrase
            if len(keywords) >= 2:
                patterns.append(' '.join(keywords[:3]))  # First 3 keywords
            patterns.extend(keywords[:5])  # Individual keywords (max 5)

            seen_ids = set()

            for pattern in patterns:
                if len(results) >= limit:
                    break

                # Search document_embeddings
                doc_query = """
                    SELECT
                        id::text as id,
                        LEFT(chunk_text, 150) as title,
                        'document_embeddings' as source_table,
                        'document' as source_type,
                        document_id::text as source_id,
                        LEFT(chunk_text, 500) as content,
                        metadata,
                        0.85 as similarity_score
                    FROM document_embeddings
                    WHERE chunk_text ILIKE '%' || $1 || '%'
                    LIMIT $2
                """

                try:
                    rows = await pool.fetch(doc_query, pattern, limit - len(results))
                    for row in rows:
                        if row['id'] in seen_ids:
                            continue
                        seen_ids.add(row['id'])

                        metadata = {}
                        if row['metadata']:
                            try:
                                metadata = json.loads(row['metadata']) if isinstance(row['metadata'], str) else dict(row['metadata'])
                            except (json.JSONDecodeError, TypeError):
                                metadata = {}

                        results.append({
                            "id": str(row['id']),
                            "content": row['content'],
                            "title": row['title'],
                            "source_table": 'document_embeddings',
                            "source_type": 'document',
                            "source_id": str(row['source_id']) if row['source_id'] else None,
                            "similarity_score": 0.85,  # Good base score for keyword match
                            "metadata": metadata,
                            "search_source": "keyword_augment"
                        })
                except Exception as e:
                    logger.debug(f"document_embeddings keyword augment skipped: {e}")

            logger.info(f"Keyword augment: {len(results)} results for '{query[:30]}...'")
            return results

        except Exception as e:
            logger.error(f"Keyword augment error: {e}")
            return []

    def _calculate_keyword_boost(
        self,
        query: str,
        content: str,
        title: Optional[str] = None
    ) -> float:
        """
        Calculate enhanced keyword boost for hybrid search.

        Enhanced boost algorithm:
        1. Exact phrase match gets highest boost
        2. Consecutive word sequences (n-grams) get medium boost
        3. Individual word matches get base boost weighted by match count
        4. Title matches weighted higher than content
        """
        boost = 0.0
        query_lower = query.lower().strip()

        # Filter meaningful words (>2 chars, not common stopwords)
        turkish_stopwords = {'ve', 'ile', 'bu', 'bir', 'için', 'da', 'de', 'mi', 'ne', 'var', 'yok', 'ise', 'gibi', 'kadar', 'daha'}
        query_words = [w for w in query_lower.split() if len(w) > 2 and w not in turkish_stopwords]

        if not query_words:
            return 0.0

        # Content matching
        if content:
            content_lower = content.lower()

            # 1. Exact phrase match - HIGHEST PRIORITY
            if query_lower in content_lower:
                boost += 0.35  # Strong boost for exact phrase
            else:
                # 2. Check for consecutive word sequences (bigrams/trigrams)
                if len(query_words) >= 2:
                    # Check bigrams (2-word sequences)
                    for i in range(len(query_words) - 1):
                        bigram = f"{query_words[i]} {query_words[i+1]}"
                        if bigram in content_lower:
                            boost += 0.15  # Medium boost for partial phrase match
                            break  # Only count once

                    # Check trigrams (3-word sequences)
                    if len(query_words) >= 3:
                        for i in range(len(query_words) - 2):
                            trigram = f"{query_words[i]} {query_words[i+1]} {query_words[i+2]}"
                            if trigram in content_lower:
                                boost += 0.20  # Higher boost for longer sequence
                                break

                # 3. Individual word matches with weighted scoring
                content_words_set = set(content_lower.split())
                matched_words = [w for w in query_words if w in content_words_set]
                match_ratio = len(matched_words) / len(query_words)

                # Progressive boost: more matches = higher boost
                if match_ratio >= 0.8:  # 80%+ words match
                    boost += 0.20
                elif match_ratio >= 0.6:  # 60-80% words match
                    boost += 0.15
                elif match_ratio >= 0.4:  # 40-60% words match
                    boost += 0.10
                elif match_ratio > 0:  # Any match
                    boost += match_ratio * 0.08

        # Title matching (higher weight than content)
        if title:
            title_lower = title.lower()

            # Exact phrase in title - very high value
            if query_lower in title_lower:
                boost += 0.25
            else:
                # Word overlap in title
                title_words_set = set(title_lower.split())
                matched_title_words = [w for w in query_words if w in title_words_set]
                title_match_ratio = len(matched_title_words) / len(query_words)

                if title_match_ratio >= 0.5:  # Half or more words in title
                    boost += 0.15
                elif title_match_ratio > 0:
                    boost += title_match_ratio * 0.10

        return min(boost, 0.50)  # Increased cap to 0.50 for stronger keyword influence

    def _get_source_priority(self, source_table: str, settings: RAGSettings) -> float:
        """Get priority multiplier for source table"""
        table_lower = (source_table or '').lower()

        if 'document' in table_lower or 'pdf' in table_lower:
            return max(0.1, settings.documents_priority)
        elif 'chat' in table_lower or 'message' in table_lower:
            return max(0.1, settings.chat_priority)
        elif 'scrape' in table_lower or 'web' in table_lower or 'crawl' in table_lower:
            return max(0.1, settings.web_priority)
        else:
            return max(0.1, settings.database_priority)

    def _get_table_weight(self, source_table: str, settings: RAGSettings) -> float:
        """Get individual table weight from settings"""
        if not settings.source_table_weights:
            return 1.0

        # Check exact match first
        if source_table in settings.source_table_weights:
            return settings.source_table_weights[source_table]

        # Check case-insensitive
        table_lower = (source_table or '').lower()
        for key, weight in settings.source_table_weights.items():
            if key.lower() == table_lower:
                return weight

        return 1.0  # Default weight

    def _format_content(self, result: Dict[str, Any]) -> Dict[str, str]:
        """
        Format search result for human-readable display

        Transforms raw metadata into proper title and excerpt
        """
        metadata = result.get("metadata", {})
        source_table = (result.get("source_table") or "").lower()
        content = result.get("content", "")

        title = ""
        excerpt = ""

        # Source-specific formatting for Turkish legal/tax content
        if source_table == "maddeler":
            madde_no = metadata.get("madde_numarasi", "")
            mevzuat_id = metadata.get("mevzuat_id", "")
            orijinal_metin = metadata.get("orijinal_metin", "")
            ozet = metadata.get("ozet", "")

            title = f"Madde {madde_no}" if madde_no else (ozet or "Madde")
            if mevzuat_id:
                title += f" ({mevzuat_id})"
            excerpt = orijinal_metin or ozet or content

        elif source_table == "mevzuat":
            mevzuat_adi = metadata.get("mevzuat_adi") or metadata.get("title", "")
            mevzuat_tipi = metadata.get("mevzuat_tipi", "")
            durum = metadata.get("durum", "")

            title = mevzuat_adi or "Mevzuat"
            if mevzuat_tipi:
                title = f"{mevzuat_tipi}: {title}"

            excerpt_parts = []
            if durum:
                excerpt_parts.append(f"Durum: {durum}")
            excerpt = " | ".join(excerpt_parts) if excerpt_parts else content

        elif source_table in ["sorucevap", "soru_cevap"] or "soru" in source_table:
            title = metadata.get("question") or metadata.get("soru") or "Soru-Cevap"
            excerpt = metadata.get("answer") or metadata.get("cevap") or content

        elif source_table == "ozelgeler":
            title = metadata.get("ozelge_no") or metadata.get("konu") or "Ozelge"
            excerpt = metadata.get("icerik") or metadata.get("ozet") or content

        elif source_table in ["danistaykararlari", "danistay_kararlari"] or "karar" in source_table:
            daire = metadata.get("daire", "")
            karar_no = metadata.get("karar_no", "")
            title = f"{daire} {karar_no}" if karar_no else (metadata.get("konu") or "Danistay Karari")
            excerpt = metadata.get("karar") or metadata.get("ozet") or content

        elif source_table == "makaleler":
            title = metadata.get("baslik") or metadata.get("title") or "Makale"
            excerpt = metadata.get("icerik") or metadata.get("ozet") or content

        elif source_table == "document_embeddings":
            # Extract title from metadata or content
            title = metadata.get("filename") or metadata.get("title") or metadata.get("name") or metadata.get("document_title") or ""

            # If no title, try to extract from content (first meaningful line)
            if not title and content:
                lines = content.split('\n')
                for line in lines[:5]:
                    clean_line = line.strip()
                    # Skip very short lines, numbers, and formatting
                    if len(clean_line) > 15 and not clean_line.replace('.', '').replace('-', '').isdigit():
                        title = clean_line[:120]
                        break
                if not title:
                    title = "Döküman"

            # Create intelligent excerpt
            page_info = metadata.get("page") or metadata.get("page_number", "")
            chunk_info = metadata.get("chunk_index", "")

            # Build excerpt with context
            excerpt_parts = []
            if page_info:
                excerpt_parts.append(f"[Sayfa {page_info}]")
            if chunk_info:
                excerpt_parts.append(f"[Bölüm {chunk_info}]")

            # Clean and format content for excerpt
            clean_content = content.strip()
            if clean_content:
                # Remove excessive whitespace
                clean_content = re.sub(r'\s+', ' ', clean_content)
                excerpt_parts.append(clean_content[:800])

            excerpt = " ".join(excerpt_parts) if excerpt_parts else content[:800]

        elif source_table == "scrape_embeddings" or "scrape" in source_table:
            # Web scrape results
            title = metadata.get("title") or metadata.get("url") or metadata.get("source_url") or "Web İçeriği"
            url = metadata.get("url") or metadata.get("source_url", "")

            # Extract domain from URL for context
            if url and not title.startswith("http"):
                try:
                    domain = urlparse(url).netloc
                    if domain:
                        title = f"{title} ({domain})"
                except:
                    pass

            excerpt = metadata.get("description") or metadata.get("summary") or content[:600]

        elif source_table == "message_embeddings" or "message" in source_table:
            # Chat message history
            role = metadata.get("role", "user")
            conversation_id = metadata.get("conversation_id", "")

            if role == "assistant":
                title = "Asistan Yanıtı"
            elif role == "user":
                title = "Kullanıcı Sorusu"
            else:
                title = f"Mesaj ({role})"

            if conversation_id:
                title += f" [{conversation_id[:8]}]"

            # Clean up message content
            clean_content = re.sub(r'\s+', ' ', content.strip()) if content else ""
            excerpt = clean_content[:600]

        else:
            # Generic fallback
            title = metadata.get("title") or metadata.get("baslik") or metadata.get("name") or metadata.get("konu") or ""
            excerpt = metadata.get("content") or metadata.get("icerik") or metadata.get("text") or metadata.get("ozet") or ""

            if not title and content:
                # Extract first meaningful line as title
                lines = content.split('\n')
                for line in lines[:5]:
                    clean_line = line.strip()
                    # Skip short lines and pure formatting
                    if len(clean_line) > 15 and not clean_line.replace('.', '').replace('-', '').replace('_', '').isdigit():
                        title = clean_line[:150]
                        break

            if not excerpt:
                # Clean up and format content
                clean_content = re.sub(r'\s+', ' ', content.strip()) if content else ""
                excerpt = clean_content

        # Final cleanup
        title = (title or "Kaynak")[:200].strip()
        excerpt = (excerpt or "")[:1500].strip()

        return {"title": title, "excerpt": excerpt}

    def _get_source_display_name(self, source_table: str) -> str:
        """Get human-readable source name"""
        mapping = {
            "unified_embeddings": "Veritabani",
            "document_embeddings": "Dokumanlar",
            "scrape_embeddings": "Web Icerigi",
            "message_embeddings": "Soru-Cevap",
            "sorucevap": "Soru-Cevap",
            "makaleler": "Makaleler",
            "ozelgeler": "Ozelgeler",
            "danistaykararlari": "Danistay Kararlari",
            "maddeler": "Maddeler",
            "mevzuat": "Mevzuat",
        }

        source_lower = (source_table or "").lower()
        if source_lower in mapping:
            return mapping[source_lower]

        # Format unknown tables
        return source_table.replace("_", " ").title() if source_table else "Kaynak"

    async def semantic_search(
        self,
        query: str,
        limit: Optional[int] = None,
        use_cache: bool = True
    ) -> Dict[str, Any]:
        """
        Full semantic search pipeline with all features

        Features:
        1. Multi-source search (unified_embeddings, document_embeddings)
        2. Source table weights (user configurable per table)
        3. Hybrid scoring (semantic + keyword boost)
        4. Content formatting for Turkish legal/tax content
        5. Keyword search fallback when embedding fails

        Performance target: <300ms for cached queries, <500ms for new queries
        """
        start_time = datetime.now()
        timings = {}
        use_keyword_fallback = False

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
            try:
                query_embedding = await self.generate_embedding(query)
                timings["embedding_ms"] = (datetime.now() - embed_start).total_seconds() * 1000
            except Exception as embed_error:
                logger.warning(f"Embedding failed, using keyword fallback: {embed_error}")
                use_keyword_fallback = True
                timings["embedding_ms"] = 0
                timings["embedding_error"] = str(embed_error)

            # Vector search or keyword fallback
            search_start = datetime.now()

            if use_keyword_fallback:
                # Keyword search fallback
                raw_results = await self.keyword_search(query, limit * 2)
                timings["keyword_search_ms"] = (datetime.now() - search_start).total_seconds() * 1000
            else:
                # Vector search with settings
                raw_results = await self.vector_search(
                    query_embedding,
                    limit=limit * 2,  # Get extra for filtering
                    similarity_threshold=settings.similarity_threshold,
                    settings=settings
                )
                timings["vector_search_ms"] = (datetime.now() - search_start).total_seconds() * 1000

                # HYBRID SEARCH: Augment vector results with keyword matches
                # This ensures exact keyword matches are included even if vector similarity is low
                if settings.enable_hybrid_search:
                    augment_start = datetime.now()
                    keyword_results = await self.keyword_augment_search(query, limit=5)
                    timings["keyword_augment_ms"] = (datetime.now() - augment_start).total_seconds() * 1000

                    # Merge keyword results, avoiding duplicates
                    existing_ids = {r["id"] for r in raw_results}
                    for kr in keyword_results:
                        if kr["id"] not in existing_ids:
                            raw_results.append(kr)
                            existing_ids.add(kr["id"])
                    logger.info(f"Hybrid search: {len(keyword_results)} keyword augment results added")

            # Apply hybrid scoring with table weights
            score_start = datetime.now()
            scored_results = []

            for result in raw_results:
                # Format content for human-readable display
                formatted = self._format_content(result)

                # Get title from formatted content or metadata
                title = formatted["title"]

                # Calculate keyword boost
                keyword_boost = 0.0
                if settings.enable_hybrid_search and settings.enable_keyword_boost:
                    keyword_boost = self._calculate_keyword_boost(
                        query,
                        result["content"] or "",
                        title
                    )

                # Apply source category priority (database, documents, chat, web)
                source_priority = self._get_source_priority(result["source_table"], settings)

                # Apply individual table weight
                table_weight = self._get_table_weight(result["source_table"], settings)

                # Skip tables with weight = 0 (disabled by user)
                if table_weight <= 0:
                    continue

                # Calculate weighted similarity
                similarity = result["similarity_score"]
                weighted_similarity = similarity * source_priority * table_weight

                # Calculate final score (includes keyword boost)
                final_score = weighted_similarity + keyword_boost

                scored_results.append({
                    "id": result["id"],
                    "content": formatted["excerpt"][:500] if formatted["excerpt"] else "",
                    "full_content": result["content"],
                    "title": title,
                    "excerpt": formatted["excerpt"],
                    "source_table": result["source_table"],
                    "source_type": self._get_source_display_name(result["source_table"]),
                    "source_id": result["source_id"],
                    "similarity_score": round(weighted_similarity * 100, 2),
                    "keyword_boost": round(keyword_boost * 100, 2),
                    "source_priority": round(source_priority, 2),
                    "table_weight": round(table_weight, 2),
                    "final_score": round(final_score * 100, 2),
                    "metadata": result.get("metadata", {}),
                    "search_source": result.get("search_source", "unknown"),
                    "_debug": {
                        "pure_similarity": round(similarity * 100, 2),
                        "weighted_similarity": round(weighted_similarity * 100, 2),
                        "source_priority": round(source_priority, 2),
                        "table_weight": round(table_weight, 2),
                        "keyword_boost": round(keyword_boost * 100, 2),
                        "final": round(final_score * 100, 2)
                    }
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
                f"(embed: {timings.get('embedding_ms', 0):.1f}ms, search: {timings.get('vector_search_ms', timings.get('keyword_search_ms', 0)):.1f}ms)"
            )

            # Load prompt settings for response context
            prompt_settings = await self.get_prompt_settings()

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
                    "keyword_boost": settings.enable_keyword_boost,
                    "max_results": settings.max_results,
                    "database_priority": settings.database_priority,
                    "documents_priority": settings.documents_priority,
                    "web_priority": settings.web_priority,
                    "table_weights_count": len(settings.source_table_weights or {}),
                    "used_keyword_fallback": use_keyword_fallback
                },
                "prompt_context": {
                    "conversation_tone": prompt_settings.conversation_tone,
                    "schema_name": prompt_settings.schema_name,
                    "has_system_prompt": bool(prompt_settings.system_prompt),
                    "has_llm_guide": bool(prompt_settings.llm_guide),
                    "system_prompt_preview": prompt_settings.system_prompt[:200] if prompt_settings.system_prompt else None
                }
            }

        except Exception as e:
            logger.error(f"Semantic search error: {e}")

            # Try keyword fallback on any error if hybrid search is enabled
            if settings.enable_hybrid_search and not use_keyword_fallback:
                logger.info("Attempting keyword search fallback...")
                try:
                    fallback_results = await self.keyword_search(query, limit)
                    if fallback_results:
                        return {
                            "success": True,
                            "cached": False,
                            "query": query,
                            "results": fallback_results,
                            "total": len(fallback_results),
                            "timings": {"total_ms": (datetime.now() - start_time).total_seconds() * 1000, "fallback": "keyword"},
                            "settings": {"used_keyword_fallback": True}
                        }
                except Exception as fallback_error:
                    logger.error(f"Keyword fallback also failed: {fallback_error}")

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
