#!/usr/bin/env python3
"""
Google Drive Bulk Import Script
Imports all files from a shared Google Drive folder to the documents system.

Usage:
    python gdrive_bulk_import.py --folder-id <FOLDER_ID> [--credentials <path>]

Example:
    python gdrive_bulk_import.py --folder-id 1ABC123xyz --credentials credentials.json
"""

import os
import sys
import json
import argparse
import asyncio
from pathlib import Path
from io import BytesIO
from typing import List, Dict, Any, Optional

# Add parent to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

import psycopg
from google.oauth2.credentials import Credentials
from google.oauth2 import service_account
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseDownload

# Configuration
DOCS_DIR = os.getenv('DOCUMENTS_PATH', '/var/www/vergilex/docs')
DATABASE_URL = os.getenv('DATABASE_URL', 'postgresql://postgres@localhost:5432/vergilex_db')

# Supported file types
SUPPORTED_TYPES = {
    'application/pdf': 'pdf',
    'text/csv': 'csv',
    'application/vnd.ms-excel': 'excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'excel',
    'application/msword': 'word',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'word',
    'text/plain': 'text',
    'text/markdown': 'text',
}


def normalize_filename(filename: str) -> str:
    """Normalize Turkish characters and sanitize filename"""
    replacements = {
        'ı': 'i', 'İ': 'I', 'ğ': 'g', 'Ğ': 'G',
        'ü': 'u', 'Ü': 'U', 'ş': 's', 'Ş': 'S',
        'ö': 'o', 'Ö': 'O', 'ç': 'c', 'Ç': 'C'
    }
    for tr, en in replacements.items():
        filename = filename.replace(tr, en)

    # Remove invalid characters
    import re
    filename = re.sub(r'[^\w\s\-_.]', '_', filename)
    filename = re.sub(r'\s+', '_', filename)
    filename = re.sub(r'_+', '_', filename)
    return filename


def get_file_type(mime_type: str, filename: str) -> str:
    """Determine file type from MIME type or extension"""
    if mime_type in SUPPORTED_TYPES:
        return SUPPORTED_TYPES[mime_type]

    ext = Path(filename).suffix.lower()
    ext_map = {
        '.pdf': 'pdf', '.csv': 'csv', '.xlsx': 'excel', '.xls': 'excel',
        '.doc': 'word', '.docx': 'word', '.txt': 'text', '.md': 'text'
    }
    return ext_map.get(ext, 'other')


async def check_document_exists(google_drive_id: str) -> bool:
    """Check if document already exists in database"""
    async with await psycopg.AsyncConnection.connect(DATABASE_URL) as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                "SELECT id FROM documents WHERE metadata->>'google_drive_id' = %s",
                (google_drive_id,)
            )
            return await cur.fetchone() is not None


async def save_to_database(
    filename: str,
    file_path: str,
    file_size: int,
    file_type: str,
    google_drive_id: str
) -> int:
    """Save document to database, return document ID"""
    metadata = {
        'google_drive_id': google_drive_id,
        'source': 'google_drive_bulk_import',
    }

    async with await psycopg.AsyncConnection.connect(DATABASE_URL) as conn:
        async with conn.cursor() as cur:
            await cur.execute("""
                INSERT INTO documents (title, file_path, file_size, file_type, processing_status, metadata)
                VALUES (%s, %s, %s, %s, 'pending', %s)
                RETURNING id
            """, (filename, file_path, file_size, file_type, json.dumps(metadata)))

            result = await cur.fetchone()
            await conn.commit()
            return result[0] if result else None


def list_folder_files(service, folder_id: str, recursive: bool = True) -> List[Dict]:
    """List all files in a Google Drive folder"""
    files = []
    page_token = None

    while True:
        query = f"'{folder_id}' in parents and trashed = false"

        results = service.files().list(
            q=query,
            pageSize=100,
            fields="nextPageToken, files(id, name, mimeType, size)",
            pageToken=page_token
        ).execute()

        items = results.get('files', [])

        for item in items:
            if item['mimeType'] == 'application/vnd.google-apps.folder':
                if recursive:
                    # Recursively get files from subfolders
                    subfolder_files = list_folder_files(service, item['id'], recursive=True)
                    files.extend(subfolder_files)
            else:
                files.append(item)

        page_token = results.get('nextPageToken')
        if not page_token:
            break

    return files


def download_file(service, file_id: str) -> bytes:
    """Download file content from Google Drive"""
    request = service.files().get_media(fileId=file_id)
    buffer = BytesIO()
    downloader = MediaIoBaseDownload(buffer, request)

    done = False
    while not done:
        status, done = downloader.next_chunk()

    return buffer.getvalue()


async def import_files(
    service,
    files: List[Dict],
    docs_dir: str,
    skip_existing: bool = True
):
    """Import files to local storage and database"""
    total = len(files)
    successful = 0
    skipped = 0
    failed = 0

    # Sort by size (smallest first)
    files.sort(key=lambda x: int(x.get('size', 0)))

    print(f"\n{'='*60}")
    print(f"Starting import of {total} files")
    print(f"Target directory: {docs_dir}")
    print(f"{'='*60}\n")

    Path(docs_dir).mkdir(parents=True, exist_ok=True)

    for i, file_info in enumerate(files, 1):
        file_id = file_info['id']
        filename = file_info['name']
        mime_type = file_info.get('mimeType', '')
        file_size = int(file_info.get('size', 0))

        progress = f"[{i}/{total}]"

        try:
            # Check if already exists
            if skip_existing and await check_document_exists(file_id):
                print(f"{progress} ⏭️  SKIP: {filename} (already imported)")
                skipped += 1
                continue

            # Check if supported type
            file_type = get_file_type(mime_type, filename)
            if file_type == 'other':
                print(f"{progress} ⏭️  SKIP: {filename} (unsupported type: {mime_type})")
                skipped += 1
                continue

            print(f"{progress} 📥 Downloading: {filename} ({file_size/1024:.1f} KB)...")

            # Download file
            content = download_file(service, file_id)

            # Save to disk
            safe_filename = normalize_filename(filename)
            file_path = os.path.join(docs_dir, safe_filename)

            with open(file_path, 'wb') as f:
                f.write(content)

            # Save to database
            doc_id = await save_to_database(
                filename=filename,
                file_path=file_path,
                file_size=len(content),
                file_type=file_type,
                google_drive_id=file_id
            )

            print(f"{progress} ✅ DONE: {filename} → doc_id={doc_id}")
            successful += 1

        except Exception as e:
            print(f"{progress} ❌ FAIL: {filename} - {str(e)}")
            failed += 1

    print(f"\n{'='*60}")
    print(f"Import completed!")
    print(f"  ✅ Successful: {successful}")
    print(f"  ⏭️  Skipped: {skipped}")
    print(f"  ❌ Failed: {failed}")
    print(f"  📊 Total: {total}")
    print(f"{'='*60}\n")

    return {
        'total': total,
        'successful': successful,
        'skipped': skipped,
        'failed': failed
    }


def get_credentials(credentials_path: Optional[str] = None) -> Credentials:
    """Get Google credentials from file or environment"""

    # Try service account first
    if credentials_path and os.path.exists(credentials_path):
        if 'service_account' in open(credentials_path).read():
            return service_account.Credentials.from_service_account_file(
                credentials_path,
                scopes=['https://www.googleapis.com/auth/drive.readonly']
            )
        else:
            # OAuth credentials
            with open(credentials_path) as f:
                creds_data = json.load(f)
            return Credentials(**creds_data)

    # Try environment variable
    creds_json = os.getenv('GOOGLE_CREDENTIALS_JSON')
    if creds_json:
        creds_data = json.loads(creds_json)
        if 'type' in creds_data and creds_data['type'] == 'service_account':
            return service_account.Credentials.from_service_account_info(
                creds_data,
                scopes=['https://www.googleapis.com/auth/drive.readonly']
            )
        return Credentials(**creds_data)

    raise ValueError("No credentials found. Provide --credentials or set GOOGLE_CREDENTIALS_JSON")


def main():
    parser = argparse.ArgumentParser(description='Import files from Google Drive folder')
    parser.add_argument('--folder-id', required=True, help='Google Drive folder ID')
    parser.add_argument('--credentials', help='Path to credentials JSON file')
    parser.add_argument('--docs-dir', default=DOCS_DIR, help='Target directory for files')
    parser.add_argument('--no-skip', action='store_true', help='Re-import existing files')
    parser.add_argument('--no-recursive', action='store_true', help='Do not import subfolders')
    parser.add_argument('--dry-run', action='store_true', help='List files without importing')

    args = parser.parse_args()

    print("\n🚀 Google Drive Bulk Import")
    print(f"   Folder ID: {args.folder_id}")
    print(f"   Target: {args.docs_dir}")

    # Get credentials
    try:
        credentials = get_credentials(args.credentials)
        print("   ✅ Credentials loaded")
    except Exception as e:
        print(f"   ❌ Credentials error: {e}")
        sys.exit(1)

    # Build service
    service = build('drive', 'v3', credentials=credentials)
    print("   ✅ Google Drive service ready")

    # List files
    print("\n📂 Listing files in folder...")
    files = list_folder_files(service, args.folder_id, recursive=not args.no_recursive)
    print(f"   Found {len(files)} files")

    if args.dry_run:
        print("\n📋 Files to import (dry run):")
        for f in files:
            size = int(f.get('size', 0))
            print(f"   - {f['name']} ({size/1024:.1f} KB)")
        return

    # Import files
    asyncio.run(import_files(
        service=service,
        files=files,
        docs_dir=args.docs_dir,
        skip_existing=not args.no_skip
    ))


if __name__ == '__main__':
    main()
