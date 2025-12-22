#!/usr/bin/env python3
"""
Clean HTML content from unified_embeddings
Converts HTML to clean markdown-like text
"""

import os
import re
import psycopg2
from psycopg2.extras import execute_batch
from html import unescape
import time

# Configuration
TARGET_DB = os.environ.get('TARGET_DB', 'vergilex_lsemb')
DB_HOST = os.environ.get('DB_HOST', 'localhost')
DB_PORT = os.environ.get('DB_PORT', '5432')
DB_USER = os.environ.get('DB_USER', 'postgres')
DB_PASS = os.environ.get('DB_PASS', 'Luwi2025SecurePGx7749')
BATCH_SIZE = 100


def get_connection():
    return psycopg2.connect(
        host=DB_HOST, port=DB_PORT, user=DB_USER,
        password=DB_PASS, database=TARGET_DB
    )


def clean_html(text):
    """Remove HTML tags and clean up content"""
    if not text:
        return text

    # Unescape HTML entities first
    text = unescape(text)

    # Replace common block elements with newlines
    text = re.sub(r'<br\s*/?>', '\n', text, flags=re.IGNORECASE)
    text = re.sub(r'</p>', '\n\n', text, flags=re.IGNORECASE)
    text = re.sub(r'</div>', '\n', text, flags=re.IGNORECASE)
    text = re.sub(r'</li>', '\n', text, flags=re.IGNORECASE)
    text = re.sub(r'</tr>', '\n', text, flags=re.IGNORECASE)
    text = re.sub(r'</h[1-6]>', '\n\n', text, flags=re.IGNORECASE)

    # Convert bold/strong to markdown
    text = re.sub(r'<(strong|b)>(.*?)</\1>', r'**\2**', text, flags=re.IGNORECASE | re.DOTALL)

    # Convert italic/em to markdown
    text = re.sub(r'<(em|i)>(.*?)</\1>', r'*\2*', text, flags=re.IGNORECASE | re.DOTALL)

    # Convert headers to markdown
    for i in range(1, 7):
        text = re.sub(rf'<h{i}[^>]*>(.*?)</h{i}>', rf'{"#" * i} \1\n', text, flags=re.IGNORECASE | re.DOTALL)

    # Remove all remaining HTML tags
    text = re.sub(r'<[^>]+>', '', text)

    # Fix spaced Turkish characters (common OCR issue)
    # D A N I Ş T A Y -> DANIŞTAY
    text = re.sub(r'D\s+A\s+N\s+I\s+Ş\s+T\s+A\s+Y', 'DANIŞTAY', text)
    text = re.sub(r'V\s+E\s+R\s+G\s+İ', 'VERGİ', text)
    text = re.sub(r'M\s+A\s+H\s+K\s+E\s+M\s+E', 'MAHKEME', text)
    text = re.sub(r'K\s+A\s+R\s+A\s+R', 'KARAR', text)
    text = re.sub(r'T\s+Ü\s+R\s+K\s+İ\s+Y\s+E', 'TÜRKİYE', text)

    # Clean up whitespace
    text = re.sub(r'[ \t]+', ' ', text)  # Multiple spaces to single
    text = re.sub(r'\n\s*\n\s*\n+', '\n\n', text)  # Multiple newlines to double
    text = text.strip()

    return text


def count_html_records(conn):
    """Count records with HTML content"""
    with conn.cursor() as cur:
        cur.execute("""
            SELECT COUNT(*) FROM unified_embeddings
            WHERE content LIKE '%<%>%'
               OR content LIKE '%&nbsp;%'
               OR content LIKE '%&amp;%'
               OR content LIKE '%D A N I Ş T A Y%'
        """)
        return cur.fetchone()[0]


def process_batch(conn, offset, batch_size):
    """Process a batch of records"""
    with conn.cursor() as cur:
        # Fetch records with HTML
        cur.execute("""
            SELECT id, content FROM unified_embeddings
            WHERE content LIKE '%%<%%>%%'
               OR content LIKE '%%&nbsp;%%'
               OR content LIKE '%%&amp;%%'
               OR content LIKE '%%D A N I Ş T A Y%%'
            ORDER BY id
            LIMIT %s OFFSET %s
        """, (batch_size, offset))
        records = cur.fetchall()

        if not records:
            return 0

        # Clean content
        updates = []
        for record_id, content in records:
            cleaned = clean_html(content)
            if cleaned != content:
                updates.append((cleaned, record_id))

        # Update records
        if updates:
            execute_batch(
                cur,
                "UPDATE unified_embeddings SET content = %s WHERE id = %s",
                updates
            )
            conn.commit()

        return len(records)


def main():
    print("=" * 60)
    print("CLEANING HTML CONTENT FROM UNIFIED_EMBEDDINGS")
    print("=" * 60)

    conn = get_connection()

    # Count total records with HTML
    total = count_html_records(conn)
    print(f"\nFound {total:,} records with HTML content or spaced text")

    if total == 0:
        print("No records to clean!")
        conn.close()
        return

    processed = 0
    start_time = time.time()

    while True:
        batch_count = process_batch(conn, 0, BATCH_SIZE)  # Always offset 0 since we update

        if batch_count == 0:
            break

        processed += batch_count
        elapsed = time.time() - start_time
        rate = processed / elapsed if elapsed > 0 else 0
        remaining = count_html_records(conn)

        print(f"  Processed: {processed:,} | Remaining: {remaining:,} | Rate: {rate:.1f}/sec")

        if remaining == 0:
            break

    elapsed = time.time() - start_time
    print(f"\n{'=' * 60}")
    print(f"CLEANING COMPLETE!")
    print(f"  Total processed: {processed:,}")
    print(f"  Time elapsed: {elapsed:.1f} seconds")
    print(f"{'=' * 60}")

    conn.close()


if __name__ == '__main__':
    main()
