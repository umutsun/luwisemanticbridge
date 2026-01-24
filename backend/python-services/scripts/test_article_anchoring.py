#!/usr/bin/env python3
"""
Test Article Anchoring System
Diagnoses why specific law articles aren't being matched properly.

Usage:
    python test_article_anchoring.py VUK 114
    python test_article_anchoring.py KDVK 29
    python test_article_anchoring.py GVK 40
"""

import os
import sys
import json
import asyncio
from typing import Optional, Dict, Any

# Fix Windows console encoding for Turkish characters
if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

# Load environment variables
from pathlib import Path
from dotenv import load_dotenv

# Try to load .env files in order of priority
env_paths = [
    Path(__file__).parent.parent.parent.parent / '.env.lsemb',  # lsemb/.env.lsemb
    Path(__file__).parent.parent.parent / '.env',               # backend/.env
    Path(__file__).parent.parent / '.env',                      # python-services/.env
]
for env_path in env_paths:
    if env_path.exists():
        load_dotenv(dotenv_path=env_path)
        print(f"[INFO] Loaded env from: {env_path}")
        break

# Add parent directory for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services.database import get_db, init_db
from services.semantic_search_service import SemanticSearchService


async def test_article_query(law_code: str, article_number: str):
    """Test article anchoring for a specific law article"""

    print("=" * 70)
    print(f"[SEARCH] Testing Article Anchoring: {law_code} Madde {article_number}")
    print("=" * 70)

    # Initialize database
    await init_db()
    pool = await get_db()
    service = SemanticSearchService()

    # Test 1: Query Detection
    print("\n[TEST] Test 1: Article Query Detection")
    print("-" * 50)

    test_queries = [
        f"{law_code} {article_number}",
        f"{law_code} Madde {article_number}",
        f"Madde {article_number} {law_code}",
        f"{law_code}'nin {article_number}. maddesi"
    ]

    for query in test_queries:
        result = service._detect_article_query(query)
        status = "✅" if result else "❌"
        print(f"  {status} \"{query}\" -> {result}")

    # Test 2: Check Chunk Existence
    print("\n[TEST] Test 2: Database Chunk Search")
    print("-" * 50)

    # Build law patterns
    law_patterns = service.LAW_CODES.get(law_code, [law_code])
    law_name_patterns = [law_code] + law_patterns

    # Also add full names from LAW_NAME_TO_CODE
    for full_name, code in service.LAW_NAME_TO_CODE.items():
        if code == law_code:
            law_name_patterns.append(full_name)

    print(f"  Looking for law patterns: {law_name_patterns[:5]}...")

    # Query 1: Check vergilex_mevzuat_kanunlar_chunks
    chunks_query = """
        SELECT
            id::text,
            source_table,
            source_name,
            metadata->>'law_name' as law_name,
            metadata->>'article_number' as article_num,
            LEFT(content, 200) as content_preview
        FROM unified_embeddings
        WHERE source_table = 'vergilex_mevzuat_kanunlar_chunks'
        AND metadata->>'article_number' = $1
        LIMIT 10
    """

    chunks = await pool.fetch(chunks_query, article_number)

    print(f"\n  Found {len(chunks)} chunks with article_number = '{article_number}':")
    for chunk in chunks:
        law_name = chunk['law_name'] or 'N/A'
        match = "✅" if any(p.upper() in law_name.upper() for p in law_name_patterns) else "❌"
        print(f"    {match} ID: {chunk['id'][:8]}...")
        print(f"       law_name: \"{law_name}\"")
        print(f"       article_num: \"{chunk['article_num']}\"")
        print(f"       source_name: \"{chunk['source_name'][:60]}...\"")
        print()

    # Test 3: Law Name Normalization
    print("\n[TEST] Test 3: Law Name Normalization")
    print("-" * 50)

    for chunk in chunks:
        law_name = chunk['law_name'] or ''
        normalized = service._normalize_law_code(law_name)
        from_name = service._law_name_to_code(law_name)

        final_code = from_name or normalized
        match = "✅" if final_code == law_code else "❌"

        print(f"  {match} \"{law_name[:50]}...\"")
        print(f"     -> _normalize_law_code: {normalized}")
        print(f"     -> _law_name_to_code: {from_name}")
        print(f"     -> Final: {final_code} (expected: {law_code})")
        print()

    # Test 4: Full Search Test
    print("\n[TEST] Test 4: Full Semantic Search")
    print("-" * 50)

    query = f"{law_code} {article_number}"
    print(f"  Query: \"{query}\"")

    result = await service.semantic_search(query, limit=10, use_cache=False, debug=True)

    print(f"\n  Article Detection: {result.get('article_query', {})}")

    # Check results
    exact_found = 0
    wrong_found = 0

    print(f"\n  Results ({result.get('total', 0)} total):")
    for i, r in enumerate(result.get('results', [])[:10]):
        source_table = r.get('source_table', '')
        article_match = r.get('article_match_type', 'unknown')
        article_boost = r.get('article_boost', 0)
        title = r.get('title', 'N/A')[:50]

        if article_match == 'exact':
            exact_found += 1
            icon = "[MATCH]"
        elif 'wrong' in article_match:
            wrong_found += 1
            icon = "❌"
        else:
            icon = "📄"

        print(f"    {i+1}. {icon} [{source_table[:30]}] boost={article_boost}")
        print(f"       {title}...")
        print(f"       match_type: {article_match}")
        print()

    # Summary
    print("\n[SUMMARY] Summary")
    print("-" * 50)
    print(f"  Exact match chunks found: {exact_found}")
    print(f"  Wrong article chunks found: {wrong_found}")

    if exact_found == 0:
        print("\n[WARNING]  WARNING: No exact match found!")
        print("   Possible issues:")
        print("   1. Chunk doesn't exist in database")
        print("   2. metadata.article_number doesn't match")
        print("   3. metadata.law_name not recognized")
    else:
        print("\n✅ Article anchoring is working correctly!")

    print("\n" + "=" * 70)


async def main():
    if len(sys.argv) < 3:
        print("Usage: python test_article_anchoring.py <LAW_CODE> <ARTICLE_NUMBER>")
        print("Example: python test_article_anchoring.py VUK 114")
        print("         python test_article_anchoring.py KDVK 29")
        sys.exit(1)

    law_code = sys.argv[1].upper()
    article_number = sys.argv[2]

    await test_article_query(law_code, article_number)


if __name__ == "__main__":
    asyncio.run(main())
