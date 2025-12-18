"""
Download missing files from Google Drive
Syncs documents that have missing_file status with Google Drive folder
"""

import os
import sys
import asyncio
import asyncpg
import httpx
import json
from pathlib import Path
from typing import Dict, List, Optional
from urllib.parse import quote

# Add parent to path
sys.path.insert(0, str(Path(__file__).parent.parent))

# Configuration
DOCS_PATH = os.getenv("DOCS_PATH", "/var/www/vergilex/docs")
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/vergilex_db")

# Google OAuth
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_DRIVE_FILES_URL = "https://www.googleapis.com/drive/v3/files"


async def get_google_drive_config(pool: asyncpg.Pool) -> Dict:
    """Get Google Drive OAuth config from settings"""
    oauth_row = await pool.fetchrow(
        "SELECT value FROM settings WHERE key = 'googleDrive.oauth'"
    )
    config_row = await pool.fetchrow(
        "SELECT value FROM settings WHERE key = 'googleDrive.config'"
    )

    if not oauth_row or not config_row:
        raise Exception("Google Drive not configured")

    oauth = json.loads(oauth_row['value']) if isinstance(oauth_row['value'], str) else oauth_row['value']
    config = json.loads(config_row['value']) if isinstance(config_row['value'], str) else config_row['value']

    return {
        "client_id": oauth.get("clientId"),
        "client_secret": oauth.get("clientSecret"),
        "refresh_token": config.get("refreshToken"),
        "access_token": config.get("accessToken"),
        "folder_id": config.get("folderId")
    }


async def refresh_access_token(client: httpx.AsyncClient, config: Dict) -> str:
    """Get new access token using refresh token"""
    response = await client.post(GOOGLE_TOKEN_URL, data={
        "client_id": config["client_id"],
        "client_secret": config["client_secret"],
        "refresh_token": config["refresh_token"],
        "grant_type": "refresh_token"
    })

    if response.status_code != 200:
        raise Exception(f"Failed to refresh token: {response.text}")

    data = response.json()
    return data["access_token"]


async def list_drive_files(client: httpx.AsyncClient, access_token: str, folder_id: str) -> List[Dict]:
    """List all files in Google Drive folder"""
    files = []
    page_token = None

    headers = {"Authorization": f"Bearer {access_token}"}

    while True:
        params = {
            "q": f"'{folder_id}' in parents and trashed = false",
            "fields": "nextPageToken, files(id, name, mimeType, size)",
            "pageSize": 1000
        }

        if page_token:
            params["pageToken"] = page_token

        response = await client.get(GOOGLE_DRIVE_FILES_URL, headers=headers, params=params)

        if response.status_code != 200:
            raise Exception(f"Failed to list files: {response.text}")

        data = response.json()
        files.extend(data.get("files", []))

        page_token = data.get("nextPageToken")
        if not page_token:
            break

    return files


async def download_file(client: httpx.AsyncClient, access_token: str, file_id: str, dest_path: str) -> bool:
    """Download a file from Google Drive"""
    headers = {"Authorization": f"Bearer {access_token}"}
    url = f"{GOOGLE_DRIVE_FILES_URL}/{file_id}?alt=media"

    try:
        response = await client.get(url, headers=headers, follow_redirects=True)

        if response.status_code == 200:
            # Ensure directory exists
            os.makedirs(os.path.dirname(dest_path), exist_ok=True)

            with open(dest_path, 'wb') as f:
                f.write(response.content)

            return True
        else:
            print(f"  Failed to download: {response.status_code}")
            return False
    except Exception as e:
        print(f"  Error downloading: {e}")
        return False


def normalize_filename(name: str) -> str:
    """Normalize filename for comparison"""
    # Remove extension, lowercase, replace special chars
    name = name.lower()
    name = name.replace('.pdf', '').replace('.PDF', '')
    name = name.replace('_', ' ').replace('-', ' ')
    name = ''.join(c for c in name if c.isalnum() or c.isspace())
    return ' '.join(name.split())


async def main():
    print("=" * 60)
    print("Google Drive Missing Files Downloader")
    print("=" * 60)

    # Connect to database
    pool = await asyncpg.create_pool(DATABASE_URL)

    try:
        # Get Google Drive config
        print("\n1. Getting Google Drive configuration...")
        config = await get_google_drive_config(pool)
        print(f"   Folder ID: {config['folder_id']}")

        # Get fresh access token
        print("\n2. Refreshing access token...")
        async with httpx.AsyncClient(timeout=60.0) as client:
            access_token = await refresh_access_token(client, config)
            print("   Access token refreshed successfully")

            # List files in Drive folder
            print("\n3. Listing files in Google Drive folder...")
            drive_files = await list_drive_files(client, access_token, config['folder_id'])
            print(f"   Found {len(drive_files)} files in Google Drive")

            # Create lookup by normalized name
            drive_lookup = {}
            for f in drive_files:
                normalized = normalize_filename(f['name'])
                drive_lookup[normalized] = f
                # Also store by exact name
                drive_lookup[f['name'].lower()] = f

            # Get missing files from database
            print("\n4. Getting missing files from database...")
            missing_docs = await pool.fetch("""
                SELECT id, title, filename, file_path
                FROM documents
                WHERE processing_status = 'missing_file'
            """)
            print(f"   Found {len(missing_docs)} missing documents")

            # Match and download
            print("\n5. Matching and downloading files...")
            downloaded = 0
            not_found = 0
            errors = 0

            for doc in missing_docs:
                doc_id = doc['id']
                title = doc['title'] or ''
                filename = doc['filename'] or ''
                file_path = doc['file_path'] or ''

                # Try to find in Drive
                search_names = []

                # From title
                if title:
                    search_names.append(title.lower())
                    search_names.append(normalize_filename(title))

                # From filename
                if filename:
                    search_names.append(filename.lower())
                    search_names.append(normalize_filename(filename))

                # From file_path (extract filename)
                if file_path:
                    path_filename = os.path.basename(file_path)
                    search_names.append(path_filename.lower())
                    search_names.append(normalize_filename(path_filename))

                # Try to find match
                drive_file = None
                matched_name = None
                for name in search_names:
                    if name in drive_lookup:
                        drive_file = drive_lookup[name]
                        matched_name = name
                        break

                if not drive_file:
                    print(f"   [{doc_id}] NOT FOUND: {title or filename}")
                    not_found += 1
                    continue

                # Determine destination path
                dest_path = file_path if file_path else os.path.join(DOCS_PATH, drive_file['name'])

                # Ensure it's in vergilex docs
                if '/emlakai/' in dest_path:
                    dest_path = dest_path.replace('/emlakai/', '/vergilex/')

                print(f"   [{doc_id}] Downloading: {drive_file['name']}")

                success = await download_file(client, access_token, drive_file['id'], dest_path)

                if success:
                    # Update database - mark as pending for re-analysis
                    await pool.execute("""
                        UPDATE documents
                        SET processing_status = 'pending',
                            file_path = $2,
                            updated_at = NOW()
                        WHERE id = $1
                    """, doc_id, dest_path)
                    downloaded += 1
                    print(f"       ✓ Downloaded and marked for re-analysis")
                else:
                    errors += 1

            print("\n" + "=" * 60)
            print("SUMMARY")
            print("=" * 60)
            print(f"Total missing files: {len(missing_docs)}")
            print(f"Downloaded: {downloaded}")
            print(f"Not found in Drive: {not_found}")
            print(f"Errors: {errors}")

    finally:
        await pool.close()


if __name__ == "__main__":
    asyncio.run(main())
