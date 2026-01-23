#!/usr/bin/env python3
"""
Law Document Chunking Script
============================
Chunks large law documents (vergilex_mevzuat_kanunlar) into individual articles (Madde).

Problem: Law documents are stored as single 100K-450K character embeddings.
         This causes low semantic similarity for specific article queries like "VUK 341".

Solution: Parse each law and create separate embeddings for each article (Madde N).

Usage:
    python chunk_laws_by_article.py [--dry-run] [--limit N]

Options:
    --dry-run   Don't actually insert, just show what would be done
    --limit N   Process only first N law documents
"""

import os
import re
import sys
import json
import asyncio
import hashlib
from datetime import datetime
from typing import List, Dict, Tuple, Optional
from dataclasses import dataclass
import asyncpg

# Add parent directory for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services.semantic_search_service import SemanticSearchService

# Configuration
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:Luwi2025SecurePGx7749@localhost:5432/vergilex_lsemb")
CHUNK_MIN_LENGTH = 100  # Minimum article length to embed
CHUNK_MAX_LENGTH = 8000  # Maximum chunk length for embedding
BATCH_SIZE = 5  # Embeddings per batch


@dataclass
class ArticleChunk:
    """Represents a single article chunk from a law document"""
    law_name: str
    law_number: Optional[str]
    article_number: str
    article_title: Optional[str]
    content: str
    original_id: int
    source_table: str = "vergilex_mevzuat_kanunlar"
    source_type: str = "law"


def parse_law_header(content: str) -> Tuple[str, Optional[str]]:
    """Extract law name and number from content header"""
    # First, try to get law name from first 500 chars (usually contains title)
    first_part = content[:500]

    # Look for law number pattern anywhere in header
    law_number = None
    num_match = re.search(r'(?:Kanun\s*Numarası|No)\s*[:\s]*(\d+)', first_part, re.IGNORECASE)
    if num_match:
        law_number = num_match.group(1)

    # Try to extract law name - look for pattern ending with KANUNU or KANUN
    # Common patterns: "VERGİ USUL KANUNU", "GELİR VERGİSİ KANUNU"
    law_name = ""

    # Method 1: Look for lines ending with KANUNU or KANUN
    lines = first_part.split('\n')
    for line in lines[:10]:
        line = line.strip().rstrip(',')  # Remove trailing comma
        if not line or len(line) > 100:
            continue

        # Check if line ends with KANUN/KANUNU (the actual law name)
        if re.search(r'KANUNU?\s*$', line.upper()):
            law_name = line
            break

        # Also check for common patterns at start of content
        if re.match(r'^[A-ZİĞÜŞÖÇ\s]+KANUNU?', line):
            law_name = line
            break

    # Method 2: If no match, try first line if it contains KANUN
    if not law_name and lines:
        first_line = lines[0].strip().rstrip(',')
        if 'KANUN' in first_line.upper() and len(first_line) < 80:
            law_name = first_line

    # Clean up law name - remove trailing comma and extra whitespace
    law_name = re.sub(r'\s+', ' ', law_name).strip().rstrip(',')

    return law_name or "Bilinmeyen Kanun", law_number


def parse_articles(content: str, law_name: str) -> List[Dict]:
    """
    Parse law content into individual articles (Madde).

    Turkish law articles typically follow patterns like:
    - "Madde 1 –" or "Madde 1-"
    - "MADDE 1 –"
    - "Madde 1." followed by content
    """
    articles = []

    # Pre-process: Add newline before "Madde" when preceded by lowercase (e.g., "indirmeMadde 376")
    # This handles cases where articles are concatenated without proper delimiters
    content = re.sub(r'([a-zğüşöçı])(Madde\s*\d)', r'\1\n\2', content, flags=re.IGNORECASE)

    # Pattern to match article headers
    # Matches: Madde 1, MADDE 1, Madde 1 –, Madde 1-, Madde 1.
    # Also matches articles after : or . or ] (inline format in some documents)
    # Example: "Zamanaşımı süreleri:Madde 114 –" or "giderler:[35]Madde 40"
    article_pattern = re.compile(
        r'(?:^|\n|[:.\]])[ \t]*((?:MADDE|Madde)\s*(\d+(?:\s*/\s*[A-Za-z])?)\s*[-–.]?\s*)',
        re.MULTILINE | re.IGNORECASE
    )

    matches = list(article_pattern.finditer(content))

    if not matches:
        print(f"  ⚠️ No articles found in {law_name[:50]}...")
        return articles

    for i, match in enumerate(matches):
        article_number = match.group(2).strip()
        start_pos = match.end()

        # End position is start of next article or end of content
        if i + 1 < len(matches):
            end_pos = matches[i + 1].start()
        else:
            end_pos = len(content)

        article_content = content[start_pos:end_pos].strip()

        # Skip very short articles (likely parsing errors)
        if len(article_content) < CHUNK_MIN_LENGTH:
            continue

        # Extract article title if present (usually in parentheses or first line)
        title_match = re.match(r'^\(([^)]+)\)', article_content)
        article_title = title_match.group(1) if title_match else None

        # Prepend law name and article number for context
        full_content = f"{law_name}\n\nMadde {article_number}\n\n{article_content}"

        # Truncate if too long
        if len(full_content) > CHUNK_MAX_LENGTH:
            full_content = full_content[:CHUNK_MAX_LENGTH] + "..."

        articles.append({
            'article_number': article_number,
            'article_title': article_title,
            'content': full_content,
            'original_content_length': len(article_content)
        })

    return articles


async def get_law_documents(pool: asyncpg.Pool, limit: Optional[int] = None) -> List[Dict]:
    """Fetch law documents that need chunking"""
    query = """
        SELECT id, source_name, content, source_type, metadata
        FROM unified_embeddings
        WHERE source_table = 'vergilex_mevzuat_kanunlar'
        AND LENGTH(content) > 10000  -- Only process large documents
        ORDER BY LENGTH(content) DESC
    """
    if limit:
        query += f" LIMIT {limit}"

    rows = await pool.fetch(query)
    return [dict(row) for row in rows]


async def check_existing_chunks(pool: asyncpg.Pool, original_id: int) -> int:
    """Check if chunks already exist for this law document"""
    result = await pool.fetchval("""
        SELECT COUNT(*) FROM unified_embeddings
        WHERE source_table = 'vergilex_mevzuat_kanunlar_chunks'
        AND metadata->>'original_id' = $1
    """, str(original_id))
    return result or 0


# Global counter for generating unique source_ids
_chunk_id_counter = 0


async def get_next_chunk_id(pool: asyncpg.Pool) -> int:
    """Get the next available source_id for chunks"""
    global _chunk_id_counter
    if _chunk_id_counter == 0:
        # Initialize from database
        max_id = await pool.fetchval("""
            SELECT COALESCE(MAX(source_id), 0) FROM unified_embeddings
            WHERE source_table = 'vergilex_mevzuat_kanunlar_chunks'
        """)
        _chunk_id_counter = (max_id or 0) + 1
    else:
        _chunk_id_counter += 1
    return _chunk_id_counter


async def insert_article_chunk(
    pool: asyncpg.Pool,
    chunk: ArticleChunk,
    embedding: List[float],
    dry_run: bool = False
) -> bool:
    """Insert a single article chunk with its embedding"""

    # Generate unique integer source_id (source_id is bigint, not varchar!)
    source_id = await get_next_chunk_id(pool)

    # Build metadata with original references
    metadata = {
        "original_id": chunk.original_id,
        "law_name": chunk.law_name,
        "law_number": chunk.law_number,
        "article_number": chunk.article_number,
        "article_title": chunk.article_title,
        "chunked_at": datetime.now().isoformat(),
        "chunk_type": "article",
        "content_hash": hashlib.md5(chunk.content.encode()).hexdigest()[:12]
    }

    # Source name for display (max 255 chars for VARCHAR column)
    source_name = f"{chunk.law_name[:150]} - Madde {chunk.article_number}"
    if chunk.article_title:
        source_name += f" ({chunk.article_title[:50]})"
    source_name = source_name[:250]  # Safety truncate

    if dry_run:
        print(f"    [DRY-RUN] Would insert: {source_name[:60]}... ({len(chunk.content)} chars)")
        return True

    try:
        await pool.execute("""
            INSERT INTO unified_embeddings
            (source_table, source_type, source_id, source_name, content, embedding, metadata, tokens_used, model_used, embedding_provider)
            VALUES ($1, $2, $3, $4, $5, $6::vector, $7::jsonb, $8, $9, $10)
            ON CONFLICT (source_table, source_id) DO UPDATE SET
                content = EXCLUDED.content,
                embedding = EXCLUDED.embedding,
                metadata = EXCLUDED.metadata,
                updated_at = NOW()
        """,
            'vergilex_mevzuat_kanunlar_chunks',  # New source_table for chunks
            'kanun',  # Türkçe key for hierarchy
            source_id,  # Integer ID
            source_name[:500],
            chunk.content,
            f"[{','.join(map(str, embedding))}]",  # Vector format
            json.dumps(metadata),
            len(chunk.content) // 3,  # Approximate token count
            'text-embedding-3-small',
            'openai'
        )
        return True
    except Exception as e:
        print(f"    ❌ Insert error for {source_name[:40]}: {e}")
        return False


async def process_law_document(
    pool: asyncpg.Pool,
    search_service: SemanticSearchService,
    doc: Dict,
    dry_run: bool = False,
    force: bool = False
) -> Tuple[int, int]:
    """Process a single law document: parse articles and create embeddings"""

    doc_id = doc['id']
    content = doc['content']
    source_name = doc['source_name'] or "Unknown Law"

    print(f"\n📜 Processing: {source_name[:60]}... ({len(content):,} chars)")

    # Check if already chunked
    existing = await check_existing_chunks(pool, doc_id)
    if existing > 0:
        if force:
            # Delete existing chunks when force=True
            print(f"  🗑️ Force mode: Deleting {existing} existing chunks...")
            if not dry_run:
                await pool.execute("""
                    DELETE FROM unified_embeddings
                    WHERE source_table = 'vergilex_mevzuat_kanunlar_chunks'
                    AND metadata->>'original_id' = $1
                """, str(doc_id))
        else:
            print(f"  ⏭️ Already chunked ({existing} articles exist)")
            return 0, 0

    # Parse law header - prefer source_name if it looks like a proper law name
    parsed_name, law_number = parse_law_header(content)

    # Use source_name if it contains KANUN and is reasonably formatted
    if source_name and ('KANUN' in source_name.upper()) and len(source_name) < 100:
        law_name = source_name.strip()
    else:
        law_name = parsed_name

    print(f"  📋 Law: {law_name[:50]}... (No: {law_number or 'N/A'})")

    # Parse articles
    articles = parse_articles(content, law_name)
    print(f"  📄 Found {len(articles)} articles")

    if not articles:
        return 0, 0

    # Process articles in batches
    inserted = 0
    failed = 0

    for i in range(0, len(articles), BATCH_SIZE):
        batch = articles[i:i+BATCH_SIZE]
        texts = [a['content'] for a in batch]

        try:
            # Generate embeddings for batch
            if not dry_run:
                embeddings = await search_service.generate_embeddings_batch(texts)
            else:
                embeddings = [[0.0] * 1536 for _ in texts]  # Dummy for dry-run

            # Insert each chunk
            for j, article in enumerate(batch):
                chunk = ArticleChunk(
                    law_name=law_name,
                    law_number=law_number,
                    article_number=article['article_number'],
                    article_title=article['article_title'],
                    content=article['content'],
                    original_id=doc_id
                )

                success = await insert_article_chunk(pool, chunk, embeddings[j], dry_run)
                if success:
                    inserted += 1
                else:
                    failed += 1

            # Progress update
            if not dry_run:
                print(f"  ✅ Batch {i//BATCH_SIZE + 1}: {len(batch)} articles embedded")

        except Exception as e:
            print(f"  ❌ Batch error: {e}")
            failed += len(batch)

    return inserted, failed


async def add_chunks_to_search_sources(pool: asyncpg.Pool):
    """
    Add vergilex_mevzuat_kanunlar_chunks to search.sourceTableWeights
    so it appears in search results
    """
    try:
        # Get current weights
        result = await pool.fetchval(
            "SELECT value FROM settings WHERE key = 'search.sourceTableWeights'"
        )

        if result:
            weights = json.loads(result)
        else:
            weights = {}

        # Add chunks table with high weight (same as law)
        if 'vergilex_mevzuat_kanunlar_chunks' not in weights:
            weights['vergilex_mevzuat_kanunlar_chunks'] = 1.0

            await pool.execute("""
                INSERT INTO settings (key, value, category, description, updated_at)
                VALUES ($1, $2, 'search', 'Source table weights for search', NOW())
                ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()
            """, 'search.sourceTableWeights', json.dumps(weights))

            print("✅ Added vergilex_mevzuat_kanunlar_chunks to search.sourceTableWeights")

    except Exception as e:
        print(f"⚠️ Could not update search.sourceTableWeights: {e}")


async def main():
    """Main entry point"""
    import argparse

    parser = argparse.ArgumentParser(description='Chunk law documents by article')
    parser.add_argument('--dry-run', action='store_true', help='Show what would be done without making changes')
    parser.add_argument('--limit', type=int, help='Process only first N documents')
    parser.add_argument('--force', action='store_true', help='Re-chunk even if already processed (deletes existing chunks first)')
    args = parser.parse_args()

    print("=" * 60)
    print("🏛️  Law Document Chunking Script")
    print("=" * 60)
    print(f"Mode: {'DRY-RUN (no changes)' if args.dry_run else 'LIVE'}")
    if args.force:
        print("Force: Re-chunking all documents (deleting existing chunks)")
    if args.limit:
        print(f"Limit: {args.limit} documents")
    print()

    # Connect to database
    print("🔌 Connecting to database...")
    pool = await asyncpg.create_pool(DATABASE_URL)

    # Initialize search service for embeddings
    search_service = SemanticSearchService()

    try:
        # Get law documents
        docs = await get_law_documents(pool, args.limit)
        print(f"📚 Found {len(docs)} law documents to process")

        if not docs:
            print("No documents to process.")
            return

        # Process each document
        total_inserted = 0
        total_failed = 0

        for doc in docs:
            inserted, failed = await process_law_document(
                pool, search_service, doc, args.dry_run, args.force
            )
            total_inserted += inserted
            total_failed += failed

        # Add chunks table to search sources
        if not args.dry_run and total_inserted > 0:
            await add_chunks_to_search_sources(pool)

        # Summary
        print("\n" + "=" * 60)
        print("📊 Summary")
        print("=" * 60)
        print(f"Documents processed: {len(docs)}")
        print(f"Articles chunked: {total_inserted}")
        print(f"Failed: {total_failed}")

        if args.dry_run:
            print("\n⚠️ DRY-RUN mode - no changes were made")
            print("Run without --dry-run to actually create chunks")

    finally:
        await pool.close()


if __name__ == "__main__":
    asyncio.run(main())
