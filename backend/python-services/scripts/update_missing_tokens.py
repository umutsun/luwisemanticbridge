"""
Update Missing Tokens Script
Scans documents with missing estimated_tokens and calculates them
Also validates Turkish character support
"""

import asyncio
import asyncpg
import os
import sys
from pathlib import Path

# Add parent to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

async def update_missing_tokens():
    """Update documents missing estimated_tokens in metadata"""

    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        print("ERROR: DATABASE_URL not set")
        return

    pool = await asyncpg.create_pool(database_url, min_size=1, max_size=5)

    try:
        # 1. Count documents with missing tokens
        missing_count = await pool.fetchval("""
            SELECT COUNT(*)
            FROM documents
            WHERE processing_status = 'analyzed'
            AND content IS NOT NULL
            AND LENGTH(content) > 0
            AND (metadata->>'estimated_tokens' IS NULL)
        """)

        print(f"📊 Token eksik döküman sayısı: {missing_count}")

        if missing_count == 0:
            print("✅ Tüm dökümanların token değeri mevcut!")
            return

        # 2. Count documents with Turkish characters
        turkish_count = await pool.fetchval("""
            SELECT COUNT(*)
            FROM documents
            WHERE processing_status = 'analyzed'
            AND content ~ '[şğüöıçŞĞÜÖİÇ]'
        """)
        print(f"🇹🇷 Türkçe karakterli döküman: {turkish_count}")

        # 3. Update missing tokens in batches
        batch_size = 100
        updated = 0

        while True:
            # Get batch of documents with missing tokens
            rows = await pool.fetch("""
                SELECT id, LENGTH(content) as char_count
                FROM documents
                WHERE processing_status = 'analyzed'
                AND content IS NOT NULL
                AND LENGTH(content) > 0
                AND (metadata->>'estimated_tokens' IS NULL)
                LIMIT $1
            """, batch_size)

            if not rows:
                break

            # Update each document
            for row in rows:
                doc_id = row['id']
                char_count = row['char_count']
                estimated_tokens = char_count // 4  # ~4 chars per token for Turkish

                await pool.execute("""
                    UPDATE documents
                    SET metadata = COALESCE(metadata, '{}'::jsonb) ||
                        jsonb_build_object('estimated_tokens', $2, 'char_count', $3)
                    WHERE id = $1
                """, doc_id, estimated_tokens, char_count)

                updated += 1

            print(f"  ✓ Güncellendi: {updated}/{missing_count}")

        print(f"\n✅ Toplam {updated} döküman güncellendi!")

        # 4. Calculate total tokens
        total_tokens = await pool.fetchval("""
            SELECT SUM((metadata->>'estimated_tokens')::bigint)
            FROM documents
            WHERE processing_status = 'analyzed'
            AND metadata->>'estimated_tokens' IS NOT NULL
        """)

        print(f"📈 Toplam tahmini token: {total_tokens:,}")

    finally:
        await pool.close()

if __name__ == "__main__":
    asyncio.run(update_missing_tokens())
