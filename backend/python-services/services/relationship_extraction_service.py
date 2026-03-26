"""
Relationship Extraction Service - v1.0
Extracts entities and cross-references from unified_embeddings chunks
using LLM-based extraction with regex fallback.

Stores results in chunk_relationships and chunk_entities tables
for graph-enhanced RAG retrieval.
"""

import os
import re
import json
import time
import uuid
import asyncio
from typing import Any, Dict, List, Optional, Tuple
from dataclasses import dataclass
from datetime import datetime

import openai
from loguru import logger

from services.database import get_db
from services.redis_client import cache_get, cache_set, get_redis
from services.neo4j_service import neo4j_service


# ═══════════════════════════════════════════════════════════════════════════
# CONFIGURATION
# ═══════════════════════════════════════════════════════════════════════════

DEFAULT_MODEL = "gpt-4o-mini"
DEFAULT_BATCH_SIZE = 50
DEFAULT_CONFIDENCE_THRESHOLD = 0.7
MAX_CONTENT_LENGTH = 6000  # Truncate content sent to LLM
EXTRACTION_CACHE_TTL = 86400  # 24h cache for extraction results

# Reuse article detection patterns from rag_pipeline_service.py
ARTICLE_PATTERN = re.compile(
    r"\b(VUK|GVK|KVK|KDVK|ÖTVK|MTV|DVK|HMK|SGK|İYUK|AATUHK|VİVK|VIVK|OTVK|MTVK)"
    r"\s*(?:madde\s*)?\.?\s*(\d+(?:/[A-Za-z])?)",
    re.IGNORECASE
)

FULL_LAW_NAMES = {
    "kurumlar vergisi kanunu": "KVK",
    "gelir vergisi kanunu": "GVK",
    "katma değer vergisi kanunu": "KDVK",
    "vergi usul kanunu": "VUK",
    "damga vergisi kanunu": "DVK",
    "özel tüketim vergisi kanunu": "OTVK",
    "motorlu taşıtlar vergisi kanunu": "MTVK",
    "veraset ve intikal vergisi kanunu": "VIVK",
    "amme alacaklarının tahsil usulü": "AATUHK",
    "idari yargılama usulü kanunu": "IYUK",
}

FULL_LAW_ARTICLE_PATTERN = re.compile(
    r"(" + "|".join(re.escape(name) for name in FULL_LAW_NAMES.keys()) + r")"
    r"(?:nun|nın|nün|nin|'n[ıiuü]n)?\s*"
    r"(?:(\d+(?:/[A-Za-z])?)\s*\.?\s*(?:madde\w*)?|(?:madde\s*)?(\d+(?:/[A-Za-z])?))",
    re.IGNORECASE
)

# Additional reference patterns
REFERENCE_KEYWORDS = re.compile(
    r"(?:atıf(?:\s+yapılan)?|uyarınca|gereğince|hükmüne\s+göre|kapsamında|"
    r"belirtilen|düzenlenen|öngörülen|sayılı\s+kanun)",
    re.IGNORECASE
)

LAW_NUMBER_PATTERN = re.compile(
    r"(\d{3,4})\s*sayılı\s*(kanun|yasa)",
    re.IGNORECASE
)

LAW_NUMBER_TO_CODE = {
    "213": "VUK", "193": "GVK", "5520": "KVK", "3065": "KDVK",
    "488": "DVK", "4760": "OTVK", "197": "MTVK", "7338": "VIVK",
    "6183": "AATUHK", "2577": "IYUK",
}

RATE_PATTERN = re.compile(r"[%‰]\s*\d+(?:[.,]\d+)?|\d+(?:[.,]\d+)?\s*(?:yüzde|%|‰)")
DATE_PATTERN = re.compile(r"\d{1,2}[./]\d{1,2}[./]\d{2,4}")
INSTITUTION_KEYWORDS = [
    "Danıştay", "Gelir İdaresi Başkanlığı", "GİB", "Maliye Bakanlığı",
    "Hazine ve Maliye Bakanlığı", "Vergi Dairesi", "Sayıştay", "TBMM",
    "Anayasa Mahkemesi", "Yargıtay",
]


# ═══════════════════════════════════════════════════════════════════════════
# LLM EXTRACTION PROMPT
# ═══════════════════════════════════════════════════════════════════════════

EXTRACTION_SYSTEM_PROMPT = """You are a legal document analyzer specializing in Turkish tax and legal texts.
Extract structured entities and cross-references from the given text chunk.

Return ONLY valid JSON with this exact structure:
{
  "entities": [
    {"type": "law_code", "value": "VUK", "normalized": "VUK"},
    {"type": "article_number", "value": "114", "normalized": "114"},
    {"type": "institution", "value": "Danıştay", "normalized": "Danıştay"},
    {"type": "rate", "value": "%18", "normalized": "0.18"},
    {"type": "date", "value": "26.05.2024", "normalized": "2024-05-26"},
    {"type": "penalty", "value": "usulsüzlük cezası", "normalized": "usulsüzlük cezası"},
    {"type": "concept", "value": "zamanaşımı", "normalized": "zamanaşımı"}
  ],
  "references": [
    {
      "target_law": "GVK",
      "target_article": "40",
      "type": "references",
      "context": "...the surrounding text where this reference appears...",
      "confidence": 0.9
    }
  ]
}

Rules:
- "type" for entities must be one of: law_code, article_number, institution, date, rate, penalty, concept
- "type" for references must be one of: references, amends, parent_of, related_to, supersedes, interprets
  - references: explicit cross-reference (atıf) to another law/article
  - amends: this text modifies/amends another article
  - parent_of: hierarchical relationship (kanun -> madde)
  - related_to: topically related but no explicit reference
  - supersedes: this replaces/repeals an older provision
  - interprets: this text interprets/explains another law (özelge, Danıştay kararı)
- Extract ALL law codes mentioned (VUK, GVK, KVK, KDVK, DVK, OTVK, MTVK, VIVK, AATUHK, IYUK, etc.)
- For article numbers, include suffixes like 114/A, 29/B
- For references, only include if there's a clear reference to a DIFFERENT law or article
- Do NOT create self-references (if text is about VUK 114, don't reference VUK 114)
- confidence should be 0.7-1.0 for explicit references, 0.5-0.7 for implicit ones
- If no entities or references found, return empty arrays
- Return ONLY the JSON object, no markdown formatting"""

EXTRACTION_USER_PROMPT = """Analyze this Turkish legal/tax text chunk and extract entities and cross-references.

Source: {source_table} / {source_type}
{metadata_context}

Text:
{content}"""


# ═══════════════════════════════════════════════════════════════════════════
# SERVICE CLASS
# ═══════════════════════════════════════════════════════════════════════════

class RelationshipExtractionService:
    """Extracts entities and relationships from unified_embeddings chunks."""

    def __init__(self):
        self._settings_cache: Optional[Dict[str, Any]] = None
        self._settings_cache_time: float = 0
        self._openai_client: Optional[openai.AsyncOpenAI] = None

    # ─────────────────────────────────────────────────────────────────
    # Settings & Init
    # ─────────────────────────────────────────────────────────────────

    async def _get_settings(self) -> Dict[str, Any]:
        """Load relationship settings from DB with 60s cache."""
        now = time.time()
        if self._settings_cache and (now - self._settings_cache_time) < 60:
            return self._settings_cache

        try:
            pool = await get_db()
            rows = await pool.fetch(
                "SELECT key, value FROM settings WHERE category = 'relationships'"
            )
            settings = {}
            for row in rows:
                key = row['key'].replace('relationships.', '')
                settings[key] = row['value']

            self._settings_cache = settings
            self._settings_cache_time = now
            return settings
        except Exception as e:
            logger.error(f"[RelExtract] Failed to load settings: {e}")
            return {}

    def _get_openai_client(self) -> openai.AsyncOpenAI:
        """Get or create OpenAI async client."""
        if not self._openai_client:
            api_key = os.getenv("OPENAI_API_KEY")
            if not api_key:
                raise ValueError("OPENAI_API_KEY not configured")
            self._openai_client = openai.AsyncOpenAI(api_key=api_key)
        return self._openai_client

    # ─────────────────────────────────────────────────────────────────
    # Single Chunk Extraction
    # ─────────────────────────────────────────────────────────────────

    async def extract_from_chunk(
        self,
        chunk_id: int,
        content: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
        source_table: Optional[str] = None,
        source_type: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Extract entities and relationships from a single chunk.
        Uses LLM with regex fallback.
        Returns ExtractionResult-compatible dict.
        """
        start_time = time.time()
        settings = await self._get_settings()
        model = settings.get('extractionModel', DEFAULT_MODEL)
        confidence_threshold = float(settings.get('confidenceThreshold', DEFAULT_CONFIDENCE_THRESHOLD))

        # Fetch content from DB if not provided
        if not content:
            pool = await get_db()
            row = await pool.fetchrow(
                "SELECT content, metadata, source_table, source_type FROM unified_embeddings WHERE id = $1",
                chunk_id
            )
            if not row:
                return {"chunk_id": chunk_id, "entities": [], "references": [],
                        "entities_stored": 0, "relationships_stored": 0,
                        "extraction_time_ms": 0, "model_used": model, "fallback_used": False}
            content = row['content']
            metadata = json.loads(row['metadata']) if row['metadata'] else {}
            source_table = row['source_table']
            source_type = row['source_type']

        if not content or not content.strip():
            return {"chunk_id": chunk_id, "entities": [], "references": [],
                    "entities_stored": 0, "relationships_stored": 0,
                    "extraction_time_ms": 0, "model_used": model, "fallback_used": False}

        # Try LLM extraction, fall back to regex
        fallback_used = False
        try:
            extraction = await self._llm_extract(content, source_table, source_type, metadata, model)
        except Exception as e:
            logger.warning(f"[RelExtract] LLM failed for chunk {chunk_id}, using regex fallback: {e}")
            extraction = self._regex_extract(content)
            fallback_used = True

        entities = extraction.get("entities", [])
        references = extraction.get("references", [])

        # Filter by confidence threshold
        references = [r for r in references if r.get("confidence", 0.8) >= confidence_threshold]

        # Determine self-reference law/article to exclude
        self_law = (metadata or {}).get("law_code", "")
        self_article = str((metadata or {}).get("article_number", ""))

        # Filter self-references
        references = [
            r for r in references
            if not (r.get("target_law", "") == self_law and str(r.get("target_article", "")) == self_article and self_law)
        ]

        # Store in DB
        entities_stored = await self._store_entities(chunk_id, entities)
        relationships_stored = await self._store_relationships(chunk_id, references)

        # ─────────────────────────────────────────────────────────────
        # NEO4J INTEGRATION: Push to Knowledge Graph (Isolated by workspace_id)
        # ─────────────────────────────────────────────────────────────
        try:
            # 1. Ensure Chunk exists in Neo4j
            await neo4j_service.upsert_chunk_node(workspace_id, chunk_id, content, metadata or {})
            
            # 2. Add Entities
            for entity in entities:
                await neo4j_service.add_entity(workspace_id, chunk_id, entity.get("type", "concept"), entity.get("value", ""))
            
            # 3. Add Relationships
            for ref in references:
                target_law = ref.get("target_law")
                target_article = ref.get("target_article")
                rel_type = ref.get("type", "references")
                target_ref = f"{target_law} Madde {target_article}" if target_law and target_article else ref.get("context", "")[:100]
                
                # Try to resolve target_chunk_id (similar to PG storage)
                target_chunk_id = None
                if target_law and target_article:
                    pool = await get_db()
                    target_chunk_id = await pool.fetchval("""
                        SELECT id FROM unified_embeddings 
                        WHERE metadata->>'law_code' = $1 AND metadata->>'article_number' = $2 LIMIT 1
                    """, target_law, str(target_article))
                
                await neo4j_service.add_relationship(
                    workspace_id, chunk_id, target_chunk_id, rel_type, target_ref, target_law, str(target_article) if target_article else None
                )
                
            logger.info(f"🕸️ Knowledge Graph: Pushed chunk {chunk_id} to Neo4j (Workspace: {workspace_id})")
        except Exception as e:
            logger.warning(f"🕸️ Knowledge Graph: Failed to push to Neo4j for chunk {chunk_id}: {e}")

        elapsed = (time.time() - start_time) * 1000

        return {
            "chunk_id": chunk_id,
            "entities": entities,
            "references": references,
            "entities_stored": entities_stored,
            "relationships_stored": relationships_stored,
            "extraction_time_ms": round(elapsed, 1),
            "model_used": model,
            "fallback_used": fallback_used,
        }

    # ─────────────────────────────────────────────────────────────────
    # LLM Extraction
    # ─────────────────────────────────────────────────────────────────

    async def _llm_extract(
        self,
        content: str,
        source_table: Optional[str],
        source_type: Optional[str],
        metadata: Optional[Dict[str, Any]],
        model: str,
    ) -> Dict[str, Any]:
        """Call LLM to extract entities and references."""
        client = self._get_openai_client()

        # Build metadata context
        meta_parts = []
        if metadata:
            if metadata.get("law_code"):
                meta_parts.append(f"Law Code: {metadata['law_code']}")
            if metadata.get("article_number"):
                meta_parts.append(f"Article: {metadata['article_number']}")
            if metadata.get("law_name"):
                meta_parts.append(f"Law Name: {metadata['law_name']}")
        metadata_context = "Metadata: " + ", ".join(meta_parts) if meta_parts else ""

        user_prompt = EXTRACTION_USER_PROMPT.format(
            source_table=source_table or "unknown",
            source_type=source_type or "unknown",
            metadata_context=metadata_context,
            content=content[:MAX_CONTENT_LENGTH],
        )

        response = await client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": EXTRACTION_SYSTEM_PROMPT},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.1,
            max_tokens=2000,
            response_format={"type": "json_object"},
        )

        raw = response.choices[0].message.content.strip()
        try:
            result = json.loads(raw)
        except json.JSONDecodeError:
            # Try to extract JSON from markdown code block
            json_match = re.search(r'```(?:json)?\s*\n?(.*?)\n?```', raw, re.DOTALL)
            if json_match:
                result = json.loads(json_match.group(1))
            else:
                logger.warning(f"[RelExtract] Failed to parse LLM response: {raw[:200]}")
                result = {"entities": [], "references": []}

        return result

    # ─────────────────────────────────────────────────────────────────
    # Regex Fallback Extraction
    # ─────────────────────────────────────────────────────────────────

    def _regex_extract(self, content: str) -> Dict[str, Any]:
        """Regex-based extraction as fallback when LLM is unavailable."""
        entities = []
        references = []
        seen_entities = set()

        # Extract abbreviated law code + article references
        for match in ARTICLE_PATTERN.finditer(content):
            law_code = match.group(1).upper()
            article = match.group(2)
            key = (law_code, article)

            if ("law_code", law_code) not in seen_entities:
                entities.append({"type": "law_code", "value": law_code, "normalized": law_code})
                seen_entities.add(("law_code", law_code))

            if ("article_number", article) not in seen_entities:
                entities.append({"type": "article_number", "value": article, "normalized": article})
                seen_entities.add(("article_number", article))

            # Check if this is a cross-reference (has reference keywords nearby)
            start = max(0, match.start() - 100)
            end = min(len(content), match.end() + 50)
            context = content[start:end]
            if REFERENCE_KEYWORDS.search(context):
                references.append({
                    "target_law": law_code,
                    "target_article": article,
                    "type": "references",
                    "context": context.strip(),
                    "confidence": 0.7,
                })

        # Extract full law name + article references
        for match in FULL_LAW_ARTICLE_PATTERN.finditer(content):
            law_name = match.group(1).lower()
            law_code = FULL_LAW_NAMES.get(law_name, "")
            article = match.group(2) or match.group(3)

            if law_code and ("law_code", law_code) not in seen_entities:
                entities.append({"type": "law_code", "value": law_code, "normalized": law_code})
                seen_entities.add(("law_code", law_code))

            if article and ("article_number", article) not in seen_entities:
                entities.append({"type": "article_number", "value": article, "normalized": article})
                seen_entities.add(("article_number", article))

        # Extract law number references (e.g., "213 sayılı kanun")
        for match in LAW_NUMBER_PATTERN.finditer(content):
            law_number = match.group(1)
            law_code = LAW_NUMBER_TO_CODE.get(law_number, "")
            if law_code and ("law_code", law_code) not in seen_entities:
                entities.append({"type": "law_code", "value": law_code, "normalized": law_code})
                seen_entities.add(("law_code", law_code))

        # Extract rates
        for match in RATE_PATTERN.finditer(content):
            value = match.group(0).strip()
            if ("rate", value) not in seen_entities:
                entities.append({"type": "rate", "value": value, "normalized": value})
                seen_entities.add(("rate", value))

        # Extract dates
        for match in DATE_PATTERN.finditer(content):
            value = match.group(0)
            if ("date", value) not in seen_entities:
                entities.append({"type": "date", "value": value, "normalized": value})
                seen_entities.add(("date", value))

        # Extract institutions
        content_lower = content.lower()
        for inst in INSTITUTION_KEYWORDS:
            if inst.lower() in content_lower and ("institution", inst) not in seen_entities:
                entities.append({"type": "institution", "value": inst, "normalized": inst})
                seen_entities.add(("institution", inst))

        return {"entities": entities, "references": references}

    # ─────────────────────────────────────────────────────────────────
    # Database Storage
    # ─────────────────────────────────────────────────────────────────

    async def _store_entities(self, chunk_id: int, entities: List[Dict]) -> int:
        """Store extracted entities in chunk_entities table."""
        if not entities:
            return 0

        pool = await get_db()
        stored = 0
        async with pool.acquire() as conn:
            for entity in entities:
                try:
                    await conn.execute("""
                        INSERT INTO chunk_entities (chunk_id, entity_type, entity_value, normalized_value, metadata)
                        VALUES ($1, $2, $3, $4, $5)
                        ON CONFLICT (chunk_id, entity_type, entity_value) DO UPDATE
                        SET normalized_value = EXCLUDED.normalized_value
                    """,
                        chunk_id,
                        entity.get("type", "concept"),
                        entity.get("value", ""),
                        entity.get("normalized"),
                        json.dumps(entity.get("metadata", {})),
                    )
                    stored += 1
                except Exception as e:
                    logger.warning(f"[RelExtract] Entity store failed for chunk {chunk_id}: {e}")

        return stored

    async def _store_relationships(self, chunk_id: int, references: List[Dict]) -> int:
        """Store extracted relationships in chunk_relationships table."""
        if not references:
            return 0

        pool = await get_db()
        stored = 0
        async with pool.acquire() as conn:
            for ref in references:
                try:
                    target_law = ref.get("target_law", "")
                    target_article = str(ref.get("target_article", ""))
                    rel_type = ref.get("type", "references")
                    confidence = ref.get("confidence", 0.8)
                    context = ref.get("context", "")
                    raw_ref = f"{target_law} Madde {target_article}" if target_law and target_article else context[:200]

                    # Try to resolve target_chunk_id immediately
                    target_chunk_id = None
                    if target_law and target_article:
                        target_chunk_id = await self._resolve_single_reference(
                            conn, target_law, target_article
                        )

                    await conn.execute("""
                        INSERT INTO chunk_relationships
                        (source_chunk_id, target_chunk_id, relationship_type, confidence,
                         extracted_by, target_reference, target_law_code, target_article_number, metadata)
                        VALUES ($1, $2, $3, $4, 'llm', $5, $6, $7, $8)
                        ON CONFLICT (source_chunk_id, COALESCE(target_chunk_id, -1), relationship_type)
                        DO UPDATE SET confidence = GREATEST(chunk_relationships.confidence, EXCLUDED.confidence),
                                      target_chunk_id = COALESCE(EXCLUDED.target_chunk_id, chunk_relationships.target_chunk_id),
                                      updated_at = NOW()
                    """,
                        chunk_id,
                        target_chunk_id,
                        rel_type,
                        confidence,
                        raw_ref,
                        target_law if target_law else None,
                        target_article if target_article else None,
                        json.dumps({"context": context[:500]}),
                    )
                    stored += 1
                except Exception as e:
                    logger.warning(f"[RelExtract] Relationship store failed for chunk {chunk_id}: {e}")

        return stored

    async def _resolve_single_reference(
        self, conn, law_code: str, article_number: str
    ) -> Optional[int]:
        """Try to find target chunk in unified_embeddings by law_code + article_number."""
        try:
            row = await conn.fetchrow("""
                SELECT id FROM unified_embeddings
                WHERE metadata->>'law_code' = $1
                  AND metadata->>'article_number' = $2
                LIMIT 1
            """, law_code, str(article_number))
            return row['id'] if row else None
        except Exception:
            return None

    # ─────────────────────────────────────────────────────────────────
    # Batch Extraction
    # ─────────────────────────────────────────────────────────────────

    async def extract_batch(
        self,
        source_table: Optional[str] = None,
        source_type: Optional[str] = None,
        limit: Optional[int] = None,
        offset: int = 0,
        force_reprocess: bool = False,
    ) -> Dict[str, Any]:
        """
        Start a batch extraction job. Runs in background.
        Returns job_id for tracking progress.
        """
        settings = await self._get_settings()
        batch_size = int(settings.get('batchSize', DEFAULT_BATCH_SIZE))

        job_id = f"extract_{uuid.uuid4().hex[:12]}"

        # Count total chunks to process
        pool = await get_db()
        count_query = "SELECT COUNT(*) FROM unified_embeddings WHERE content IS NOT NULL AND content != ''"
        count_params = []

        if source_table:
            count_query += f" AND source_table = ${len(count_params) + 1}"
            count_params.append(source_table)

        if source_type:
            count_query += f" AND source_type = ${len(count_params) + 1}"
            count_params.append(source_type)

        if not force_reprocess:
            count_query += """
                AND id NOT IN (SELECT DISTINCT chunk_id FROM chunk_entities)
            """

        total_count = await pool.fetchval(count_query, *count_params)
        if limit:
            total_count = min(total_count, limit)

        # Create job record
        await pool.execute("""
            INSERT INTO extraction_jobs (job_id, status, source_table, total_chunks, model_used, started_at)
            VALUES ($1, 'running', $2, $3, $4, NOW())
        """, job_id, source_table, total_count, settings.get('extractionModel', DEFAULT_MODEL))

        # Start background processing
        asyncio.create_task(
            self._run_batch_extraction(
                job_id, source_table, source_type, limit, offset,
                batch_size, force_reprocess
            )
        )

        return {
            "job_id": job_id,
            "status": "running",
            "source_table": source_table,
            "total_chunks": total_count,
            "message": f"Batch extraction started. Processing {total_count} chunks in batches of {batch_size}.",
        }

    async def _run_batch_extraction(
        self,
        job_id: str,
        source_table: Optional[str],
        source_type: Optional[str],
        limit: Optional[int],
        offset: int,
        batch_size: int,
        force_reprocess: bool,
    ):
        """Background batch extraction worker."""
        pool = await get_db()
        processed = 0
        failed = 0
        total_relationships = 0
        total_entities = 0

        try:
            # Build query
            query = """
                SELECT id, content, metadata, source_table, source_type
                FROM unified_embeddings
                WHERE content IS NOT NULL AND content != ''
            """
            params = []

            if source_table:
                query += f" AND source_table = ${len(params) + 1}"
                params.append(source_table)

            if source_type:
                query += f" AND source_type = ${len(params) + 1}"
                params.append(source_type)

            if not force_reprocess:
                query += " AND id NOT IN (SELECT DISTINCT chunk_id FROM chunk_entities)"

            query += f" ORDER BY id OFFSET ${len(params) + 1}"
            params.append(offset)

            if limit:
                query += f" LIMIT ${len(params) + 1}"
                params.append(limit)

            rows = await pool.fetch(query, *params)

            job_status = 'running'

            for i in range(0, len(rows), batch_size):
                batch = rows[i:i + batch_size]

                # Check if job was cancelled
                job_status = await pool.fetchval(
                    "SELECT status FROM extraction_jobs WHERE job_id = $1", job_id
                )
                if job_status == 'cancelled':
                    logger.info(f"[RelExtract] Job {job_id} cancelled")
                    break

                for row in batch:
                    try:
                        raw_meta = row['metadata']
                        if isinstance(raw_meta, dict):
                            metadata = raw_meta
                        elif isinstance(raw_meta, str):
                            metadata = json.loads(raw_meta)
                        else:
                            metadata = {}
                        result = await self.extract_from_chunk(
                            chunk_id=row['id'],
                            content=row['content'],
                            metadata=metadata,
                            source_table=row['source_table'],
                            source_type=row['source_type'],
                        )
                        processed += 1
                        total_relationships += result.get("relationships_stored", 0)
                        total_entities += result.get("entities_stored", 0)
                    except Exception as e:
                        failed += 1
                        logger.error(f"[RelExtract] Chunk {row['id']} failed: {e}")

                    # Rate limit: ~20 requests/sec for gpt-4o-mini
                    await asyncio.sleep(0.05)

                # Update progress
                await pool.execute("""
                    UPDATE extraction_jobs
                    SET processed_chunks = $1, failed_chunks = $2,
                        relationships_found = $3, entities_found = $4
                    WHERE job_id = $5
                """, processed, failed, total_relationships, total_entities, job_id)

                logger.info(
                    f"[RelExtract] Job {job_id}: {processed}/{len(rows)} chunks, "
                    f"{total_relationships} rels, {total_entities} entities"
                )

            # Mark complete
            final_status = 'completed' if job_status != 'cancelled' else 'cancelled'
            await pool.execute("""
                UPDATE extraction_jobs
                SET status = $1, processed_chunks = $2, failed_chunks = $3,
                    relationships_found = $4, entities_found = $5, completed_at = NOW()
                WHERE job_id = $6
            """, final_status, processed, failed, total_relationships, total_entities, job_id)

            logger.info(f"[RelExtract] Job {job_id} {final_status}: {processed} chunks processed")

        except Exception as e:
            logger.error(f"[RelExtract] Job {job_id} failed: {e}")
            await pool.execute("""
                UPDATE extraction_jobs
                SET status = 'failed', error_message = $1,
                    processed_chunks = $2, failed_chunks = $3, completed_at = NOW()
                WHERE job_id = $4
            """, str(e)[:1000], processed, failed, job_id)

    # ─────────────────────────────────────────────────────────────────
    # Batch Progress
    # ─────────────────────────────────────────────────────────────────

    async def get_batch_progress(self, job_id: str) -> Optional[Dict[str, Any]]:
        """Get progress of a batch extraction job."""
        pool = await get_db()
        row = await pool.fetchrow(
            "SELECT * FROM extraction_jobs WHERE job_id = $1", job_id
        )
        if not row:
            return None

        total = row['total_chunks'] or 1
        processed = row['processed_chunks'] or 0
        progress_pct = round((processed / total) * 100, 1) if total > 0 else 0

        elapsed = None
        eta = None
        if row['started_at']:
            elapsed = (datetime.now(row['started_at'].tzinfo) - row['started_at']).total_seconds()
            if processed > 0 and progress_pct < 100:
                rate = processed / elapsed
                remaining = total - processed
                eta = remaining / rate if rate > 0 else None

        return {
            "job_id": job_id,
            "status": row['status'],
            "total_chunks": total,
            "processed_chunks": processed,
            "failed_chunks": row['failed_chunks'] or 0,
            "relationships_found": row['relationships_found'] or 0,
            "entities_found": row['entities_found'] or 0,
            "progress_pct": progress_pct,
            "elapsed_seconds": round(elapsed, 1) if elapsed else None,
            "eta_seconds": round(eta, 1) if eta else None,
            "error_message": row['error_message'],
        }

    async def cancel_batch(self, job_id: str) -> bool:
        """Cancel a running batch extraction job."""
        pool = await get_db()
        result = await pool.execute(
            "UPDATE extraction_jobs SET status = 'cancelled' WHERE job_id = $1 AND status = 'running'",
            job_id
        )
        return 'UPDATE 1' in result

    # ─────────────────────────────────────────────────────────────────
    # Reference Resolution
    # ─────────────────────────────────────────────────────────────────

    async def _load_law_code_mapping(self) -> Dict[str, str]:
        """Load law code abbreviation → law number mapping from settings."""
        pool = await get_db()
        raw = await pool.fetchval(
            "SELECT value FROM settings WHERE key = 'relationships.lawCodeMapping'"
        )
        if raw:
            try:
                return json.loads(raw) if isinstance(raw, str) else raw
            except (json.JSONDecodeError, TypeError):
                pass
        return {}

    async def resolve_references(self, dry_run: bool = False) -> Dict[str, Any]:
        """
        Resolve unresolved references by matching target_law_code + target_article_number
        to unified_embeddings metadata. Uses law code → law number mapping from settings.
        """
        pool = await get_db()
        law_map = await self._load_law_code_mapping()

        # Count unresolved
        total_unresolved = await pool.fetchval("""
            SELECT COUNT(*) FROM chunk_relationships
            WHERE target_chunk_id IS NULL AND target_law_code IS NOT NULL
        """)

        # Get all unresolved references
        unresolved = await pool.fetch("""
            SELECT id, target_law_code, target_article_number
            FROM chunk_relationships
            WHERE target_chunk_id IS NULL AND target_law_code IS NOT NULL
        """)

        resolved_count = 0
        for ref in unresolved:
            law_code = ref['target_law_code']
            article = ref['target_article_number']
            if not article:
                continue

            # Convert abbreviation to law number via mapping
            law_number = law_map.get(law_code, law_code)

            # Try matching by law_number + article_number in metadata
            target_id = await pool.fetchval("""
                SELECT id FROM unified_embeddings
                WHERE metadata->>'law_number' = $1
                  AND metadata->>'article_number' = $2
                LIMIT 1
            """, law_number, article)

            if target_id and not dry_run:
                await pool.execute("""
                    UPDATE chunk_relationships
                    SET target_chunk_id = $1, updated_at = NOW()
                    WHERE id = $2
                """, target_id, ref['id'])
                resolved_count += 1
            elif target_id and dry_run:
                resolved_count += 1

        if not dry_run and resolved_count > 0:
            workspace_id = os.getenv("TENANT_ID", "default")
            await neo4j_service.resolve_references(workspace_id)

        still_unresolved = total_unresolved - resolved_count

        return {
            "total_unresolved": total_unresolved,
            "resolved": resolved_count,
            "resolvable": resolved_count if dry_run else None,
            "still_unresolved": still_unresolved,
            "dry_run": dry_run,
        }

    # ─────────────────────────────────────────────────────────────────
    # Query Methods (for retrieval integration)
    # ─────────────────────────────────────────────────────────────────

    async def get_chunk_relationships(self, chunk_id: int) -> Dict[str, Any]:
        """Get all relationships for a specific chunk (both directions)."""
        pool = await get_db()

        outgoing = await pool.fetch("""
            SELECT cr.*, ue.content as target_content, ue.source_table as target_source_table
            FROM chunk_relationships cr
            LEFT JOIN unified_embeddings ue ON cr.target_chunk_id = ue.id
            WHERE cr.source_chunk_id = $1
            ORDER BY cr.confidence DESC
        """, chunk_id)

        incoming = await pool.fetch("""
            SELECT cr.*, ue.content as source_content, ue.source_table as source_source_table
            FROM chunk_relationships cr
            LEFT JOIN unified_embeddings ue ON cr.source_chunk_id = ue.id
            WHERE cr.target_chunk_id = $1
            ORDER BY cr.confidence DESC
        """, chunk_id)

        def _parse_row(r):
            d = dict(r)
            if isinstance(d.get("metadata"), str):
                try:
                    d["metadata"] = json.loads(d["metadata"])
                except (json.JSONDecodeError, TypeError):
                    d["metadata"] = {}
            return d

        return {
            "chunk_id": chunk_id,
            "outgoing": [_parse_row(r) for r in outgoing],
            "incoming": [_parse_row(r) for r in incoming],
            "total": len(outgoing) + len(incoming),
        }

    async def get_related_chunks(
        self, chunk_id: int, max_hops: int = 1, max_results: int = 10
    ) -> Dict[str, Any]:
        """
        Get related chunks via graph traversal.
        Used by semantic_search_service for graph-enhanced retrieval.
        """
        pool = await get_db()

        if max_hops == 1:
            # Single hop: direct references only
            rows = await pool.fetch("""
                SELECT DISTINCT
                    ue.id as chunk_id,
                    ue.content,
                    ue.source_table,
                    ue.source_type,
                    cr.relationship_type,
                    cr.confidence,
                    CASE WHEN cr.source_chunk_id = $1 THEN 'outgoing' ELSE 'incoming' END as direction
                FROM chunk_relationships cr
                JOIN unified_embeddings ue ON (
                    CASE WHEN cr.source_chunk_id = $1 THEN cr.target_chunk_id
                         ELSE cr.source_chunk_id END
                ) = ue.id
                WHERE (cr.source_chunk_id = $1 OR cr.target_chunk_id = $1)
                  AND cr.target_chunk_id IS NOT NULL
                ORDER BY cr.confidence DESC
                LIMIT $2
            """, chunk_id, max_results)
        else:
            # Two hops: include references of references
            rows = await pool.fetch("""
                WITH hop1 AS (
                    SELECT DISTINCT
                        CASE WHEN cr.source_chunk_id = $1 THEN cr.target_chunk_id
                             ELSE cr.source_chunk_id END as related_id,
                        cr.relationship_type,
                        cr.confidence,
                        1 as hop
                    FROM chunk_relationships cr
                    WHERE (cr.source_chunk_id = $1 OR cr.target_chunk_id = $1)
                      AND cr.target_chunk_id IS NOT NULL
                ),
                hop2 AS (
                    SELECT DISTINCT
                        CASE WHEN cr.source_chunk_id = h.related_id THEN cr.target_chunk_id
                             ELSE cr.source_chunk_id END as related_id,
                        cr.relationship_type,
                        cr.confidence * 0.7 as confidence,
                        2 as hop
                    FROM chunk_relationships cr
                    JOIN hop1 h ON (cr.source_chunk_id = h.related_id OR cr.target_chunk_id = h.related_id)
                    WHERE cr.target_chunk_id IS NOT NULL
                      AND cr.target_chunk_id != $1
                      AND cr.source_chunk_id != $1
                ),
                all_hops AS (
                    SELECT * FROM hop1
                    UNION ALL
                    SELECT * FROM hop2
                    WHERE related_id NOT IN (SELECT related_id FROM hop1)
                )
                SELECT DISTINCT ON (ue.id)
                    ue.id as chunk_id,
                    ue.content,
                    ue.source_table,
                    ue.source_type,
                    ah.relationship_type,
                    ah.confidence,
                    'outgoing' as direction,
                    ah.hop
                FROM all_hops ah
                JOIN unified_embeddings ue ON ah.related_id = ue.id
                ORDER BY ue.id, ah.hop, ah.confidence DESC
                LIMIT $2
            """, chunk_id, max_results)

        related = []
        for row in rows:
            related.append({
                "chunk_id": row['chunk_id'],
                "content": row['content'][:500] if row['content'] else "",
                "source_table": row['source_table'],
                "source_type": row['source_type'],
                "relationship_type": row['relationship_type'],
                "relationship_direction": row.get('direction', 'outgoing'),
                "confidence": float(row['confidence']),
                "hop_distance": row.get('hop', 1),
            })

        return {
            "chunk_id": chunk_id,
            "related": related,
            "hops_used": max_hops,
            "total": len(related),
        }

    async def load_graph_for_chunks(
        self, chunk_ids: List[int]
    ) -> Dict[int, List[Dict]]:
        """
        Bulk load relationships for multiple chunks in a single query.
        Used by semantic_search_service during scoring phase.
        Prioritizes Neo4j if available, falls back to PostgreSQL.
        """
        if not chunk_ids:
            return {}

        # 1. Try Neo4j first
        try:
            settings = await self._get_settings()
            graph_enabled = settings.get('neo4jEnabled', 'true').lower() == 'true'
            
            if graph_enabled and neo4j_service.driver:
                workspace_id = os.getenv("TENANT_ID", "default")
                cypher = """
                MATCH (s:Chunk)-[r]->(t:Chunk)
                WHERE s.id IN $chunk_ids AND s.workspace_id = $workspace_id AND t.workspace_id = $workspace_id
                RETURN s.id as source_chunk_id, t.id as target_chunk_id, 
                       type(r) as relationship_type, coalesce(r.confidence, 0.8) as confidence
                ORDER BY confidence DESC
                """
                records = await neo4j_service.run_query(cypher, {"chunk_ids": chunk_ids, "workspace_id": workspace_id})
                
                if records:
                    result: Dict[int, List[Dict]] = {}
                    for row in records:
                        src_id = row['source_chunk_id']
                        if src_id not in result:
                            result[src_id] = []
                        result[src_id].append({
                            "target_chunk_id": row['target_chunk_id'],
                            "relationship_type": row['relationship_type'],
                            "confidence": float(row['confidence']),
                        })
                    logger.debug(f"🕸️ Neo4j: Loaded graph data for {len(result)} chunks via Cypher")
                    return result
        except Exception as e:
            logger.warning(f"🕸️ Neo4j: Graph load failed, falling back to PG: {e}")

        # 2. Fallback to PostgreSQL
        pool = await get_db()
        rows = await pool.fetch("""
            SELECT
                cr.source_chunk_id,
                cr.target_chunk_id,
                cr.relationship_type,
                cr.confidence
            FROM chunk_relationships cr
            WHERE cr.source_chunk_id = ANY($1::int[])
              AND cr.target_chunk_id IS NOT NULL
              AND cr.confidence >= 0.5
            ORDER BY cr.confidence DESC
        """, chunk_ids)

        result: Dict[int, List[Dict]] = {}
        for row in rows:
            src_id = row['source_chunk_id']
            if src_id not in result:
                result[src_id] = []
            result[src_id].append({
                "target_chunk_id": row['target_chunk_id'],
                "relationship_type": row['relationship_type'],
                "confidence": float(row['confidence']),
            })

        return result

    # ─────────────────────────────────────────────────────────────────
    # Statistics
    # ─────────────────────────────────────────────────────────────────

    async def get_stats(self) -> Dict[str, Any]:
        """Get overall extraction statistics. Including Neo4j if available."""
        pool = await get_db()
        workspace_id = os.getenv("TENANT_ID", "default")

        # 1. Get PG Stats
        total_chunks = await pool.fetchval("SELECT COUNT(*) FROM unified_embeddings")
        pg_chunks_with_rels = await pool.fetchval(
            "SELECT COUNT(DISTINCT source_chunk_id) FROM chunk_relationships"
        )
        pg_total_rels = await pool.fetchval("SELECT COUNT(*) FROM chunk_relationships")
        pg_total_entities = await pool.fetchval("SELECT COUNT(*) FROM chunk_entities")
        
        # 2. Get Neo4j Stats if available
        neo4j_rels = 0
        neo4j_entities = 0
        neo4j_active = False
        
        if neo4j_service.driver:
            try:
                # Count Relationships
                rel_q = "MATCH (s:Chunk)-[r]->(t:Chunk) WHERE s.workspace_id = $wid RETURN count(r) as cnt"
                rel_res = await neo4j_service.run_query(rel_q, {"wid": workspace_id})
                if rel_res: neo4j_rels = rel_res[0]['cnt']
                
                # Count Entities (Reference nodes in our schema)
                ent_q = "MATCH (n:Reference) WHERE n.workspace_id = $wid RETURN count(n) as cnt"
                ent_res = await neo4j_service.run_query(ent_q, {"wid": workspace_id})
                if ent_res: neo4j_entities = ent_res[0]['cnt']
                
                neo4j_active = True
            except Exception as e:
                logger.warning(f"Failed to fetch stats from Neo4j: {e}")

        # Use the higher value or Neo4j value if active
        total_rels = max(pg_total_rels, neo4j_rels)
        total_entities = max(pg_total_entities, neo4j_entities)
        chunks_with_rels = pg_chunks_with_rels # Neo4j doesn't easily store "chunks with rels" without complex query
        
        unresolved = await pool.fetchval(
            "SELECT COUNT(*) FROM chunk_relationships WHERE target_chunk_id IS NULL AND target_law_code IS NOT NULL"
        )

        # Extra data for visualization
        rel_rows = await pool.fetch(
            "SELECT relationship_type, COUNT(*) as cnt FROM chunk_relationships GROUP BY relationship_type"
        )
        rels_by_type = {r['relationship_type']: r['cnt'] for r in rel_rows}

        ent_rows = await pool.fetch(
            "SELECT entity_type, COUNT(*) as cnt FROM chunk_entities GROUP BY entity_type"
        )
        ents_by_type = {r['entity_type']: r['cnt'] for r in ent_rows}

        chunks_with_entities = await pool.fetchval(
            "SELECT COUNT(DISTINCT chunk_id) FROM chunk_entities"
        )

        # Active jobs
        active_jobs = await pool.fetchval(
            "SELECT COUNT(*) FROM extraction_jobs WHERE status = 'running'"
        )

        coverage = round((chunks_with_entities / total_chunks * 100), 1) if total_chunks > 0 else 0

        return {
            "total_chunks": total_chunks,
            "chunks_with_relationships": chunks_with_rels,
            "chunks_with_entities": chunks_with_entities,
            "total_relationships": total_rels,
            "total_entities": total_entities,
            "relationships_by_type": rels_by_type,
            "entities_by_type": ents_by_type,
            "unresolved_references": unresolved,
            "extraction_coverage_pct": coverage,
            "active_jobs": active_jobs,
        }

    async def get_graph_data(self) -> Dict[str, Any]:
        """Get cross-table relationship data for dashboard graph visualization. Priority: Neo4j."""
        workspace_id = os.getenv("TENANT_ID", "default")
        
        # ─────────────────────────────────────────────────────────────
        # 1. Try Neo4j for high-fidelity Knowledge Graph
        # ─────────────────────────────────────────────────────────────
        if neo4j_service.driver:
            try:
                # Aggregate relationships between source_tables (or Law codes)
                cypher = """
                MATCH (s:Chunk)-[r]->(t:Chunk)
                WHERE s.workspace_id = $workspace_id AND t.workspace_id = $workspace_id
                RETURN s.law_code as source, t.law_code as target, 
                       type(r) as type, count(*) as count
                ORDER BY count DESC
                """
                records = await neo4j_service.run_query(cypher, {"workspace_id": workspace_id})
                
                if records:
                    nodes_dict = {}
                    edges = []
                    
                    for row in records:
                        src = row['source'] or "General"
                        tgt = row['target'] or "General"
                        
                        if src not in nodes_dict:
                            nodes_dict[src] = {"id": src, "label": src, "val": 1}
                        if tgt not in nodes_dict:
                            nodes_dict[tgt] = {"id": tgt, "label": tgt, "val": 1}
                            
                        nodes_dict[src]["val"] += 1
                        nodes_dict[tgt]["val"] += 1
                        
                        edges.append({
                            "source": src,
                            "target": tgt,
                            "type": row['type'],
                            "count": row['count']
                        })
                    
                    return {
                        "nodes": list(nodes_dict.values()), 
                        "edges": edges,
                        "engine": "neo4j"
                    }
            except Exception as e:
                logger.warning(f"🕸️ Knowledge Graph: Failed to fetch dashboard graph from Neo4j: {e}")

        # ─────────────────────────────────────────────────────────────
        # 2. Fallback to PostgreSQL (Simplified Stats)
        # ─────────────────────────────────────────────────────────────
        pool = await get_db()
        node_rows = await pool.fetch("""
            SELECT ue.source_table,
                   COUNT(DISTINCT ue.id) as chunk_count,
                   COUNT(DISTINCT ce.id) as entity_count
            FROM unified_embeddings ue
            LEFT JOIN chunk_entities ce ON ce.chunk_id = ue.id
            GROUP BY ue.source_table
            ORDER BY chunk_count DESC
        """)

        nodes = [
            {
                "id": row['source_table'],
                "label": row['source_table'].replace('csv_', '').replace('vergilex_', ''),
                "val": row['chunk_count'], 
                "chunk_count": row['chunk_count'],
                "entity_count": row['entity_count'],
            }
            for row in node_rows
        ]

        edge_rows = await pool.fetch("""
            SELECT src.source_table as source, tgt.source_table as target,
                   cr.relationship_type, COUNT(*) as count
            FROM chunk_relationships cr
            JOIN unified_embeddings src ON cr.source_chunk_id = src.id
            JOIN unified_embeddings tgt ON cr.target_chunk_id = tgt.id
            WHERE cr.target_chunk_id IS NOT NULL
            GROUP BY src.source_table, tgt.source_table, cr.relationship_type
            ORDER BY count DESC
        """)

        edges = [
            {
                "source": row['source'],
                "target": row['target'],
                "type": row['relationship_type'],
                "count": row['count'],
            }
            for row in edge_rows
        ]

        return {"nodes": nodes, "edges": edges, "engine": "postgresql"}

    # ─────────────────────────────────────────────────────────────────
    # Optimized Batch Processing
    # ─────────────────────────────────────────────────────────────────

    async def extract_batch_optimized(
        self,
        source_table: Optional[str] = None,
        source_type: Optional[str] = None,
        limit: int = 50,
        offset: int = 0,
        force_reprocess: bool = False
    ) -> Dict[str, Any]:
        """
        Optimized batch extraction with parallel processing.
        Returns immediate results (not background job).
        
        Args:
            source_table: Source table to extract from
            source_type: Source type to filter by
            limit: Maximum number of chunks to process
            offset: Offset for pagination
            force_reprocess: Force reprocess even if already extracted
        
        Returns:
            Dictionary with extraction results
        """
        start_time = time.time()
        
        # 1. Batch fetch
        pool = await get_db()
        query = """
        SELECT id, content, metadata, source_table, source_type
        FROM unified_embeddings
        WHERE content IS NOT NULL AND content != ''
        """
        params = []
        param_count = 0
        
        if source_table:
            query += f" AND source_table = ${param_count + 1}"
            params.append(source_table)
            param_count += 1
        
        if source_type:
            query += f" AND source_type = ${param_count + 1}"
            params.append(source_type)
            param_count += 1
        
        if not force_reprocess:
            query += """
            AND id NOT IN (SELECT DISTINCT chunk_id FROM chunk_entities)
            """
        
        query += " ORDER BY id LIMIT $1 OFFSET $2"
        params.extend([limit, offset])
        
        rows = await pool.fetch(query, *params)
        
        if not rows:
            return {
                "job_id": str(uuid.uuid4()),
                "total": 0,
                "success": 0,
                "failed": 0,
                "results": [],
                "status": "completed",
                "extraction_time_ms": 0
            }
        
        # 2. Parallel extraction
        tasks = [
            self.extract_from_chunk(
                chunk_id=row['id'],
                content=row['content'],
                metadata=json.loads(row['metadata']) if row['metadata'] else {},
                source_table=row['source_table'],
                source_type=row['source_type']
            )
            for row in rows
        ]
        
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        # 3. Process results
        success_count = sum(1 for r in results if not isinstance(r, Exception))
        failed_count = len(results) - success_count
        total_time = (time.time() - start_time) * 1000
        
        # 4. Calculate statistics
        avg_entities = sum(
            r.get('entities_stored', 0)
            for r in results
            if not isinstance(r, Exception)
        ) / success_count if success_count > 0 else 0
        
        avg_references = sum(
            r.get('relationships_stored', 0)
            for r in results
            if not isinstance(r, Exception)
        ) / success_count if success_count > 0 else 0
        
        avg_time = sum(
            r.get('extraction_time_ms', 0)
            for r in results
            if not isinstance(r, Exception)
        ) / success_count if success_count > 0 else 0
        
        return {
            "job_id": str(uuid.uuid4()),
            "total": len(rows),
            "success": success_count,
            "failed": failed_count,
            "results": results,
            "status": "completed",
            "extraction_time_ms": round(total_time, 1),
            "avg_entities_per_chunk": round(avg_entities, 1),
            "avg_references_per_chunk": round(avg_references, 1),
            "avg_extraction_time_ms": round(avg_time, 1)
        }

    # ─────────────────────────────────────────────────────────────────
    # Dynamic Confidence Threshold
    # ─────────────────────────────────────────────────────────────────

    async def _get_dynamic_confidence_threshold(self, workspace_id: str) -> float:
        """
        Get dynamic confidence threshold based on workspace data quality.
        
        Args:
            workspace_id: Workspace ID for filtering
        
        Returns:
            Dynamic confidence threshold (0.5 - 0.95)
        """
        settings = await self._get_settings()
        base_threshold = float(settings.get('confidenceThreshold', DEFAULT_CONFIDENCE_THRESHOLD))
        
        # Get workspace statistics
        pool = await get_db()
        stats = await pool.fetchrow("""
            SELECT
                COUNT(*) as total,
                COUNT(CASE WHEN confidence >= $1 THEN 1 END) as high_conf
            FROM chunk_relationships
            WHERE workspace_id = $2
        """, base_threshold, workspace_id)
        
        if stats and stats['total'] > 0:
            confidence_rate = stats['high_conf'] / stats['total']
            # Adjust threshold based on confidence rate
            if confidence_rate > 0.8:
                return min(base_threshold + 0.1, 0.95)
            elif confidence_rate < 0.5:
                return max(base_threshold - 0.1, 0.5)
        
        return base_threshold

    # ─────────────────────────────────────────────────────────────────
    # Entity Resolution with Caching
    # ─────────────────────────────────────────────────────────────────

    async def _resolve_entity_cached(
        self,
        law_code: str,
        article_number: str,
        workspace_id: str
    ) -> Optional[int]:
        """
        Resolve entity to chunk ID with Redis caching.
        
        Args:
            law_code: Law code (e.g., "VUK")
            article_number: Article number (e.g., "114")
            workspace_id: Workspace ID for filtering
        
        Returns:
            Chunk ID if found, None otherwise
        """
        cache_key = f"entity:resolve:{workspace_id}:{law_code}:{article_number}"
        cached = await cache_get(cache_key)
        if cached:
            return int(cached)
        
        pool = await get_db()
        chunk_id = await pool.fetchval("""
            SELECT id FROM unified_embeddings
            WHERE metadata->>'law_code' = $1
            AND metadata->>'article_number' = $2
            LIMIT 1
        """, law_code, str(article_number))
        
        if chunk_id:
            await cache_set(cache_key, str(chunk_id), ttl=3600)
        
        return chunk_id

    # ─────────────────────────────────────────────────────────────────
    # Metrics Tracking
    # ─────────────────────────────────────────────────────────────────

    async def track_extraction_metrics(
        self,
        chunk_id: int,
        entities_count: int,
        references_count: int,
        confidence_avg: float,
        model_used: str,
        fallback_used: bool
    ) -> Dict[str, Any]:
        """
        Track extraction quality metrics.
        
        Args:
            chunk_id: Chunk ID
            entities_count: Number of entities extracted
            references_count: Number of references extracted
            confidence_avg: Average confidence score
            model_used: Model used for extraction
            fallback_used: Whether regex fallback was used
        
        Returns:
            Metrics dictionary
        """
        metrics = {
            "chunk_id": chunk_id,
            "entities_count": entities_count,
            "references_count": references_count,
            "confidence_avg": confidence_avg,
            "model_used": model_used,
            "fallback_used": fallback_used,
            "timestamp": datetime.utcnow().isoformat(),
            "quality_score": self._calculate_quality_score(
                entities_count, references_count, confidence_avg
            )
        }
        
        # Log to database
        pool = await get_db()
        try:
            await pool.execute("""
                INSERT INTO extraction_metrics (
                    chunk_id, entities_count, references_count,
                    confidence_avg, model_used, fallback_used, quality_score
                ) VALUES ($1, $2, $3, $4, $5, $6, $7)
            """, chunk_id, entities_count, references_count, confidence_avg, model_used, fallback_used, metrics['quality_score'])
        except Exception as e:
            logger.warning(f"[RelExtract] Failed to log metrics: {e}")
        
        # Alert if quality is low
        if metrics['quality_score'] < 0.5:
            logger.warning(f"Low quality extraction for chunk {chunk_id}: {metrics}")
        
        return metrics

    def _calculate_quality_score(
        self,
        entities_count: int,
        references_count: int,
        confidence_avg: float
    ) -> float:
        """
        Calculate extraction quality score.
        
        Args:
            entities_count: Number of entities
            references_count: Number of references
            confidence_avg: Average confidence
        
        Returns:
            Quality score (0.0 - 1.0)
        """
        entity_score = min(entities_count / 10.0, 0.3)
        reference_score = min(references_count / 5.0, 0.4)
        confidence_score = confidence_avg * 0.3
        
        return entity_score + reference_score + confidence_score

    # ─────────────────────────────────────────────────────────────────
    # Performance Measurement
    # ─────────────────────────────────────────────────────────────────

    async def measure_performance(
        self,
        operation: str,
        chunk_id: int,
        start_time: float
    ) -> Dict[str, Any]:
        """
        Measure and log performance metrics.
        
        Args:
            operation: Operation name
            chunk_id: Chunk ID
            start_time: Start time in seconds
        
        Returns:
            Performance metrics dictionary
        """
        end_time = time.time()
        duration_ms = (end_time - start_time) * 1000
        
        metrics = {
            "operation": operation,
            "chunk_id": chunk_id,
            "duration_ms": duration_ms,
            "timestamp": datetime.utcnow().isoformat()
        }
        
        # Log to database
        pool = await get_db()
        try:
            await pool.execute("""
                INSERT INTO performance_metrics (
                    operation, chunk_id, duration_ms, timestamp
                ) VALUES ($1, $2, $3, $4)
            """, operation, chunk_id, duration_ms, metrics['timestamp'])
        except Exception as e:
            logger.warning(f"[RelExtract] Failed to log performance: {e}")
        
        # Alert if performance is slow
        if duration_ms > 5000:  # 5 seconds
            logger.warning(f"Slow operation: {operation} for chunk {chunk_id} took {duration_ms}ms")
        
        return metrics


# ═══════════════════════════════════════════════════════════════════════════
# SINGLETON
# ═══════════════════════════════════════════════════════════════════════════

_service_instance: Optional[RelationshipExtractionService] = None

def get_relationship_extraction_service() -> RelationshipExtractionService:
    """Get singleton instance of RelationshipExtractionService."""
    global _service_instance
    if _service_instance is None:
        _service_instance = RelationshipExtractionService()
    return _service_instance
