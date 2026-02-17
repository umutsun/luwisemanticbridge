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
                        metadata = json.loads(row['metadata']) if row['metadata'] else {}
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

    async def resolve_references(self, dry_run: bool = False) -> Dict[str, Any]:
        """
        Resolve unresolved references by matching target_law_code + target_article_number
        to unified_embeddings metadata.
        """
        pool = await get_db()

        # Count unresolved
        total_unresolved = await pool.fetchval("""
            SELECT COUNT(*) FROM chunk_relationships
            WHERE target_chunk_id IS NULL AND target_law_code IS NOT NULL
        """)

        if dry_run:
            # Find how many could be resolved
            resolvable = await pool.fetchval("""
                SELECT COUNT(*) FROM chunk_relationships cr
                WHERE cr.target_chunk_id IS NULL
                  AND cr.target_law_code IS NOT NULL
                  AND EXISTS (
                    SELECT 1 FROM unified_embeddings ue
                    WHERE ue.metadata->>'law_code' = cr.target_law_code
                      AND ue.metadata->>'article_number' = cr.target_article_number
                  )
            """)
            return {
                "total_unresolved": total_unresolved,
                "resolved": 0,
                "resolvable": resolvable,
                "still_unresolved": total_unresolved,
                "dry_run": True,
            }

        # Resolve
        result = await pool.execute("""
            UPDATE chunk_relationships cr
            SET target_chunk_id = ue.id, updated_at = NOW()
            FROM unified_embeddings ue
            WHERE cr.target_chunk_id IS NULL
              AND cr.target_law_code IS NOT NULL
              AND ue.metadata->>'law_code' = cr.target_law_code
              AND ue.metadata->>'article_number' = cr.target_article_number
        """)

        resolved_count = int(result.split()[-1]) if result else 0
        still_unresolved = total_unresolved - resolved_count

        return {
            "total_unresolved": total_unresolved,
            "resolved": resolved_count,
            "still_unresolved": still_unresolved,
            "dry_run": False,
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
        Returns {chunk_id: [relationships]}.
        """
        if not chunk_ids:
            return {}

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
        """Get overall extraction statistics."""
        pool = await get_db()

        total_chunks = await pool.fetchval("SELECT COUNT(*) FROM unified_embeddings")
        chunks_with_rels = await pool.fetchval(
            "SELECT COUNT(DISTINCT source_chunk_id) FROM chunk_relationships"
        )
        chunks_with_entities = await pool.fetchval(
            "SELECT COUNT(DISTINCT chunk_id) FROM chunk_entities"
        )
        total_rels = await pool.fetchval("SELECT COUNT(*) FROM chunk_relationships")
        total_entities = await pool.fetchval("SELECT COUNT(*) FROM chunk_entities")
        unresolved = await pool.fetchval(
            "SELECT COUNT(*) FROM chunk_relationships WHERE target_chunk_id IS NULL AND target_law_code IS NOT NULL"
        )

        # Relationships by type
        rel_rows = await pool.fetch(
            "SELECT relationship_type, COUNT(*) as cnt FROM chunk_relationships GROUP BY relationship_type"
        )
        rels_by_type = {r['relationship_type']: r['cnt'] for r in rel_rows}

        # Entities by type
        ent_rows = await pool.fetch(
            "SELECT entity_type, COUNT(*) as cnt FROM chunk_entities GROUP BY entity_type"
        )
        ents_by_type = {r['entity_type']: r['cnt'] for r in ent_rows}

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
