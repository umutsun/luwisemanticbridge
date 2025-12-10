"""
Google Drive Import Worker - Production Ready
Downloads files from Google Drive and saves to docs/ folder
Progress tracked in PostgreSQL import_jobs table
"""
import os
import re
import json
import asyncio
from pathlib import Path
from typing import List, Dict, Any
from unicodedata import normalize

import psycopg
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseDownload
from io import BytesIO

from workers.celery_app import celery_app


def normalize_turkish_chars(text: str) -> str:
    """Normalize Turkish characters for filename safety"""
    replacements = {
        'ı': 'i', 'İ': 'I', 'ğ': 'g', 'Ğ': 'G',
        'ü': 'u', 'Ü': 'U', 'ş': 's', 'Ş': 'S',
        'ö': 'o', 'Ö': 'O', 'ç': 'c', 'Ç': 'C'
    }
    for turkish, latin in replacements.items():
        text = text.replace(turkish, latin)
    return text


def sanitize_filename(filename: str) -> str:
    """Sanitize filename for filesystem"""
    # Normalize Turkish chars
    filename = normalize_turkish_chars(filename)
    # Remove invalid chars
    filename = re.sub(r'[^\w\s\-_.]', '_', filename)
    # Collapse spaces and underscores
    filename = re.sub(r'\s+', '_', filename)
    filename = re.sub(r'_+', '_', filename)
    return filename


def get_file_type(mime_type: str, filename: str) -> str:
    """Determine file type from MIME type or extension"""
    ext = Path(filename).suffix.lower()

    if 'pdf' in mime_type or ext == '.pdf':
        return 'pdf'
    elif 'csv' in mime_type or ext == '.csv':
        return 'csv'
    elif 'spreadsheet' in mime_type or ext in ['.xlsx', '.xls']:
        return 'excel'
    elif 'document' in mime_type or ext in ['.doc', '.docx']:
        return 'word'
    elif 'text' in mime_type or ext == '.txt':
        return 'text'
    else:
        return 'other'


async def update_job_progress(
    job_id: int,
    processed: int,
    successful: int,
    failed: int,
    total: int,
    current_file: str = None,
    error: str = None
):
    """Update job progress in PostgreSQL"""
    db_url = os.getenv('DATABASE_URL', 'postgresql://postgres@localhost:5432/vergilex_lsemb')

    progress = min(100, int((processed / total) * 100))

    async with await psycopg.AsyncConnection.connect(db_url) as conn:
        async with conn.cursor() as cur:
            # Update progress
            await cur.execute("""
                UPDATE import_jobs
                SET progress = %s,
                    processed_files = %s,
                    successful_files = %s,
                    failed_files = %s,
                    metadata = jsonb_set(
                        COALESCE(metadata, '{}'::jsonb),
                        '{currentFile}',
                        to_jsonb(%s::text)
                    ),
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = %s
            """, (progress, processed, successful, failed, current_file or '', job_id))

            # If error, append to errors array
            if error:
                await cur.execute("""
                    UPDATE import_jobs
                    SET metadata = jsonb_set(
                        COALESCE(metadata, '{}'::jsonb),
                        '{errors}',
                        COALESCE(metadata->'errors', '[]'::jsonb) || jsonb_build_object(
                            'file', %s,
                            'error', %s,
                            'timestamp', to_jsonb(CURRENT_TIMESTAMP)
                        )::jsonb
                    )
                    WHERE id = %s
                """, (current_file or '', error, job_id))

            await conn.commit()


async def update_job_status(job_id: int, status: str):
    """Update job status (pending, in_progress, completed, failed)"""
    db_url = os.getenv('DATABASE_URL', 'postgresql://postgres@localhost:5432/vergilex_lsemb')

    timestamp_field = None
    if status == 'in_progress':
        timestamp_field = 'started_at'
    elif status in ['completed', 'failed']:
        timestamp_field = 'completed_at'

    async with await psycopg.AsyncConnection.connect(db_url) as conn:
        async with conn.cursor() as cur:
            if timestamp_field:
                await cur.execute(f"""
                    UPDATE import_jobs
                    SET status = %s, {timestamp_field} = CURRENT_TIMESTAMP
                    WHERE id = %s
                """, (status, job_id))
            else:
                await cur.execute("""
                    UPDATE import_jobs SET status = %s WHERE id = %s
                """, (status, job_id))
            await conn.commit()


async def check_if_document_exists(google_drive_id: str) -> bool:
    """Check if document with this google_drive_id already exists"""
    db_url = os.getenv('DATABASE_URL', 'postgresql://postgres@localhost:5432/vergilex_lsemb')

    async with await psycopg.AsyncConnection.connect(db_url) as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                "SELECT id FROM documents WHERE metadata->>'google_drive_id' = %s",
                (google_drive_id,)
            )
            existing = await cur.fetchone()
            return existing is not None


async def save_document_to_db(
    filename: str,
    file_path: str,
    file_size: int,
    file_type: str,
    google_drive_id: str,
    job_id: int
):
    """Save document metadata to PostgreSQL (INSERT only, no updates)"""
    db_url = os.getenv('DATABASE_URL', 'postgresql://postgres@localhost:5432/vergilex_lsemb')

    metadata = {
        'google_drive_id': google_drive_id,
        'source': 'google_drive',
        'imported_at': str(asyncio.get_event_loop().time()),
        'import_job_id': job_id
    }

    async with await psycopg.AsyncConnection.connect(db_url) as conn:
        async with conn.cursor() as cur:
            # Insert new document
            await cur.execute("""
                INSERT INTO documents (title, file_path, file_size, file_type, processing_status, metadata)
                VALUES (%s, %s, %s, %s, 'completed', %s)
            """, (filename, file_path, file_size, file_type, json.dumps(metadata)))

            await conn.commit()


@celery_app.task(bind=True, name='workers.import_google_drive_files')
def import_google_drive_files(
    self,
    job_id: int,
    file_ids: List[str],
    credentials_dict: Dict[str, Any],
    docs_dir: str,
    save_to_db: bool = True
):
    """
    Celery task to import files from Google Drive

    Args:
        job_id: Import job ID in import_jobs table
        file_ids: List of Google Drive file IDs
        credentials_dict: OAuth2 credentials dictionary
        docs_dir: Target directory for downloaded files
        save_to_db: Whether to save file metadata to database (default: True)
    """
    async def _run():
        print(f"[GoogleDrive Worker] Starting job {job_id} with {len(file_ids)} files")

        # Update status to in_progress
        await update_job_status(job_id, 'in_progress')

        # Build Google Drive service
        credentials = Credentials(**credentials_dict)
        service = build('drive', 'v3', credentials=credentials)

        processed = 0
        successful = 0
        failed = 0
        total = len(file_ids)

        # Create docs directory if not exists
        Path(docs_dir).mkdir(parents=True, exist_ok=True)

        for file_id in file_ids:
            try:
                # Get file metadata
                file_metadata = service.files().get(fileId=file_id, fields='name,mimeType,size').execute()
                filename = file_metadata.get('name', 'unknown')
                mime_type = file_metadata.get('mimeType', '')
                file_size = int(file_metadata.get('size', 0))

                # Check if already exists (by google_drive_id)
                if save_to_db and await check_if_document_exists(file_id):
                    print(f"[GoogleDrive Worker] ⏭️  Skipped (already imported): {filename} ({processed + 1}/{total})")
                    successful += 1
                    processed += 1

                    # Update progress
                    await update_job_progress(
                        job_id=job_id,
                        processed=processed,
                        successful=successful,
                        failed=failed,
                        total=total,
                        current_file=f"[SKIPPED] {filename}"
                    )
                    continue

                print(f"[GoogleDrive Worker] Downloading: {filename}")

                # Download file
                request = service.files().get_media(fileId=file_id)
                file_buffer = BytesIO()
                downloader = MediaIoBaseDownload(file_buffer, request)

                done = False
                while not done:
                    status, done = downloader.next_chunk()

                file_content = file_buffer.getvalue()

                print(f"[GoogleDrive Worker] Downloaded {filename}: {file_size / 1024:.1f} KB")

                # Sanitize filename
                safe_filename = sanitize_filename(filename)
                file_path = os.path.join(docs_dir, safe_filename)

                # Write to disk
                with open(file_path, 'wb') as f:
                    f.write(file_content)

                # Determine file type
                file_type = get_file_type(mime_type, filename)

                # Save to database (if enabled)
                if save_to_db:
                    await save_document_to_db(
                        filename=filename,
                        file_path=file_path,
                        file_size=file_size,
                        file_type=file_type,
                        google_drive_id=file_id,
                        job_id=job_id
                    )
                    print(f"[GoogleDrive Worker] ✅ Saved to DB and disk: {safe_filename} ({processed + 1}/{total})")
                else:
                    print(f"[GoogleDrive Worker] ✅ Saved to disk only: {safe_filename} ({processed + 1}/{total})")

                successful += 1
                processed += 1

                # Update progress
                await update_job_progress(
                    job_id=job_id,
                    processed=processed,
                    successful=successful,
                    failed=failed,
                    total=total,
                    current_file=filename
                )

            except Exception as e:
                failed += 1
                processed += 1
                error_msg = str(e)

                print(f"[GoogleDrive Worker] ❌ Failed {file_id}: {error_msg}")

                # Update progress with error
                await update_job_progress(
                    job_id=job_id,
                    processed=processed,
                    successful=successful,
                    failed=failed,
                    total=total,
                    error=error_msg
                )

        # Final progress update
        await update_job_progress(
            job_id=job_id,
            processed=processed,
            successful=successful,
            failed=failed,
            total=total,
            current_file='Import completed'
        )

        # Update final status
        final_status = 'completed' if failed == 0 else 'completed'  # Mark as completed even with some failures
        await update_job_status(job_id, final_status)

        print(f"[GoogleDrive Worker] Job {job_id} completed: {successful}/{total} successful, {failed} failed")

        return {
            'job_id': job_id,
            'processed': processed,
            'successful': successful,
            'failed': failed,
            'total': total
        }

    # Run async function
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        result = loop.run_until_complete(_run())
        return result
    finally:
        loop.close()
