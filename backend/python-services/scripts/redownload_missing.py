#!/usr/bin/env python3
"""Re-download missing files from Google Drive"""

import os
import sys
import json
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

import psycopg2
from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseDownload
from io import BytesIO

DOCS_DIR = "/var/www/vergilex/docs"
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:Luwi2025SecurePGx7749@localhost:5432/vergilex_lsemb")
FOLDER_ID = "1oiminpf_w6ZiKXc-HUHPcVlKpiYL3TIb"

def normalize(name):
    """Normalize filename for comparison"""
    name = name.lower().replace(".pdf", "").replace("_", " ").replace("-", " ")
    return " ".join(name.split())

def main():
    print("=" * 60)
    print("Re-download Missing Files from Google Drive")
    print("=" * 60)

    # Load credentials
    with open("gdrive_credentials.json") as f:
        creds_data = json.load(f)

    creds = Credentials(
        token=None,
        refresh_token=creds_data["refresh_token"],
        client_id=creds_data["client_id"],
        client_secret=creds_data["client_secret"],
        token_uri=creds_data["token_uri"]
    )

    # Refresh token
    creds.refresh(Request())
    print("Token refreshed")

    # Build service
    service = build("drive", "v3", credentials=creds)
    print("Google Drive service ready")

    # Get missing files from database
    conn = psycopg2.connect(DATABASE_URL)
    cur = conn.cursor()
    cur.execute("""
        SELECT id, title, filename, file_path
        FROM documents
        WHERE processing_status = %s
    """, ("missing_file",))
    missing_docs = cur.fetchall()
    print(f"\nFound {len(missing_docs)} missing documents")

    # List files from Google Drive recursively
    def list_all_files(folder_id):
        """Recursively list all files in folder and subfolders"""
        all_files = []
        page_token = None

        while True:
            results = service.files().list(
                q=f"'{folder_id}' in parents and trashed = false",
                pageSize=1000,
                fields="nextPageToken, files(id, name, mimeType, size)",
                pageToken=page_token
            ).execute()

            for f in results.get("files", []):
                if f["mimeType"] == "application/vnd.google-apps.folder":
                    # Recursively get files from subfolder
                    all_files.extend(list_all_files(f["id"]))
                else:
                    all_files.append(f)

            page_token = results.get("nextPageToken")
            if not page_token:
                break

        return all_files

    print("\nListing files from Google Drive (recursive)...")
    files = list_all_files(FOLDER_ID)
    print(f"Found {len(files)} files in Google Drive")

    # Create lookup
    drive_lookup = {}
    for f in files:
        drive_lookup[f["name"].lower()] = f
        drive_lookup[normalize(f["name"])] = f

    # Match and download
    print("\nDownloading missing files...")
    downloaded = 0
    not_found = 0

    for doc_id, title, filename, file_path in missing_docs:
        search_names = []
        if title:
            search_names.extend([title.lower(), normalize(title)])
        if filename:
            search_names.extend([filename.lower(), normalize(filename)])
        if file_path:
            path_name = os.path.basename(file_path)
            search_names.extend([path_name.lower(), normalize(path_name)])

        # Find match
        drive_file = None
        for name in search_names:
            if name in drive_lookup:
                drive_file = drive_lookup[name]
                break

        if not drive_file:
            print(f"[{doc_id}] NOT FOUND: {title or filename}")
            not_found += 1
            continue

        # Download
        dest_path = file_path if file_path else os.path.join(DOCS_DIR, drive_file["name"])
        if "/emlakai/" in str(dest_path):
            dest_path = dest_path.replace("/emlakai/", "/vergilex/")

        print(f"[{doc_id}] Downloading {drive_file['name']}...")

        try:
            request = service.files().get_media(fileId=drive_file["id"])
            buffer = BytesIO()
            downloader = MediaIoBaseDownload(buffer, request)
            done = False
            while not done:
                _, done = downloader.next_chunk()

            os.makedirs(os.path.dirname(dest_path), exist_ok=True)
            with open(dest_path, "wb") as f:
                f.write(buffer.getvalue())

            # Update database
            cur.execute("""
                UPDATE documents
                SET processing_status = %s,
                    file_path = %s,
                    updated_at = NOW()
                WHERE id = %s
            """, ("pending", dest_path, doc_id))
            conn.commit()

            downloaded += 1
            file_size = os.path.getsize(dest_path)
            print(f"    Downloaded ({file_size/1024:.1f} KB)")

        except Exception as e:
            print(f"    Error: {e}")

    conn.close()

    print("\n" + "=" * 60)
    print(f"SUMMARY: Downloaded {downloaded}, Not found {not_found}")
    print("=" * 60)

if __name__ == "__main__":
    main()
