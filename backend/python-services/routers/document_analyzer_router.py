"""
Document Analyzer Router
FastAPI endpoints for batch PDF text extraction
"""

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from typing import Optional, List
import logging

from services.document_analyzer_service import document_analyzer, SKIP_REASONS

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/documents", tags=["Document Analyzer"])


class BatchAnalyzeRequest(BaseModel):
    batch_size: int = 10
    limit: int = 0  # 0 = no limit


@router.get("/pending")
async def get_pending_documents():
    """Get count and sample of pending documents"""
    try:
        total = await document_analyzer.get_total_pending()
        sample = await document_analyzer.get_pending_documents(limit=10)

        return {
            "success": True,
            "total_pending": total,
            "sample": sample
        }
    except Exception as e:
        logger.error(f"Error getting pending documents: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/analyze/start")
async def start_batch_analyze(request: BatchAnalyzeRequest = BatchAnalyzeRequest()):
    """
    Start batch PDF text extraction

    - batch_size: How many documents to process per batch (default 10)
    - limit: Maximum documents to process (0 = all)
    """
    try:
        result = await document_analyzer.start_batch_analyze(
            batch_size=request.batch_size,
            limit=request.limit
        )
        return result
    except Exception as e:
        logger.error(f"Error starting batch analyze: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/analyze/pause")
async def pause_analyze():
    """Pause ongoing analysis"""
    return document_analyzer.pause()


@router.post("/analyze/resume")
async def resume_analyze():
    """Resume paused analysis"""
    return document_analyzer.resume()


@router.post("/analyze/stop")
async def stop_analyze():
    """Stop ongoing analysis"""
    return document_analyzer.stop()


@router.get("/analyze/status")
async def get_analyze_status():
    """Get current analysis status"""
    return document_analyzer.get_status()


@router.post("/analyze/single/{document_id}")
async def analyze_single_document(document_id: int):
    """Analyze a single document by ID"""
    try:
        pool = await document_analyzer.get_pool()

        # Get document
        doc = await pool.fetchrow(
            "SELECT id, filename, title, file_path, file_type FROM documents WHERE id = $1",
            document_id
        )

        if not doc:
            raise HTTPException(status_code=404, detail="Document not found")

        result = await document_analyzer.analyze_document(dict(doc))
        return result

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error analyzing document {document_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/skip-reasons")
async def get_skip_reasons():
    """
    Get all possible skip reasons with user-friendly messages
    Returns status codes, Turkish reasons, and recommended user actions
    """
    return {
        "success": True,
        "skip_reasons": SKIP_REASONS
    }


@router.get("/skipped")
async def get_skipped_documents(
    status: Optional[str] = Query(None, description="Filter by specific status (low_quality, missing_file, etc.)"),
    limit: int = Query(50, description="Maximum documents to return"),
    offset: int = Query(0, description="Offset for pagination")
):
    """
    Get documents that were skipped during analysis
    Each document includes the skip reason and recommended user action
    """
    try:
        pool = await document_analyzer.get_pool()

        # Build query based on filters
        skip_statuses = list(SKIP_REASONS.keys())

        if status and status in skip_statuses:
            query = """
                SELECT id, title, filename, file_path, processing_status, metadata, updated_at
                FROM documents
                WHERE processing_status = $1
                ORDER BY updated_at DESC
                LIMIT $2 OFFSET $3
            """
            rows = await pool.fetch(query, status, limit, offset)

            count_query = "SELECT COUNT(*) as count FROM documents WHERE processing_status = $1"
            total = await pool.fetchrow(count_query, status)
        else:
            # Get all skipped documents
            placeholders = ', '.join(f"'{s}'" for s in skip_statuses)
            query = f"""
                SELECT id, title, filename, file_path, processing_status, metadata, updated_at
                FROM documents
                WHERE processing_status IN ({placeholders})
                ORDER BY updated_at DESC
                LIMIT $1 OFFSET $2
            """
            rows = await pool.fetch(query, limit, offset)

            count_query = f"SELECT COUNT(*) as count FROM documents WHERE processing_status IN ({placeholders})"
            total = await pool.fetchrow(count_query)

        documents = []
        for row in rows:
            doc = dict(row)
            # Add user-friendly skip info
            skip_info = SKIP_REASONS.get(doc['processing_status'], {})
            doc['skip_reason'] = skip_info.get('reason', 'Bilinmeyen hata')
            doc['user_action'] = skip_info.get('user_action', 'Dosyayı kontrol edin')
            doc['severity'] = skip_info.get('severity', 'warning')
            documents.append(doc)

        return {
            "success": True,
            "total": total['count'] if total else 0,
            "documents": documents
        }

    except Exception as e:
        logger.error(f"Error getting skipped documents: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/skipped/summary")
async def get_skipped_summary():
    """
    Get summary of skipped documents grouped by status
    Useful for admin dashboard to see overall skip statistics
    """
    try:
        pool = await document_analyzer.get_pool()

        skip_statuses = list(SKIP_REASONS.keys())
        placeholders = ', '.join(f"'{s}'" for s in skip_statuses)

        query = f"""
            SELECT processing_status, COUNT(*) as count
            FROM documents
            WHERE processing_status IN ({placeholders})
            GROUP BY processing_status
            ORDER BY count DESC
        """

        rows = await pool.fetch(query)

        summary = []
        total_skipped = 0

        for row in rows:
            status = row['processing_status']
            count = row['count']
            total_skipped += count

            skip_info = SKIP_REASONS.get(status, {})
            summary.append({
                "status": status,
                "count": count,
                "reason": skip_info.get('reason', 'Bilinmeyen'),
                "user_action": skip_info.get('user_action', 'Kontrol edin'),
                "severity": skip_info.get('severity', 'warning')
            })

        return {
            "success": True,
            "total_skipped": total_skipped,
            "by_status": summary
        }

    except Exception as e:
        logger.error(f"Error getting skipped summary: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/stats")
async def get_document_stats():
    """
    Get comprehensive document statistics
    Shows analyzed, pending, skipped, and embedded counts
    """
    try:
        pool = await document_analyzer.get_pool()

        query = """
            SELECT
                processing_status,
                COUNT(*) as count,
                ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER(), 1) as percentage
            FROM documents
            WHERE file_type IN ('pdf', 'PDF')
            GROUP BY processing_status
            ORDER BY count DESC
        """

        rows = await pool.fetch(query)

        stats = []
        total = 0
        for row in rows:
            count = row['count']
            total += count

            status = row['processing_status']
            skip_info = SKIP_REASONS.get(status, {})

            stats.append({
                "status": status,
                "count": count,
                "percentage": float(row['percentage']),
                "is_skipped": status in SKIP_REASONS,
                "user_action": skip_info.get('user_action') if status in SKIP_REASONS else None
            })

        return {
            "success": True,
            "total_documents": total,
            "stats": stats
        }

    except Exception as e:
        logger.error(f"Error getting document stats: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/fix-missing-tokens")
async def fix_missing_tokens():
    """
    Fix documents with missing estimated_tokens in metadata.
    Also validates Turkish character support.
    """
    try:
        pool = await document_analyzer.get_pool()

        # 1. Count documents with missing tokens
        missing_count = await pool.fetchval("""
            SELECT COUNT(*)
            FROM documents
            WHERE processing_status = 'analyzed'
            AND content IS NOT NULL
            AND LENGTH(content) > 0
            AND (metadata->>'estimated_tokens' IS NULL)
        """)

        if missing_count == 0:
            # Get total tokens for already processed docs
            total_tokens = await pool.fetchval("""
                SELECT COALESCE(SUM((metadata->>'estimated_tokens')::bigint), 0)
                FROM documents
                WHERE processing_status = 'analyzed'
                AND metadata->>'estimated_tokens' IS NOT NULL
            """)

            return {
                "success": True,
                "message": "Tüm dökümanların token değeri mevcut",
                "missing_count": 0,
                "updated": 0,
                "total_tokens": total_tokens
            }

        # 2. Count Turkish character documents
        turkish_count = await pool.fetchval("""
            SELECT COUNT(*)
            FROM documents
            WHERE processing_status = 'analyzed'
            AND content ~ '[şğüöıçŞĞÜÖİÇ]'
        """)

        # 3. Update missing tokens in batches
        updated = await pool.execute("""
            UPDATE documents
            SET metadata = COALESCE(metadata, '{}'::jsonb) ||
                jsonb_build_object(
                    'estimated_tokens', LENGTH(content) / 4,
                    'char_count', LENGTH(content),
                    'tokens_fixed_at', NOW()::text
                )
            WHERE processing_status = 'analyzed'
            AND content IS NOT NULL
            AND LENGTH(content) > 0
            AND (metadata->>'estimated_tokens' IS NULL)
        """)

        # 4. Get total tokens after update
        total_tokens = await pool.fetchval("""
            SELECT COALESCE(SUM((metadata->>'estimated_tokens')::bigint), 0)
            FROM documents
            WHERE processing_status = 'analyzed'
            AND metadata->>'estimated_tokens' IS NOT NULL
        """)

        return {
            "success": True,
            "message": f"{missing_count} döküman güncellendi",
            "missing_count": missing_count,
            "turkish_docs": turkish_count,
            "updated": missing_count,
            "total_tokens": total_tokens
        }

    except Exception as e:
        logger.error(f"Error fixing missing tokens: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/token-stats")
async def get_token_stats():
    """
    Get token usage statistics for all analyzed documents.
    """
    try:
        pool = await document_analyzer.get_pool()

        stats = await pool.fetchrow("""
            SELECT
                COUNT(*) as total_analyzed,
                COUNT(*) FILTER (WHERE metadata->>'estimated_tokens' IS NOT NULL) as with_tokens,
                COUNT(*) FILTER (WHERE metadata->>'estimated_tokens' IS NULL) as missing_tokens,
                COALESCE(SUM((metadata->>'estimated_tokens')::bigint), 0) as total_tokens,
                COALESCE(AVG((metadata->>'estimated_tokens')::bigint), 0) as avg_tokens_per_doc,
                COUNT(*) FILTER (WHERE content ~ '[şğüöıçŞĞÜÖİÇ]') as turkish_docs
            FROM documents
            WHERE processing_status = 'analyzed'
            AND content IS NOT NULL
        """)

        return {
            "success": True,
            "stats": {
                "total_analyzed": stats['total_analyzed'],
                "with_tokens": stats['with_tokens'],
                "missing_tokens": stats['missing_tokens'],
                "total_tokens": stats['total_tokens'],
                "avg_tokens_per_doc": int(stats['avg_tokens_per_doc']),
                "turkish_docs": stats['turkish_docs']
            }
        }

    except Exception as e:
        logger.error(f"Error getting token stats: {e}")
        raise HTTPException(status_code=500, detail=str(e))
