#!/usr/bin/env python3
"""
Direct Embedding Script - Bypass Node.js backend
Runs directly on the server with minimal memory footprint
Auto-resumes from last position on failure
"""

import os
import sys
import time
import json
import psycopg2
from psycopg2.extras import execute_values
from openai import OpenAI
import redis

# Configuration
SOURCE_DB = os.environ.get('SOURCE_DB', 'vergilex_db')
TARGET_DB = os.environ.get('TARGET_DB', 'vergilex_lsemb')
DB_HOST = os.environ.get('DB_HOST', 'localhost')
DB_PORT = os.environ.get('DB_PORT', '5432')
DB_USER = os.environ.get('DB_USER', 'postgres')
DB_PASS = os.environ.get('DB_PASS', 'Luwi2025SecurePGx7749')
OPENAI_API_KEY = os.environ.get('OPENAI_API_KEY', '')
EMBEDDING_MODEL = 'text-embedding-3-small'
BATCH_SIZE = 10
PROGRESS_FILE = '/var/www/vergilex/embedding_progress.json'
REDIS_HOST = os.environ.get('REDIS_HOST', 'localhost')
REDIS_PORT = int(os.environ.get('REDIS_PORT', '6379'))
REDIS_DB = int(os.environ.get('REDIS_DB', '2'))

# Initialize Redis connection
try:
    redis_client = redis.Redis(host=REDIS_HOST, port=REDIS_PORT, db=REDIS_DB, decode_responses=True)
    redis_client.ping()
    print("✅ Redis connected")
except:
    redis_client = None
    print("⚠️  Redis not available, progress won't be visible in UI")

def get_connection(dbname):
    """Get database connection"""
    return psycopg2.connect(
        host=DB_HOST,
        port=DB_PORT,
        user=DB_USER,
        password=DB_PASS,
        database=dbname
    )

def load_progress():
    """Load progress from file"""
    try:
        if os.path.exists(PROGRESS_FILE):
            with open(PROGRESS_FILE, 'r') as f:
                return json.load(f)
    except:
        pass
    return {'table': 'csv_danistaykararlari', 'offset': 0, 'processed': 0}

def save_progress(progress, table_total=None):
    """Save progress to file and Redis"""
    with open(PROGRESS_FILE, 'w') as f:
        json.dump(progress, f)

    # Also update Redis for real-time UI updates
    if redis_client:
        try:
            # Calculate total across all tables if available
            total_to_embed = table_total if table_total else 0

            # For percentage, use only current table progress (offset vs table total)
            # current is cumulative across all tables, so use offset for single-table progress
            current_table_progress = progress.get('offset', 0)

            redis_progress = {
                'status': 'processing',
                'currentTable': progress.get('table'),
                'current': progress.get('processed', 0),  # Cumulative total
                'total': total_to_embed,  # Current table total
                'offset': progress.get('offset', 0),
                'percentage': int((current_table_progress / total_to_embed * 100)) if total_to_embed > 0 else 0,
                'startTime': int(time.time() * 1000),
                'processedTables': []  # Backend expects this field
            }
            redis_client.setex('embedding:progress', 86400, json.dumps(redis_progress))  # 24h expiry
        except Exception as e:
            print(f"  ⚠️  Redis update failed: {e}")

def get_existing_ids(target_conn, table_name, ids):
    """Get existing source IDs in one query"""
    if not ids:
        return set()
    with target_conn.cursor() as cur:
        cur.execute(
            "SELECT source_id FROM unified_embeddings WHERE source_table = %s AND source_id = ANY(%s::bigint[])",
            (table_name, ids)
        )
        return set(row[0] for row in cur.fetchall())

def generate_embeddings(texts, client, max_retries=5):
    """Generate embeddings using OpenAI API with retry logic"""
    for attempt in range(max_retries):
        try:
            response = client.embeddings.create(
                model=EMBEDDING_MODEL,
                input=texts
            )
            return [item.embedding for item in response.data]
        except Exception as e:
            error_str = str(e).lower()
            if 'rate' in error_str or 'limit' in error_str or '429' in str(e):
                wait_time = (2 ** attempt) * 10  # 10, 20, 40, 80, 160 seconds
                print(f"  ⚠️ Rate limit hit, waiting {wait_time}s (attempt {attempt+1}/{max_retries})...")
                time.sleep(wait_time)
            elif 'timeout' in error_str or 'connection' in error_str:
                wait_time = (2 ** attempt) * 5  # 5, 10, 20, 40, 80 seconds
                print(f"  ⚠️ Connection error, waiting {wait_time}s (attempt {attempt+1}/{max_retries})...")
                time.sleep(wait_time)
            else:
                print(f"  ❌ Embedding error: {e}")
                if attempt < max_retries - 1:
                    time.sleep(5)
                else:
                    return None
    return None

def process_table(client, table_name, progress):
    """Process a single table with auto-reconnection"""
    offset = progress.get('offset', 0)
    processed = progress.get('processed', 0)

    # Create fresh connections
    source_conn = get_connection(SOURCE_DB)
    target_conn = get_connection(TARGET_DB)
    reconnect_count = 0
    max_reconnects = 5

    # Column mapping for different tables
    if table_name == 'csv_sorucevap':
        content_query = "SELECT id::int, soru || E'\\n\\nCevap: ' || cevap as content, soru as title FROM {}"
    else:
        content_query = "SELECT id::int, icerik as content, konusu as title FROM {}"

    # Get total count
    with source_conn.cursor() as cur:
        cur.execute(f"SELECT COUNT(*) FROM {table_name}")
        total = cur.fetchone()[0]

    print(f"\n[{table_name}] Starting from offset {offset}, total records: {total}")

    while offset < total:
        try:
            # Check if connections are closed and reconnect
            if source_conn.closed or target_conn.closed:
                print(f"  Reconnecting to databases...")
                try:
                    source_conn.close()
                except:
                    pass
                try:
                    target_conn.close()
                except:
                    pass
                source_conn = get_connection(SOURCE_DB)
                target_conn = get_connection(TARGET_DB)
                reconnect_count += 1
                if reconnect_count > max_reconnects:
                    print(f"  Too many reconnects ({reconnect_count}), waiting 30s...")
                    time.sleep(30)
                    reconnect_count = 0

            # Fetch batch
            with source_conn.cursor() as cur:
                cur.execute(
                    content_query.format(table_name) + " ORDER BY id::int LIMIT %s OFFSET %s",
                    (BATCH_SIZE, offset)
                )
                rows = cur.fetchall()

            if not rows:
                break

            # Get existing IDs
            batch_ids = [row[0] for row in rows]
            existing_ids = get_existing_ids(target_conn, table_name, batch_ids)

            # Filter new records
            new_rows = [row for row in rows if row[0] not in existing_ids]
            skipped = len(rows) - len(new_rows)

            if skipped > 0:
                print(f"  Offset {offset}: {skipped}/{len(rows)} skipped (already exist)")

            if new_rows:
                # Prepare texts for embedding
                texts = [row[1][:8000] if row[1] else '' for row in new_rows]
                texts = [t for t in texts if t.strip()]  # Filter empty

                if texts:
                    # Generate embeddings
                    embeddings = generate_embeddings(texts, client)

                    if embeddings:
                        # Insert into unified_embeddings
                        with target_conn.cursor() as cur:
                            for i, row in enumerate(new_rows):
                                if i < len(embeddings) and row[1] and row[1].strip():
                                    cur.execute("""
                                        INSERT INTO unified_embeddings
                                        (source_table, source_type, source_id, source_name, content, embedding, metadata, tokens_used, model_used)
                                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                                        ON CONFLICT (source_table, source_id) DO NOTHING
                                    """, (
                                        table_name,
                                        'document',
                                        row[0],
                                        (row[2] or f'{table_name} {row[0]}')[:255],
                                        row[1][:8000],
                                        embeddings[i],
                                        json.dumps({'model': EMBEDDING_MODEL}),
                                        len(row[1]) // 4,
                                        EMBEDDING_MODEL
                                    ))
                        target_conn.commit()
                        processed += len(texts)
                        print(f"  Offset {offset}: Created {len(texts)} new embeddings (total: {processed})")

            offset += BATCH_SIZE
            progress['offset'] = offset
            progress['processed'] = processed
            save_progress(progress, total)

            # Small delay to avoid rate limiting
            time.sleep(0.1)

        except psycopg2.OperationalError as e:
            print(f"DB Error at offset {offset}: {e}")
            save_progress(progress, total)
            # Force reconnection
            try:
                source_conn.close()
            except:
                pass
            try:
                target_conn.close()
            except:
                pass
            source_conn = get_connection(SOURCE_DB)
            target_conn = get_connection(TARGET_DB)
            time.sleep(5)
            continue
        except Exception as e:
            print(f"Error at offset {offset}: {e}")
            save_progress(progress, total)
            time.sleep(5)  # Wait before retry
            continue

    # Close connections
    try:
        source_conn.close()
        target_conn.close()
    except:
        pass

    return processed

def main():
    # Load OpenAI API key
    api_key = OPENAI_API_KEY
    if not api_key:
        # Try to load from backend .env
        env_file = '/var/www/vergilex/backend/.env'
        if os.path.exists(env_file):
            with open(env_file) as f:
                for line in f:
                    if line.startswith('OPENAI_API_KEY='):
                        api_key = line.strip().split('=', 1)[1]
                        break

    if not api_key:
        print("ERROR: OPENAI_API_KEY not found!")
        sys.exit(1)

    client = OpenAI(api_key=api_key)
    progress = load_progress()

    print("=" * 60)
    print("DIRECT EMBEDDING SCRIPT")
    print("=" * 60)
    print(f"Source DB: {SOURCE_DB}")
    print(f"Target DB: {TARGET_DB}")
    print(f"Model: {EMBEDDING_MODEL}")
    print(f"Batch size: {BATCH_SIZE}")
    print(f"Starting from: {progress}")
    print("=" * 60)

    # Tables to process
    tables = [
        'csv_danistaykararlari',
        'csv_sorucevap',
        'csv_ozelge',
        'csv_makale_arsiv_2021',
        'csv_makale_arsiv_2022',
        'csv_makale_arsiv_2023',
        'csv_makale_arsiv_2024',
        'csv_hukdkk',
        'csv_maliansiklopedi'
    ]

    # Find starting table index
    start_idx = 0
    current_table = progress.get('table')
    if current_table and current_table in tables:
        start_idx = tables.index(current_table)

    # Process tables from current position
    for table in tables[start_idx:]:
        progress['table'] = table

        # Only reset offset if we're moving to a new table
        if table != current_table:
            progress['offset'] = 0
            save_progress(progress)

        process_table(client, table, progress)

        # Mark current table as processed
        current_table = table

    print("\n" + "=" * 60)
    print("EMBEDDING COMPLETE!")
    print(f"Total processed: {progress.get('processed', 0)}")
    print("=" * 60)

if __name__ == '__main__':
    main()
