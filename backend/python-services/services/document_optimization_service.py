"""
Document Embeddings Optimization Service
=========================================
Analyze and fix OCR artifacts in document_embeddings table.
Runs as async background task with progress tracking.

Two-layer strategy:
  Layer 1 (Regex): Deterministic fixes for spaced letters, word-breaks, metadata spacing
  Layer 2 (LLM): GPT-4o-mini for complex concatenated text that regex can't resolve
"""

import os
import re
import json
import asyncio
import hashlib
import time
from datetime import datetime
from typing import Dict, List, Tuple, Optional, Any
from html import unescape

import asyncpg
from loguru import logger

from services.database import get_db

# ---------------------------------------------------------------------------
# Turkish character sets
# ---------------------------------------------------------------------------
TR_UPPER = 'A-ZÇĞİÖŞÜ'
TR_LOWER = 'a-zçğıöşü'
TR_ALL = f'{TR_UPPER}{TR_LOWER}'


# ===================================================================
# OCR Fix Functions (ported from rag-chat.service.ts)
# ===================================================================

def fix_spaced_letters(text: str) -> str:
    """Fix single-letter spacing: "D A N I Ş T A Y" → "DANIŞTAY" """
    if not text:
        return text

    def _join(m):
        return m.group(0).replace(' ', '')

    return re.sub(
        rf'\b([{TR_UPPER}]) ([{TR_UPPER}]) ([{TR_UPPER}](?:\s[{TR_UPPER}])*)\b',
        _join, text
    )


def fix_word_break_spacing(text: str) -> str:
    """Fix OCR word-break artifacts: "çal ı şanlar" → "çalışanlar" """
    if not text:
        return text
    result = text
    for _ in range(5):
        prev = result
        result = re.sub(
            rf'([{TR_ALL}]) ([ıİşŞğĞüÜöÖçÇ]) ([{TR_ALL}])',
            r'\1\2\3', result
        )
        result = re.sub(
            rf'([{TR_ALL}]) ([{TR_ALL}]{{1,2}}) ([{TR_LOWER}])',
            r'\1\2\3', result
        )
        if result == prev:
            break
    return result


def fix_turkish_word_spacing(text: str) -> str:
    """Morphology-based Turkish word spacing fix for concatenated OCR text."""
    if not text or len(text) < 20:
        return text

    space_count = len(re.findall(r'\s', text))
    space_ratio = space_count / len(text) if len(text) > 0 else 1
    has_long_upper = bool(re.search(rf'[{TR_UPPER}]{{12,}}', text))
    has_long_mixed = bool(re.search(rf'[{TR_ALL}]{{25,}}', text))
    has_word_num = bool(re.search(rf'[{TR_ALL}]\d{{3,}}[{TR_ALL}]', text))

    if space_ratio > 0.1 and not has_long_upper and not has_long_mixed and not has_word_num:
        return text

    result = text

    # 1. Number-word boundary
    result = re.sub(rf'(\d)([{TR_ALL}]{{2,}})', r'\1 \2', result)
    # 2. CamelCase boundary
    result = re.sub(rf'([{TR_LOWER}]{{2,}})([{TR_UPPER}]{{2,}})', r'\1 \2', result)

    # 3. Turkish suffix boundaries
    suffix_patterns = [
        (rf'(SİNDEN|SİNDE|SİNE|SİNİ|SİNİN)(?=[{TR_UPPER}])', re.IGNORECASE),
        (rf'(MASINDA|MESİNDE|MASINA|MESİNE|MASI|MESİ)(?=[{TR_UPPER}])', re.IGNORECASE),
        (rf'(LARINDA|LERİNDE|LARINDAN|LERİNDEN|LARINA|LERİNE)(?=[{TR_UPPER}])', re.IGNORECASE),
        (rf'(LARIN|LERİN|LARDAN|LERDEN|LARI|LERİ)(?=[{TR_UPPER}])', re.IGNORECASE),
        (rf'(ININ|İNİN|UNUN|ÜNÜN)(?=[{TR_UPPER}])', re.IGNORECASE),
        (rf'(NIN|NİN|NUN|NÜN)(?=[{TR_UPPER}])', re.IGNORECASE),
        (rf'(Sİ|SI|SU|SÜ)(?=[{TR_UPPER}]{{4,}})', re.IGNORECASE),
        (rf'(NU|NÜ|NI|Nİ)(?=[{TR_UPPER}]{{4,}})', re.IGNORECASE),
        (rf'(NDAN|NDEN|NDA|NDE)(?=[{TR_UPPER}])', re.IGNORECASE),
        (rf'(DAN|DEN|TAN|TEN)(?=[{TR_UPPER}]{{3,}})', re.IGNORECASE),
        (rf'(DA|DE|TA|TE)(?=[{TR_UPPER}]{{5,}})', re.IGNORECASE),
        (rf'(DAKİ|DEKİ|TAKİ|TEKİ)(?=[{TR_UPPER}])', re.IGNORECASE),
        (rf'(YLA|YLE|İLE)(?=[{TR_UPPER}]{{3,}})', re.IGNORECASE),
        (rf'(INA|İNE|UNA|ÜNE)(?=[{TR_UPPER}]{{3,}})', re.IGNORECASE),
    ]

    for pattern, flags in suffix_patterns:
        result = re.sub(pattern, r'\1 ', result, flags=flags)

    # 4. Conjunctions
    for conj in ['VE', 'VEYA', 'İLE', 'İÇİN', 'OLAN', 'OLARAK', 'GÖRE', 'DAİR', 'HAKKINDA', 'İLİŞKİN']:
        pat = rf'([{TR_ALL}])(?={re.escape(conj)}(?=[{TR_UPPER}]))'
        result = re.sub(pat, r'\1 ', result, flags=re.IGNORECASE)

    # 5. Lowercase suffix + uppercase
    result = re.sub(
        rf'([{TR_LOWER}]{{3,}}(?:da|de|dan|den|nda|nde|nın|nin|nun|nün|yla|yle))([{TR_UPPER}])',
        r'\1 \2', result
    )

    # 6. Aggressive split for 20+ char sequences
    def _aggressive(m):
        s = m.group(0)
        s = re.sub(r'(ması|mesi|ları|leri|ının|inin|unun|ünün|sından|sinden|sinde|sine|sini|sinin)',
                   r'\1 ', s, flags=re.IGNORECASE)
        return s

    result = re.sub(rf'[{TR_ALL}]{{20,}}', _aggressive, result)

    # 7. Clean multiple spaces
    result = re.sub(r'\s{2,}', ' ', result).strip()
    return result


def fix_metadata_spacing(text: str) -> str:
    """Fix metadata field spacing: "TARİH:2012SAYI" → "TARİH: 2012 SAYI" """
    if not text:
        return ''
    result = text
    result = re.sub(rf'([{TR_ALL}]+):(\S)', r'\1: \2', result)
    result = re.sub(rf'([{TR_LOWER}0-9])([{TR_UPPER}]{{2,}}:)', r'\1 \2', result)
    result = re.sub(rf'([{TR_LOWER}])hk\.', r'\1 hk.', result, flags=re.IGNORECASE)
    result = re.sub(rf'(\d{{1,2}}/\d{{1,2}}/\d{{4}})([{TR_ALL}])', r'\1 \2', result)
    result = re.sub(rf'(\d+\.\d+)([{TR_UPPER}])', r'\1 \2', result)
    result = re.sub(rf'(\d{{2,}})([{TR_UPPER}][{TR_LOWER}])', r'\1 \2', result)
    result = re.sub(rf'(\d{{2,}})([{TR_UPPER}]{{2,}})', r'\1 \2', result)
    result = re.sub(r'\s{2,}', ' ', result).strip()
    return result


def strip_html(text: str) -> str:
    """Remove HTML tags and decode entities."""
    if not text:
        return text
    result = unescape(text)
    result = re.sub(r'<br\s*/?>', '\n', result, flags=re.IGNORECASE)
    result = re.sub(r'</p>', '\n\n', result, flags=re.IGNORECASE)
    result = re.sub(r'</div>', '\n', result, flags=re.IGNORECASE)
    result = re.sub(r'</h[1-6]>', '\n\n', result, flags=re.IGNORECASE)
    result = re.sub(r'<[^>]+>', '', result)
    result = re.sub(r'[ \t]+', ' ', result)
    result = re.sub(r'\n\s*\n\s*\n+', '\n\n', result)
    return result.strip()


def detect_concatenated_text(text: str) -> bool:
    """Detect if text still has concatenated words after regex fixes."""
    if not text or len(text) < 20:
        return False
    if re.search(rf'[{TR_UPPER}]{{12,}}', text):
        return True
    space_count = len(re.findall(r'\s', text))
    if len(text) > 40 and (space_count / len(text)) < 0.05:
        return True
    concat_count = len(re.findall(rf'[{TR_LOWER}][{TR_UPPER}][{TR_LOWER}]', text))
    if concat_count > 3:
        return True
    return False


def apply_all_regex_fixes(text: str) -> Tuple[str, List[str]]:
    """Apply all regex-based OCR fixes. Returns (fixed_text, list_of_fix_types)."""
    if not text:
        return text, []

    fixes = []
    result = text

    new = strip_html(result)
    if new != result:
        fixes.append('html_strip')
        result = new

    new = fix_spaced_letters(result)
    if new != result:
        fixes.append('spaced_letters')
        result = new

    new = fix_word_break_spacing(result)
    if new != result:
        fixes.append('word_breaks')
        result = new

    new = fix_turkish_word_spacing(result)
    if new != result:
        fixes.append('word_spacing')
        result = new

    new = fix_metadata_spacing(result)
    if new != result:
        fixes.append('metadata_spacing')
        result = new

    return result, fixes


def fix_metadata_json(metadata: dict) -> Tuple[dict, List[str]]:
    """Fix OCR artifacts in metadata JSONB. Returns (fixed_meta, changed_fields)."""
    if not metadata or not isinstance(metadata, dict):
        return metadata, []

    changed = []
    fixed = dict(metadata)

    text_fields = ['title', 'baslik', 'konusu', 'daire', 'source_name',
                   'description', 'summary', 'fileName', 'documentTitle']

    for field in text_fields:
        if field in fixed and isinstance(fixed[field], str) and fixed[field]:
            original = fixed[field]
            val = strip_html(original)
            val = fix_spaced_letters(val)
            val = fix_word_break_spacing(val)
            val = fix_turkish_word_spacing(val)
            val = fix_metadata_spacing(val)
            if val != original:
                fixed[field] = val
                changed.append(field)

    # One level of nested dicts
    for key, val in list(fixed.items()):
        if isinstance(val, dict):
            nested, nc = fix_metadata_json(val)
            if nc:
                fixed[key] = nested
                changed.extend([f'{key}.{f}' for f in nc])

    return fixed, changed


# ===================================================================
# SQL detection queries (PostgreSQL regex)
# ===================================================================

DETECTION_WHERE = """
    chunk_text ~ '[A-ZÇĞİÖŞÜ] [A-ZÇĞİÖŞÜ] [A-ZÇĞİÖŞÜ]'
    OR chunk_text ~ '[a-zçğıöşüA-ZÇĞİÖŞÜ] [ıİşŞğĞüÜöÖçÇ] [a-zçğıöşü]'
    OR chunk_text ~ '[A-ZÇĞİÖŞÜ]{12,}'
    OR chunk_text LIKE '%<%>%'
    OR chunk_text LIKE '%&nbsp;%'
    OR chunk_text LIKE '%&rsquo;%'
"""

DETECTION_WHERE_META = """
    OR (metadata IS NOT NULL AND (
        metadata::text ~ '[A-ZÇĞİÖŞÜ] [A-ZÇĞİÖŞÜ] [A-ZÇĞİÖŞÜ]'
        OR metadata::text LIKE '%<%>%'
        OR metadata::text LIKE '%&rsquo;%'
    ))
"""


# ===================================================================
# Service class
# ===================================================================

class DocumentOptimizationService:
    """Async background service for document_embeddings OCR cleanup."""

    def __init__(self):
        self.is_running = False
        self.is_paused = False
        self.current_job: Optional[str] = None  # 'analyze' | 'optimize'

        self.status: Dict[str, Any] = {
            "phase": "idle",       # idle | analyzing | optimizing | re-embedding | completed | error
            "progress": 0,
            "total": 0,
            "processed": 0,
            "chunk_fixes": 0,
            "meta_fixes": 0,
            "llm_fixes": 0,
            "errors": 0,
            "started_at": None,
            "elapsed_seconds": 0,
            "message": "",
            "samples": [],         # Sample before/after for UI display
            "analysis": None,      # Analysis report (from analyze mode)
        }

    def get_status(self) -> Dict[str, Any]:
        if self.status.get("started_at"):
            self.status["elapsed_seconds"] = round(
                time.time() - self.status["started_at"], 1
            )
        return {
            "is_running": self.is_running,
            "is_paused": self.is_paused,
            "current_job": self.current_job,
            **self.status
        }

    def pause(self) -> Dict[str, Any]:
        self.is_paused = True
        return {"success": True, "message": "İşlem duraklatıldı"}

    def resume(self) -> Dict[str, Any]:
        self.is_paused = False
        return {"success": True, "message": "İşlem devam ediyor"}

    def stop(self) -> Dict[str, Any]:
        self.is_running = False
        self.is_paused = False
        self.status["phase"] = "idle"
        self.status["message"] = "İşlem durduruldu"
        logger.info("Document optimization stopped by user")
        return {"success": True, "message": "İşlem durduruldu"}

    def _reset_status(self, phase: str):
        self.status = {
            "phase": phase,
            "progress": 0,
            "total": 0,
            "processed": 0,
            "chunk_fixes": 0,
            "meta_fixes": 0,
            "llm_fixes": 0,
            "errors": 0,
            "started_at": time.time(),
            "elapsed_seconds": 0,
            "message": "Başlatılıyor...",
            "samples": [],
            "analysis": None,
        }

    # ------------------------------------------------------------------
    # ANALYZE
    # ------------------------------------------------------------------
    async def start_analyze(self) -> Dict[str, Any]:
        if self.is_running:
            return {"success": False, "error": "Başka bir işlem devam ediyor"}

        self.is_running = True
        self.current_job = "analyze"
        self._reset_status("analyzing")

        asyncio.create_task(self._run_analyze())

        return {"success": True, "message": "Analiz başlatıldı"}

    async def _run_analyze(self):
        try:
            pool = await get_db()

            # Total count
            total = await pool.fetchval("SELECT COUNT(*) FROM document_embeddings")
            self.status["total"] = total
            self.status["message"] = f"Toplam {total:,} kayıt taranıyor..."

            # Spaced letters
            spaced = await pool.fetchval(f"""
                SELECT COUNT(*) FROM document_embeddings
                WHERE chunk_text ~ '[A-ZÇĞİÖŞÜ] [A-ZÇĞİÖŞÜ] [A-ZÇĞİÖŞÜ]'
            """)

            # Word breaks
            word_breaks = await pool.fetchval(f"""
                SELECT COUNT(*) FROM document_embeddings
                WHERE chunk_text ~ '[a-zçğıöşüA-ZÇĞİÖŞÜ] [ıİşŞğĞüÜöÖçÇ] [a-zçğıöşü]'
            """)

            # Concatenated text
            concat = await pool.fetchval(f"""
                SELECT COUNT(*) FROM document_embeddings
                WHERE chunk_text ~ '[A-ZÇĞİÖŞÜ]{{12,}}'
            """)

            # HTML
            html_count = await pool.fetchval("""
                SELECT COUNT(*) FROM document_embeddings
                WHERE chunk_text LIKE '%<%>%'
                   OR chunk_text LIKE '%&nbsp;%'
                   OR chunk_text LIKE '%&rsquo;%'
            """)

            # Any issue (union)
            any_issue = await pool.fetchval(f"""
                SELECT COUNT(*) FROM document_embeddings
                WHERE {DETECTION_WHERE}
            """)

            # Metadata issues
            meta_issues = await pool.fetchval("""
                SELECT COUNT(*) FROM document_embeddings
                WHERE metadata IS NOT NULL AND (
                    metadata::text ~ '[A-ZÇĞİÖŞÜ] [A-ZÇĞİÖŞÜ] [A-ZÇĞİÖŞÜ]'
                    OR metadata::text LIKE '%<%>%'
                    OR metadata::text LIKE '%&rsquo;%'
                )
            """)

            # Sample records with before/after
            samples = []
            rows = await pool.fetch(f"""
                SELECT id, document_id, chunk_text, metadata
                FROM document_embeddings
                WHERE {DETECTION_WHERE}
                ORDER BY id LIMIT 8
            """)
            for row in rows:
                chunk = row['chunk_text'] or ''
                fixed, fix_types = apply_all_regex_fixes(chunk)
                meta = json.loads(row['metadata']) if row['metadata'] else {}
                _, meta_changes = fix_metadata_json(meta)

                samples.append({
                    "id": row['id'],
                    "document_id": row['document_id'],
                    "before": chunk[:150],
                    "after": fixed[:150],
                    "fix_types": fix_types,
                    "meta_changes": meta_changes,
                    "changed": fixed != chunk or bool(meta_changes),
                })

            analysis = {
                "total_records": total,
                "affected_records": any_issue,
                "clean_records": total - any_issue,
                "issues": {
                    "spaced_letters": spaced,
                    "word_breaks": word_breaks,
                    "concatenated": concat,
                    "html": html_count,
                    "metadata": meta_issues,
                },
                "samples": samples,
            }

            self.status["analysis"] = analysis
            self.status["samples"] = samples
            self.status["phase"] = "completed"
            self.status["message"] = f"Analiz tamamlandı: {any_issue:,}/{total:,} kayıtta sorun bulundu"
            self.status["processed"] = total

            logger.info(f"Document optimization analysis complete: {any_issue}/{total} affected")

        except Exception as e:
            logger.error(f"Analyze failed: {e}")
            self.status["phase"] = "error"
            self.status["message"] = f"Analiz hatası: {str(e)}"
            self.status["errors"] += 1
        finally:
            self.is_running = False
            self.current_job = None

    # ------------------------------------------------------------------
    # OPTIMIZE (fix)
    # ------------------------------------------------------------------
    async def start_optimize(self, use_llm: bool = False, batch_size: int = 100) -> Dict[str, Any]:
        if self.is_running:
            return {"success": False, "error": "Başka bir işlem devam ediyor"}

        self.is_running = True
        self.current_job = "optimize"
        self._reset_status("optimizing")

        asyncio.create_task(self._run_optimize(use_llm, batch_size))

        return {"success": True, "message": "Optimizasyon başlatıldı"}

    async def _run_optimize(self, use_llm: bool, batch_size: int):
        llm_client = None
        if use_llm:
            try:
                from openai import OpenAI
                api_key = os.environ.get('OPENAI_API_KEY', '')
                if api_key:
                    llm_client = OpenAI(api_key=api_key)
                    logger.info("LLM client initialized for document optimization")
                else:
                    logger.warning("OPENAI_API_KEY not set, LLM layer disabled")
            except ImportError:
                logger.warning("openai package not installed, LLM layer disabled")

        try:
            pool = await get_db()

            # Count affected
            total_affected = await pool.fetchval(f"""
                SELECT COUNT(*) FROM document_embeddings
                WHERE {DETECTION_WHERE} {DETECTION_WHERE_META}
            """)
            self.status["total"] = total_affected
            self.status["message"] = f"{total_affected:,} sorunlu kayıt düzeltiliyor..."

            if total_affected == 0:
                self.status["phase"] = "completed"
                self.status["message"] = "Düzeltilecek kayıt bulunamadı"
                self.is_running = False
                self.current_job = None
                return

            offset = 0
            while self.is_running:
                # Check pause
                while self.is_paused and self.is_running:
                    self.status["message"] = "Duraklatıldı..."
                    await asyncio.sleep(1)

                if not self.is_running:
                    break

                rows = await pool.fetch(f"""
                    SELECT id, chunk_text, metadata
                    FROM document_embeddings
                    WHERE {DETECTION_WHERE} {DETECTION_WHERE_META}
                    ORDER BY id
                    LIMIT {batch_size}
                """)

                if not rows:
                    break

                for row in rows:
                    if not self.is_running:
                        break

                    record_id = row['id']
                    chunk = row['chunk_text'] or ''
                    metadata = json.loads(row['metadata']) if row['metadata'] else {}

                    # Layer 1: Regex fixes
                    fixed_chunk, fix_types = apply_all_regex_fixes(chunk)
                    chunk_changed = fixed_chunk != chunk

                    # Layer 2: LLM (if enabled and still has issues)
                    if use_llm and llm_client and detect_concatenated_text(fixed_chunk):
                        try:
                            llm_result = await asyncio.get_event_loop().run_in_executor(
                                None, self._llm_fix, fixed_chunk, llm_client
                            )
                            if llm_result and llm_result != fixed_chunk:
                                fixed_chunk = llm_result
                                fix_types.append('llm')
                                self.status["llm_fixes"] += 1
                                chunk_changed = True
                        except Exception as e:
                            logger.warning(f"LLM fix failed for id={record_id}: {e}")

                    # Fix metadata
                    fixed_meta, meta_changes = fix_metadata_json(metadata)
                    meta_changed = bool(meta_changes)

                    if chunk_changed or meta_changed:
                        await pool.execute("""
                            UPDATE document_embeddings
                            SET chunk_text = $1, metadata = $2::jsonb
                            WHERE id = $3
                        """, fixed_chunk, json.dumps(fixed_meta), record_id)

                        if chunk_changed:
                            self.status["chunk_fixes"] += 1
                        if meta_changed:
                            self.status["meta_fixes"] += 1

                    self.status["processed"] += 1
                    self.status["progress"] = round(
                        self.status["processed"] / self.status["total"] * 100, 1
                    ) if self.status["total"] > 0 else 0

                elapsed = time.time() - self.status["started_at"]
                rate = self.status["processed"] / elapsed if elapsed > 0 else 0
                self.status["message"] = (
                    f'{self.status["processed"]:,}/{self.status["total"]:,} işlendi | '
                    f'Chunk: {self.status["chunk_fixes"]:,} | Meta: {self.status["meta_fixes"]:,} | '
                    f'{rate:.0f}/sn'
                )

            if self.is_running:
                self.status["phase"] = "completed"
                self.status["progress"] = 100
                self.status["message"] = (
                    f'Tamamlandı! {self.status["chunk_fixes"]:,} chunk + '
                    f'{self.status["meta_fixes"]:,} metadata düzeltildi'
                )
                logger.info(
                    f"Document optimization complete: "
                    f"{self.status['chunk_fixes']} chunk fixes, "
                    f"{self.status['meta_fixes']} meta fixes"
                )

        except Exception as e:
            logger.error(f"Optimize failed: {e}")
            self.status["phase"] = "error"
            self.status["message"] = f"Optimizasyon hatası: {str(e)}"
            self.status["errors"] += 1
        finally:
            self.is_running = False
            self.current_job = None

    def _llm_fix(self, text: str, client) -> Optional[str]:
        """Sync LLM call (run in executor for async compat)."""
        if not text or len(text) < 20:
            return text

        text_to_fix = text[:2000]
        prompt = """Sen bir OCR hata düzeltme uzmanısın. Metin PDF/OCR taramasından geldi ve kelimeler arasında boşluklar eksik veya hatalı.

GÖREV: Kelimeleri ayır ve doğru boşlukları ekle.

KURALLAR:
- SADECE boşluk ekle/düzelt, kelime değiştirme
- Orijinal harfleri AYNEN koru
- Noktalama ve sayıları koru

ÖRNEK:
"VERASETİNTİKALVERGİSİKANUNU" → "VERASET İNTİKAL VERGİSİ KANUNU"
"m ükellef bak ımından" → "mükellef bakımından"

METİN:
""" + text_to_fix + "\n\nDÜZELTİLMİŞ:"

        try:
            response = client.chat.completions.create(
                model='gpt-4o-mini',
                messages=[{"role": "user", "content": prompt}],
                temperature=0.1,
                max_tokens=2500
            )
            normalized = response.choices[0].message.content.strip()
            for prefix in ['DÜZELTİLMİŞ:', 'DÜZELTİLMİŞ METİN:', 'ÇIKTI:']:
                if normalized.upper().startswith(prefix.upper()):
                    normalized = normalized[len(prefix):].strip()

            ratio = len(normalized) / len(text_to_fix) if len(text_to_fix) > 0 else 0
            if ratio < 0.7 or ratio > 1.4:
                return None

            if len(text) > 2000:
                normalized += text[2000:]
            return normalized
        except Exception as e:
            logger.warning(f"LLM normalization error: {e}")
            return None

    # ------------------------------------------------------------------
    # RE-EMBED
    # ------------------------------------------------------------------
    async def start_reembed(self, batch_size: int = 10, since: Optional[str] = None) -> Dict[str, Any]:
        if self.is_running:
            return {"success": False, "error": "Başka bir işlem devam ediyor"}

        self.is_running = True
        self.current_job = "re-embed"
        self._reset_status("re-embedding")

        asyncio.create_task(self._run_reembed(batch_size, since))

        return {"success": True, "message": "Re-embedding başlatıldı"}

    async def _run_reembed(self, batch_size: int, since: Optional[str]):
        try:
            from openai import AsyncOpenAI
            api_key = os.environ.get('OPENAI_API_KEY', '')
            if not api_key:
                self.status["phase"] = "error"
                self.status["message"] = "OPENAI_API_KEY ayarlanmamış"
                self.is_running = False
                return

            client = AsyncOpenAI(api_key=api_key)
            pool = await get_db()

            # Find records needing re-embedding
            if since:
                total = await pool.fetchval(
                    "SELECT COUNT(*) FROM document_embeddings WHERE updated_at >= $1 OR embedding IS NULL",
                    since
                )
            else:
                total = await pool.fetchval(
                    "SELECT COUNT(*) FROM document_embeddings WHERE embedding IS NULL"
                )

            self.status["total"] = total
            self.status["message"] = f"{total:,} kayıt için embedding oluşturuluyor..."

            if total == 0:
                self.status["phase"] = "completed"
                self.status["message"] = "Re-embed edilecek kayıt yok"
                self.is_running = False
                self.current_job = None
                return

            offset = 0
            while self.is_running:
                while self.is_paused and self.is_running:
                    await asyncio.sleep(1)
                if not self.is_running:
                    break

                if since:
                    rows = await pool.fetch("""
                        SELECT id, chunk_text FROM document_embeddings
                        WHERE updated_at >= $1 OR embedding IS NULL
                        ORDER BY id LIMIT $2 OFFSET $3
                    """, since, batch_size, offset)
                else:
                    rows = await pool.fetch("""
                        SELECT id, chunk_text FROM document_embeddings
                        WHERE embedding IS NULL
                        ORDER BY id LIMIT $1 OFFSET $2
                    """, batch_size, offset)

                if not rows:
                    break

                texts = [(row['chunk_text'] or '')[:8000] for row in rows]
                ids = [row['id'] for row in rows]

                try:
                    response = await client.embeddings.create(
                        input=texts, model=EMBEDDING_MODEL
                    )

                    for i, emb_data in enumerate(response.data):
                        vec_str = '[' + ','.join(str(x) for x in emb_data.embedding) + ']'
                        await pool.execute("""
                            UPDATE document_embeddings
                            SET embedding = $1::vector, model_name = $2, tokens_used = $3
                            WHERE id = $4
                        """, vec_str, EMBEDDING_MODEL, len(texts[i]) // 4, ids[i])

                    self.status["processed"] += len(rows)
                    self.status["progress"] = round(
                        self.status["processed"] / self.status["total"] * 100, 1
                    ) if self.status["total"] > 0 else 0
                    self.status["message"] = f'{self.status["processed"]:,}/{self.status["total"]:,} embedding oluşturuldu'

                except Exception as e:
                    self.status["errors"] += 1
                    logger.error(f"Re-embed batch error: {e}")
                    if 'rate_limit' in str(e).lower():
                        await asyncio.sleep(60)
                    else:
                        await asyncio.sleep(5)

                offset += batch_size
                await asyncio.sleep(0.3)

            if self.is_running:
                self.status["phase"] = "completed"
                self.status["progress"] = 100
                self.status["message"] = f'{self.status["processed"]:,} embedding başarıyla oluşturuldu'

        except Exception as e:
            logger.error(f"Re-embed failed: {e}")
            self.status["phase"] = "error"
            self.status["message"] = f"Re-embed hatası: {str(e)}"
        finally:
            self.is_running = False
            self.current_job = None


# Singleton
doc_optimization_service = DocumentOptimizationService()
