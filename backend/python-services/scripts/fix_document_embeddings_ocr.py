#!/usr/bin/env python3
"""
Fix OCR artifacts in document_embeddings table.
Cleans chunk_text content and metadata JSONB fields using deterministic regex fixes.

Two-layer fix strategy:
  Layer 1 (Regex): Deterministic regex fixes - always applied
    - Single-letter spacing:  "D A N I Ş T A Y" → "DANIŞTAY"
    - Word-break spacing:     "çal ı şanlar"    → "çalışanlar"
    - Metadata spacing:       "TARİH:2012SAYI"  → "TARİH: 2012 SAYI"
    - Concatenated text:      "VERGİSİKANUNU"   → "VERGİSİ KANUNU"
  Layer 2 (LLM): GPT-4o-mini for complex cases that regex can't fully resolve
    - Enabled with --llm flag
    - Only processes records still having issues after Layer 1

Usage:
    python fix_document_embeddings_ocr.py analyze [--db DB_NAME] [--limit N]
    python fix_document_embeddings_ocr.py fix [--db DB_NAME] [--dry-run] [--batch-size N] [--llm]
    python fix_document_embeddings_ocr.py re-embed [--db DB_NAME] [--batch-size N] [--since TIMESTAMP]
"""

import os
import sys
import re
import json
import time
import hashlib
import argparse
import logging
from datetime import datetime
from typing import Dict, List, Tuple, Optional, Any

import psycopg2
from psycopg2.extras import RealDictCursor, execute_batch

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
DB_HOST = os.environ.get('DB_HOST', 'localhost')
DB_PORT = os.environ.get('DB_PORT', '5432')
DB_USER = os.environ.get('DB_USER', 'postgres')
DB_PASS = os.environ.get('DB_PASS', 'Luwi2025SecurePGx7749')
DEFAULT_DB = os.environ.get('TARGET_DB', 'vergilex_lsemb')
EMBEDDING_MODEL = 'text-embedding-3-small'
EMBEDDING_DIM = 1536

# Logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    datefmt='%H:%M:%S'
)
logger = logging.getLogger('fix_doc_embeddings')

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
    """Fix single-letter spacing in uppercase text.
    "D A N I Ş T A Y" → "DANIŞTAY"
    Generic: joins 3+ consecutive spaced uppercase Turkish chars.
    """
    if not text:
        return text

    # Match sequences of spaced uppercase letters (3+ letters)
    # e.g. "D A N I Ş T A Y" or "V E R G İ"
    def _join_spaced(m):
        return m.group(0).replace(' ', '')

    return re.sub(
        rf'\b([{TR_UPPER}]) ([{TR_UPPER}]) ([{TR_UPPER}](?:\s[{TR_UPPER}])*)\b',
        _join_spaced,
        text
    )


def fix_turkish_word_spacing(text: str) -> str:
    """Morphology-based Turkish word spacing fix for concatenated OCR text.
    Ported from rag-chat.service.ts:8779-8863.
    """
    if not text or len(text) < 20:
        return text

    # Quick exit: if text already has good spacing, skip
    space_count = len(re.findall(r'\s', text))
    space_ratio = space_count / len(text) if len(text) > 0 else 1
    has_long_upper = bool(re.search(rf'[{TR_UPPER}]{{12,}}', text))
    has_long_mixed = bool(re.search(rf'[{TR_ALL}]{{25,}}', text))
    has_word_num_join = bool(re.search(rf'[{TR_ALL}]\d{{3,}}[{TR_ALL}]', text))

    if space_ratio > 0.1 and not has_long_upper and not has_long_mixed and not has_word_num_join:
        return text

    result = text

    # 1. Number-to-word boundary
    result = re.sub(rf'(\d)([{TR_ALL}]{{2,}})', r'\1 \2', result)

    # 2. CamelCase boundary (lowercase → uppercase)
    result = re.sub(rf'([{TR_LOWER}]{{2,}})([{TR_UPPER}]{{2,}})', r'\1 \2', result)

    # 3. Turkish morphological suffix boundaries
    # After these suffixes, a new word likely begins (lookahead for uppercase)
    suffix_patterns = [
        # Derivational (longest first)
        (rf'(SİNDEN|SİNDE|SİNE|SİNİ|SİNİN)(?=[{TR_UPPER}])', re.IGNORECASE),
        # Verbal noun + case
        (rf'(MASINDA|MESİNDE|MASINA|MESİNE|MASI|MESİ)(?=[{TR_UPPER}])', re.IGNORECASE),
        # Plural + case
        (rf'(LARINDA|LERİNDE|LARINDAN|LERİNDEN|LARINA|LERİNE)(?=[{TR_UPPER}])', re.IGNORECASE),
        (rf'(LARIN|LERİN|LARDAN|LERDEN|LARI|LERİ)(?=[{TR_UPPER}])', re.IGNORECASE),
        # Genitive/possessive (long)
        (rf'(ININ|İNİN|UNUN|ÜNÜN)(?=[{TR_UPPER}])', re.IGNORECASE),
        (rf'(NIN|NİN|NUN|NÜN)(?=[{TR_UPPER}])', re.IGNORECASE),
        # Possessive -Sİ (vergisi, kanunu) - 4+ following chars
        (rf'(Sİ|SI|SU|SÜ)(?=[{TR_UPPER}]{{4,}})', re.IGNORECASE),
        # Accusative/possessive -NU/-NÜ - 4+ following chars
        (rf'(NU|NÜ|NI|Nİ)(?=[{TR_UPPER}]{{4,}})', re.IGNORECASE),
        # Locative, ablative
        (rf'(NDAN|NDEN|NDA|NDE)(?=[{TR_UPPER}])', re.IGNORECASE),
        (rf'(DAN|DEN|TAN|TEN)(?=[{TR_UPPER}]{{3,}})', re.IGNORECASE),
        # DA/DE/TA/TE - very short, 5+ following chars
        (rf'(DA|DE|TA|TE)(?=[{TR_UPPER}]{{5,}})', re.IGNORECASE),
        # Relative/adjective
        (rf'(DAKİ|DEKİ|TAKİ|TEKİ)(?=[{TR_UPPER}])', re.IGNORECASE),
        # Instrumental/comitative
        (rf'(YLA|YLE|İLE)(?=[{TR_UPPER}]{{3,}})', re.IGNORECASE),
        # Dative
        (rf'(INA|İNE|UNA|ÜNE)(?=[{TR_UPPER}]{{3,}})', re.IGNORECASE),
    ]

    for pattern, flags in suffix_patterns:
        result = re.sub(pattern, r'\1 ', result, flags=flags)

    # 4. Conjunctions as word boundaries
    conjunctions = ['VE', 'VEYA', 'İLE', 'İÇİN', 'OLAN', 'OLARAK', 'GÖRE', 'DAİR', 'HAKKINDA', 'İLİŞKİN']
    for conj in conjunctions:
        pat = rf'([{TR_ALL}])(?={re.escape(conj)}(?=[{TR_UPPER}]))'
        result = re.sub(pat, r'\1 ', result, flags=re.IGNORECASE)

    # 5. Lowercase suffix ending + uppercase word start
    result = re.sub(
        rf'([{TR_LOWER}]{{3,}}(?:da|de|dan|den|nda|nde|nın|nin|nun|nün|yla|yle))([{TR_UPPER}])',
        r'\1 \2', result
    )

    # 6. Aggressive split for remaining 20+ char sequences without space
    def _aggressive_split(m):
        s = m.group(0)
        s = re.sub(
            r'(ması|mesi|ları|leri|ının|inin|unun|ünün|sından|sinden|sinde|sine|sini|sinin)',
            r'\1 ', s, flags=re.IGNORECASE
        )

        def _suffix_split(sm):
            suffix = sm.group(1)
            full = sm.group(0)
            after_len = len(sm.string[sm.end():])
            # Only add space if 3+ chars remaining in the original match
            rest = sm.string[sm.end():]
            if len(rest) >= 3:
                return suffix + ' '
            return full

        s = re.sub(
            r'(ndan|nden|nda|nde|dan|den|nin|nın|nun|nün)',
            _suffix_split, s, flags=re.IGNORECASE
        )
        return s

    result = re.sub(rf'[{TR_ALL}]{{20,}}', _aggressive_split, result)

    # 7. Clean up multiple spaces
    result = re.sub(r'\s{2,}', ' ', result).strip()

    return result


def fix_word_break_spacing(text: str) -> str:
    """Fix OCR word-break artifacts where Turkish special chars cause breaks.
    "çal ı şanlar" → "çalışanlar", "Bakanl ı ğı" → "Bakanlığı"

    Pattern: letter + space + 1-2 Turkish special chars + space + letter
    This is the most common OCR artifact in Turkish PDF scans.
    """
    if not text:
        return text

    # Pattern: a letter, then space, then 1-2 chars (often ı,ş,ğ,ü,ö,ç,İ),
    # then space, then a letter continuing the word
    # e.g. "çal ı şanlar" has "l ı ş" pattern
    # We need multiple passes since fixes can reveal new patterns

    result = text
    for _ in range(5):  # max 5 passes
        prev = result
        # Single Turkish char between spaces, surrounded by word chars
        # "Bakanl ı ğı" → "Bakanlığı"
        result = re.sub(
            rf'([{TR_ALL}]) ([ıİşŞğĞüÜöÖçÇ]) ([{TR_ALL}])',
            r'\1\2\3', result
        )
        # Two-char cluster between spaces: "el çi lik" → "elçilik"
        result = re.sub(
            rf'([{TR_ALL}]) ([{TR_ALL}]{{1,2}}) ([{TR_LOWER}])',
            r'\1\2\3', result
        )
        if result == prev:
            break

    return result


def fix_metadata_spacing(text: str) -> str:
    """Fix spacing in metadata content.
    Ported from rag-chat.service.ts:8975-9006.
    """
    if not text:
        return ''

    result = text
    # Label:value → Label: value
    result = re.sub(rf'([{TR_ALL}]+):(\S)', r'\1: \2', result)
    # valueSAYI: → value SAYI:
    result = re.sub(rf'([{TR_LOWER}0-9])([{TR_UPPER}]{{2,}}:)', r'\1 \2', result)
    # konuhk. → konu hk.
    result = re.sub(rf'([{TR_LOWER}])hk\.', r'\1 hk.', result, flags=re.IGNORECASE)
    # Date + word: 13/09/2012SAYI → 13/09/2012 SAYI
    result = re.sub(rf'(\d{{1,2}}/\d{{1,2}}/\d{{4}})([{TR_ALL}])', r'\1 \2', result)
    # Decimal + uppercase: 120.01SAYI → 120.01 SAYI
    result = re.sub(rf'(\d+\.\d+)([{TR_UPPER}])', r'\1 \2', result)
    # Number + Turkish word: 6728Kabul → 6728 Kabul
    result = re.sub(rf'(\d{{2,}})([{TR_UPPER}][{TR_LOWER}])', r'\1 \2', result)
    # Number + UPPERCASE word: 29796YAYIMLANDIĞI → 29796 YAYIMLANDIĞI
    result = re.sub(rf'(\d{{2,}})([{TR_UPPER}]{{2,}})', r'\1 \2', result)
    # Clean multiple spaces
    result = re.sub(r'\s{2,}', ' ', result).strip()

    return result


def strip_html(text: str) -> str:
    """Remove HTML tags and decode entities."""
    if not text:
        return text

    from html import unescape
    result = unescape(text)

    # Block elements → newlines
    result = re.sub(r'<br\s*/?>', '\n', result, flags=re.IGNORECASE)
    result = re.sub(r'</p>', '\n\n', result, flags=re.IGNORECASE)
    result = re.sub(r'</div>', '\n', result, flags=re.IGNORECASE)
    result = re.sub(r'</h[1-6]>', '\n\n', result, flags=re.IGNORECASE)

    # Remove all remaining tags
    result = re.sub(r'<[^>]+>', '', result)

    # Clean whitespace
    result = re.sub(r'[ \t]+', ' ', result)
    result = re.sub(r'\n\s*\n\s*\n+', '\n\n', result)

    return result.strip()


def detect_has_ocr_issues(text: str) -> dict:
    """Detect what kind of OCR issues exist in text. Returns dict of issue types found."""
    if not text or len(text) < 10:
        return {}

    issues = {}

    # Spaced uppercase letters: "D A N I Ş T A Y"
    spaced_matches = re.findall(
        rf'\b[{TR_UPPER}](?: [{TR_UPPER}]){{2,}}\b', text
    )
    if spaced_matches:
        issues['spaced_letters'] = len(spaced_matches)

    # Word-break spacing: single Turkish char between spaces in word context
    word_break_matches = re.findall(
        rf'[{TR_ALL}] [ıİşŞğĞüÜöÖçÇ] [{TR_ALL}]', text
    )
    if word_break_matches:
        issues['word_breaks'] = len(word_break_matches)

    # Concatenated uppercase: 12+ uppercase chars without spaces
    concat_matches = re.findall(rf'[{TR_UPPER}]{{12,}}', text)
    if concat_matches:
        issues['concatenated'] = len(concat_matches)

    # HTML content
    if re.search(r'<[a-zA-Z][^>]*>', text) or '&nbsp;' in text or '&amp;' in text or '&rsquo;' in text:
        issues['html'] = 1

    return issues


def detect_concatenated_text(text: str) -> bool:
    """Detect if text still has OCR-style concatenated words after regex fixes.
    Ported from rag-chat.service.ts:8870-8887.
    """
    if not text or len(text) < 20:
        return False

    # 12+ consecutive uppercase chars without spaces
    if re.search(rf'[{TR_UPPER}]{{12,}}', text):
        return True

    # Low space ratio (mostly concatenated)
    space_count = len(re.findall(r'\s', text))
    if len(text) > 40 and (space_count / len(text)) < 0.05:
        return True

    # Mixed-case concatenation (lowercase-uppercase-lowercase without space, 3+ times)
    concat_pattern = re.findall(rf'[{TR_LOWER}][{TR_UPPER}][{TR_LOWER}]', text)
    if len(concat_pattern) > 3:
        return True

    return False


def normalize_ocr_with_llm(text: str, client, model: str = 'gpt-4o-mini') -> Tuple[str, bool]:
    """Use LLM to fix severely concatenated text that regex can't resolve.
    Ported from rag-chat.service.ts:8894-8968.

    Returns (fixed_text, was_changed).
    """
    if not text or len(text) < 20:
        return text, False

    # Take first 2000 chars for normalization
    text_to_normalize = text[:2000]

    prompt = """Sen bir OCR hata düzeltme uzmanısın. Aşağıdaki metin PDF/OCR taramasından geldi ve kelimeler arasında boşluklar eksik veya hatalı.

GÖREV: Kelimeleri ayır ve doğru boşlukları ekle. Türkçe dil bilgisi kurallarına göre kelimeleri tanı.

ÖNEMLİ KURALLAR:
- SADECE boşluk ekle/düzelt, kelime değiştirme
- Orijinal harfleri AYNEN koru (büyük/küçük harf dahil)
- Noktalama işaretlerini koru
- Sayıları ve tarihleri koru
- Kısaltmaları koru (VUK, GVK, KDVK, vb.)

ÖRNEK:
GİRDİ: "VERASETİNTİKALVERGİSİKANUNU Madde 13"
ÇIKTI: "VERASET İNTİKAL VERGİSİ KANUNU Madde 13"

GİRDİ: "GELİRVERGİSİKANUNU"
ÇIKTI: "GELİR VERGİSİ KANUNU"

GİRDİ: "m ükellef bak ımından vergi borcunu te şkil etti ği"
ÇIKTI: "mükellef bakımından vergi borcunu teşkil ettiği"

GİRDİ: "Harc ırah Öde melerinin Vergi Kanun ları Kar ş ısında ki Durumu"
ÇIKTI: "Harcırah Ödemelerinin Vergi Kanunları Karşısındaki Durumu"

ŞİMDİ BU METNİ DÜZELT:
""" + text_to_normalize + "\n\nDÜZELTİLMİŞ METİN:"

    try:
        response = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "user", "content": prompt}
            ],
            temperature=0.1,
            max_tokens=2500
        )

        normalized = response.choices[0].message.content.strip()

        # Remove preamble the LLM might add
        for prefix in ['DÜZELTİLMİŞ METİN:', 'ÇIKTI:', 'İşte düzeltilmiş metin:']:
            if normalized.upper().startswith(prefix.upper()):
                normalized = normalized[len(prefix):].strip()

        # Length validation: normalized text should be within ±30% of original
        length_ratio = len(normalized) / len(text_to_normalize) if len(text_to_normalize) > 0 else 0
        if length_ratio < 0.7 or length_ratio > 1.4:
            logger.warning(f"    LLM length mismatch (ratio: {length_ratio:.2f}), keeping regex result")
            return text, False

        # If original text was longer, append the rest
        if len(text) > 2000:
            normalized += text[2000:]

        return normalized, True

    except Exception as e:
        logger.error(f"    LLM normalization failed: {e}")
        return text, False


def apply_all_fixes(text: str, use_llm: bool = False, llm_client=None) -> Tuple[str, List[dict]]:
    """Apply all OCR fixes in correct order. Returns (fixed_text, changes_list).

    Layer 1: Regex-based (always applied)
    Layer 2: LLM-based (only if use_llm=True and text still has issues after Layer 1)
    """
    if not text:
        return text, []

    changes = []
    result = text

    # --- Layer 1: Regex fixes ---

    # 1. Strip HTML first
    new_result = strip_html(result)
    if new_result != result:
        changes.append({'type': 'html_strip', 'before': result[:80], 'after': new_result[:80]})
        result = new_result

    # 2. Fix spaced letters ("D A N I Ş T A Y" → "DANIŞTAY")
    new_result = fix_spaced_letters(result)
    if new_result != result:
        changes.append({'type': 'spaced_letters', 'before': result[:80], 'after': new_result[:80]})
        result = new_result

    # 3. Fix word-break spacing ("çal ı şanlar" → "çalışanlar")
    new_result = fix_word_break_spacing(result)
    if new_result != result:
        changes.append({'type': 'word_breaks', 'before': result[:80], 'after': new_result[:80]})
        result = new_result

    # 4. Fix concatenated text ("VERGİSİKANUNU" → "VERGİSİ KANUNU")
    new_result = fix_turkish_word_spacing(result)
    if new_result != result:
        changes.append({'type': 'word_spacing', 'before': result[:80], 'after': new_result[:80]})
        result = new_result

    # 5. Fix metadata spacing ("TARİH:2012" → "TARİH: 2012")
    new_result = fix_metadata_spacing(result)
    if new_result != result:
        changes.append({'type': 'metadata_spacing', 'before': result[:80], 'after': new_result[:80]})
        result = new_result

    # --- Layer 2: LLM fix (only if regex wasn't enough) ---
    if use_llm and llm_client and detect_concatenated_text(result):
        before_llm = result[:80]
        new_result, was_changed = normalize_ocr_with_llm(result, llm_client)
        if was_changed and new_result != result:
            changes.append({'type': 'llm_normalize', 'before': before_llm, 'after': new_result[:80]})
            result = new_result

    return result, changes


def fix_metadata_json(metadata: dict) -> Tuple[dict, List[dict]]:
    """Fix OCR artifacts in metadata JSONB fields. Returns (fixed_metadata, changes)."""
    if not metadata or not isinstance(metadata, dict):
        return metadata, []

    changes = []
    fixed = dict(metadata)  # shallow copy

    # Fix string values in metadata
    text_fields = ['title', 'baslik', 'konusu', 'daire', 'source_name',
                   'description', 'summary', 'fileName', 'documentTitle']

    for field in text_fields:
        if field in fixed and isinstance(fixed[field], str) and fixed[field]:
            original_val = fixed[field]
            new_val = fix_spaced_letters(original_val)
            new_val = fix_word_break_spacing(new_val)
            new_val = fix_turkish_word_spacing(new_val)
            new_val = fix_metadata_spacing(new_val)
            new_val = strip_html(new_val)

            if new_val != original_val:
                fixed[field] = new_val
                changes.append({
                    'field': f'metadata.{field}',
                    'before': original_val[:60],
                    'after': new_val[:60]
                })

    # Recurse into nested objects (one level deep)
    for key, val in fixed.items():
        if isinstance(val, dict):
            nested_fixed, nested_changes = fix_metadata_json(val)
            if nested_changes:
                fixed[key] = nested_fixed
                changes.extend(nested_changes)

    return fixed, changes


# ===================================================================
# Database helpers
# ===================================================================

def get_connection(dbname: str):
    return psycopg2.connect(
        host=DB_HOST, port=DB_PORT, user=DB_USER,
        password=DB_PASS, database=dbname
    )


# ===================================================================
# Mode: ANALYZE
# ===================================================================

def mode_analyze(db_name: str, limit: int = 0):
    """Scan document_embeddings for OCR issues without modifying anything."""
    logger.info(f"{'='*60}")
    logger.info(f"ANALYZING document_embeddings in [{db_name}]")
    logger.info(f"{'='*60}")

    conn = get_connection(db_name)
    cur = conn.cursor(cursor_factory=RealDictCursor)

    # Total count
    cur.execute("SELECT COUNT(*) as cnt FROM document_embeddings")
    total = cur.fetchone()['cnt']
    logger.info(f"Total records: {total:,}")

    if total == 0:
        logger.info("No records found.")
        conn.close()
        return

    # SQL-level detection for quick counts
    logger.info("\n--- SQL-Level Quick Detection ---")

    # Spaced letters
    cur.execute(f"""
        SELECT COUNT(*) as cnt FROM document_embeddings
        WHERE chunk_text ~ '[A-ZÇĞİÖŞÜ] [A-ZÇĞİÖŞÜ] [A-ZÇĞİÖŞÜ]'
    """)
    spaced = cur.fetchone()['cnt']
    logger.info(f"  Spaced letters (D A N I Ş T A Y):  {spaced:,} records")

    # Word-break spacing (Turkish special char between spaces)
    cur.execute(f"""
        SELECT COUNT(*) as cnt FROM document_embeddings
        WHERE chunk_text ~ '[a-zçğıöşüA-ZÇĞİÖŞÜ] [ıİşŞğĞüÜöÖçÇ] [a-zçğıöşü]'
    """)
    word_breaks = cur.fetchone()['cnt']
    logger.info(f"  Word-break spacing (çal ı şan):    {word_breaks:,} records")

    # Concatenated text (12+ uppercase without space)
    cur.execute(f"""
        SELECT COUNT(*) as cnt FROM document_embeddings
        WHERE chunk_text ~ '[A-ZÇĞİÖŞÜ]{{12,}}'
    """)
    concat = cur.fetchone()['cnt']
    logger.info(f"  Concatenated text (12+ uppercase):  {concat:,} records")

    # HTML content
    cur.execute("""
        SELECT COUNT(*) as cnt FROM document_embeddings
        WHERE chunk_text LIKE '%<%>%'
           OR chunk_text LIKE '%&nbsp;%'
           OR chunk_text LIKE '%&amp;%'
           OR chunk_text LIKE '%&rsquo;%'
    """)
    html_count = cur.fetchone()['cnt']
    logger.info(f"  HTML content:                       {html_count:,} records")

    # Any issue
    cur.execute(f"""
        SELECT COUNT(*) as cnt FROM document_embeddings
        WHERE chunk_text ~ '[A-ZÇĞİÖŞÜ] [A-ZÇĞİÖŞÜ] [A-ZÇĞİÖŞÜ]'
           OR chunk_text ~ '[a-zçğıöşüA-ZÇĞİÖŞÜ] [ıİşŞğĞüÜöÖçÇ] [a-zçğıöşü]'
           OR chunk_text ~ '[A-ZÇĞİÖŞÜ]{{12,}}'
           OR chunk_text LIKE '%<%>%'
           OR chunk_text LIKE '%&nbsp;%'
           OR chunk_text LIKE '%&rsquo;%'
    """)
    any_issue = cur.fetchone()['cnt']
    logger.info(f"  ANY issue (union):                  {any_issue:,} records")
    logger.info(f"  Clean records:                      {total - any_issue:,} records")

    # Sample records with before/after preview
    logger.info(f"\n--- Sample Before/After Previews ---")

    sample_limit = min(limit, 10) if limit > 0 else 10
    cur.execute(f"""
        SELECT id, document_id, chunk_text,
               metadata::text as metadata_text
        FROM document_embeddings
        WHERE chunk_text ~ '[A-ZÇĞİÖŞÜ] [A-ZÇĞİÖŞÜ] [A-ZÇĞİÖŞÜ]'
           OR chunk_text ~ '[a-zçğıöşüA-ZÇĞİÖŞÜ] [ıİşŞğĞüÜöÖçÇ] [a-zçğıöşü]'
           OR chunk_text ~ '[A-ZÇĞİÖŞÜ]{{12,}}'
           OR chunk_text LIKE '%<%>%'
           OR chunk_text LIKE '%&rsquo;%'
        ORDER BY id
        LIMIT {sample_limit}
    """)
    samples = cur.fetchall()

    for i, row in enumerate(samples):
        chunk = row['chunk_text'] or ''
        fixed, changes = apply_all_fixes(chunk)

        logger.info(f"\n  [{i+1}] ID={row['id']} (doc_id={row['document_id']})")
        logger.info(f"      BEFORE: {chunk[:120]}...")
        logger.info(f"      AFTER:  {fixed[:120]}...")
        logger.info(f"      Changes: {[c['type'] for c in changes]}")

        # Check metadata too
        if row['metadata_text']:
            try:
                meta = json.loads(row['metadata_text'])
                _, meta_changes = fix_metadata_json(meta)
                if meta_changes:
                    logger.info(f"      Metadata fixes: {[c['field'] for c in meta_changes]}")
            except json.JSONDecodeError:
                pass

    # Metadata analysis
    logger.info(f"\n--- Metadata JSONB Analysis ---")
    cur.execute("""
        SELECT COUNT(*) as cnt FROM document_embeddings
        WHERE metadata IS NOT NULL
          AND metadata::text ~ '[A-ZÇĞİÖŞÜ] [A-ZÇĞİÖŞÜ] [A-ZÇĞİÖŞÜ]'
    """)
    meta_spaced = cur.fetchone()['cnt']
    logger.info(f"  Metadata with spaced letters: {meta_spaced:,}")

    cur.execute("""
        SELECT COUNT(*) as cnt FROM document_embeddings
        WHERE metadata IS NOT NULL
          AND (metadata::text LIKE '%<%>%' OR metadata::text LIKE '%&rsquo;%')
    """)
    meta_html = cur.fetchone()['cnt']
    logger.info(f"  Metadata with HTML:           {meta_html:,}")

    logger.info(f"\n{'='*60}")
    logger.info(f"ANALYSIS COMPLETE")
    logger.info(f"{'='*60}")

    conn.close()


# ===================================================================
# Mode: FIX
# ===================================================================

def mode_fix(db_name: str, dry_run: bool = False, batch_size: int = 100, use_llm: bool = False):
    """Fix OCR artifacts in document_embeddings.chunk_text and metadata."""
    logger.info(f"{'='*60}")
    logger.info(f"FIXING document_embeddings in [{db_name}]")
    logger.info(f"  Mode: {'DRY-RUN' if dry_run else 'LIVE'}")
    logger.info(f"  Batch size: {batch_size}")
    logger.info(f"  LLM Layer 2: {'ENABLED' if use_llm else 'DISABLED'}")
    logger.info(f"{'='*60}")

    # Initialize LLM client if needed
    llm_client = None
    if use_llm:
        try:
            from openai import OpenAI
            api_key = os.environ.get('OPENAI_API_KEY', '')
            if not api_key:
                logger.error("OPENAI_API_KEY not set. LLM layer disabled.")
                use_llm = False
            else:
                llm_client = OpenAI(api_key=api_key)
                logger.info("  LLM client initialized (gpt-4o-mini)")
        except ImportError:
            logger.error("openai package not installed. LLM layer disabled.")
            use_llm = False

    conn = get_connection(db_name)
    conn.autocommit = False

    try:
        cur = conn.cursor(cursor_factory=RealDictCursor)

        # Count affected records
        cur.execute(f"""
            SELECT COUNT(*) as cnt FROM document_embeddings
            WHERE chunk_text ~ '[A-ZÇĞİÖŞÜ] [A-ZÇĞİÖŞÜ] [A-ZÇĞİÖŞÜ]'
               OR chunk_text ~ '[a-zçğıöşüA-ZÇĞİÖŞÜ] [ıİşŞğĞüÜöÖçÇ] [a-zçğıöşü]'
               OR chunk_text ~ '[A-ZÇĞİÖŞÜ]{{12,}}'
               OR chunk_text LIKE '%<%>%'
               OR chunk_text LIKE '%&nbsp;%'
               OR chunk_text LIKE '%&rsquo;%'
               OR (metadata IS NOT NULL AND (
                   metadata::text ~ '[A-ZÇĞİÖŞÜ] [A-ZÇĞİÖŞÜ] [A-ZÇĞİÖŞÜ]'
                   OR metadata::text LIKE '%<%>%'
                   OR metadata::text LIKE '%&rsquo;%'
               ))
        """)
        total_affected = cur.fetchone()['cnt']
        logger.info(f"Records to process: {total_affected:,}")

        if total_affected == 0:
            logger.info("No records need fixing!")
            conn.close()
            return

        # Process in batches
        processed = 0
        fixed_count = 0
        meta_fixed_count = 0
        start_time = time.time()
        fix_log = []

        offset = 0
        while True:
            cur.execute(f"""
                SELECT id, chunk_text, metadata
                FROM document_embeddings
                WHERE chunk_text ~ '[A-ZÇĞİÖŞÜ] [A-ZÇĞİÖŞÜ] [A-ZÇĞİÖŞÜ]'
                   OR chunk_text ~ '[a-zçğıöşüA-ZÇĞİÖŞÜ] [ıİşŞğĞüÜöÖçÇ] [a-zçğıöşü]'
                   OR chunk_text ~ '[A-ZÇĞİÖŞÜ]{{12,}}'
                   OR chunk_text LIKE '%<%>%'
                   OR chunk_text LIKE '%&nbsp;%'
                   OR chunk_text LIKE '%&rsquo;%'
                   OR (metadata IS NOT NULL AND (
                       metadata::text ~ '[A-ZÇĞİÖŞÜ] [A-ZÇĞİÖŞÜ] [A-ZÇĞİÖŞÜ]'
                       OR metadata::text LIKE '%<%>%'
                       OR metadata::text LIKE '%&rsquo;%'
                   ))
                ORDER BY id
                LIMIT {batch_size}
            """)
            rows = cur.fetchall()

            if not rows:
                break

            updates = []
            for row in rows:
                record_id = row['id']
                chunk = row['chunk_text'] or ''
                metadata = row['metadata'] or {}

                # Fix chunk_text
                fixed_chunk, chunk_changes = apply_all_fixes(chunk, use_llm=use_llm, llm_client=llm_client)
                chunk_changed = (fixed_chunk != chunk)

                # Fix metadata
                fixed_meta, meta_changes = fix_metadata_json(metadata)
                meta_changed = bool(meta_changes)

                if chunk_changed or meta_changed:
                    updates.append((
                        fixed_chunk if chunk_changed else chunk,
                        json.dumps(fixed_meta) if meta_changed else json.dumps(metadata),
                        record_id
                    ))

                    if chunk_changed:
                        fixed_count += 1
                    if meta_changed:
                        meta_fixed_count += 1

                    # Log entry
                    log_entry = {
                        'id': record_id,
                        'chunk_changes': [c['type'] for c in chunk_changes],
                        'meta_changes': [c['field'] for c in meta_changes],
                    }
                    if chunk_changes:
                        log_entry['chunk_before'] = chunk[:80]
                        log_entry['chunk_after'] = fixed_chunk[:80]
                    fix_log.append(log_entry)

            # Execute batch update
            if updates and not dry_run:
                write_cur = conn.cursor()
                execute_batch(
                    write_cur,
                    "UPDATE document_embeddings SET chunk_text = %s, metadata = %s::jsonb WHERE id = %s",
                    updates
                )
                write_cur.close()

            processed += len(rows)
            elapsed = time.time() - start_time
            rate = processed / elapsed if elapsed > 0 else 0

            logger.info(
                f"  Batch: {processed:,}/{total_affected:,} | "
                f"Chunk fixes: {fixed_count:,} | Meta fixes: {meta_fixed_count:,} | "
                f"Rate: {rate:.1f}/sec"
            )

        # Commit or rollback
        if dry_run:
            conn.rollback()
            logger.info("\n  [DRY-RUN] All changes rolled back.")
        else:
            conn.commit()
            logger.info(f"\n  COMMITTED all changes.")

        # Save log
        elapsed = time.time() - start_time
        log_path = os.path.join(
            os.path.dirname(os.path.abspath(__file__)),
            f'fix_doc_embeddings_log_{datetime.now().strftime("%Y%m%d_%H%M%S")}.json'
        )
        log_data = {
            'db': db_name,
            'mode': 'dry-run' if dry_run else 'fix',
            'timestamp': datetime.now().isoformat(),
            'total_processed': processed,
            'chunk_fixes': fixed_count,
            'metadata_fixes': meta_fixed_count,
            'elapsed_seconds': round(elapsed, 1),
            'entries': fix_log[:500]  # Cap log size
        }
        with open(log_path, 'w', encoding='utf-8') as f:
            json.dump(log_data, f, ensure_ascii=False, indent=2)
        logger.info(f"  Log saved: {log_path}")

        logger.info(f"\n{'='*60}")
        logger.info(f"FIX {'(DRY-RUN) ' if dry_run else ''}COMPLETE")
        logger.info(f"  Processed:      {processed:,}")
        logger.info(f"  Chunk fixes:    {fixed_count:,}")
        logger.info(f"  Metadata fixes: {meta_fixed_count:,}")
        logger.info(f"  Time:           {elapsed:.1f}s")
        logger.info(f"{'='*60}")

    except Exception as e:
        conn.rollback()
        logger.error(f"ERROR - Rolling back: {e}")
        raise
    finally:
        conn.close()


# ===================================================================
# Mode: RE-EMBED
# ===================================================================

def mode_reembed(db_name: str, batch_size: int = 10, since: str = None):
    """Regenerate embeddings for records that were fixed.
    Uses OpenAI text-embedding-3-small to create fresh vectors.
    """
    try:
        from openai import OpenAI
    except ImportError:
        logger.error("openai package not installed. Run: pip install openai")
        sys.exit(1)

    api_key = os.environ.get('OPENAI_API_KEY', '')
    if not api_key:
        logger.error("OPENAI_API_KEY environment variable not set.")
        sys.exit(1)

    client = OpenAI(api_key=api_key)

    logger.info(f"{'='*60}")
    logger.info(f"RE-EMBEDDING document_embeddings in [{db_name}]")
    logger.info(f"  Model: {EMBEDDING_MODEL}")
    logger.info(f"  Batch size: {batch_size}")
    if since:
        logger.info(f"  Since: {since}")
    logger.info(f"{'='*60}")

    conn = get_connection(db_name)

    cur = conn.cursor(cursor_factory=RealDictCursor)

    # Find records needing re-embedding
    # Strategy: records with embedding = NULL, or if --since given, recently updated
    where_clause = "WHERE embedding IS NULL"
    params = []
    if since:
        where_clause = "WHERE updated_at >= %s OR embedding IS NULL"
        params = [since]

    cur.execute(f"SELECT COUNT(*) as cnt FROM document_embeddings {where_clause}", params)
    total = cur.fetchone()['cnt']
    logger.info(f"Records to re-embed: {total:,}")

    if total == 0:
        logger.info("No records need re-embedding.")
        conn.close()
        return

    processed = 0
    total_tokens = 0
    errors = 0
    start_time = time.time()

    offset = 0
    while True:
        cur.execute(f"""
            SELECT id, chunk_text
            FROM document_embeddings
            {where_clause}
            ORDER BY id
            LIMIT {batch_size} OFFSET {offset}
        """, params)
        rows = cur.fetchall()

        if not rows:
            break

        texts = [(row['chunk_text'] or '')[:8000] for row in rows]
        ids = [row['id'] for row in rows]

        try:
            response = client.embeddings.create(
                input=texts,
                model=EMBEDDING_MODEL
            )

            api_tokens = response.usage.total_tokens if response.usage else 0
            total_tokens += api_tokens

            write_cur = conn.cursor()
            for i, emb_data in enumerate(response.data):
                vec_str = '[' + ','.join(str(x) for x in emb_data.embedding) + ']'
                write_cur.execute(
                    """UPDATE document_embeddings
                       SET embedding = %s::vector,
                           model_name = %s,
                           tokens_used = %s
                       WHERE id = %s""",
                    (vec_str, EMBEDDING_MODEL, len(texts[i]) // 4, ids[i])
                )
            conn.commit()
            write_cur.close()

            processed += len(rows)
            elapsed = time.time() - start_time
            rate = processed / elapsed if elapsed > 0 else 0
            logger.info(
                f"  Batch: {processed:,}/{total:,} | "
                f"Tokens: {total_tokens:,} | Rate: {rate:.1f}/sec"
            )

        except Exception as e:
            errors += 1
            logger.error(f"  Embedding error (batch at offset {offset}): {e}")
            if 'rate_limit' in str(e).lower():
                logger.info("  Rate limited, waiting 60s...")
                time.sleep(60)
            else:
                time.sleep(5)

        offset += batch_size
        time.sleep(0.3)  # Gentle rate limiting

    elapsed = time.time() - start_time
    logger.info(f"\n{'='*60}")
    logger.info(f"RE-EMBEDDING COMPLETE")
    logger.info(f"  Processed:    {processed:,}")
    logger.info(f"  Total tokens: {total_tokens:,}")
    logger.info(f"  Errors:       {errors}")
    logger.info(f"  Time:         {elapsed:.1f}s")
    logger.info(f"{'='*60}")

    conn.close()


# ===================================================================
# CLI
# ===================================================================

def main():
    parser = argparse.ArgumentParser(
        description='Fix OCR artifacts in document_embeddings table',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python fix_document_embeddings_ocr.py analyze
  python fix_document_embeddings_ocr.py analyze --db geolex_lsemb
  python fix_document_embeddings_ocr.py fix --dry-run
  python fix_document_embeddings_ocr.py fix --batch-size 200
  python fix_document_embeddings_ocr.py fix --llm
  python fix_document_embeddings_ocr.py fix --llm --dry-run
  python fix_document_embeddings_ocr.py re-embed --since "2026-02-10"
        """
    )

    parser.add_argument('mode', choices=['analyze', 'fix', 're-embed'],
                        help='Operation mode')
    parser.add_argument('--db', type=str, default=DEFAULT_DB,
                        help=f'Database name (default: {DEFAULT_DB})')
    parser.add_argument('--dry-run', action='store_true',
                        help='Show changes without applying (fix mode)')
    parser.add_argument('--batch-size', type=int, default=100,
                        help='Records per batch (default: 100)')
    parser.add_argument('--limit', type=int, default=0,
                        help='Limit sample count in analyze mode')
    parser.add_argument('--llm', action='store_true',
                        help='Enable LLM-assisted fixes for complex cases (fix mode)')
    parser.add_argument('--since', type=str, default=None,
                        help='Re-embed records updated since this timestamp (re-embed mode)')

    args = parser.parse_args()

    logger.info(f"Database: {args.db}")
    logger.info(f"Mode: {args.mode}")

    if args.mode == 'analyze':
        mode_analyze(args.db, args.limit)
    elif args.mode == 'fix':
        mode_fix(args.db, args.dry_run, args.batch_size, args.llm)
    elif args.mode == 're-embed':
        mode_reembed(args.db, args.batch_size, args.since)


if __name__ == '__main__':
    main()