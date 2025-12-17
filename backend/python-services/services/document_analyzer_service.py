"""
Document Analyzer Service
Batch PDF analysis: text extraction from database documents
Supports both digital PDFs (PyPDF2) and scanned PDFs (OCR)

OCR Priority:
1. Google Vision API (if enabled and API key available)
2. Tesseract (local, fallback)

Processing Status Types:
- pending: Not yet processed
- analyzed: Successfully extracted text
- embedded: Text extracted and embedded
- missing_file: Physical file not found on disk
- low_quality: PDF quality too low for OCR (user should re-upload higher quality)
- corrupt_file: PDF is corrupted or invalid (user should re-upload)
- empty_document: PDF has no readable content (user should check the file)
- encoding_error: Character encoding issues (user should re-save with UTF-8)
- ocr_failed: OCR processing failed (may need manual review)
- failed: General processing failure
"""

import os
import asyncio
import asyncpg
import PyPDF2
import io
import logging
import json
import re
from typing import Dict, List, Optional
from pathlib import Path
from datetime import datetime

logger = logging.getLogger(__name__)

# Configuration
DOCS_BASE_PATH = os.getenv("DOCS_PATH", "/var/www/vergilex/docs")
BATCH_SIZE = int(os.getenv("ANALYZE_BATCH_SIZE", "10"))
MIN_TEXT_THRESHOLD = 100  # Minimum chars to consider PDF as having text
OCR_ENABLED = os.getenv("OCR_ENABLED", "true").lower() == "true"
OCR_PROVIDER = os.getenv("OCR_PROVIDER", "tesseract")  # tesseract | google_vision

# Skip reasons with user-friendly messages (Turkish)
SKIP_REASONS = {
    "missing_file": {
        "status": "missing_file",
        "reason": "Dosya bulunamadı",
        "user_action": "Lütfen dosyayı tekrar yükleyin.",
        "severity": "error"
    },
    "low_quality": {
        "status": "low_quality",
        "reason": "PDF kalitesi çok düşük, metin okunamıyor",
        "user_action": "Lütfen daha yüksek çözünürlüklü (min 150 DPI) bir PDF yükleyin.",
        "severity": "warning"
    },
    "corrupt_file": {
        "status": "corrupt_file",
        "reason": "PDF dosyası bozuk veya geçersiz",
        "user_action": "Dosya hasarlı görünüyor. Lütfen orijinal dosyayı tekrar PDF olarak kaydedin ve yükleyin.",
        "severity": "error"
    },
    "empty_document": {
        "status": "empty_document",
        "reason": "PDF'de okunabilir içerik bulunamadı",
        "user_action": "Dosya boş veya sadece görsel içeriyor. Metin içeren bir PDF yükleyin.",
        "severity": "warning"
    },
    "encoding_error": {
        "status": "encoding_error",
        "reason": "Karakter kodlama hatası",
        "user_action": "Dosyada özel karakterler var. Lütfen UTF-8 kodlamasıyla tekrar kaydedin.",
        "severity": "warning"
    },
    "ocr_failed": {
        "status": "ocr_failed",
        "reason": "OCR işlemi başarısız oldu",
        "user_action": "Taranmış PDF okunamadı. Daha net taranmış bir versiyon yükleyin veya metin tabanlı PDF kullanın.",
        "severity": "warning"
    },
    "too_large": {
        "status": "too_large",
        "reason": "PDF çok büyük (sayfa sayısı veya dosya boyutu)",
        "user_action": "Dosyayı daha küçük parçalara bölün ve tekrar yükleyin.",
        "severity": "warning"
    },
    "password_protected": {
        "status": "password_protected",
        "reason": "PDF şifre korumalı",
        "user_action": "Lütfen şifresiz bir PDF yükleyin.",
        "severity": "error"
    }
}


class DocumentAnalyzerService:
    """Service for batch PDF text extraction"""

    def __init__(self):
        self.is_running = False
        self.is_paused = False
        self.current_job = None
        self.stats = {
            "total_processed": 0,
            "total_success": 0,
            "total_errors": 0,
            "started_at": None,
            "last_activity": None
        }
        self._pool: Optional[asyncpg.Pool] = None

    async def get_pool(self) -> asyncpg.Pool:
        """Get or create database connection pool"""
        if self._pool is None:
            database_url = os.getenv("DATABASE_URL")
            if not database_url:
                raise ValueError("DATABASE_URL not set")
            self._pool = await asyncpg.create_pool(database_url, min_size=2, max_size=10)
        return self._pool

    async def get_pending_documents(self, limit: int = 100) -> List[Dict]:
        """Get documents that need text extraction"""
        pool = await self.get_pool()

        query = """
            SELECT id, filename, title, file_path, file_type, processing_status
            FROM documents
            WHERE file_type IN ('pdf', 'PDF')
            AND (content IS NULL OR LENGTH(content) < 100)
            AND processing_status IN ('pending', 'completed', 'failed')
            ORDER BY id
            LIMIT $1
        """

        rows = await pool.fetch(query, limit)
        return [dict(row) for row in rows]

    async def get_total_pending(self) -> int:
        """Get total count of pending documents"""
        pool = await self.get_pool()

        query = """
            SELECT COUNT(*) as count
            FROM documents
            WHERE file_type IN ('pdf', 'PDF')
            AND (content IS NULL OR LENGTH(content) < 100)
            AND processing_status IN ('pending', 'completed', 'failed')
        """

        row = await pool.fetchrow(query)
        return row['count'] if row else 0

    def extract_text_from_pdf(self, file_path: str) -> Dict:
        """Extract text from PDF file using PyPDF2 (for digital PDFs)"""
        try:
            if not os.path.exists(file_path):
                return {"success": False, "error": f"File not found: {file_path}", "text": "", "needs_ocr": False}

            with open(file_path, 'rb') as f:
                reader = PyPDF2.PdfReader(f)

                text_parts = []
                for page_num, page in enumerate(reader.pages):
                    try:
                        page_text = page.extract_text()
                        if page_text:
                            text_parts.append(page_text.strip())
                    except Exception as e:
                        logger.warning(f"Page {page_num + 1} extraction failed: {e}")
                        continue

                text = "\n\n".join(text_parts)

                # Check if PDF needs OCR (scanned document)
                needs_ocr = len(text) < MIN_TEXT_THRESHOLD

                return {
                    "success": True,
                    "text": text,
                    "page_count": len(reader.pages),
                    "char_count": len(text),
                    "needs_ocr": needs_ocr
                }

        except PyPDF2.errors.PdfReadError as e:
            return {"success": False, "error": f"Invalid PDF: {e}", "text": "", "needs_ocr": True}
        except Exception as e:
            return {"success": False, "error": str(e), "text": "", "needs_ocr": False}

    async def extract_text_with_ocr(self, file_path: str) -> Dict:
        """
        Extract text from scanned PDF using OCR

        Uses OCR_PROVIDER env var to select provider:
        - tesseract (default): Local Tesseract OCR
        - google_vision: Google Cloud Vision API
        """
        provider = OCR_PROVIDER.lower()

        # Try Tesseract first (default, no API key needed)
        if provider == "tesseract":
            try:
                from services.tesseract_ocr import tesseract_ocr

                logger.info(f"Starting Tesseract OCR for: {file_path}")
                result = tesseract_ocr.ocr_pdf(file_path, max_pages=30)

                if result["success"] and result.get("text") and len(result.get("text", "")) >= MIN_TEXT_THRESHOLD:
                    return {
                        "success": True,
                        "text": result.get("text", ""),
                        "page_count": result.get("pages", 0),
                        "char_count": result.get("chars", 0),
                        "method": "tesseract",
                        "error": None
                    }
                else:
                    logger.warning(f"Tesseract OCR returned insufficient text: {len(result.get('text', ''))} chars")

            except ImportError as e:
                logger.error(f"Tesseract not available: {e}")
            except Exception as e:
                logger.error(f"Tesseract OCR failed: {e}")

        # Try Google Vision if selected or as fallback
        if provider == "google_vision":
            try:
                from services.google_vision_ocr import google_vision_ocr

                logger.info(f"Starting Google Vision OCR for: {file_path}")
                result = await google_vision_ocr.ocr_pdf(file_path, max_pages=30)

                return {
                    "success": result["success"],
                    "text": result.get("text", ""),
                    "page_count": result.get("pages", 0),
                    "char_count": result.get("chars", 0),
                    "method": "google_vision_ocr",
                    "error": result.get("error")
                }

            except ImportError:
                logger.error("Google Vision OCR not available")
            except Exception as e:
                logger.error(f"Google Vision OCR failed: {e}")

        return {"success": False, "text": "", "error": "OCR not available or failed", "method": "none"}

    def resolve_file_path(self, doc: Dict) -> Optional[str]:
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

    async def mark_document_skipped(self, doc_id: int, skip_type: str, extra_info: Dict = None) -> Dict:
        """Mark document as skipped with detailed reason and user guidance"""
        pool = await self.get_pool()

        skip_info = SKIP_REASONS.get(skip_type, {
            "status": "failed",
            "reason": "Bilinmeyen hata",
            "user_action": "Lütfen dosyayı kontrol edin ve tekrar deneyin.",
            "severity": "error"
        })

        metadata = {
            "skip_reason": skip_info["reason"],
            "user_action": skip_info["user_action"],
            "severity": skip_info["severity"],
            "skipped_at": datetime.now().isoformat()
        }

        if extra_info:
            metadata.update(extra_info)

        await pool.execute("""
            UPDATE documents
            SET processing_status = $2,
                metadata = COALESCE(metadata, '{}'::jsonb) || $3::jsonb,
                updated_at = NOW()
            WHERE id = $1
        """, doc_id, skip_info["status"], json.dumps(metadata))

        logger.info(f"Document {doc_id} skipped: {skip_info['reason']}")

        return {
            "id": doc_id,
            "success": False,
            "status": skip_info["status"],
            "reason": skip_info["reason"],
            "user_action": skip_info["user_action"]
        }

    def detect_text_quality_issues(self, text: str) -> Optional[str]:
        """Detect quality issues in extracted text"""
        if not text:
            return "empty_document"

        # Check for encoding issues (lots of replacement characters or garbage)
        garbage_ratio = len(re.findall(r'[\ufffd\x00-\x08\x0b\x0c\x0e-\x1f]', text)) / max(len(text), 1)
        if garbage_ratio > 0.1:
            return "encoding_error"

        # Check if text is mostly non-printable or symbols
        printable_ratio = len(re.findall(r'[a-zA-Z0-9çğıöşüÇĞİÖŞÜ\s]', text)) / max(len(text), 1)
        if printable_ratio < 0.3:
            return "encoding_error"

        # Check for very short text after OCR (low quality scan)
        if len(text.strip()) < MIN_TEXT_THRESHOLD:
            return "low_quality"

        return None

    async def analyze_document(self, doc: Dict, use_ocr: bool = True) -> Dict:
        """Analyze single document and update database with detailed status"""
        doc_id = doc['id']
        pool = await self.get_pool()

        try:
            # Resolve file path
            file_path = self.resolve_file_path(doc)

            if not file_path:
                return await self.mark_document_skipped(doc_id, "missing_file")

            # Check file size
            try:
                file_size = os.path.getsize(file_path)
                if file_size > 100 * 1024 * 1024:  # 100MB limit
                    return await self.mark_document_skipped(doc_id, "too_large", {
                        "file_size_mb": round(file_size / 1024 / 1024, 2)
                    })
            except OSError:
                return await self.mark_document_skipped(doc_id, "missing_file")

            # First try PyPDF2 extraction
            result = self.extract_text_from_pdf(file_path)

            # Handle PDF read errors
            if not result["success"]:
                error_msg = result.get("error", "")

                if "password" in error_msg.lower() or "encrypted" in error_msg.lower():
                    return await self.mark_document_skipped(doc_id, "password_protected")
                elif "invalid" in error_msg.lower() or "corrupt" in error_msg.lower():
                    return await self.mark_document_skipped(doc_id, "corrupt_file", {
                        "original_error": error_msg[:200]
                    })
                elif result.get("needs_ocr"):
                    # Continue to OCR
                    pass
                else:
                    return await self.mark_document_skipped(doc_id, "corrupt_file", {
                        "original_error": error_msg[:200]
                    })

            # If needs OCR and OCR is enabled
            if result.get("needs_ocr") and use_ocr and OCR_ENABLED:
                logger.info(f"Document {doc_id} needs OCR, starting...")
                ocr_result = await self.extract_text_with_ocr(file_path)

                if ocr_result["success"]:
                    result = ocr_result
                else:
                    # OCR failed - determine why
                    ocr_chars = len(ocr_result.get("text", ""))
                    if ocr_chars < 20:
                        return await self.mark_document_skipped(doc_id, "low_quality", {
                            "ocr_chars_extracted": ocr_chars,
                            "method": ocr_result.get("method", "unknown")
                        })
                    else:
                        return await self.mark_document_skipped(doc_id, "ocr_failed", {
                            "ocr_error": ocr_result.get("error", "Unknown OCR error")[:200],
                            "method": ocr_result.get("method", "unknown")
                        })

            # Check text quality
            text = result.get("text", "")
            quality_issue = self.detect_text_quality_issues(text)

            if quality_issue:
                return await self.mark_document_skipped(doc_id, quality_issue, {
                    "chars_extracted": len(text),
                    "method": result.get("method", "pypdf2")
                })

            # Success - update document with extracted content
            if len(text) >= MIN_TEXT_THRESHOLD:
                method = result.get("method", "pypdf2")
                metadata = {
                    "page_count": result.get("page_count", 0),
                    "char_count": len(text),
                    "method": method,
                    "analyzed_at": datetime.now().isoformat()
                }

                await pool.execute("""
                    UPDATE documents
                    SET content = $2,
                        processing_status = 'analyzed',
                        metadata = COALESCE(metadata, '{}'::jsonb) || $3::jsonb,
                        updated_at = NOW()
                    WHERE id = $1
                """, doc_id, text, json.dumps(metadata))

                return {
                    "id": doc_id,
                    "success": True,
                    "chars": len(text),
                    "method": method
                }
            else:
                # Not enough text extracted
                return await self.mark_document_skipped(doc_id, "low_quality", {
                    "chars_extracted": len(text),
                    "method": result.get("method", "pypdf2")
                })

        except Exception as e:
            logger.error(f"Document {doc_id} analysis failed: {e}")

            # Try to categorize the error
            error_str = str(e).lower()
            if "memory" in error_str:
                return await self.mark_document_skipped(doc_id, "too_large", {
                    "original_error": str(e)[:200]
                })
            elif "codec" in error_str or "encode" in error_str or "decode" in error_str:
                return await self.mark_document_skipped(doc_id, "encoding_error", {
                    "original_error": str(e)[:200]
                })
            else:
                # Generic failure
                await pool.execute("""
                    UPDATE documents
                    SET processing_status = 'failed',
                        metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb,
                        updated_at = NOW()
                    WHERE id = $1
                """, doc_id, json.dumps({
                    "error": str(e)[:200],
                    "failed_at": datetime.now().isoformat()
                }))

                return {"id": doc_id, "success": False, "error": str(e)}

    async def start_batch_analyze(self, batch_size: int = 10, limit: int = 0) -> Dict:
        """Start batch analysis of pending documents"""
        if self.is_running:
            return {"success": False, "message": "Analysis already running"}

        self.is_running = True
        self.is_paused = False
        self.stats = {
            "total_processed": 0,
            "total_success": 0,
            "total_errors": 0,
            "started_at": datetime.now().isoformat(),
            "last_activity": datetime.now().isoformat()
        }

        # Get total pending
        total_pending = await self.get_total_pending()
        if limit > 0:
            total_pending = min(total_pending, limit)

        self.current_job = {
            "type": "batch_analyze",
            "batch_size": batch_size,
            "total": total_pending,
            "started_at": datetime.now().isoformat()
        }

        # Start background processing
        asyncio.create_task(self._process_batch_analyze(batch_size, limit))

        return {
            "success": True,
            "message": f"Started batch analysis for ~{total_pending} documents",
            "total_pending": total_pending
        }

    async def _process_batch_analyze(self, batch_size: int, limit: int):
        """Background batch processing"""
        try:
            processed = 0
            max_docs = limit if limit > 0 else float('inf')

            while self.is_running and processed < max_docs:
                if self.is_paused:
                    await asyncio.sleep(1)
                    continue

                # Get batch
                remaining = int(max_docs - processed) if limit > 0 else batch_size
                docs = await self.get_pending_documents(min(batch_size, remaining))

                if not docs:
                    logger.info("No more pending documents")
                    break

                # Process batch
                for doc in docs:
                    if not self.is_running:
                        break

                    result = await self.analyze_document(doc)

                    self.stats["total_processed"] += 1
                    if result.get("success"):
                        self.stats["total_success"] += 1
                    else:
                        self.stats["total_errors"] += 1

                    self.stats["last_activity"] = datetime.now().isoformat()
                    processed += 1

                    if processed % 10 == 0:
                        logger.info(f"Analyzed {processed} documents - Success: {self.stats['total_success']}, Errors: {self.stats['total_errors']}")

                # Small delay between batches
                await asyncio.sleep(0.5)

            logger.info(f"Batch analysis completed: {self.stats}")

        except Exception as e:
            logger.error(f"Batch analysis error: {e}")
        finally:
            self.is_running = False
            self.current_job = None

    def pause(self):
        """Pause analysis"""
        self.is_paused = True
        return {"success": True, "message": "Analysis paused"}

    def resume(self):
        """Resume analysis"""
        self.is_paused = False
        return {"success": True, "message": "Analysis resumed"}

    def stop(self):
        """Stop analysis"""
        self.is_running = False
        return {"success": True, "message": "Analysis stopped"}

    def get_status(self) -> Dict:
        """Get current status"""
        return {
            "is_running": self.is_running,
            "is_paused": self.is_paused,
            "current_job": self.current_job,
            "stats": self.stats
        }


# Singleton instance
document_analyzer = DocumentAnalyzerService()
