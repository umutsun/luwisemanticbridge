#!/usr/bin/env python3
"""
Convert HTML to Markdown in Embeddings Content (Batch Processing)
==================================================================
This script converts HTML tags to markdown format in unified_embeddings table.
Uses batch processing to handle large datasets efficiently.

Usage:
    python clean_html_from_embeddings.py [--batch-size N]
"""

import os
import re
import argparse
import html
from typing import Optional
import psycopg2
from psycopg2.extras import RealDictCursor
from dotenv import load_dotenv

load_dotenv()


def html_to_markdown(text: Optional[str]) -> str:
    """Convert HTML tags to markdown format."""
    if not text:
        return ''

    result = text

    # Block elements
    result = re.sub(r'<p[^>]*>', '\n\n', result, flags=re.IGNORECASE)
    result = re.sub(r'</p>', '', result, flags=re.IGNORECASE)
    result = re.sub(r'<br\s*/?>', '\n', result, flags=re.IGNORECASE)

    # Headings
    result = re.sub(r'<h1[^>]*>(.*?)</h1>', r'\n# \1\n', result, flags=re.IGNORECASE | re.DOTALL)
    result = re.sub(r'<h2[^>]*>(.*?)</h2>', r'\n## \1\n', result, flags=re.IGNORECASE | re.DOTALL)
    result = re.sub(r'<h3[^>]*>(.*?)</h3>', r'\n### \1\n', result, flags=re.IGNORECASE | re.DOTALL)

    # Lists
    result = re.sub(r'<li[^>]*>(.*?)</li>', r'• \1\n', result, flags=re.IGNORECASE | re.DOTALL)
    result = re.sub(r'</?[uo]l[^>]*>', '\n', result, flags=re.IGNORECASE)

    # Bold/Strong
    result = re.sub(r'<strong[^>]*>(.*?)</strong>', r'**\1**', result, flags=re.IGNORECASE | re.DOTALL)
    result = re.sub(r'<b[^>]*>(.*?)</b>', r'**\1**', result, flags=re.IGNORECASE | re.DOTALL)

    # Italic
    result = re.sub(r'<em[^>]*>(.*?)</em>', r'*\1*', result, flags=re.IGNORECASE | re.DOTALL)
    result = re.sub(r'<i[^>]*>(.*?)</i>', r'*\1*', result, flags=re.IGNORECASE | re.DOTALL)

    # Links
    result = re.sub(r'<a[^>]*href=["\']([^"\']*)["\'][^>]*>(.*?)</a>', r'[\2](\1)', result, flags=re.IGNORECASE | re.DOTALL)

    # Remove remaining tags
    result = re.sub(r'<div[^>]*>', '\n', result, flags=re.IGNORECASE)
    result = re.sub(r'</div>', '', result, flags=re.IGNORECASE)
    result = re.sub(r'<span[^>]*>', '', result, flags=re.IGNORECASE)
    result = re.sub(r'</span>', '', result, flags=re.IGNORECASE)
    result = re.sub(r'<[^>]+>', '', result)

    # Decode entities
    result = html.unescape(result)
    result = re.sub(r'&nbsp;', ' ', result, flags=re.IGNORECASE)

    # Clean whitespace
    result = re.sub(r' +', ' ', result)
    result = re.sub(r'\n{3,}', '\n\n', result)
    result = result.strip()

    return result


def get_database_url() -> str:
    db_url = os.getenv('DATABASE_URL')
    if not db_url:
        host = os.getenv('DB_HOST', 'localhost')
        port = os.getenv('DB_PORT', '5432')
        user = os.getenv('DB_USER', 'postgres')
        password = os.getenv('DB_PASSWORD', '')
        database = os.getenv('DB_NAME', 'lsemb')
        db_url = f"postgresql://{user}:{password}@{host}:{port}/{database}"
    return db_url


def clean_embeddings_batch(batch_size: int = 1000):
    """Clean HTML from unified_embeddings in batches."""
    db_url = get_database_url()

    print("=" * 60)
    print("🔄 HTML to Markdown Converter")
    print("=" * 60)
    print(f"Batch size: {batch_size}")

    conn = psycopg2.connect(db_url)
    conn.autocommit = False
    cursor = conn.cursor(cursor_factory=RealDictCursor)

    try:
        # Count total records with HTML
        cursor.execute("""
            SELECT COUNT(*) as cnt FROM unified_embeddings
            WHERE source_name LIKE '%%<%%>%%' OR content LIKE '%%<%%>%%'
        """)
        total = cursor.fetchone()['cnt']
        print(f"\n📊 Total records with HTML: {total:,}")

        if total == 0:
            print("✅ No records need cleaning!")
            return

        updated_total = 0
        offset = 0

        while True:
            # Fetch batch - use string formatting for LIMIT/OFFSET to avoid param issues
            query = f"""
                SELECT id, source_name, content
                FROM unified_embeddings
                WHERE source_name LIKE '%%<%%>%%' OR content LIKE '%%<%%>%%'
                ORDER BY id
                LIMIT {batch_size} OFFSET {offset}
            """
            cursor.execute(query)

            records = cursor.fetchall()
            if not records:
                break

            # Process batch
            batch_updates = []
            for record in records:
                clean_name = html_to_markdown(record['source_name'])
                clean_content = html_to_markdown(record['content'])

                if clean_name != record['source_name'] or clean_content != record['content']:
                    batch_updates.append((clean_name, clean_content, record['id']))

            # Execute batch update
            if batch_updates:
                cursor.executemany("""
                    UPDATE unified_embeddings
                    SET source_name = %s, content = %s, updated_at = NOW()
                    WHERE id = %s
                """, batch_updates)
                conn.commit()
                updated_total += len(batch_updates)

            print(f"   Processed: {offset + len(records):,} / {total:,} ({updated_total:,} updated)", flush=True)
            offset += batch_size

        print(f"\n✅ Done! Updated {updated_total:,} records")

    except Exception as e:
        print(f"\n❌ Error: {e}")
        conn.rollback()
        raise
    finally:
        cursor.close()
        conn.close()


def main():
    parser = argparse.ArgumentParser(description='Convert HTML to Markdown in embeddings')
    parser.add_argument('--batch-size', type=int, default=500, help='Batch size (default: 500)')
    args = parser.parse_args()

    clean_embeddings_batch(batch_size=args.batch_size)


if __name__ == '__main__':
    main()
