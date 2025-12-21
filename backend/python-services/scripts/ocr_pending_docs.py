"""
OCR Pending Documents Script
Processes documents that need OCR (needs_ocr status) using Google Vision or DeepSeek OCR
Tries Google Vision first, falls back to DeepSeek if Google Vision fails
"""

import asyncio
import os
import sys
from datetime import datetime

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Load .env file
from dotenv import load_dotenv
env_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), '.env')
load_dotenv(env_path)

from loguru import logger
from services.database import get_db, close_db
from services.openai_vision_ocr import openai_vision_ocr

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


async def try_openai_vision_ocr(file_path: str) -> dict:
    """Try OpenAI GPT-4 Vision OCR"""
    try:
        result = await openai_vision_ocr.ocr_pdf(file_path, max_pages=MAX_PAGES_PER_DOC)
        return result
    except Exception as e:
        return {"success": False, "text": "", "error": str(e)}


async def process_document_with_ocr(doc: dict) -> dict:
    """Process single document with OpenAI GPT-4 Vision OCR"""
    doc_id = doc['id']
    title = doc.get('title', f'Document {doc_id}')

    logger.info(f"Processing document {doc_id}: {title}")

    # Resolve file path
    file_path = resolve_file_path(doc)

    if not file_path:
        logger.error(f"File not found for document {doc_id}")
        return {"success": False, "doc_id": doc_id, "error": "File not found"}

    try:
        # Use OpenAI GPT-4 Vision for OCR
        logger.info(f"Using OpenAI GPT-4 Vision OCR for: {file_path}")
        result = await try_openai_vision_ocr(file_path)
        ocr_method = "gpt4_vision"

        if not result or not result.get("success"):
            error_msg = result.get("error", "OCR failed") if result else "No OCR result"
            logger.error(f"OCR failed for {doc_id}: {error_msg}")
            return {"success": False, "doc_id": doc_id, "error": error_msg}

        text = result.get("text", "")

        if len(text) < 100:
            logger.warning(f"OCR produced minimal text for {doc_id}: {len(text)} chars")
            return {"success": False, "doc_id": doc_id, "error": "OCR produced minimal text"}

        # Update document in database
        pool = await get_db()

        pages = result.get("pages", 0)
        chars = len(text)
        ocr_at = datetime.now().isoformat()

        await pool.execute("""
            UPDATE documents
            SET content = $2,
                processing_status = 'analyzed',
                metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
                    'ocr_method', $3::text,
                    'ocr_pages', $4::int,
                    'ocr_chars', $5::int,
                    'ocr_at', $6::text,
                    'estimated_tokens', LENGTH($2) / 4
                ),
                updated_at = NOW()
            WHERE id = $1
        """, doc_id, text, str(ocr_method), int(pages), int(chars), str(ocr_at))

        logger.info(f"✅ Document {doc_id} OCR complete ({ocr_method}): {len(text)} chars, {result.get('pages', 0)} pages")

        return {
            "success": True,
            "doc_id": doc_id,
            "chars": len(text),
            "pages": result.get("pages", 0),
            "method": ocr_method
        }

    except Exception as e:
        logger.error(f"Error processing document {doc_id}: {e}")
        return {"success": False, "doc_id": doc_id, "error": str(e)}


async def main():
    """Main function to process all OCR pending documents"""
    logger.info("=" * 60)
    logger.info("OCR PENDING DOCUMENTS PROCESSOR")
    logger.info("Using: OpenAI GPT-4 Vision")
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
        await asyncio.sleep(2)  # 2 seconds between OCR calls

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
