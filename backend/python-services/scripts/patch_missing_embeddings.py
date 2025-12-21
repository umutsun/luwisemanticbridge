#!/usr/bin/env python3
"""
Patch script to embed only missing records
"""

import os
import psycopg2
from psycopg2.extras import execute_values
from openai import OpenAI
import time

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

def get_connection(dbname):
    return psycopg2.connect(
        host=DB_HOST, port=DB_PORT, user=DB_USER,
        password=DB_PASS, database=dbname
    )

def get_missing_ids(source_conn, target_conn, table_name, id_column='id'):
    """Find IDs that exist in source but not in embeddings"""
    with source_conn.cursor() as src_cur:
        src_cur.execute(f"SELECT {id_column}::int FROM {table_name}")
        source_ids = set(row[0] for row in src_cur.fetchall())

    with target_conn.cursor() as tgt_cur:
        tgt_cur.execute(
            "SELECT source_id FROM unified_embeddings WHERE source_table = %s",
            (table_name,)
        )
        embedded_ids = set(row[0] for row in tgt_cur.fetchall())

    missing = source_ids - embedded_ids
    return sorted(list(missing))

def embed_missing_records(table_name, content_query, id_column='id'):
    """Embed only missing records for a table"""
    client = OpenAI(api_key=OPENAI_API_KEY)
    source_conn = get_connection(SOURCE_DB)
    target_conn = get_connection(TARGET_DB)

    missing_ids = get_missing_ids(source_conn, target_conn, table_name, id_column)
    print(f"\n[{table_name}] Found {len(missing_ids)} missing records")

    if not missing_ids:
        print("  No missing records!")
        return

    total_created = 0
    for i in range(0, len(missing_ids), BATCH_SIZE):
        batch_ids = missing_ids[i:i+BATCH_SIZE]

        # Fetch records
        with source_conn.cursor() as cur:
            placeholders = ','.join(['%s'] * len(batch_ids))
            query = content_query.format(table_name) + f" WHERE {id_column}::int IN ({placeholders})"
            cur.execute(query, batch_ids)
            records = cur.fetchall()

        if not records:
            continue

        # Create embeddings
        texts = [f"{r[2] or ''}\n\n{r[1] or ''}" for r in records]  # title + content

        try:
            response = client.embeddings.create(input=texts, model=EMBEDDING_MODEL)
            embeddings = [e.embedding for e in response.data]

            # Insert
            with target_conn.cursor() as cur:
                values = [
                    (table_name, records[j][0], texts[j][:500], embeddings[j])
                    for j in range(len(records))
                ]
                execute_values(
                    cur,
                    """INSERT INTO unified_embeddings (source_table, source_id, content_preview, embedding)
                       VALUES %s ON CONFLICT (source_table, source_id) DO NOTHING""",
                    values,
                    template="(%s, %s, %s, %s::vector)"
                )
                target_conn.commit()
                total_created += len(records)
                print(f"  Batch {i//BATCH_SIZE + 1}: Created {len(records)} embeddings (total: {total_created})")

        except Exception as e:
            print(f"  Error: {e}")
            target_conn.rollback()
            time.sleep(5)

    source_conn.close()
    target_conn.close()
    print(f"[{table_name}] Completed! Created {total_created} embeddings")

if __name__ == '__main__':
    print("=" * 60)
    print("PATCHING MISSING EMBEDDINGS")
    print("=" * 60)

    # csv_danistaykararlari - 700 missing
    embed_missing_records(
        'csv_danistaykararlari',
        "SELECT id::int, icerik as content, konusu as title FROM {}"
    )

    # csv_sorucevap - 2 missing
    embed_missing_records(
        'csv_sorucevap',
        "SELECT id::int, soru || E'\\n\\nCevap: ' || cevap as content, soru as title FROM {}"
    )

    print("\n" + "=" * 60)
    print("PATCH COMPLETE!")
    print("=" * 60)
