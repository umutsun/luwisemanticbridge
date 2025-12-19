"""
OCR Pending Documents Script
Processes documents that need OCR (needs_ocr status) using Google Vision
"""

import asyncio
import os
import sys
from datetime import datetime

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from loguru import logger
from services.database import get_db, close_db
from services.google_vision_ocr import google_vision_ocr

# Configuration
DOCS_BASE_PATH = os.getenv("DOCS_PATH", "/var/www/vergilex/docs")
MAX_PAGES_PER_DOC = 30


async def get_ocr_pending_docs():
    """Get documents that need OCR"""
    pool = await get_db()

    docs = await pool.fetch("""
        SELECT id, title, filename, file_path
        FROM documents
        WHERE processing_status = 'needs_ocr'
        ORDER BY id
    """)

    return [dict(d) for d in docs]


def resolve_file_path(doc: dict) -> str:
    """Resolve actual file path for document"""
    file_path = doc.get('file_path')
    filename = doc.get('filename')

    # Try file_path first
    if file_path:
        if os.path.exists(file_path):
            return file_path
        # Try relative to DOCS_BASE_PATH
        full_path = os.path.join(DOCS_BASE_PATH, file_path)
        if os.path.exists(full_path):
            return full_path

    # Try filename in DOCS_BASE_PATH
    if filename:
        full_path = os.path.join(DOCS_BASE_PATH, filename)
        if os.path.exists(full_path):
            return full_path

    return None


async def process_document_with_ocr(doc: dict) -> dict:
    """Process single document with Google Vision OCR"""
    doc_id = doc['id']
    title = doc.get('title', f'Document {doc_id}')

    logger.info(f"Processing document {doc_id}: {title}")

    # Resolve file path
    file_path = resolve_file_path(doc)

    if not file_path:
        logger.error(f"File not found for document {doc_id}")
        return {"success": False, "doc_id": doc_id, "error": "File not found"}

    try:
        # Run OCR
        logger.info(f"Starting Google Vision OCR for: {file_path}")
        result = await google_vision_ocr.ocr_pdf(file_path, max_pages=MAX_PAGES_PER_DOC)

        if not result["success"]:
            logger.error(f"OCR failed for {doc_id}: {result.get('error')}")
            return {"success": False, "doc_id": doc_id, "error": result.get('error')}

        text = result.get("text", "")

        if len(text) < 100:
            logger.warning(f"OCR produced minimal text for {doc_id}: {len(text)} chars")
            return {"success": False, "doc_id": doc_id, "error": "OCR produced minimal text"}

        # Update document in database
        pool = await get_db()

        await pool.execute("""
            UPDATE documents
            SET content = $2,
                processing_status = 'analyzed',
                metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
                    'ocr_method', 'google_vision',
                    'ocr_pages', $3,
                    'ocr_chars', $4,
                    'ocr_at', $5,
                    'estimated_tokens', LENGTH($2) / 4
                ),
                updated_at = NOW()
            WHERE id = $1
        """, doc_id, text, result.get("pages", 0), len(text), datetime.now().isoformat())

        logger.info(f"✅ Document {doc_id} OCR complete: {len(text)} chars, {result.get('pages', 0)} pages")

        return {
            "success": True,
            "doc_id": doc_id,
            "chars": len(text),
            "pages": result.get("pages", 0)
        }

    except Exception as e:
        logger.error(f"Error processing document {doc_id}: {e}")
        return {"success": False, "doc_id": doc_id, "error": str(e)}


async def main():
    """Main function to process all OCR pending documents"""
    logger.info("=" * 60)
    logger.info("OCR PENDING DOCUMENTS PROCESSOR")
    logger.info("=" * 60)

    # Get pending docs
    docs = await get_ocr_pending_docs()
    logger.info(f"Found {len(docs)} documents needing OCR")

    if not docs:
        logger.info("No documents to process")
        return

    # Process each document
    results = {
        "success": 0,
        "failed": 0,
        "total_chars": 0,
        "total_pages": 0,
        "errors": []
    }

    for i, doc in enumerate(docs):
        logger.info(f"\n[{i+1}/{len(docs)}] Processing: {doc.get('title', doc['id'])}")

        result = await process_document_with_ocr(doc)

        if result["success"]:
            results["success"] += 1
            results["total_chars"] += result.get("chars", 0)
            results["total_pages"] += result.get("pages", 0)
        else:
            results["failed"] += 1
            results["errors"].append({
                "doc_id": result["doc_id"],
                "error": result.get("error", "Unknown error")
            })

        # Small delay to avoid rate limiting
        await asyncio.sleep(1)

    # Summary
    logger.info("\n" + "=" * 60)
    logger.info("OCR PROCESSING COMPLETE")
    logger.info("=" * 60)
    logger.info(f"Success: {results['success']}")
    logger.info(f"Failed: {results['failed']}")
    logger.info(f"Total chars extracted: {results['total_chars']:,}")
    logger.info(f"Total pages processed: {results['total_pages']}")

    if results["errors"]:
        logger.warning("\nFailed documents:")
        for err in results["errors"]:
            logger.warning(f"  - Doc {err['doc_id']}: {err['error']}")

    # Close connections
    await close_db()


if __name__ == "__main__":
    asyncio.run(main())
