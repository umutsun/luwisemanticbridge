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
    """Start embedding generation for documents"""
    try:
        result = await embedding_worker.start_document_embedding(
            batch_size=request.batch_size,
            resume=request.resume
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
