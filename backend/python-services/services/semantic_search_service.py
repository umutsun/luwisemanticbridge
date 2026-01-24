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
    max_excerpt_length: int = 1500  # Maximum excerpt length for citations
    excerpt_max_length: int = 1500  # Alias for compatibility


@dataclass
class PromptSettings:
    """System prompt and LLM guide settings"""
    system_prompt: str = ""
    llm_guide: str = ""
    conversation_tone: str = "professional"
    active_prompt_id: Optional[str] = None
    schema_name: Optional[str] = None


@dataclass
class LawCodeConfig:
    """
    Law code configuration for article anchoring.
    Loaded dynamically from schema's llm_config.lawCodeConfig.
    Enables multi-tenant law code mappings.
    """
    # Law code → aliases (e.g., "VUK" → ["Vergi Usul Kanunu", ...])
    law_codes: Dict[str, List[str]] = None
    # Law number → code (e.g., "213" → "VUK")
    law_number_to_code: Dict[str, str] = None
    # Full law name → code (handles malformed names)
    law_name_to_code: Dict[str, str] = None
    # Patterns for matching law codes
    law_code_patterns: List[Dict[str, str]] = None

    def __post_init__(self):
        """Initialize with defaults if None"""
        if self.law_codes is None:
            self.law_codes = {}
        if self.law_number_to_code is None:
            self.law_number_to_code = {}
        if self.law_name_to_code is None:
            self.law_name_to_code = {}
        if self.law_code_patterns is None:
            self.law_code_patterns = []


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
        self._law_code_config: Optional[LawCodeConfig] = None
        self._law_code_config_time: Optional[float] = None
        self._law_code_config_ttl = 60  # 60 seconds

    async def get_law_code_config(self) -> LawCodeConfig:
        """
        Load law code configuration from database (schema's llm_config.lawCodeConfig).
        Falls back to hardcoded defaults if not configured in database.
        Cached for _law_code_config_ttl seconds.
        """
        import time
        current_time = time.time()

        # Check cache
        if (self._law_code_config is not None and
            self._law_code_config_time is not None and
            current_time - self._law_code_config_time < self._law_code_config_ttl):
            return self._law_code_config

        try:
            pool = await get_db()

            # Try to get lawCodeConfig from active schema's llm_config
            # First check user_schema_settings for active schema
            result = await pool.fetchrow("""
                SELECT ip.llm_config
                FROM user_schema_settings uss
                JOIN industry_presets ip ON ip.id = uss.active_schema_id
                WHERE uss.active_schema_type = 'preset'
                LIMIT 1
            """)

            law_config_data = None

            if result and result['llm_config']:
                llm_config = result['llm_config']
                if isinstance(llm_config, str):
                    llm_config = json.loads(llm_config)
                law_config_data = llm_config.get('lawCodeConfig')

            # If not found in presets, try user schemas
            if not law_config_data:
                result = await pool.fetchrow("""
                    SELECT us.llm_config
                    FROM user_schema_settings uss
                    JOIN user_schemas us ON us.id = uss.active_schema_id
                    WHERE uss.active_schema_type = 'custom'
                    LIMIT 1
                """)
                if result and result['llm_config']:
                    llm_config = result['llm_config']
                    if isinstance(llm_config, str):
                        llm_config = json.loads(llm_config)
                    law_config_data = llm_config.get('lawCodeConfig')

            # If still not found, try settings table directly
            if not law_config_data:
                settings_result = await pool.fetchrow("""
                    SELECT value FROM settings WHERE key = 'lawCodeConfig'
                """)
                if settings_result and settings_result['value']:
                    value = settings_result['value']
                    if isinstance(value, str):
                        law_config_data = json.loads(value)
                    else:
                        law_config_data = value

            # Build config from database or use defaults
            if law_config_data:
                config = LawCodeConfig(
                    law_codes=law_config_data.get('lawCodes', {}),
                    law_number_to_code=law_config_data.get('lawNumberToCode', {}),
                    law_name_to_code=law_config_data.get('lawNameToCode', {}),
                    law_code_patterns=law_config_data.get('lawCodePatterns', [])
                )
                logger.info(f"[LawCodeConfig] Loaded from database: {len(config.law_codes)} codes, {len(config.law_number_to_code)} numbers, {len(config.law_name_to_code)} names")
            else:
                # Use class-level defaults
                config = LawCodeConfig(
                    law_codes=self.LAW_CODES,
                    law_number_to_code=self.KANUN_NO_TO_CODE,
                    law_name_to_code=self.LAW_NAME_TO_CODE,
                    law_code_patterns=[]
                )
                logger.debug("[LawCodeConfig] Using hardcoded defaults")

            # Update cache
            self._law_code_config = config
            self._law_code_config_time = current_time
            return config

        except Exception as e:
            logger.warning(f"[LawCodeConfig] Error loading from database, using defaults: {e}")
            # Return defaults on error
            return LawCodeConfig(
                law_codes=self.LAW_CODES,
                law_number_to_code=self.KANUN_NO_TO_CODE,
                law_name_to_code=self.LAW_NAME_TO_CODE,
                law_code_patterns=[]
            )

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

            # 1. Get prompts from settings table (new format: prompts.list JSON array)
            prompts_list_row = await pool.fetchrow("""
                SELECT value FROM settings WHERE key = 'prompts.list'
            """)

            if prompts_list_row and prompts_list_row['value']:
                try:
                    prompts_list = json.loads(prompts_list_row['value'])
                    if isinstance(prompts_list, list) and len(prompts_list) > 0:
                        # Find active prompt or use first one
                        active_prompt = None
                        for prompt in prompts_list:
                            if prompt.get('isActive', False):
                                active_prompt = prompt
                                break

                        # Fallback to first prompt if none is active
                        if not active_prompt:
                            active_prompt = prompts_list[0]

                        if active_prompt:
                            settings.active_prompt_id = active_prompt.get('id')
                            settings.system_prompt = active_prompt.get('systemPrompt', '')
                            settings.conversation_tone = active_prompt.get('conversationTone', 'professional')
                            logger.info(f"Loaded prompt from prompts.list: id={settings.active_prompt_id}, len={len(settings.system_prompt)}")
                except json.JSONDecodeError as e:
                    logger.warning(f"Failed to parse prompts.list JSON: {e}")

            # 2. Fallback: Try old chatbot_settings table
            if not settings.system_prompt:
                old_prompt_row = await pool.fetchrow("""
                    SELECT setting_value FROM chatbot_settings
                    WHERE setting_key = 'system_prompt'
                """)
                if old_prompt_row and old_prompt_row['setting_value']:
                    settings.system_prompt = old_prompt_row['setting_value']
                    logger.info("Loaded prompt from chatbot_settings fallback")

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
                max_excerpt_length=int(settings_dict.get('ragSettings.maxExcerptLength', 1500)),
                excerpt_max_length=int(settings_dict.get('ragSettings.excerptMaxLength', 1500)),
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
            # 🔧 FIX: Skip unified_embeddings when database_priority = 0
            if settings.enable_unified_embeddings and settings.database_priority > 0:
                try:
                    logger.info(f"[VectorSearch] Querying unified_embeddings (database_priority={settings.database_priority})")

                    # 🔧 SOURCE DIVERSITY: Get priority sources from settings (weight >= 1.0)
                    # This ensures high-priority sources like kanun always get representation
                    priority_sources = []
                    if settings.source_table_weights:
                        priority_sources = [
                            table for table, weight in settings.source_table_weights.items()
                            if weight >= 1.0
                        ]
                        logger.info(f"[VectorSearch] Priority sources from settings: {priority_sources}")

                    seen_ids = set()

                    # First, query priority sources to ensure they're represented
                    for priority_source in priority_sources:
                        priority_query = """
                            SELECT
                                id, content, source_table, source_type, source_id, metadata,
                                1 - (embedding <=> $1::vector) as similarity_score,
                                'unified' as search_source
                            FROM unified_embeddings
                            WHERE embedding IS NOT NULL
                            AND source_table = $2
                            ORDER BY embedding <=> $1::vector
                            LIMIT 5
                        """
                        try:
                            priority_rows = await pool.fetch(priority_query, embedding_str, priority_source)
                            for row in priority_rows:
                                if float(row['similarity_score']) >= similarity_threshold and row['id'] not in seen_ids:
                                    all_results.append(dict(row))
                                    seen_ids.add(row['id'])
                            if priority_rows:
                                logger.info(f"[VectorSearch] Priority source {priority_source}: {len(priority_rows)} results")
                        except Exception as e:
                            logger.debug(f"Priority source {priority_source} query skipped: {e}")

                    # Then query all sources for general results
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
                    # Fetch more results to ensure good coverage across sources
                    unified_limit = max(50, limit * 2)
                    rows = await pool.fetch(unified_query, embedding_str, unified_limit)
                    for row in rows:
                        if float(row['similarity_score']) >= similarity_threshold and row['id'] not in seen_ids:
                            all_results.append(dict(row))
                            seen_ids.add(row['id'])
                except Exception as e:
                    logger.warning(f"unified_embeddings query error: {e}")
            elif settings.database_priority == 0:
                logger.info(f"[VectorSearch] 🔒 Skipping unified_embeddings (database_priority=0)")

            # 2. Query document_embeddings (PDFs, Word docs)
            if settings.enable_document_embeddings:
                try:
                    logger.info(f"[VectorSearch] Querying document_embeddings (documents_priority={settings.documents_priority})")
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
                    # Fetch more document embeddings to ensure good coverage
                    # Minimum 15 results to capture relevant documents even with low limit
                    doc_limit = max(15, limit)
                    rows = await pool.fetch(doc_query, embedding_str, doc_limit)
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

            # Sort all results by weighted score (similarity + source weight bonus)
            # This ensures priority sources like kanun get boosted even with lower similarity
            def get_weighted_score(result):
                sim = float(result['similarity_score'])
                source_table = result.get('source_table', '')
                # Get source weight from settings (default 0.5 for unknown)
                source_weight = 0.5
                if settings.source_table_weights and source_table in settings.source_table_weights:
                    source_weight = settings.source_table_weights[source_table]
                # Weighted score: 70% similarity + 30% source weight bonus
                # Source weight is 0-1 range, multiply by 100 to match similarity scale
                return sim * 0.7 + (source_weight * 100) * 0.3

            all_results.sort(key=get_weighted_score, reverse=True)
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

                # NOTE: Metadata is already populated in unified_embeddings table
                # No need to fetch from CSV tables - data_health.py fix_metadata() already merged CSV columns
                # into unified_embeddings.metadata (daire, tarih, esasno, kararno, konusu, etc.)
                source_table = row['source_table']
                source_id = row['source_id']

                # Log metadata fields for debugging
                if metadata:
                    meta_fields = [k for k in metadata.keys() if k not in ['table', 'embeddingModel', 'embeddingProvider', 'originalId', 'row_id', 'tokens_used']]
                    if meta_fields:
                        logger.debug(f"[Metadata] {source_table}[{source_id}]: {', '.join(meta_fields[:5])}")

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

            # Load settings for dynamic excerpt length
            settings = await self.get_rag_settings()
            max_excerpt = settings.max_excerpt_length

            # 1. Search unified_embeddings
            unified_query = f"""
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
                            LEFT(SUBSTRING(content, POSITION($1 IN content) - 50, {max_excerpt + 100}), {max_excerpt})
                        ELSE LEFT(content, {max_excerpt})
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
            doc_query = f"""
                SELECT
                    id::text as id,
                    LEFT(chunk_text, 150) as title,
                    'document_embeddings' as source_table,
                    document_id::text as source_id,
                    LEFT(chunk_text, {max_excerpt}) as content,
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

        OPTIMIZED: Uses single query with OR conditions instead of multiple queries.
        """
        try:
            pool = await get_db()
            results = []

            # Load settings for dynamic excerpt length
            settings = await self.get_rag_settings()
            max_excerpt = settings.max_excerpt_length

            # Extract significant keywords (>3 chars, not stopwords)
            turkish_stopwords = {'ve', 'ile', 'bu', 'bir', 'için', 'da', 'de', 'mi', 'ne', 'var', 'yok', 'ise', 'gibi', 'kadar', 'daha', 'olan', 'veya', 'çok', 'sonra', 'önce'}
            keywords = [w for w in query.lower().split() if len(w) > 3 and w not in turkish_stopwords]

            if not keywords:
                return []

            # Build patterns for single optimized query
            # Priority: full phrase > first 2 keywords > longest individual keyword
            patterns = []
            patterns.append(query.strip())  # Full phrase (highest priority)
            if len(keywords) >= 2:
                patterns.append(' '.join(keywords[:2]))  # First 2 keywords
            # Add the longest keyword (most specific)
            if keywords:
                longest_keyword = max(keywords, key=len)
                if longest_keyword not in patterns:
                    patterns.append(longest_keyword)

            # Build single optimized query with OR conditions
            # Uses CASE to score matches by priority
            conditions = []
            params = []
            for i, pattern in enumerate(patterns[:3]):  # Max 3 patterns for performance
                conditions.append(f"chunk_text ILIKE '%' || ${i+1} || '%'")
                params.append(pattern)

            if not conditions:
                return []

            where_clause = " OR ".join(conditions)

            # Single query with scoring based on match type
            doc_query = f"""
                SELECT
                    id::text as id,
                    LEFT(chunk_text, 150) as title,
                    'document_embeddings' as source_table,
                    'document' as source_type,
                    document_id::text as source_id,
                    LEFT(chunk_text, {max_excerpt}) as content,
                    metadata,
                    CASE
                        WHEN chunk_text ILIKE '%' || $1 || '%' THEN 0.92  -- Full phrase match
                        WHEN {len(params) >= 2 and "chunk_text ILIKE '%' || $2 || '%'" or 'FALSE'} THEN 0.88  -- Partial match
                        ELSE 0.85  -- Keyword match
                    END as similarity_score
                FROM document_embeddings
                WHERE {where_clause}
                ORDER BY
                    CASE
                        WHEN chunk_text ILIKE '%' || $1 || '%' THEN 1
                        WHEN {len(params) >= 2 and "chunk_text ILIKE '%' || $2 || '%'" or 'FALSE'} THEN 2
                        ELSE 3
                    END
                LIMIT ${len(params) + 1}
            """
            params.append(limit)

            try:
                rows = await pool.fetch(doc_query, *params)
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
                        "source_type": 'document',
                        "source_id": str(row['source_id']) if row['source_id'] else None,
                        "similarity_score": float(row['similarity_score']),
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

    # =========================================================================
    # ARTICLE ANCHORING SYSTEM
    # When user asks about specific law articles (VUK 19, KDVK 29, GVK 40),
    # the response MUST be anchored to the exact law text, not related content.
    # =========================================================================

    # Known Turkish law codes with their full names and variations
    LAW_CODES = {
        "VUK": ["VUK", "Vergi Usul Kanunu", "213"],
        "GVK": ["GVK", "Gelir Vergisi Kanunu", "193", "G.V.K."],
        "KVK": ["KVK", "Kurumlar Vergisi Kanunu", "5520"],
        "KDVK": ["KDVK", "Katma Değer Vergisi Kanunu", "3065", "KDV"],
        "ÖTVK": ["ÖTVK", "Özel Tüketim Vergisi Kanunu", "4760", "ÖTV", "OTVK", "OTV"],
        "MTV": ["MTV", "Motorlu Taşıtlar Vergisi Kanunu"],
        "DVK": ["DVK", "Damga Vergisi Kanunu", "488"],
        "VİVK": ["VİVK", "Veraset ve İntikal Vergisi Kanunu", "VIVK", "7338"],
        "AATUHK": ["AATUHK", "Amme Alacaklarının Tahsil Usulü Hakkında Kanun", "6183"],
        "HK": ["HK", "Harçlar Kanunu", "492"],  # Added
        "BGK": ["BGK", "Belediye Gelirleri Kanunu", "2464"],  # Added
        "TTK": ["TTK", "Türk Ticaret Kanunu", "6102"],
        "BK": ["BK", "Borçlar Kanunu", "6098", "TBK"],
        "HMK": ["HMK", "Hukuk Muhakemeleri Kanunu"],
        "SGK": ["SGK", "Sosyal Güvenlik Kanunu", "5510"],
        "İYUK": ["İYUK", "İdari Yargılama Usulü Kanunu", "IYUK", "2577"],
    }

    # Article reference patterns (e.g., "VUK 19", "KDVK Madde 29", "GVK md. 40")
    ARTICLE_PATTERNS = [
        # Direct patterns: VUK 19, GVK 40, KDVK 29
        r'\b({codes})\s*[Mm](?:adde)?\s*\.?\s*(\d+(?:/[A-ZÇĞİÖŞÜa-zçğıöşü])?)',
        # Short patterns: VUK 19, VUK19
        r'\b({codes})\s*(\d+(?:/[A-ZÇĞİÖŞÜa-zçğıöşü])?)\b',
        # With "madde" keyword: Madde 19 of VUK
        r'[Mm]adde\s*(\d+(?:/[A-ZÇĞİÖŞÜa-zçğıöşü])?)\s*(?:\'?[ıiuü]?n?)?.*?\b({codes})\b',
    ]

    def _detect_article_query(self, query: str) -> Optional[Dict[str, Any]]:
        """
        Detect if query asks about a specific law article.

        Args:
            query: User's search query

        Returns:
            Dict with law_code, article_number, and matched_text if found, None otherwise
            Example: {"law_code": "VUK", "article_number": "19", "matched_text": "VUK 19"}
        """
        if not query:
            return None

        query_upper = query.upper()

        # Build codes pattern from all variations
        all_codes = []
        for variations in self.LAW_CODES.values():
            all_codes.extend(variations)
        codes_pattern = '|'.join(sorted(all_codes, key=len, reverse=True))

        for pattern_template in self.ARTICLE_PATTERNS:
            pattern = pattern_template.format(codes=codes_pattern)

            match = re.search(pattern, query, re.IGNORECASE)
            if match:
                groups = match.groups()

                # Handle different pattern group orders
                if len(groups) == 2:
                    # Check which group is the code vs article number
                    g1, g2 = groups
                    if g1 and g1.upper() in query_upper and any(g1.upper() in variations for variations in self.LAW_CODES.values()):
                        law_code_raw = g1.upper()
                        article_number = g2
                    elif g2 and g2.upper() in query_upper and any(g2.upper() in variations for variations in self.LAW_CODES.values()):
                        law_code_raw = g2.upper()
                        article_number = g1
                    else:
                        continue

                    # Normalize law code to standard form
                    normalized_code = self._normalize_law_code(law_code_raw)

                    if normalized_code and article_number:
                        logger.info(f"🎯 Article query detected: {normalized_code} Madde {article_number}")
                        # Detect intent keywords for sub-clause filtering
                        intent = self._detect_query_intent(query)

                        return {
                            "law_code": normalized_code,
                            "article_number": article_number.strip(),
                            "matched_text": match.group(0),
                            "query_type": "article_specific",
                            "intent": intent
                        }

        return None

    # Intent keyword mappings for sub-clause routing
    # Format: intent_name -> (positive_keywords, negative_keywords, sub_clause_hints)
    INTENT_KEYWORDS = {
        "indirim": {
            "positive": ["indirim", "indirimi", "indirilir", "indirilecek", "indirilmesi", "indirilebilir", "indirilme"],
            "negative": ["iade", "nakden", "mahsup"],
            "sub_clause": "29/1",
            "description": "KDV indirimi şartları"
        },
        "iade": {
            "positive": ["iade", "iadesi", "nakden", "mahsup", "geri alma", "geri ödeme"],
            "negative": ["indirim"],
            "sub_clause": "29/2",
            "description": "KDV iadesi şartları"
        },
        "istisna": {
            "positive": ["istisna", "istisnası", "muaf", "muafiyet"],
            "negative": [],
            "sub_clause": None,
            "description": "Vergi istisnası"
        },
        "ceza": {
            "positive": ["ceza", "usulsüzlük", "vergi ziyaı", "gecikme", "faiz"],
            "negative": [],
            "sub_clause": None,
            "description": "Vergi cezaları"
        }
    }

    def _detect_query_intent(self, query: str) -> Optional[Dict[str, Any]]:
        """
        Detect the primary intent/concept from the query.

        This helps distinguish between related but different concepts like:
        - KDV indirimi (KDVK 29/1) vs KDV iadesi (KDVK 29/2)
        - Vergi istisnası vs vergi muafiyeti

        Returns:
            Dict with intent info if detected, None otherwise
        """
        if not query:
            return None

        query_lower = query.lower()

        detected_intents = []

        for intent_name, intent_config in self.INTENT_KEYWORDS.items():
            positive_match = any(kw in query_lower for kw in intent_config["positive"])
            negative_match = any(kw in query_lower for kw in intent_config["negative"])

            if positive_match and not negative_match:
                detected_intents.append({
                    "intent": intent_name,
                    "sub_clause": intent_config["sub_clause"],
                    "description": intent_config["description"],
                    "confidence": "high" if not negative_match else "medium"
                })

        if detected_intents:
            # Return primary intent (first match with highest confidence)
            primary = detected_intents[0]
            logger.info(f"📌 Intent detected: {primary['intent']} ({primary['description']})")
            return primary

        return None

    def _normalize_law_code(self, code: str) -> Optional[str]:
        """Normalize law code variations to standard form (e.g., KDV -> KDVK)"""
        code_upper = code.upper().strip()

        for standard_code, variations in self.LAW_CODES.items():
            if code_upper in [v.upper() for v in variations]:
                return standard_code

        return code_upper if code_upper else None

    # Full law name to code mapping for article matching
    # Includes both proper names and malformed variations found in chunk data
    LAW_NAME_TO_CODE = {
        # VUK - Vergi Usul Kanunu
        "VERGİ USUL KANUNU": "VUK",
        "VERGI USUL KANUNU": "VUK",

        # GVK - Gelir Vergisi Kanunu (+ malformed variations)
        "GELİR VERGİSİ KANUNU": "GVK",
        "GELIR VERGISI KANUNU": "GVK",
        "VERGİSİ KANUNU (G.V.K.)KANUN": "GVK",  # Malformed in chunk data
        "VERGİSİ KANUNU (G.V.K.)": "GVK",       # Malformed variation
        "(G.V.K.)KANUN": "GVK",                 # Short malformed
        "G.V.K.": "GVK",                        # Abbreviation

        # KVK - Kurumlar Vergisi Kanunu
        "KURUMLAR VERGİSİ KANUNU": "KVK",
        "KURUMLAR VERGISI KANUNU": "KVK",

        # KDVK - Katma Değer Vergisi Kanunu
        "KATMA DEĞER VERGİSİ KANUNU": "KDVK",
        "KATMA DEGER VERGISI KANUNU": "KDVK",

        # ÖTVK - Özel Tüketim Vergisi Kanunu
        "ÖZEL TÜKETİM VERGİSİ KANUNU": "ÖTVK",
        "OZEL TUKETIM VERGISI KANUNU": "ÖTVK",

        # MTV - Motorlu Taşıtlar Vergisi Kanunu
        "MOTORLU TAŞITLAR VERGİSİ KANUNU": "MTV",

        # DVK - Damga Vergisi Kanunu
        "DAMGA VERGİSİ KANUNU": "DVK",

        # VİVK - Veraset ve İntikal Vergisi Kanunu
        "VERASET VE İNTİKAL VERGİSİ KANUNU": "VİVK",

        # AATUHK - Amme Alacaklarının Tahsil Usulü Hakkında Kanun
        "AMME ALACAKLARININ TAHSİL USULÜ HAKKINDA KANUN": "AATUHK",

        # HK - Harçlar Kanunu (+ number-based variations)
        "HARÇLAR KANUNU": "HK",
        "HARCLAR KANUNU": "HK",
        "KANUNLAR NO: 492": "HK",  # Malformed in chunk data

        # İYUK - İdari Yargılama Usulü Kanunu
        "İDARİ YARGILAMA USULÜ KANUNU": "İYUK",
        "IDARI YARGILAMA USULU KANUNU": "İYUK",
        "KANUNLAR NO: 2575": "İYUK",  # Malformed variation

        # TTK - Türk Ticaret Kanunu
        "TÜRK TİCARET KANUNU": "TTK",

        # BK - Borçlar Kanunu
        "BORÇLAR KANUNU": "BK",
        "TÜRK BORÇLAR KANUNU": "BK",

        # BELEDİYE - Belediye Gelirleri Kanunu
        "BELEDİYE GELİRLERİ KANUNU": "BGK",
    }

    # Kanun numarası -> Kod mapping (for number-based lookups)
    KANUN_NO_TO_CODE = {
        "213": "VUK",
        "193": "GVK",
        "5520": "KVK",
        "3065": "KDVK",
        "4760": "ÖTVK",
        "492": "HK",
        "488": "DVK",
        "7338": "VİVK",
        "6183": "AATUHK",
        "2577": "İYUK",
        "6102": "TTK",
        "6098": "BK",
    }

    def _law_name_to_code(self, law_name: str) -> Optional[str]:
        """Convert full law name to standard code (e.g., 'VERGİ USUL KANUNU' -> 'VUK')

        Handles:
        - Standard law names: "VERGİ USUL KANUNU" -> "VUK"
        - Malformed names: "VERGİSİ KANUNU (G.V.K.)Kanun" -> "GVK"
        - Number-based: "Kanunlar No: 492" -> "HK"
        - Abbreviations: "G.V.K." -> "GVK"
        """
        if not law_name:
            return None

        name_upper = law_name.upper().strip()

        # Remove common prefixes like "213 SAYILI"
        name_upper = re.sub(r'^\d+\s*SAYILI\s*', '', name_upper)

        # 1. Direct lookup
        if name_upper in self.LAW_NAME_TO_CODE:
            return self.LAW_NAME_TO_CODE[name_upper]

        # 2. Partial match - check if any key is contained in the name
        for full_name, code in self.LAW_NAME_TO_CODE.items():
            if full_name in name_upper:
                return code

        # 3. GVK special patterns (handles malformed "VERGİSİ KANUNU (G.V.K.)Kanun")
        if 'G.V.K' in name_upper or '(GVK)' in name_upper:
            return 'GVK'

        # 4. Number-based lookup (handles "Kanunlar No: 492")
        num_match = re.search(r'(?:NO:|NUMARASI:?)\s*(\d+)', name_upper)
        if num_match:
            kanun_no = num_match.group(1)
            if kanun_no in self.KANUN_NO_TO_CODE:
                return self.KANUN_NO_TO_CODE[kanun_no]

        # 5. Try extracting number from start of name
        start_num_match = re.match(r'^(\d+)\s', name_upper)
        if start_num_match:
            kanun_no = start_num_match.group(1)
            if kanun_no in self.KANUN_NO_TO_CODE:
                return self.KANUN_NO_TO_CODE[kanun_no]

        return None

    def _check_article_match(
        self,
        result: Dict[str, Any],
        target_law: str,
        target_article: str
    ) -> Dict[str, Any]:
        """
        Check if a search result contains the exact target law article.

        Args:
            result: Search result dict
            target_law: Target law code (e.g., "VUK")
            target_article: Target article number (e.g., "19")

        Returns:
            Dict with match_type, match_score, and reason
        """
        source_table = (result.get("source_table") or "").lower()
        metadata = result.get("metadata", {}) or {}
        content = (result.get("content") or "").upper()

        # Check if this is a law article source
        # Supports both old "maddeler" table and new "vergilex_mevzuat_kanunlar_chunks" table
        is_law_chunk = (
            source_table == "maddeler" or
            "kanunlar_chunks" in source_table or
            "mevzuat_chunk" in source_table or
            (result.get("source_type") or "").lower() == "kanun"
        )

        if is_law_chunk:
            # Get law identifier from metadata (supports multiple field names)
            mevzuat_id = (
                metadata.get("mevzuat_id") or
                metadata.get("law_name") or
                metadata.get("kanun_adi") or
                ""
            ).upper()

            # Get article number from metadata (supports multiple field names)
            madde_no = str(
                metadata.get("madde_numarasi") or
                metadata.get("madde_no") or
                metadata.get("article_number") or
                ""
            ).strip()

            # Normalize law identifier to standard code
            # First try direct normalization (for codes like "VUK")
            normalized_mevzuat = self._normalize_law_code(mevzuat_id)

            # If that fails, try full name to code conversion
            if not normalized_mevzuat or normalized_mevzuat == mevzuat_id:
                code_from_name = self._law_name_to_code(mevzuat_id)
                if code_from_name:
                    normalized_mevzuat = code_from_name

            logger.debug(f"Article match check: source={source_table}, law={mevzuat_id}->{normalized_mevzuat}, article={madde_no}, target={target_law} {target_article}")

            # EXACT MATCH: Same law AND same article number
            if normalized_mevzuat == target_law and madde_no == target_article:
                return {
                    "match_type": "exact",
                    "match_score": 1.0,
                    "is_law_text": True,
                    "reason": f"Exact match: {target_law} Madde {target_article}"
                }

            # WRONG ARTICLE: Same law but different article
            if normalized_mevzuat == target_law and madde_no and madde_no != target_article:
                return {
                    "match_type": "wrong_article",
                    "match_score": -0.5,
                    "is_law_text": True,
                    "reason": f"Wrong article: {target_law} Madde {madde_no} (wanted {target_article})"
                }

            # WRONG LAW: Different law
            if normalized_mevzuat and normalized_mevzuat != target_law:
                return {
                    "match_type": "wrong_law",
                    "match_score": -0.8,
                    "is_law_text": True,
                    "reason": f"Wrong law: {normalized_mevzuat} (wanted {target_law})"
                }

        # Check if this is a mevzuat (legislation) source
        if source_table == "mevzuat":
            mevzuat_adi = (metadata.get("mevzuat_adi") or "").upper()
            mevzuat_no = metadata.get("mevzuat_no", "")

            # Check if the content MENTIONS the target article
            article_pattern = rf'\b{target_law}\b.*?\b[Mm]adde\s*{target_article}\b|\b[Mm]adde\s*{target_article}\b.*?\b{target_law}\b'
            if re.search(article_pattern, content, re.IGNORECASE):
                return {
                    "match_type": "mentions",
                    "match_score": 0.3,
                    "is_law_text": False,
                    "reason": f"Mentions {target_law} Madde {target_article} in content"
                }

        # For non-law sources (articles, ozelge, danistay, etc.)
        # Check if they REFERENCE the target article
        article_ref_pattern = rf'\b{target_law}\s*(?:[Mm]adde\s*)?{target_article}\b'
        if re.search(article_ref_pattern, content, re.IGNORECASE):
            return {
                "match_type": "reference",
                "match_score": 0.1,  # Lower score - references don't replace law text
                "is_law_text": False,
                "reason": f"References {target_law} Madde {target_article}"
            }

        # Check for WRONG law references (citing other laws)
        for law_code in self.LAW_CODES.keys():
            if law_code != target_law:
                wrong_law_pattern = rf'\b{law_code}\s*(?:[Mm]adde\s*)?\d+'
                if re.search(wrong_law_pattern, content, re.IGNORECASE):
                    return {
                        "match_type": "wrong_law_reference",
                        "match_score": -0.3,
                        "is_law_text": False,
                        "reason": f"References different law: {law_code}"
                    }

        # No match found
        return {
            "match_type": "no_match",
            "match_score": 0.0,
            "is_law_text": False,
            "reason": "No article match found"
        }

    def _calculate_article_boost(
        self,
        result: Dict[str, Any],
        article_query: Optional[Dict[str, Any]]
    ) -> Tuple[float, Dict[str, Any]]:
        """
        Calculate score boost/penalty based on article anchoring rules.

        When user asks about a specific article (VUK 19), we:
        1. BOOST results that contain the exact article text
        2. PENALIZE results that cite wrong articles or wrong laws
        3. Mark results so LLM knows which are authoritative

        Args:
            result: Search result dict
            article_query: Detected article query (from _detect_article_query)

        Returns:
            Tuple of (boost_value, match_details)
        """
        if not article_query:
            return 0.0, {"article_anchoring": "not_applicable"}

        target_law = article_query["law_code"]
        target_article = article_query["article_number"]
        intent = article_query.get("intent")

        match_result = self._check_article_match(result, target_law, target_article)

        # Calculate boost based on match type
        match_type = match_result["match_type"]
        base_score = match_result["match_score"]

        # Apply boost/penalty
        if match_type == "exact":
            # EXACT MATCH: Strong boost for the actual law text
            boost = 0.5
        elif match_type == "wrong_article":
            # WRONG ARTICLE: Penalize heavily
            boost = -0.3
        elif match_type == "wrong_law":
            # WRONG LAW: Penalize most heavily
            boost = -0.4
        elif match_type == "mentions":
            # MENTIONS: Small positive boost
            boost = 0.1
        elif match_type == "reference":
            # REFERENCE: Very small boost (secondary source)
            boost = 0.05
        elif match_type == "wrong_law_reference":
            # WRONG LAW REFERENCE: Small penalty
            boost = -0.15
        else:
            # NO MATCH: Slight penalty for irrelevant content
            boost = -0.05

        # Intent-based sub-clause filtering (e.g., KDVK 29 indirim vs iade)
        intent_penalty = 0.0
        intent_info = None
        if intent and intent.get("intent"):
            intent_penalty, intent_info = self._apply_intent_filter(result, intent)
            boost += intent_penalty

        details = {
            "article_anchoring": match_type,
            "article_boost": round(boost * 100, 2),
            "is_law_text": match_result.get("is_law_text", False),
            "match_reason": match_result.get("reason", ""),
            "target": f"{target_law} Madde {target_article}"
        }

        if intent_info:
            details["intent_filter"] = intent_info

        return boost, details

    # Aggressive content patterns that indicate wrong intent (for hard filtering)
    # These patterns are strong signals of off-topic content
    INTENT_HARD_FILTERS = {
        "indirim": {
            # When asking about "indirim", heavily penalize these iade-specific patterns
            "hard_negative": [
                # İade kavramları
                "nakden iade",
                "mahsup yoluyla iade",
                "iade edilir",
                "iade talep",
                "iade hakkı",
                "geri ödeme",
                # KDVK 29/2 references (iade fıkrası)
                "29/2",
                "29 uncu maddesinin 2",
                "29. maddesinin 2",
                "ikinci fıkra",
                "2. fıkra",
                "2 nci fıkra",
                # Kamu istisnaları (iade bağlamı)
                "%51",
                "kamuya ait",
                # Tevkifat (alakasız - farklı konu)
                "tevkifat",
                "tevkifat oranı",
                "tevkifat uygulaması",
                "kdv tevkifatı",
                "kısmi tevkifat",
                "tam tevkifat",
                # İhracat/özel matrah (iade bağlamı)
                "ihracat istisnası",
                "özel matrah",
            ],
            "hard_penalty": -0.5  # Heavy penalty for off-topic content in indirim query
        },
        "iade": {
            # When asking about "iade", heavily penalize these indirim-only patterns
            "hard_negative": [
                "indirim hakkı doğar",
                "indirim konusu yapılır",
                "indirilecek kdv",
                "29/1",
                "29 uncu maddesinin 1",
                "birinci fıkra",
                "1. fıkra",
                # Tevkifat (alakasız - farklı konu)
                "tevkifat",
                "tevkifat oranı",
            ],
            "hard_penalty": -0.5
        }
    }

    def _apply_intent_filter(
        self,
        result: Dict[str, Any],
        intent: Dict[str, Any]
    ) -> Tuple[float, Optional[Dict[str, Any]]]:
        """
        Apply intent-based filtering to boost/penalize results based on query intent.

        For example, if user asks about "KDVK 29 indirim", we:
        - Boost content about indirim (29/1 context)
        - HEAVILY penalize content about iade (29/2 context)

        Args:
            result: Search result dict
            intent: Intent info from _detect_query_intent

        Returns:
            Tuple of (penalty_value, details)
        """
        intent_name = intent.get("intent")
        if not intent_name or intent_name not in self.INTENT_KEYWORDS:
            return 0.0, None

        content = (result.get("content") or "").lower()
        title = (result.get("title") or "").lower()
        text = f"{title} {content}"

        intent_config = self.INTENT_KEYWORDS[intent_name]
        positive_keywords = intent_config["positive"]
        negative_keywords = intent_config["negative"]

        # Count keyword occurrences
        positive_count = sum(1 for kw in positive_keywords if kw in text)
        negative_count = sum(1 for kw in negative_keywords if kw in text)

        # Calculate base intent alignment score
        penalty = 0.0
        alignment = "neutral"
        hard_filtered = False
        hard_match = None

        # AGGRESSIVE HARD FILTERING: Check for strong off-topic signals
        if intent_name in self.INTENT_HARD_FILTERS:
            hard_config = self.INTENT_HARD_FILTERS[intent_name]
            for pattern in hard_config["hard_negative"]:
                if pattern.lower() in text:
                    penalty = hard_config["hard_penalty"]
                    alignment = "hard_filtered"
                    hard_filtered = True
                    hard_match = pattern
                    logger.info(f"📌 HARD FILTER: '{pattern}' found in result for intent={intent_name}, penalty={penalty}")
                    break

        # If not hard-filtered, apply soft filtering
        if not hard_filtered:
            if negative_count > positive_count:
                # Content talks more about opposite concept - penalize
                penalty = -0.25
                alignment = "misaligned"
                logger.debug(f"📌 Intent filter: {intent_name} misaligned (pos={positive_count}, neg={negative_count})")
            elif positive_count > 0 and negative_count == 0:
                # Content aligns with intent - boost
                penalty = 0.15
                alignment = "aligned"
            elif positive_count > 0 and negative_count > 0:
                # Mixed content - slight penalty
                penalty = -0.05
                alignment = "mixed"

        return penalty, {
            "intent": intent_name,
            "alignment": alignment,
            "positive_matches": positive_count,
            "negative_matches": negative_count,
            "hard_filtered": hard_filtered,
            "hard_match": hard_match,
            "penalty": round(penalty * 100, 2)
        }

    async def _inject_target_article(
        self,
        raw_results: List[Dict[str, Any]],
        article_query: Dict[str, Any],
        query_embedding: List[float]
    ) -> bool:
        """
        Directly fetch and inject the target article into search results.

        When user asks about a specific article (VUK 8, KDVK 29), we MUST include
        the actual law text even if vector similarity didn't rank it high enough.

        Args:
            raw_results: Current search results (will be modified in place)
            article_query: Detected article query info
            query_embedding: Query embedding for similarity calculation

        Returns:
            True if article was injected, False otherwise
        """
        if not article_query:
            return False

        target_law = article_query["law_code"]
        target_article = article_query["article_number"]

        # Check if target article already in results
        existing_ids = {r["id"] for r in raw_results}

        try:
            pool = await get_db()

            # Build law name patterns to search for
            law_name_patterns = []
            if target_law in self.LAW_CODES:
                law_name_patterns.extend(self.LAW_CODES[target_law])

            # Also add reverse lookup from LAW_NAME_TO_CODE
            for full_name, code in self.LAW_NAME_TO_CODE.items():
                if code == target_law:
                    law_name_patterns.append(full_name)

            # Create SQL pattern for law name matching
            law_patterns_sql = " OR ".join([
                f"metadata->>'law_name' ILIKE '%{p}%'" for p in law_name_patterns if p
            ])

            if not law_patterns_sql:
                law_patterns_sql = f"metadata->>'law_name' ILIKE '%{target_law}%'"

            # Query for exact article match
            query_sql = f"""
                SELECT id::text, content, source_table, source_type, source_id, metadata,
                       1 - (embedding <=> $1::vector) as similarity_score
                FROM unified_embeddings
                WHERE (
                    source_table LIKE '%kanun%chunks%'
                    OR source_table = 'maddeler'
                    OR source_type = 'kanun'
                )
                AND ({law_patterns_sql})
                AND (
                    metadata->>'article_number' = $2
                    OR metadata->>'madde_numarasi' = $2
                    OR metadata->>'madde_no' = $2
                )
                AND embedding IS NOT NULL
                ORDER BY similarity_score DESC
                LIMIT 3
            """

            # Execute query
            embedding_str = f"[{','.join(map(str, query_embedding))}]"
            rows = await pool.fetch(query_sql, embedding_str, target_article)

            injected_count = 0
            for row in rows:
                row_id = str(row['id'])
                if row_id not in existing_ids:
                    # Parse metadata
                    metadata = row['metadata']
                    if isinstance(metadata, str):
                        try:
                            metadata = json.loads(metadata)
                        except:
                            metadata = {}

                    # Add to results
                    raw_results.insert(0, {
                        "id": row_id,
                        "content": row['content'],
                        "source_table": row['source_table'],
                        "source_type": row['source_type'],
                        "source_id": row['source_id'],
                        "metadata": metadata,
                        "similarity_score": float(row['similarity_score']),
                        "search_source": "article_injection"
                    })
                    existing_ids.add(row_id)
                    injected_count += 1
                    logger.debug(f"Injected article: {row['source_table']} id={row_id}")

            return injected_count > 0

        except Exception as e:
            logger.error(f"Error injecting target article: {e}")
            return False

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

    # ========================================================================
    # RETRIEVAL-LEVEL QUALITY PENALTIES
    # Applied during search scoring to filter low-quality chunks BEFORE ranking
    # Configurable via database settings (ragSettings.penalties.*)
    # ========================================================================

    # Default penalty weights (can be overridden via settings)
    DEFAULT_PENALTY_CONFIG = {
        "temporal_penalty_weight": -0.15,  # Year-specific content for general question
        "toc_penalty_weight": -0.25,       # Table of contents / header-only content
        "toc_score_threshold": 0.5,        # TOC score threshold to apply penalty
        "toc_min_pattern_count": 2,        # Min patterns to flag as TOC
        "table_parser_enabled": True,      # Enable HTML table preprocessing
        "config_version": "v1.0.0"         # Track config version for debugging
    }

    # Instance-level penalty config (loaded from DB)
    _penalty_config: Dict[str, Any] = None
    _penalty_config_loaded: bool = False

    async def _load_penalty_config(self) -> Dict[str, Any]:
        """Load penalty configuration from database settings.

        Falls back to DEFAULT_PENALTY_CONFIG if not configured.
        Config keys: ragSettings.penalties.*
        """
        if self._penalty_config_loaded and self._penalty_config:
            return self._penalty_config

        try:
            pool = await get_db()

            # Load penalty settings from database
            rows = await pool.fetch("""
                SELECT key, value FROM settings
                WHERE key LIKE 'ragSettings.penalties.%'
            """)

            config = dict(self.DEFAULT_PENALTY_CONFIG)  # Start with defaults

            for row in rows:
                key = row['key'].replace('ragSettings.penalties.', '')
                value = row['value']

                # Parse numeric values
                if key in ['temporal_penalty_weight', 'toc_penalty_weight', 'toc_score_threshold']:
                    try:
                        config[key] = float(value)
                    except (ValueError, TypeError):
                        pass
                elif key in ['toc_min_pattern_count']:
                    try:
                        config[key] = int(value)
                    except (ValueError, TypeError):
                        pass
                elif key == 'table_parser_enabled':
                    config[key] = value.lower() in ('true', '1', 'yes')
                elif key == 'config_version':
                    config[key] = value

            self._penalty_config = config
            self._penalty_config_loaded = True
            logger.info(f"Penalty config loaded: {config}")
            return config

        except Exception as e:
            logger.warning(f"Failed to load penalty config, using defaults: {e}")
            self._penalty_config = dict(self.DEFAULT_PENALTY_CONFIG)
            self._penalty_config_loaded = True
            return self._penalty_config

    def get_penalty_config_sync(self) -> Dict[str, Any]:
        """Get penalty config synchronously (for non-async contexts).
        Returns cached config or defaults."""
        if self._penalty_config:
            return self._penalty_config
        return dict(self.DEFAULT_PENALTY_CONFIG)

    # Year pattern for temporal detection
    _YEAR_PATTERN = re.compile(r'\b(19|20)\d{2}\b')
    _YEAR_CONTEXT_PATTERNS = [
        re.compile(r'\b(19|20)\d{2}\s*yılı?\s*(için|içinde|nda|nde|dan|den|itibaren)', re.IGNORECASE),
        re.compile(r'\b(19|20)\d{2}\s*yılı\b', re.IGNORECASE),
        re.compile(r'\b(19|20)\d{2}\s*(senesinde|senesi)', re.IGNORECASE),
    ]
    _TEMPORAL_QUESTION_INDICATORS = [
        re.compile(r'\bhangi\s+yıl\b', re.IGNORECASE),
        re.compile(r'\b\d{4}\s*yılı\b', re.IGNORECASE),
        re.compile(r'\bbu\s+yıl\b', re.IGNORECASE),
        re.compile(r'\bgeçen\s+yıl\b', re.IGNORECASE),
        re.compile(r'\bgelecek\s+yıl\b', re.IGNORECASE),
        re.compile(r'\b(19|20)\d{2}\b'),  # Year in question
    ]

    # TOC detection patterns
    _TOC_PATTERNS = [
        # Structure indicators
        (re.compile(r'^\d+\.\s*[A-ZÜÖÇŞĞİ]', re.MULTILINE), "numaralı başlık"),
        (re.compile(r'^\d+\.\d+\s+[A-ZÜÖÇŞĞİ]', re.MULTILINE), "bölüm numarası"),
        (re.compile(r'^[a-zıöüçşğ]\)\s+', re.MULTILINE), "harf listesi"),
        (re.compile(r'^-\s+[A-ZÜÖÇŞĞİ]', re.MULTILINE), "tire listesi"),
        # Meta indicators
        (re.compile(r'içindekiler\b', re.IGNORECASE), "içindekiler"),
        (re.compile(r'bkz\.\s*', re.IGNORECASE), "bakınız referansı"),
        (re.compile(r'sayfa\s*\d+', re.IGNORECASE), "sayfa referansı"),
        (re.compile(r'(bölüm|kısım)\s*\d+', re.IGNORECASE), "bölüm referansı"),
        # Dot sequences (table of contents formatting)
        (re.compile(r'\.{5,}'), "nokta dizisi"),
        (re.compile(r'…{3,}'), "ellipsis dizisi"),
    ]

    # Verdict patterns (chunks with these are valuable)
    _VERDICT_PATTERNS = [
        re.compile(r'mümkündür', re.IGNORECASE),
        re.compile(r'mümkün\s+değildir', re.IGNORECASE),
        re.compile(r'uygundur', re.IGNORECASE),
        re.compile(r'uygun\s+değildir', re.IGNORECASE),
        re.compile(r'gerekmektedir', re.IGNORECASE),
        re.compile(r'gerekmemektedir', re.IGNORECASE),
        re.compile(r'zorunludur', re.IGNORECASE),
        re.compile(r'zorunlu\s+değildir', re.IGNORECASE),
        re.compile(r'yeterlidir', re.IGNORECASE),
        re.compile(r'yapılmalıdır', re.IGNORECASE),
        re.compile(r'bulunmaktadır', re.IGNORECASE),
    ]

    # ========================================================================
    # METADATA QUALITY SCORING
    # Smart algorithm to boost results with complete, high-quality metadata
    # Helps citation display show meaningful information
    # ========================================================================

    # Required metadata fields by source table type (for quality scoring)
    METADATA_QUALITY_FIELDS = {
        'ozelge': {
            'required': ['daire', 'tarih', 'sayisirano'],
            'optional': ['konusu', 'makam', 'kurum'],
            'title_fields': ['konusu', 'baslik']
        },
        'danistaykararlari': {
            'required': ['daire', 'tarih', 'esasno', 'kararno'],
            'optional': ['konusu'],
            'title_fields': ['konusu', 'baslik']
        },
        'sorucevap': {
            'required': ['soru'],
            'optional': ['cevap', 'donemi'],
            'title_fields': ['soru']
        },
        'makale': {
            'required': ['baslik', 'yazar'],
            'optional': ['tarih', 'dergi'],
            'title_fields': ['baslik']
        },
        'hukdkk': {
            'required': ['tarih'],
            'optional': ['genelsirano', 'yayinsirano', 'ozeti', 'gecerlilik'],
            'title_fields': ['ozeti', 'baslik']
        },
        'gib_sirkuler': {
            'required': ['title'],
            'optional': ['category', 'category_tr', 'crawled_at'],
            'title_fields': ['title']
        },
        'default': {
            'required': ['tarih'],
            'optional': ['baslik', 'yazar', 'dergi', 'daire', 'konusu'],
            'title_fields': ['baslik', 'konusu', 'title']
        }
    }

    # Metadata boost weights
    METADATA_BOOST_CONFIG = {
        'max_boost': 0.15,           # Maximum metadata quality boost
        'required_field_weight': 0.6, # Weight for required fields
        'optional_field_weight': 0.3, # Weight for optional fields
        'title_quality_weight': 0.1,  # Weight for title quality
        'min_title_length': 10,       # Minimum meaningful title length
        'ideal_title_length': 50,     # Ideal title length
    }

    def _get_metadata_quality_config(self, source_table: str) -> Dict[str, Any]:
        """Get metadata quality configuration for a source table"""
        table_lower = (source_table or '').lower()

        # Remove csv_ prefix if present
        if table_lower.startswith('csv_'):
            table_lower = table_lower[4:]

        # Remove year suffixes (e.g., makale_arsiv_2021 -> makale)
        for suffix in ['_arsiv_2021', '_arsiv_2022', '_arsiv_2023', '_arsiv_2024', '_arsiv_2025']:
            if table_lower.endswith(suffix.replace('_', '')):
                table_lower = table_lower.replace(suffix.replace('_', ''), '')

        # Try exact match first
        if table_lower in self.METADATA_QUALITY_FIELDS:
            return self.METADATA_QUALITY_FIELDS[table_lower]

        # Try partial match
        for key in self.METADATA_QUALITY_FIELDS:
            if key in table_lower or table_lower in key:
                return self.METADATA_QUALITY_FIELDS[key]

        # Default config
        return self.METADATA_QUALITY_FIELDS['default']

    def _calculate_metadata_quality_score(
        self,
        metadata: Optional[Dict[str, Any]],
        source_table: str,
        title: Optional[str] = None
    ) -> Tuple[float, Dict[str, Any]]:
        """
        Calculate metadata quality score for ranking boost.

        Higher quality metadata = better citation display = higher ranking

        Args:
            metadata: Chunk metadata dictionary
            source_table: Source table name
            title: Extracted title (if available)

        Returns:
            (boost_score, quality_details)
            - boost_score: 0.0 to max_boost (positive = increase score)
            - quality_details: Dict with breakdown for debugging
        """
        config = self._get_metadata_quality_config(source_table)
        boost_config = self.METADATA_BOOST_CONFIG

        details = {
            'required_score': 0.0,
            'optional_score': 0.0,
            'title_score': 0.0,
            'total_boost': 0.0,
            'missing_required': [],
            'present_optional': [],
            'title_quality': 'none'
        }

        if not metadata:
            return 0.0, details

        # 1. Score required fields (0.0 to 1.0)
        required_fields = config.get('required', [])
        if required_fields:
            present_required = 0
            for field in required_fields:
                # Check both snake_case and camelCase versions
                field_variants = [field, field.replace('_', '')]
                for variant in field_variants:
                    if variant in metadata and metadata[variant]:
                        value = str(metadata[variant]).strip()
                        if value and len(value) > 1:  # Non-empty value
                            present_required += 1
                            break
                else:
                    details['missing_required'].append(field)

            details['required_score'] = present_required / len(required_fields)

        # 2. Score optional fields (0.0 to 1.0)
        optional_fields = config.get('optional', [])
        if optional_fields:
            present_optional = 0
            for field in optional_fields:
                field_variants = [field, field.replace('_', '')]
                for variant in field_variants:
                    if variant in metadata and metadata[variant]:
                        value = str(metadata[variant]).strip()
                        if value and len(value) > 1:
                            present_optional += 1
                            details['present_optional'].append(field)
                            break

            details['optional_score'] = present_optional / len(optional_fields)

        # 3. Score title quality (0.0 to 1.0)
        title_fields = config.get('title_fields', [])
        best_title = title or ''

        # Try to find best title from metadata
        for field in title_fields:
            field_variants = [field, field.replace('_', '')]
            for variant in field_variants:
                if variant in metadata and metadata[variant]:
                    candidate = str(metadata[variant]).strip()
                    if len(candidate) > len(best_title):
                        best_title = candidate

        if best_title:
            title_len = len(best_title)
            min_len = boost_config['min_title_length']
            ideal_len = boost_config['ideal_title_length']

            if title_len < min_len:
                details['title_score'] = 0.2
                details['title_quality'] = 'too_short'
            elif title_len >= ideal_len:
                details['title_score'] = 1.0
                details['title_quality'] = 'excellent'
            else:
                # Linear interpolation between min and ideal
                details['title_score'] = 0.3 + 0.7 * (title_len - min_len) / (ideal_len - min_len)
                details['title_quality'] = 'good' if details['title_score'] > 0.7 else 'moderate'

        # 4. Calculate weighted total boost
        max_boost = boost_config['max_boost']
        required_weight = boost_config['required_field_weight']
        optional_weight = boost_config['optional_field_weight']
        title_weight = boost_config['title_quality_weight']

        weighted_score = (
            details['required_score'] * required_weight +
            details['optional_score'] * optional_weight +
            details['title_score'] * title_weight
        )

        details['total_boost'] = min(weighted_score * max_boost, max_boost)

        return details['total_boost'], details

    def _calculate_retrieval_penalties(
        self,
        query: str,
        content: str,
        metadata: Optional[Dict[str, Any]] = None,
        config: Optional[Dict[str, Any]] = None
    ) -> Tuple[float, Dict[str, Any]]:
        """
        Calculate retrieval-level penalties for a chunk.

        Args:
            query: User question
            content: Chunk content
            metadata: Optional chunk metadata
            config: Penalty configuration (from _load_penalty_config or defaults)

        Returns:
            (total_penalty, penalty_details)
            - total_penalty: 0.0 to -0.50 (negative = reduce score)
            - penalty_details: Dict with breakdown for debugging
        """
        # Use provided config or get from sync cache/defaults
        cfg = config or self.get_penalty_config_sync()

        total_penalty = 0.0
        details = {
            "temporal_penalty": 0.0,
            "toc_penalty": 0.0,
            "temporal_reason": None,
            "toc_reason": None,
            "has_verdict": False,
            "config_version": cfg.get("config_version", "unknown")
        }

        if not content:
            return 0.0, details

        # 1. TEMPORAL MISMATCH PENALTY
        temporal_weight = cfg.get("temporal_penalty_weight", -0.15)
        temporal_penalty, temporal_reason = self._detect_temporal_mismatch_retrieval(
            query, content, penalty_weight=temporal_weight
        )
        if temporal_penalty < 0:
            total_penalty += temporal_penalty
            details["temporal_penalty"] = temporal_penalty
            details["temporal_reason"] = temporal_reason

        # 2. TOC CONTENT PENALTY
        toc_weight = cfg.get("toc_penalty_weight", -0.25)
        toc_threshold = cfg.get("toc_score_threshold", 0.5)
        toc_min_patterns = cfg.get("toc_min_pattern_count", 2)
        toc_penalty, toc_reason, has_verdict = self._detect_toc_content_retrieval(
            content,
            penalty_weight=toc_weight,
            score_threshold=toc_threshold,
            min_pattern_count=toc_min_patterns
        )
        if toc_penalty < 0:
            total_penalty += toc_penalty
            details["toc_penalty"] = toc_penalty
            details["toc_reason"] = toc_reason
        details["has_verdict"] = has_verdict

        return total_penalty, details

    def _detect_temporal_mismatch_retrieval(
        self,
        query: str,
        content: str,
        penalty_weight: float = -0.15
    ) -> Tuple[float, Optional[str]]:
        """
        Detect temporal mismatch at retrieval level.

        RULE: If question has no year but content has year-specific context,
        apply penalty to reduce ranking of potentially outdated/mismatched content.

        Args:
            query: User question
            content: Chunk content
            penalty_weight: Configurable penalty weight (default: -0.15)

        Returns:
            (penalty, reason)
            - penalty: 0.0 or penalty_weight
        """
        query_lower = query.lower()

        # Check if question already mentions a year
        question_has_temporal = False
        for pattern in self._TEMPORAL_QUESTION_INDICATORS:
            if pattern.search(query_lower):
                question_has_temporal = True
                break

        if question_has_temporal:
            # Question is already time-specific, no mismatch
            return 0.0, None

        # Check if content has year-specific context
        content_lower = content.lower()
        for pattern in self._YEAR_CONTEXT_PATTERNS:
            match = pattern.search(content_lower)
            if match:
                # Extract the year
                year_match = self._YEAR_PATTERN.search(match.group(0))
                if year_match:
                    detected_year = year_match.group(0)
                    return penalty_weight, f"İçerik '{detected_year}' yılına özgü, soru genel"

        return 0.0, None

    def _detect_toc_content_retrieval(
        self,
        content: str,
        penalty_weight: float = -0.25,
        score_threshold: float = 0.5,
        min_pattern_count: int = 2
    ) -> Tuple[float, Optional[str], bool]:
        """
        Detect TOC (Table of Contents) or header-only content at retrieval level.

        TOC chunks are navigation/index content without actual legal substance.
        They should be penalized heavily to improve retrieval quality.

        Args:
            content: Chunk content
            penalty_weight: Configurable penalty weight (default: -0.25)
            score_threshold: TOC score threshold to apply penalty (default: 0.5)
            min_pattern_count: Minimum patterns to flag as TOC (default: 2)

        Returns:
            (penalty, reason, has_verdict)
            - penalty: 0.0 or penalty_weight
            - has_verdict: True if content has verdict patterns
        """
        if not content:
            return 0.0, None, False

        content_lower = content.lower()
        word_count = len(content.split())

        # Check for verdict patterns (valuable content)
        has_verdict = False
        for pattern in self._VERDICT_PATTERNS:
            if pattern.search(content_lower):
                has_verdict = True
                break

        # Count TOC pattern matches
        matched_patterns = []
        for pattern, pattern_name in self._TOC_PATTERNS:
            if pattern.search(content):
                matched_patterns.append(pattern_name)

        # TOC detection heuristics:
        # - Need min_pattern_count+ patterns to flag as TOC
        # - Very short content (< 50 words) with TOC patterns is likely TOC
        # - No verdict sentence increases TOC likelihood
        toc_score = 0.0

        if len(matched_patterns) >= min_pattern_count:
            toc_score += 0.4

        if word_count < 50 and len(matched_patterns) >= 1:
            toc_score += 0.3

        if not has_verdict and len(matched_patterns) >= 1:
            toc_score += 0.3

        # Apply penalty if TOC score is high enough
        if toc_score >= score_threshold:
            reason = f"TOC içeriği: {', '.join(matched_patterns[:3])}"
            return penalty_weight, reason, has_verdict

        return 0.0, None, has_verdict

    def parse_html_tables(self, content: str) -> List[Dict[str, Any]]:
        """
        Deterministic HTML table parser.

        Extracts tables from HTML content and converts to structured data.
        This is used for preprocessing content before sending to LLM,
        ensuring consistent table parsing regardless of LLM behavior.

        Returns:
            List of parsed tables with headers and rows
        """
        tables = []

        # Find all <table> elements
        table_pattern = re.compile(r'<table[^>]*>(.*?)</table>', re.DOTALL | re.IGNORECASE)

        for table_match in table_pattern.finditer(content):
            table_html = table_match.group(1)
            parsed_table = {
                "headers": [],
                "rows": [],
                "raw_html": table_match.group(0)
            }

            # Extract headers from <th> or first <tr> with <td>
            header_pattern = re.compile(r'<th[^>]*>(.*?)</th>', re.DOTALL | re.IGNORECASE)
            headers = [self._clean_html_text(h.group(1)) for h in header_pattern.finditer(table_html)]

            if headers:
                parsed_table["headers"] = headers
            else:
                # Try first row as headers
                first_row = re.search(r'<tr[^>]*>(.*?)</tr>', table_html, re.DOTALL | re.IGNORECASE)
                if first_row:
                    td_pattern = re.compile(r'<td[^>]*>(.*?)</td>', re.DOTALL | re.IGNORECASE)
                    headers = [self._clean_html_text(td.group(1)) for td in td_pattern.finditer(first_row.group(1))]
                    parsed_table["headers"] = headers

            # Extract data rows
            row_pattern = re.compile(r'<tr[^>]*>(.*?)</tr>', re.DOTALL | re.IGNORECASE)
            td_pattern = re.compile(r'<td[^>]*>(.*?)</td>', re.DOTALL | re.IGNORECASE)

            for row_match in row_pattern.finditer(table_html):
                cells = [self._clean_html_text(td.group(1)) for td in td_pattern.finditer(row_match.group(1))]
                if cells:
                    # Skip if this is the header row
                    if cells == parsed_table["headers"]:
                        continue
                    parsed_table["rows"].append(cells)

            if parsed_table["rows"] or parsed_table["headers"]:
                tables.append(parsed_table)

        return tables

    def _clean_html_text(self, html: str) -> str:
        """Clean HTML tags and entities from text"""
        # Remove HTML tags
        text = re.sub(r'<[^>]+>', '', html)
        # Decode common entities
        text = text.replace('&nbsp;', ' ')
        text = text.replace('&amp;', '&')
        text = text.replace('&lt;', '<')
        text = text.replace('&gt;', '>')
        text = text.replace('&quot;', '"')
        text = text.replace('&#39;', "'")
        # Clean whitespace
        text = re.sub(r'\s+', ' ', text).strip()
        return text

    def format_parsed_tables(self, tables: List[Dict[str, Any]]) -> str:
        """
        Format parsed tables into readable text for LLM context.

        Converts structured table data into a consistent text representation
        that can be included in RAG context.
        """
        if not tables:
            return ""

        formatted_parts = []

        for i, table in enumerate(tables, 1):
            lines = [f"\n[Tablo {i}]"]

            # Add headers
            if table["headers"]:
                lines.append("| " + " | ".join(table["headers"]) + " |")
                lines.append("|" + "|".join(["---"] * len(table["headers"])) + "|")

            # Add rows
            for row in table["rows"]:
                if row:
                    lines.append("| " + " | ".join(str(cell) for cell in row) + " |")

            formatted_parts.append("\n".join(lines))

        return "\n".join(formatted_parts)

    def preprocess_content_for_rag(self, content: str) -> str:
        """
        Preprocess content before sending to RAG/LLM.

        1. Parse HTML tables deterministically
        2. Replace table HTML with formatted text
        3. Clean up other HTML artifacts

        This ensures consistent content regardless of LLM table parsing ability.
        """
        if not content:
            return content

        # Parse and format tables
        tables = self.parse_html_tables(content)
        if tables:
            formatted_tables = self.format_parsed_tables(tables)

            # Replace original table HTML with formatted version
            for table in tables:
                content = content.replace(table["raw_html"], "")

            # Append formatted tables at the end
            content = content.strip() + "\n" + formatted_tables

        # Clean remaining HTML
        content = re.sub(r'<br\s*/?>', '\n', content)
        content = re.sub(r'</?(?:p|div|span|strong|em|b|i|u)>', '', content)
        content = self._clean_html_text(content)

        return content

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
        use_cache: bool = True,
        debug: bool = False
    ) -> Dict[str, Any]:
        """
        Full semantic search pipeline with all features

        Features:
        1. Multi-source search (unified_embeddings, document_embeddings)
        2. Source table weights (user configurable per table)
        3. Hybrid scoring (semantic + keyword boost)
        4. Content formatting for Turkish legal/tax content
        5. Keyword search fallback when embedding fails

        Args:
            query: Search query text
            limit: Maximum results (default from settings)
            use_cache: Use Redis cache for results
            debug: Include detailed debug info in response (_debug key)

        Debug Response (when debug=True):
            _debug: {
                "penalty_config": {...},  # Current penalty weights
                "penalty_stats": {...},   # Applied penalty counts
                "embedding_provider": "openai|gemini",
                "query_embedding_dims": 1536,
                "raw_results_count": N,
                "filtered_count": N,
                "top_penalties": [...]   # Top 5 penalized results
            }

        Performance target: <300ms for cached queries, <500ms for new queries
        """
        start_time = datetime.now()
        timings = {}
        use_keyword_fallback = False

        # Load settings
        settings = await self.get_rag_settings()
        limit = limit or settings.max_results

        # Load penalty configuration (from DB or defaults)
        penalty_config = await self._load_penalty_config()

        # === ARTICLE ANCHORING: Detect if query asks about specific law article ===
        article_query = self._detect_article_query(query)
        article_anchoring_enabled = article_query is not None

        if article_anchoring_enabled:
            intent_info = article_query.get('intent', {})
            intent_str = f" | Intent: {intent_info.get('intent', 'none')}" if intent_info else ""
            logger.info(f"🎯 Article-specific query: {article_query['law_code']} Madde {article_query['article_number']}{intent_str}")

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

            # === ARTICLE INJECTION: Ensure target article is included when detected ===
            # When user asks for specific article (VUK 8, KDVK 29), inject it directly
            if article_anchoring_enabled and not use_keyword_fallback:
                article_inject_start = datetime.now()
                injected = await self._inject_target_article(
                    raw_results,
                    article_query,
                    query_embedding
                )
                timings["article_inject_ms"] = (datetime.now() - article_inject_start).total_seconds() * 1000
                if injected:
                    logger.info(f"🎯 Injected target article: {article_query['law_code']} Madde {article_query['article_number']}")

            # Apply hybrid scoring with table weights and retrieval-level penalties
            score_start = datetime.now()
            scored_results = []
            penalty_stats = {"temporal_count": 0, "toc_count": 0}

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

                # Calculate weighted similarity with additive boost for high-priority sources
                # Only sources EXPLICITLY set with weight >= 1.0 in settings get the boost
                similarity = result["similarity_score"]
                source_table = result["source_table"]
                base_weighted = similarity * source_priority * table_weight

                # Additive boost for priority sources that are EXPLICITLY in settings with weight >= 1.0
                priority_boost = 0.0
                explicit_weight = settings.source_table_weights.get(source_table) if settings.source_table_weights else None
                if explicit_weight is not None and explicit_weight >= 1.0:
                    priority_boost = 0.25  # 25% boost for explicitly configured priority sources

                weighted_similarity = base_weighted + priority_boost

                # === RETRIEVAL-LEVEL QUALITY PENALTIES ===
                # Apply temporal mismatch and TOC content penalties (with loaded config)
                retrieval_penalty, penalty_details = self._calculate_retrieval_penalties(
                    query,
                    result["content"] or "",
                    result.get("metadata"),
                    config=penalty_config
                )

                # Track penalty statistics
                if penalty_details["temporal_penalty"] < 0:
                    penalty_stats["temporal_count"] += 1
                if penalty_details["toc_penalty"] < 0:
                    penalty_stats["toc_count"] += 1

                # === METADATA QUALITY BOOST ===
                # Better metadata = better citation display = higher ranking
                metadata_boost, metadata_details = self._calculate_metadata_quality_score(
                    result.get("metadata"),
                    result["source_table"],
                    title
                )

                # Track metadata quality statistics
                if "metadata_quality_count" not in penalty_stats:
                    penalty_stats["metadata_quality_count"] = 0
                    penalty_stats["metadata_boost_total"] = 0.0
                if metadata_boost > 0:
                    penalty_stats["metadata_quality_count"] += 1
                    penalty_stats["metadata_boost_total"] += metadata_boost

                # === ARTICLE ANCHORING BOOST/PENALTY ===
                # When query asks about specific article, boost exact matches, penalize wrong articles
                article_boost = 0.0
                article_details = {"article_anchoring": "not_applicable"}

                if article_anchoring_enabled:
                    article_boost, article_details = self._calculate_article_boost(result, article_query)

                    # Track article anchoring statistics
                    if "article_exact_count" not in penalty_stats:
                        penalty_stats["article_exact_count"] = 0
                        penalty_stats["article_wrong_count"] = 0
                        penalty_stats["article_reference_count"] = 0

                    if article_details.get("article_anchoring") == "exact":
                        penalty_stats["article_exact_count"] += 1
                    elif article_details.get("article_anchoring") in ["wrong_article", "wrong_law", "wrong_law_reference"]:
                        penalty_stats["article_wrong_count"] += 1
                    elif article_details.get("article_anchoring") == "reference":
                        penalty_stats["article_reference_count"] += 1

                # Calculate final score (includes keyword boost, penalties, metadata boost, AND article boost)
                # Penalty is negative, metadata_boost and article_boost can be positive or negative
                final_score = max(0, weighted_similarity + keyword_boost + retrieval_penalty + metadata_boost + article_boost)

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
                    "metadata_boost": round(metadata_boost * 100, 2),
                    "article_boost": round(article_boost * 100, 2),
                    "source_priority": round(source_priority, 2),
                    "table_weight": round(table_weight, 2),
                    "final_score": round(final_score * 100, 2),
                    "metadata": result.get("metadata", {}),
                    "search_source": result.get("search_source", "unknown"),
                    # Article anchoring info for LLM context
                    "is_law_text": article_details.get("is_law_text", False),
                    "article_match_type": article_details.get("article_anchoring", "not_applicable"),
                    "_debug": {
                        "pure_similarity": round(similarity * 100, 2),
                        "weighted_similarity": round(weighted_similarity * 100, 2),
                        "source_priority": round(source_priority, 2),
                        "table_weight": round(table_weight, 2),
                        "keyword_boost": round(keyword_boost * 100, 2),
                        "metadata_boost": round(metadata_boost * 100, 2),
                        "article_boost": round(article_boost * 100, 2),
                        "article_anchoring": article_details,
                        "metadata_quality": metadata_details,
                        "retrieval_penalty": round(retrieval_penalty * 100, 2),
                        "temporal_penalty": round(penalty_details["temporal_penalty"] * 100, 2),
                        "toc_penalty": round(penalty_details["toc_penalty"] * 100, 2),
                        "temporal_reason": penalty_details["temporal_reason"],
                        "toc_reason": penalty_details["toc_reason"],
                        "has_verdict": penalty_details["has_verdict"],
                        "final": round(final_score * 100, 2)
                    }
                })

            # Log penalty and metadata quality statistics
            if penalty_stats["temporal_count"] > 0 or penalty_stats["toc_count"] > 0:
                logger.info(f"Retrieval penalties applied: temporal={penalty_stats['temporal_count']}, toc={penalty_stats['toc_count']}")
            if penalty_stats.get("metadata_quality_count", 0) > 0:
                avg_boost = penalty_stats["metadata_boost_total"] / penalty_stats["metadata_quality_count"]
                logger.info(f"Metadata quality boost: {penalty_stats['metadata_quality_count']} results boosted, avg={avg_boost*100:.1f}%")

            # Log article anchoring statistics
            if article_anchoring_enabled:
                exact_count = penalty_stats.get("article_exact_count", 0)
                wrong_count = penalty_stats.get("article_wrong_count", 0)
                ref_count = penalty_stats.get("article_reference_count", 0)
                logger.info(f"🎯 Article anchoring: exact={exact_count}, wrong={wrong_count}, references={ref_count}")
                if exact_count == 0:
                    logger.warning(f"⚠️ No exact article match found for {article_query['law_code']} Madde {article_query['article_number']}")

            # Sort by final score and limit
            scored_results.sort(key=lambda x: x["final_score"], reverse=True)

            # 🎯 ARTICLE FILTERING: When article anchoring is enabled,
            # filter law chunks to prevent LLM from citing wrong articles
            if article_anchoring_enabled:
                target_law = article_query["law_code"]
                target_article = article_query["article_number"]
                exact_match_found = penalty_stats.get("article_exact_count", 0) > 0

                def check_content_for_wrong_article(content: str, target_law: str, target_article: str) -> bool:
                    """
                    Check if content mentions other articles of the same law.
                    Returns True if content has WRONG article references that might confuse LLM.
                    """
                    content_upper = content.upper()

                    # Get all code variations for this law
                    law_variations = [target_law]
                    if target_law in self.LAW_CODES:
                        law_variations.extend(self.LAW_CODES[target_law])

                    # Check if content mentions this law at all
                    mentions_target_law = any(v.upper() in content_upper for v in law_variations)
                    if not mentions_target_law:
                        return False  # Doesn't mention target law, OK to keep

                    # Content mentions target law - check if it mentions WRONG article numbers
                    # Pattern: "Madde X" or "Md. X" where X is NOT target_article
                    import re
                    article_refs = re.findall(r'(?:MADDE|Madde|Md\.?)\s*(\d+(?:/[A-Za-z])?)', content, re.IGNORECASE)

                    if not article_refs:
                        return False  # No specific article mentioned, OK to keep

                    # Check if any mentioned article is NOT the target
                    for ref in article_refs:
                        ref_num = ref.split('/')[0].strip()  # Handle "40/A" format
                        if ref_num != str(target_article):
                            # Found reference to WRONG article of the same law
                            return True

                    return False  # Only mentions target article or general law

                def should_keep_result(result: Dict) -> bool:
                    source_table = result.get("source_table", "")
                    content = result.get("content", "")
                    metadata = result.get("metadata", {}) or {}

                    # ===== LAW CHUNKS =====
                    if source_table == "vergilex_mevzuat_kanunlar_chunks":
                        law_name = metadata.get("law_name", "")
                        article_num = str(metadata.get("article_number", ""))

                        # Check if this chunk is for the target law
                        is_target_law = (
                            target_law.upper() in law_name.upper() or
                            self._law_name_to_code(law_name) == target_law
                        )

                        if is_target_law:
                            # Same law - only keep if correct article number
                            is_target_article = article_num == str(target_article)
                            if not is_target_article:
                                logger.debug(f"🚫 Filtering wrong article: {law_name} Madde {article_num} (target: {target_article})")
                                return False
                            return True  # Keep - correct law and article
                        else:
                            # Different law - keep (might be relevant context)
                            return True

                    # ===== SECONDARY SOURCES (özelge, makale, sirküler, etc.) =====
                    # V3 FIX: Less aggressive filtering - only remove if source explicitly
                    # cites a DIFFERENT article of the SAME law in its title or metadata
                    title = (result.get("title", "") or "").upper()

                    # Check if title explicitly mentions a WRONG article
                    import re
                    law_variations = [target_law] + (self.LAW_CODES.get(target_law, []))

                    for law_var in law_variations:
                        # Pattern: "VUK 359" or "VUK Madde 359" in title
                        title_article_pattern = rf'{re.escape(law_var.upper())}\s*(?:MADDE\s*)?(\d+)'
                        title_match = re.search(title_article_pattern, title)
                        if title_match:
                            title_article = title_match.group(1)
                            if title_article != str(target_article):
                                logger.debug(f"🚫 Filtering source with wrong article in title: {title[:50]}... ({law_var} {title_article} vs target {target_article})")
                                return False  # Title explicitly about wrong article
                            break  # Title mentions correct article

                    return True  # Keep secondary source

                filtered_count = len(scored_results)
                scored_results = [r for r in scored_results if should_keep_result(r)]
                removed_count = filtered_count - len(scored_results)

                if removed_count > 0:
                    logger.info(f"🎯 Article filter v3: removed {removed_count} wrong-article sources, keeping {len(scored_results)} results for {target_law} Madde {target_article}")

                if not exact_match_found and len(scored_results) > 0:
                    logger.info(f"ℹ️ Exact article text not in DB, using {len(scored_results)} related sources (özelge, makale, etc.)")

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

            # Build response
            response = {
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
                # Article anchoring context for LLM
                "article_query": {
                    "detected": article_anchoring_enabled,
                    "law_code": article_query["law_code"] if article_query else None,
                    "article_number": article_query["article_number"] if article_query else None,
                    "exact_match_found": penalty_stats.get("article_exact_count", 0) > 0 if article_anchoring_enabled else None,
                    "exact_match_count": penalty_stats.get("article_exact_count", 0) if article_anchoring_enabled else None,
                    "wrong_match_count": penalty_stats.get("article_wrong_count", 0) if article_anchoring_enabled else None,
                    # Intent info for sub-clause routing (e.g., indirim vs iade)
                    "intent": article_query.get("intent") if article_query else None,
                    # LLM context hint for better responses
                    "llm_hint": (
                        f"Kullanıcı {article_query['law_code']} Madde {article_query['article_number']} hakkında sormuş. "
                        f"{'Madde metni kaynaklar arasında mevcut.' if penalty_stats.get('article_exact_count', 0) > 0 else 'Madde metninin kendisi veritabanında bulunamadı, ancak ilgili özelge/makale/içtihat kaynakları mevcut. Bu kaynaklara dayanarak bilgi ver.'}"
                    ) if article_anchoring_enabled and article_query else None
                } if article_anchoring_enabled else None,
                "prompt_context": {
                    "conversation_tone": prompt_settings.conversation_tone,
                    "schema_name": prompt_settings.schema_name,
                    "has_system_prompt": bool(prompt_settings.system_prompt),
                    "has_llm_guide": bool(prompt_settings.llm_guide),
                    "system_prompt_preview": prompt_settings.system_prompt[:200] if prompt_settings.system_prompt else None
                }
            }

            # Add debug info when requested
            if debug:
                # Get top penalized results (those with retrieval_penalty < 0)
                penalized_results = [
                    {
                        "id": r["id"],
                        "title": r.get("title", "")[:50],
                        "source_table": r.get("source_table"),
                        "retrieval_penalty": r.get("_debug", {}).get("retrieval_penalty", 0),
                        "temporal_reason": r.get("_debug", {}).get("temporal_reason"),
                        "toc_reason": r.get("_debug", {}).get("toc_reason"),
                    }
                    for r in scored_results
                    if r.get("_debug", {}).get("retrieval_penalty", 0) < 0
                ]
                # Sort by penalty (most penalized first)
                penalized_results.sort(key=lambda x: x["retrieval_penalty"])

                # Get top metadata quality results
                top_metadata_quality = [
                    {
                        "id": r["id"],
                        "title": r.get("title", "")[:50],
                        "source_table": r.get("source_table"),
                        "metadata_boost": r.get("metadata_boost", 0),
                        "metadata_quality": r.get("_debug", {}).get("metadata_quality", {}),
                    }
                    for r in scored_results
                    if r.get("metadata_boost", 0) > 0
                ]
                # Sort by metadata boost (highest first)
                top_metadata_quality.sort(key=lambda x: x["metadata_boost"], reverse=True)

                # Get article anchoring debug results
                article_anchoring_debug = []
                if article_anchoring_enabled:
                    article_anchoring_debug = [
                        {
                            "id": r["id"],
                            "title": r.get("title", "")[:50],
                            "source_table": r.get("source_table"),
                            "article_boost": r.get("article_boost", 0),
                            "is_law_text": r.get("is_law_text", False),
                            "match_type": r.get("article_match_type", "unknown"),
                            "match_details": r.get("_debug", {}).get("article_anchoring", {}),
                        }
                        for r in scored_results[:20]  # Top 20 for debug
                    ]

                response["_debug"] = {
                    "penalty_config": penalty_config,
                    "penalty_stats": penalty_stats,
                    "metadata_quality_config": self.METADATA_BOOST_CONFIG,
                    "embedding_provider": self._embedding_config.provider if self._embedding_config else "unknown",
                    "query_embedding_dims": len(query_embedding) if not use_keyword_fallback else 0,
                    "raw_results_count": len(raw_results),
                    "scored_results_count": len(scored_results),
                    "filtered_count": len(final_results),
                    "top_penalized": penalized_results[:5],
                    "top_metadata_quality": top_metadata_quality[:5],
                    "search_mode": "keyword_fallback" if use_keyword_fallback else "vector",
                    "source_table_weights": settings.source_table_weights or {},
                    # Article anchoring debug info
                    "article_anchoring": {
                        "enabled": article_anchoring_enabled,
                        "target": f"{article_query['law_code']} Madde {article_query['article_number']}" if article_query else None,
                        "exact_match_found": penalty_stats.get("article_exact_count", 0) > 0 if article_anchoring_enabled else None,
                        "stats": {
                            "exact": penalty_stats.get("article_exact_count", 0),
                            "wrong": penalty_stats.get("article_wrong_count", 0),
                            "references": penalty_stats.get("article_reference_count", 0),
                        } if article_anchoring_enabled else None,
                        "results": article_anchoring_debug if article_anchoring_enabled else []
                    }
                }

            return response

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
