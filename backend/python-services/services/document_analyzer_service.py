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
import redis
from typing import Dict, List, Optional
from pathlib import Path
from datetime import datetime
import time
from concurrent.futures import ThreadPoolExecutor

logger = logging.getLogger(__name__)

# Redis configuration for auto-recovery (minimal state only)
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")
REDIS_DB = int(os.getenv("REDIS_DB", "2"))  # Vergilex uses DB 2
REDIS_KEY_PREFIX = "doc_analyzer"
HEARTBEAT_INTERVAL = 10  # seconds
HEARTBEAT_TIMEOUT = 30  # seconds - if no heartbeat, consider crashed

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
    """Service for batch PDF text extraction with Redis auto-recovery"""

    def __init__(self):
        self.is_running = False
        self.is_paused = False
        self.current_job = None
        self.stats = {
            "total_processed": 0,
            "total_success": 0,
            "total_errors": 0,
            "total_tokens": 0,  # Token usage tracking
            "started_at": None,
            "last_activity": None
        }
        self._pool: Optional[asyncpg.Pool] = None
        self._redis: Optional[redis.Redis] = None
        self._heartbeat_task: Optional[asyncio.Task] = None
        # Thread pool for CPU-bound PDF operations (prevents blocking event loop)
        self._thread_pool = ThreadPoolExecutor(max_workers=2, thread_name_prefix="pdf_")

    def _get_redis(self) -> redis.Redis:
        """Get Redis connection (lazy initialization)"""
        if self._redis is None:
            try:
                self._redis = redis.from_url(REDIS_URL, db=REDIS_DB, decode_responses=True)
                self._redis.ping()
                logger.info(f"Redis connected: {REDIS_URL} DB {REDIS_DB}")
            except Exception as e:
                logger.warning(f"Redis connection failed: {e} - auto-recovery disabled")
                self._redis = None
        return self._redis

    def _redis_key(self, suffix: str) -> str:
        """Generate Redis key with prefix"""
        return f"{REDIS_KEY_PREFIX}:{suffix}"

    def _save_state_to_redis(self):
        """Save minimal state to Redis (just flags, no arrays)"""
        r = self._get_redis()
        if not r:
            return

        try:
            # Only save essential flags - NO arrays or heavy data
            state = {
                "is_running": "1" if self.is_running else "0",
                "batch_size": str(self.current_job.get("batch_size", 10)) if self.current_job else "10",
                "started_at": self.stats.get("started_at", ""),
                "processed": str(self.stats.get("total_processed", 0)),
                "success": str(self.stats.get("total_success", 0)),
                "errors": str(self.stats.get("total_errors", 0)),
                "tokens": str(self.stats.get("total_tokens", 0))
            }
            r.hset(self._redis_key("state"), mapping=state)
            r.set(self._redis_key("heartbeat"), str(int(time.time())))
            logger.debug("State saved to Redis")
        except Exception as e:
            logger.warning(f"Failed to save state to Redis: {e}")

    def _clear_redis_state(self):
        """Clear Redis state when stopping"""
        r = self._get_redis()
        if not r:
            return

        try:
            r.delete(self._redis_key("state"))
            r.delete(self._redis_key("heartbeat"))
            logger.info("Redis state cleared")
        except Exception as e:
            logger.warning(f"Failed to clear Redis state: {e}")

    def _check_crashed_state(self) -> Optional[Dict]:
        """Check if there's a crashed state that needs recovery"""
        r = self._get_redis()
        if not r:
            return None

        try:
            state = r.hgetall(self._redis_key("state"))
            if not state or state.get("is_running") != "1":
                return None

            # Check heartbeat
            heartbeat = r.get(self._redis_key("heartbeat"))
            if not heartbeat:
                return None

            last_heartbeat = int(heartbeat)
            elapsed = int(time.time()) - last_heartbeat

            if elapsed > HEARTBEAT_TIMEOUT:
                logger.warning(f"Found crashed state! Last heartbeat {elapsed}s ago")
                return {
                    "batch_size": int(state.get("batch_size", 10)),
                    "started_at": state.get("started_at", ""),
                    "processed": int(state.get("processed", 0)),
                    "success": int(state.get("success", 0)),
                    "errors": int(state.get("errors", 0))
                }

            return None
        except Exception as e:
            logger.warning(f"Failed to check crashed state: {e}")
            return None

    async def check_and_recover(self) -> Optional[Dict]:
        """Check for crashed state and auto-recover if found"""
        crashed = self._check_crashed_state()
        if not crashed:
            return None

        logger.info(f"Auto-recovering from crashed state: {crashed}")

        # Clear old state first
        self._clear_redis_state()

        # Get current pending count from DB (fresh query, no stored arrays)
        total_pending = await self.get_total_pending()

        if total_pending == 0:
            logger.info("No pending documents, recovery not needed")
            return {"recovered": False, "reason": "no_pending_documents"}

        # Start fresh batch with same batch_size
        batch_size = crashed.get("batch_size", 10)
        result = await self.start_batch_analyze(batch_size=batch_size)

        return {
            "recovered": True,
            "previous_processed": crashed.get("processed", 0),
            "previous_success": crashed.get("success", 0),
            "previous_errors": crashed.get("errors", 0),
            "pending_now": total_pending,
            "batch_size": batch_size,
            "start_result": result
        }

    async def _heartbeat_loop(self):
        """Background heartbeat to Redis"""
        while self.is_running:
            try:
                r = self._get_redis()
                if r:
                    r.set(self._redis_key("heartbeat"), str(int(time.time())))
                await asyncio.sleep(HEARTBEAT_INTERVAL)
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.warning(f"Heartbeat error: {e}")
                await asyncio.sleep(HEARTBEAT_INTERVAL)

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

        OCR Priority (Tesseract devre dışı):
        1. Google Vision API (preferred)
        2. DeepSeek Vision (fallback)
        """
        provider = OCR_PROVIDER.lower()

        # Try Google Vision first (preferred)
        if provider in ("google_vision", "google"):
            try:
                from services.google_vision_ocr import google_vision_ocr

                logger.info(f"Starting Google Vision OCR for: {file_path}")
                result = await google_vision_ocr.ocr_pdf(file_path, max_pages=30)

                if result["success"]:
                    return {
                        "success": True,
                        "text": result.get("text", ""),
                        "page_count": result.get("pages", 0),
                        "char_count": result.get("chars", 0),
                        "method": "google_vision",
                        "error": None
                    }

            except ImportError:
                logger.warning("Google Vision OCR not available, trying DeepSeek...")
            except Exception as e:
                logger.warning(f"Google Vision OCR failed: {e}, trying DeepSeek...")

        # Try DeepSeek Vision as fallback
        if provider in ("deepseek", "google_vision", "google"):
            try:
                from services.deepseek_ocr import deepseek_ocr

                logger.info(f"Starting DeepSeek OCR for: {file_path}")
                result = await deepseek_ocr.ocr_pdf(file_path, max_pages=30)

                if result["success"]:
                    return {
                        "success": True,
                        "text": result.get("text", ""),
                        "page_count": result.get("pages", 0),
                        "char_count": result.get("chars", 0),
                        "method": "deepseek",
                        "error": None
                    }

            except ImportError:
                logger.error("DeepSeek OCR not available")
            except Exception as e:
                logger.error(f"DeepSeek OCR failed: {e}")

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

            # First try PyPDF2 extraction (run in thread pool to avoid blocking event loop)
            loop = asyncio.get_event_loop()
            result = await loop.run_in_executor(self._thread_pool, self.extract_text_from_pdf, file_path)

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

                # Clean text: Remove null bytes and invalid UTF-8 characters
                # This prevents PostgreSQL UTF-8 encoding errors
                cleaned_text = text.replace('\x00', '')  # Remove null bytes
                cleaned_text = ''.join(char for char in cleaned_text if ord(char) >= 32 or char in '\n\r\t')

                # Calculate estimated tokens (rough: ~4 chars per token for Turkish)
                estimated_tokens = len(cleaned_text) // 4

                metadata = {
                    "page_count": result.get("page_count", 0),
                    "char_count": len(cleaned_text),
                    "estimated_tokens": estimated_tokens,
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
                """, doc_id, cleaned_text, json.dumps(metadata))

                return {
                    "id": doc_id,
                    "success": True,
                    "chars": len(cleaned_text),
                    "estimated_tokens": estimated_tokens,
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
        """Start batch analysis of pending documents with auto-recovery support"""
        if self.is_running:
            return {"success": False, "message": "Analysis already running"}

        self.is_running = True
        self.is_paused = False
        self.stats = {
            "total_processed": 0,
            "total_success": 0,
            "total_errors": 0,
            "total_tokens": 0,
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

        # Save initial state to Redis for recovery
        self._save_state_to_redis()

        # Start heartbeat task
        self._heartbeat_task = asyncio.create_task(self._heartbeat_loop())

        # Start background processing
        logger.info(f"Creating background task for batch analysis...")
        task = asyncio.create_task(self._process_batch_analyze(batch_size, limit))
        logger.info(f"Background task created: {task}")

        logger.info(f"Started batch analysis: {total_pending} pending, batch_size={batch_size}")

        return {
            "success": True,
            "message": f"Started batch analysis for ~{total_pending} documents",
            "total_pending": total_pending
        }

    async def _process_batch_analyze(self, batch_size: int, limit: int):
        """Background batch processing with Redis state persistence"""
        logger.info(f"_process_batch_analyze started: batch_size={batch_size}, limit={limit}")
        try:
            processed = 0
            max_docs = limit if limit > 0 else float('inf')
            logger.info(f"Starting processing loop, max_docs={max_docs}")

            while self.is_running and processed < max_docs:
                if self.is_paused:
                    await asyncio.sleep(1)
                    continue

                # Get batch
                remaining = int(max_docs - processed) if limit > 0 else batch_size
                logger.info(f"Fetching pending documents, remaining={remaining}")
                docs = await self.get_pending_documents(min(batch_size, remaining))
                logger.info(f"Fetched {len(docs)} pending documents")

                if not docs:
                    logger.info("No more pending documents")
                    break

                # Process batch
                for doc in docs:
                    if not self.is_running:
                        break

                    try:
                        result = await self.analyze_document(doc)

                        self.stats["total_processed"] += 1
                        if result.get("success"):
                            self.stats["total_success"] += 1
                            # Track token usage
                            self.stats["total_tokens"] += result.get("estimated_tokens", 0)
                        else:
                            self.stats["total_errors"] += 1

                        self.stats["last_activity"] = datetime.now().isoformat()
                        processed += 1

                        # Save state to Redis every 5 documents (minimal overhead)
                        if processed % 5 == 0:
                            self._save_state_to_redis()

                        if processed % 10 == 0:
                            logger.info(f"Analyzed {processed} documents - Success: {self.stats['total_success']}, Errors: {self.stats['total_errors']}, Tokens: {self.stats['total_tokens']}")

                    except Exception as doc_error:
                        logger.error(f"Document {doc.get('id')} failed: {doc_error}")
                        self.stats["total_errors"] += 1
                        processed += 1
                        # Continue with next document, don't crash entire batch

                    # Yield control to event loop after each document
                    # This prevents blocking the FastAPI event loop
                    await asyncio.sleep(0.1)

                # Small delay between batches to prevent resource exhaustion
                await asyncio.sleep(0.5)

            logger.info(f"Batch analysis completed: {self.stats}")

        except Exception as e:
            logger.error(f"Batch analysis error: {e}")
        finally:
            # Cleanup
            self.is_running = False
            self.current_job = None

            # Cancel heartbeat task
            if self._heartbeat_task:
                self._heartbeat_task.cancel()
                try:
                    await self._heartbeat_task
                except asyncio.CancelledError:
                    pass
                self._heartbeat_task = None

            # Clear Redis state (job completed or stopped)
            self._clear_redis_state()

            logger.info("Batch analysis finished, Redis state cleared")

    def pause(self):
        """Pause analysis"""
        self.is_paused = True
        return {"success": True, "message": "Analysis paused"}

    def resume(self):
        """Resume analysis"""
        self.is_paused = False
        return {"success": True, "message": "Analysis resumed"}

    def stop(self):
        """Stop analysis and clear Redis state"""
        self.is_running = False
        self._clear_redis_state()
        logger.info("Analysis stopped by user")
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
