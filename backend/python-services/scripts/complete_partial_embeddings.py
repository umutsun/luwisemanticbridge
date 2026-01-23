#!/usr/bin/env python3
"""
Complete Partial Embeddings Script
===================================
Finds and processes missing embeddings for tables that show as "Partial" in the UI.

Usage:
    python complete_partial_embeddings.py [--dry-run] [--table TABLE_NAME] [--batch-size N]
"""

import os
import sys
import json
import asyncio
import argparse
from typing import List, Dict, Optional
from datetime import datetime
import asyncpg

# Add parent directory for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services.semantic_search_service import SemanticSearchService

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:Luwi2025SecurePGx7749@localhost:5432/vergilex_lsemb")
BATCH_SIZE = 10

# Table configuration: source_csv_table -> (unified_table_name, id_column, content_columns, name_column)
TABLE_CONFIG = {
    'csv_danistaykararlari': {
        'unified_name': 'danistaykararlari',
        'id_col': 'row_id',
        'content_cols': ['konusu', 'icerik'],
        'name_col': 'konusu',
        'source_type': 'danistay_karari'
    },
    'csv_ozelge': {
        'unified_name': 'ozelge',
        'id_col': 'row_id',
        'content_cols': ['konusu', 'icerik'],
        'name_col': 'konusu',
        'source_type': 'ozelge'
    },
    'csv_sorucevap': {
        'unified_name': 'sorucevap',
        'id_col': 'row_id',
        'content_cols': ['soru', 'cevap'],
        'name_col': 'soru',
        'source_type': 'soru_cevap'
    },
    'csv_makale_arsiv_2021': {
        'unified_name': 'makale_arsiv_2021',
        'id_col': 'row_id',
        'content_cols': ['baslik', 'icerik'],
        'name_col': 'baslik',
        'source_type': 'makale'
    },
    'csv_makale_arsiv_2022': {
        'unified_name': 'makale_arsiv_2022',
        'id_col': 'row_id',
        'content_cols': ['baslik', 'icerik'],
        'name_col': 'baslik',
        'source_type': 'makale'
    },
    'csv_makale_arsiv_2024': {
        'unified_name': 'makale_arsiv_2024',
        'id_col': 'row_id',
        'content_cols': ['baslik', 'icerik'],
        'name_col': 'baslik',
        'source_type': 'makale'
    }
}


async def get_missing_records(pool: asyncpg.Pool, csv_table: str, config: dict, limit: Optional[int] = None) -> List[Dict]:
    """Find records that don't have embeddings"""

    unified_name = config['unified_name']
    id_col = config['id_col']
    content_cols = config['content_cols']
    name_col = config['name_col']

    # Build content concatenation SQL
    content_sql = " || ' ' || ".join([f"COALESCE({col}, '')" for col in content_cols])

    query = f"""
        SELECT s.{id_col} as id,
               s.{name_col} as name,
               {content_sql} as content
        FROM {csv_table} s
        LEFT JOIN unified_embeddings u
            ON u.source_table = $1 AND u.source_id = s.{id_col}
        WHERE u.id IS NULL
        AND LENGTH({content_sql}) > 50
        ORDER BY s.{id_col}
    """

    if limit:
        query += f" LIMIT {limit}"

    rows = await pool.fetch(query, unified_name)
    return [dict(row) for row in rows]


async def insert_embedding(
    pool: asyncpg.Pool,
    config: dict,
    record: Dict,
    embedding: List[float]
) -> bool:
    """Insert a single embedding"""

    try:
        await pool.execute("""
            INSERT INTO unified_embeddings
            (source_table, source_type, source_id, source_name, content, embedding, metadata, tokens_used, model_used, embedding_provider)
            VALUES ($1, $2, $3, $4, $5, $6::vector, $7::jsonb, $8, $9, $10)
            ON CONFLICT (source_table, source_id) DO UPDATE SET
                content = EXCLUDED.content,
                embedding = EXCLUDED.embedding,
                updated_at = NOW()
        """,
            config['unified_name'],
            config['source_type'],
            record['id'],
            (record['name'] or 'Untitled')[:255],
            record['content'][:30000],  # Truncate very long content
            f"[{','.join(map(str, embedding))}]",
            json.dumps({'completed_by_script': True, 'processed_at': datetime.now().isoformat()}),
            len(record['content']) // 4,
            'text-embedding-3-small',
            'openai'
        )
        return True
    except Exception as e:
        print(f"    ❌ Insert error for id={record['id']}: {e}")
        return False


async def process_table(
    pool: asyncpg.Pool,
    search_service: SemanticSearchService,
    csv_table: str,
    config: dict,
    dry_run: bool = False,
    batch_size: int = BATCH_SIZE
) -> tuple[int, int]:
    """Process missing embeddings for a single table"""

    print(f"\n📋 Processing: {csv_table}")

    # Get missing records
    missing = await get_missing_records(pool, csv_table, config)
    print(f"   Found {len(missing)} missing records")

    if not missing:
        return 0, 0

    inserted = 0
    failed = 0

    # Process in batches
    for i in range(0, len(missing), batch_size):
        batch = missing[i:i+batch_size]
        texts = [r['content'][:8000] for r in batch]  # Truncate for embedding

        if dry_run:
            print(f"   [DRY-RUN] Would process batch {i//batch_size + 1}: {len(batch)} records")
            inserted += len(batch)
            continue

        try:
            # Generate embeddings
            embeddings = await search_service.generate_embeddings_batch(texts)

            # Insert each
            for j, record in enumerate(batch):
                success = await insert_embedding(pool, config, record, embeddings[j])
                if success:
                    inserted += 1
                else:
                    failed += 1

            print(f"   ✅ Batch {i//batch_size + 1}/{(len(missing) + batch_size - 1)//batch_size}: {len(batch)} processed")

        except Exception as e:
            print(f"   ❌ Batch error: {e}")
            failed += len(batch)

    return inserted, failed


async def main():
    parser = argparse.ArgumentParser(description='Complete partial embeddings')
    parser.add_argument('--dry-run', action='store_true', help='Show what would be done')
    parser.add_argument('--table', type=str, help='Process only specific table (e.g., csv_danistaykararlari)')
    parser.add_argument('--batch-size', type=int, default=BATCH_SIZE, help='Batch size for processing')
    args = parser.parse_args()

    print("=" * 60)
    print("🔧 Complete Partial Embeddings")
    print("=" * 60)
    print(f"Mode: {'DRY-RUN' if args.dry_run else 'LIVE'}")
    print(f"Batch size: {args.batch_size}")
    if args.table:
        print(f"Table: {args.table}")
    print()

    pool = await asyncpg.create_pool(DATABASE_URL)
    search_service = SemanticSearchService()

    try:
        total_inserted = 0
        total_failed = 0

        # Filter tables if specified
        tables_to_process = TABLE_CONFIG
        if args.table:
            if args.table in TABLE_CONFIG:
                tables_to_process = {args.table: TABLE_CONFIG[args.table]}
            else:
                print(f"❌ Unknown table: {args.table}")
                print(f"Available tables: {', '.join(TABLE_CONFIG.keys())}")
                return

        for csv_table, config in tables_to_process.items():
            inserted, failed = await process_table(
                pool, search_service, csv_table, config,
                dry_run=args.dry_run, batch_size=args.batch_size
            )
            total_inserted += inserted
            total_failed += failed

        print("\n" + "=" * 60)
        print("📊 Summary")
        print("=" * 60)
        print(f"Total inserted: {total_inserted}")
        print(f"Total failed: {total_failed}")

        if args.dry_run:
            print("\n⚠️ DRY-RUN mode - no changes were made")

    finally:
        await pool.close()


if __name__ == "__main__":
    asyncio.run(main())
