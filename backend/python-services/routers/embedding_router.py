"""
Embedding API Router
Endpoints for embedding generation and management
"""

from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from loguru import logger

from services.embedding_service import (
    embedding_worker,
    get_csv_tables,
    get_embedding_stats
)

router = APIRouter()


class CSVEmbeddingRequest(BaseModel):
    """Request model for CSV embedding"""
    table_name: str = Field(..., description="CSV table name (e.g., csv_ozelge)")
    text_columns: List[str] = Field(..., description="Columns to embed")
    id_column: str = Field("id", description="ID column name")
    batch_size: int = Field(100, ge=10, le=500, description="Batch size")
    resume: bool = Field(True, description="Resume from last position")


class AllCSVEmbeddingRequest(BaseModel):
    """Request model for embedding all CSV tables"""
    batch_size: int = Field(100, ge=10, le=500, description="Batch size")
    resume: bool = Field(True, description="Resume from last position")


class DocumentEmbeddingRequest(BaseModel):
    """Request model for document embedding"""
    batch_size: int = Field(100, ge=10, le=500, description="Batch size")
    resume: bool = Field(True, description="Resume from last position")
    target_table: str = Field("document_embeddings", description="Target table: 'document_embeddings' or 'unified_embeddings'")


# ============== CSV EMBEDDING ENDPOINTS ==============

@router.get("/csv/tables")
async def list_csv_tables() -> Dict[str, Any]:
    """List all CSV tables with embedding progress"""
    try:
        tables = await get_csv_tables()
        return {
            "success": True,
            "tables": tables,
            "total_tables": len(tables)
        }
    except Exception as e:
        logger.error(f"Failed to list CSV tables: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/csv/start")
async def start_csv_embedding(request: CSVEmbeddingRequest) -> Dict[str, Any]:
    """Start embedding generation for a specific CSV table"""
    try:
        result = await embedding_worker.start_csv_embedding(
            table_name=request.table_name,
            text_columns=request.text_columns,
            id_column=request.id_column,
            batch_size=request.batch_size,
            resume=request.resume
        )
        return result
    except Exception as e:
        logger.error(f"Failed to start CSV embedding: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/csv/start-all")
async def start_all_csv_embedding(request: AllCSVEmbeddingRequest) -> Dict[str, Any]:
    """
    Start embedding generation for all CSV tables sequentially.
    Uses default text columns based on table structure.
    """
    try:
        tables = await get_csv_tables()

        # Default column mappings for known tables (Vergilex schema)
        column_mappings = {
            "csv_ozelge": ["konusu", "icerik"],
            "csv_danistaykararlari": ["konusu", "icerik"],
            "csv_sorucevap": ["soru", "cevap"],
            "csv_maliansiklopedi": ["konusu", "icerik"],
            "csv_hukdkk": ["konusu", "icerik"],
            "csv_makale_arsiv_2021": ["konusu", "icerik"],
            "csv_makale_arsiv_2022": ["konusu", "icerik"],
            "csv_makale_arsiv_2023": ["konusu", "icerik"],
            "csv_makale_arsiv_2024": ["konusu", "icerik"],
            "csv_makale_arsiv_2025": ["konusu", "icerik"],
        }

        # Find first table that needs processing
        for table in tables:
            table_name = table["table_name"]
            if table["embedded_rows"] < table["total_rows"]:
                text_columns = column_mappings.get(table_name, ["baslik", "icerik"])

                result = await embedding_worker.start_csv_embedding(
                    table_name=table_name,
                    text_columns=text_columns,
                    batch_size=request.batch_size,
                    resume=request.resume
                )

                return {
                    "success": True,
                    "message": f"Started embedding for {table_name}",
                    "table": table_name,
                    "remaining_tables": [t["table_name"] for t in tables
                                         if t["embedded_rows"] < t["total_rows"] and t["table_name"] != table_name]
                }

        return {
            "success": True,
            "message": "All CSV tables are already fully embedded",
            "tables": tables
        }

    except Exception as e:
        logger.error(f"Failed to start all CSV embedding: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============== DOCUMENT EMBEDDING ENDPOINTS ==============

@router.post("/documents/start")
async def start_document_embedding(request: DocumentEmbeddingRequest) -> Dict[str, Any]:
    """Start embedding generation for documents

    Args:
        batch_size: Documents per batch (10-500)
        resume: Skip already embedded documents
        target_table: 'document_embeddings' (default) or 'unified_embeddings'
    """
    try:
        result = await embedding_worker.start_document_embedding(
            batch_size=request.batch_size,
            resume=request.resume,
            target_table=request.target_table
        )
        return result
    except Exception as e:
        logger.error(f"Failed to start document embedding: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============== CONTROL ENDPOINTS ==============

@router.post("/pause")
async def pause_embedding() -> Dict[str, Any]:
    """Pause the current embedding job"""
    return embedding_worker.pause()


@router.post("/resume")
async def resume_embedding() -> Dict[str, Any]:
    """Resume the paused embedding job"""
    return embedding_worker.resume()


@router.post("/stop")
async def stop_embedding() -> Dict[str, Any]:
    """Stop the current embedding job"""
    return embedding_worker.stop()


# ============== STATUS ENDPOINTS ==============

@router.get("/status")
async def get_status() -> Dict[str, Any]:
    """Get current embedding worker status"""
    return embedding_worker.get_status()


@router.get("/stats")
async def get_stats() -> Dict[str, Any]:
    """Get overall embedding statistics"""
    try:
        stats = await get_embedding_stats()
        return {
            "success": True,
            **stats
        }
    except Exception as e:
        logger.error(f"Failed to get stats: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/progress")
async def get_progress() -> Dict[str, Any]:
    """Get embedding progress for all sources"""
    try:
        csv_tables = await get_csv_tables()
        status = embedding_worker.get_status()

        total_csv_rows = sum(t["total_rows"] for t in csv_tables)
        total_csv_embedded = sum(t["embedded_rows"] for t in csv_tables)

        return {
            "success": True,
            "csv": {
                "total_rows": total_csv_rows,
                "embedded_rows": total_csv_embedded,
                "progress_percent": round((total_csv_embedded / total_csv_rows * 100) if total_csv_rows > 0 else 0, 2),
                "tables": csv_tables
            },
            "worker": status
        }
    except Exception as e:
        logger.error(f"Failed to get progress: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============== LAW CHUNKING ENDPOINTS ==============

class ChunkLawsRequest(BaseModel):
    """Request model for law chunking"""
    source_table: str = Field("vergilex_mevzuat_kanunlar", description="Source table with law documents")
    dry_run: bool = Field(False, description="If true, don't actually insert chunks")
    limit: Optional[int] = Field(None, description="Limit number of laws to process")


# Global chunking status
_chunking_status = {
    "running": False,
    "progress": 0,
    "total": 0,
    "processed": 0,
    "chunks_created": 0,
    "errors": [],
    "last_law": None
}


@router.post("/chunk-laws")
async def chunk_laws(request: ChunkLawsRequest, background_tasks: BackgroundTasks) -> Dict[str, Any]:
    """
    Chunk law documents into individual articles (Madde).
    Each law is split into its constituent articles for better semantic search.
    """
    global _chunking_status

    if _chunking_status["running"]:
        return {
            "success": False,
            "error": "Chunking already in progress",
            "status": _chunking_status
        }

    # Start chunking in background
    background_tasks.add_task(
        run_law_chunking,
        request.source_table,
        request.dry_run,
        request.limit
    )

    _chunking_status = {
        "running": True,
        "progress": 0,
        "total": 0,
        "processed": 0,
        "chunks_created": 0,
        "errors": [],
        "last_law": None
    }

    return {
        "success": True,
        "message": "Law chunking started in background",
        "dry_run": request.dry_run,
        "source_table": request.source_table
    }


@router.get("/chunk-laws/status")
async def get_chunk_laws_status() -> Dict[str, Any]:
    """Get the current status of law chunking"""
    return {
        "success": True,
        **_chunking_status
    }


@router.post("/chunk-laws/stop")
async def stop_chunk_laws() -> Dict[str, Any]:
    """Stop the running law chunking process"""
    global _chunking_status
    _chunking_status["running"] = False
    return {
        "success": True,
        "message": "Chunking stop requested"
    }


async def run_law_chunking(source_table: str, dry_run: bool, limit: Optional[int]):
    """Background task to run law chunking"""
    global _chunking_status
    import asyncpg
    import re
    import hashlib
    import os
    from datetime import datetime

    DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:Luwi2025SecurePGx7749@localhost:5432/vergilex_lsemb")

    try:
        conn = await asyncpg.connect(DATABASE_URL)

        # Get law documents
        query = f"""
            SELECT id, source_name, content, metadata
            FROM unified_embeddings
            WHERE source_table = $1 AND source_type = 'law'
            ORDER BY id
        """
        if limit:
            query += f" LIMIT {limit}"

        laws = await conn.fetch(query, source_table)
        _chunking_status["total"] = len(laws)

        logger.info(f"Starting law chunking: {len(laws)} documents from {source_table}")

        for i, law in enumerate(laws):
            if not _chunking_status["running"]:
                logger.info("Chunking stopped by user")
                break

            law_id = law["id"]
            law_name = law["source_name"] or "Unknown Law"
            content = law["content"] or ""
            metadata = law["metadata"] or {}

            _chunking_status["last_law"] = law_name[:50]
            _chunking_status["processed"] = i + 1
            _chunking_status["progress"] = round((i + 1) / len(laws) * 100, 1)

            # Check if already chunked
            existing = await conn.fetchval(
                "SELECT COUNT(*) FROM unified_embeddings WHERE source_table = $1 AND metadata->>'original_id' = $2",
                f"{source_table}_chunks",
                str(law_id)
            )

            if existing > 0:
                logger.debug(f"Law {law_id} already chunked ({existing} articles)")
                continue

            # Parse articles from content
            articles = parse_law_articles(content, law_name, metadata)

            if not articles:
                logger.warning(f"No articles found in law: {law_name[:50]}")
                continue

            # Insert article chunks
            if not dry_run:
                for article in articles:
                    content_hash = hashlib.md5(article["content"].encode()).hexdigest()[:12]

                    await conn.execute("""
                        INSERT INTO unified_embeddings
                        (source_table, source_type, source_id, source_name, content, metadata, content_hash, created_at)
                        VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
                        ON CONFLICT (source_table, source_type, source_name, source_id) DO NOTHING
                    """,
                        f"{source_table}_chunks",
                        "kanun",
                        article["id"],
                        article["source_name"],
                        article["content"],
                        article["metadata"],
                        content_hash
                    )
                    _chunking_status["chunks_created"] += 1
            else:
                _chunking_status["chunks_created"] += len(articles)

            logger.info(f"[{i+1}/{len(laws)}] {law_name[:40]}: {len(articles)} articles")

        await conn.close()
        _chunking_status["running"] = False
        logger.info(f"Law chunking completed: {_chunking_status['chunks_created']} chunks created")

    except Exception as e:
        logger.error(f"Law chunking failed: {e}")
        _chunking_status["errors"].append(str(e))
        _chunking_status["running"] = False


def parse_law_articles(content: str, law_name: str, metadata: dict) -> List[Dict]:
    """Parse law content into individual articles"""
    import re
    import json

    articles = []

    # Pattern to match article headers: "Madde 1", "Madde 114", "MADDE 1" etc.
    # Also handles "Madde 1 –", "Madde 1-" variants
    article_pattern = re.compile(
        r'(?:^|\n)\s*((?:Madde|MADDE|madde)\s+(\d+(?:\s*/\s*[A-Za-z])?)\s*[-–]?\s*)',
        re.MULTILINE | re.IGNORECASE
    )

    matches = list(article_pattern.finditer(content))

    if not matches:
        return articles

    law_number = metadata.get("law_number") if isinstance(metadata, dict) else None

    for i, match in enumerate(matches):
        article_num = match.group(2).strip()
        start_pos = match.start()

        # End position is start of next article or end of content
        if i + 1 < len(matches):
            end_pos = matches[i + 1].start()
        else:
            end_pos = len(content)

        article_content = content[start_pos:end_pos].strip()

        # Skip if too short
        if len(article_content) < 50:
            continue

        # Truncate if too long (for embedding)
        if len(article_content) > 8000:
            article_content = article_content[:8000] + "..."

        # Create article record
        article_metadata = {
            "law_name": law_name,
            "law_number": law_number,
            "article_number": article_num,
            "article_title": None,
            "chunk_type": "article",
            "original_id": metadata.get("original_id") if isinstance(metadata, dict) else None,
            "chunked_at": datetime.now().isoformat() if 'datetime' in dir() else None
        }

        articles.append({
            "id": len(articles) + 1,
            "source_name": f"{law_name} - Madde {article_num}",
            "content": f"{law_name}\n\nMadde {article_num}\n\n{article_content}",
            "metadata": json.dumps(article_metadata)
        })

    return articles
