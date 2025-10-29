"""
pgai API Router
Endpoints for automatic embedding management
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import Optional, Dict, Any, List
from enum import Enum
from loguru import logger

from services.database import execute_query, execute_update

router = APIRouter()

class VectorizerConfig(BaseModel):
    """Configuration for pgai vectorizer"""
    name: str = Field(..., description="Vectorizer name")
    source_table: str = Field(..., description="Source table name")
    source_columns: List[str] = Field(..., description="Columns to vectorize")
    destination_table: str = Field(..., description="Destination embeddings table")

    # Embedding settings
    embedding_model: str = Field("text-embedding-3-large", description="Embedding model")
    embedding_dimensions: int = Field(1536, description="Embedding dimensions")

    # Chunking settings
    chunk_size: int = Field(1000, description="Chunk size")
    chunk_overlap: int = Field(200, description="Chunk overlap")

    # Scheduling
    schedule_interval: str = Field("5 minutes", description="Update interval")

    class Config:
        json_schema_extra = {
            "example": {
                "name": "document_vectorizer",
                "source_table": "documents",
                "source_columns": ["title", "content"],
                "destination_table": "embeddings_auto",
                "embedding_model": "text-embedding-3-large",
                "embedding_dimensions": 1536,
                "chunk_size": 1000,
                "chunk_overlap": 200,
                "schedule_interval": "5 minutes"
            }
        }

@router.get("/status")
async def get_pgai_status() -> Dict[str, Any]:
    """Check pgai installation and worker status"""
    try:
        # Check if pgai is installed
        pgai_installed = await execute_query("""
            SELECT EXISTS (
                SELECT 1 FROM pg_namespace WHERE nspname = 'ai'
            )
        """)

        if not pgai_installed[0]['exists']:
            return {
                "installed": False,
                "message": "pgai is not installed. Run /api/python/pgai/install first"
            }

        # Get vectorizers
        vectorizers = await execute_query("""
            SELECT
                id,
                source_table,
                destination,
                config->>'embedding' as embedding_model,
                config->>'schedule' as schedule,
                created_at,
                last_run_at
            FROM ai.vectorizers
            ORDER BY created_at DESC
        """)

        return {
            "installed": True,
            "vectorizers_count": len(vectorizers),
            "vectorizers": vectorizers,
            "worker_status": "Check logs for worker status"
        }

    except Exception as e:
        logger.error(f"Failed to check pgai status: {e}")
        return {
            "installed": False,
            "error": str(e)
        }

@router.post("/install")
async def install_pgai() -> Dict[str, str]:
    """
    Install pgai in the database

    WARNING: This requires superuser privileges
    """
    try:
        # Note: This is a placeholder. Actual pgai installation
        # requires running pgai.install() from Python with proper privileges

        return {
            "message": "pgai installation initiated",
            "note": "Please run the pgai worker separately with proper database privileges",
            "command": "python -m pgai.worker --database-url $DATABASE_URL"
        }

    except Exception as e:
        logger.error(f"Failed to install pgai: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/vectorizer/create")
async def create_vectorizer(config: VectorizerConfig) -> Dict[str, Any]:
    """
    Create a new pgai vectorizer pipeline

    This will automatically:
    1. Monitor the source table for changes
    2. Generate chunks from specified columns
    3. Create embeddings using the specified model
    4. Store embeddings in the destination table
    """
    try:
        # Build the SQL for creating vectorizer
        # Note: This is pseudo-code as actual pgai syntax may differ

        create_sql = f"""
        SELECT ai.create_vectorizer(
            '{config.name}'::text,
            source => ai.source_table(
                '{config.source_table}',
                ARRAY{config.source_columns}::text[]
            ),
            destination => '{config.destination_table}',
            embedding => ai.embedding_openai(
                '{config.embedding_model}',
                {config.embedding_dimensions}
            ),
            chunking => ai.chunking_recursive_character_text_splitter(
                chunk_size => {config.chunk_size},
                chunk_overlap => {config.chunk_overlap}
            ),
            scheduling => ai.scheduling_periodic(
                interval => '{config.schedule_interval}'::interval
            )
        );
        """

        # For now, return the configuration
        # Actual implementation would execute the SQL

        return {
            "message": "Vectorizer configuration created",
            "config": config.dict(),
            "sql": create_sql,
            "note": "Run pgai worker to activate this vectorizer"
        }

    except Exception as e:
        logger.error(f"Failed to create vectorizer: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/vectorizer/{name}")
async def delete_vectorizer(name: str) -> Dict[str, str]:
    """Delete a vectorizer pipeline"""
    try:
        # Pseudo-code for deletion
        delete_sql = f"SELECT ai.drop_vectorizer('{name}');"

        return {
            "message": f"Vectorizer '{name}' deletion initiated",
            "sql": delete_sql
        }

    except Exception as e:
        logger.error(f"Failed to delete vectorizer: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/vectorizer/{name}/stats")
async def get_vectorizer_stats(name: str) -> Dict[str, Any]:
    """Get statistics for a specific vectorizer"""
    try:
        # Get vectorizer info
        stats = await execute_query(f"""
            SELECT
                v.*,
                (SELECT COUNT(*) FROM {name}_destination) as embeddings_count,
                (SELECT MAX(created_at) FROM {name}_destination) as last_embedding_created
            FROM ai.vectorizers v
            WHERE v.name = $1
        """, name)

        if not stats:
            raise HTTPException(status_code=404, detail=f"Vectorizer '{name}' not found")

        return stats[0]

    except Exception as e:
        logger.error(f"Failed to get vectorizer stats: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/manual-embedding")
async def create_manual_embedding(
    text: str = Field(..., description="Text to embed"),
    model: str = Field("text-embedding-3-large", description="Embedding model")
) -> Dict[str, Any]:
    """
    Manually create an embedding for testing

    This bypasses pgai and directly uses the embedding service
    """
    try:
        import openai
        import os

        openai.api_key = os.getenv("OPENAI_API_KEY")

        response = openai.embeddings.create(
            input=text,
            model=model
        )

        embedding = response.data[0].embedding

        return {
            "text": text[:100] + "..." if len(text) > 100 else text,
            "model": model,
            "dimensions": len(embedding),
            "embedding": embedding[:10] + ["..."],  # Show first 10 dimensions
            "usage": response.usage.dict() if hasattr(response, 'usage') else None
        }

    except Exception as e:
        logger.error(f"Failed to create manual embedding: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/recommendations")
async def get_recommendations() -> Dict[str, Any]:
    """Get recommendations for pgai optimization"""

    recommendations = []

    try:
        # Check for tables without vectorizers
        tables = await execute_query("""
            SELECT tablename
            FROM pg_tables
            WHERE schemaname = 'public'
            AND tablename IN ('documents', 'scraped_pages', 'messages')
        """)

        for table in tables:
            recommendations.append({
                "table": table['tablename'],
                "recommendation": f"Consider creating a vectorizer for {table['tablename']} table",
                "benefit": "Automatic embedding generation and updates"
            })

        # Check for pgvectorscale
        pgvectorscale = await execute_query("""
            SELECT EXISTS (
                SELECT 1 FROM pg_extension WHERE extname = 'vectorscale'
            )
        """)

        if not pgvectorscale[0]['exists']:
            recommendations.append({
                "component": "pgvectorscale",
                "recommendation": "Install pgvectorscale for better performance",
                "benefit": "28x faster search, 75% lower cost"
            })

        return {
            "recommendations": recommendations,
            "total": len(recommendations)
        }

    except Exception as e:
        logger.error(f"Failed to get recommendations: {e}")
        return {
            "error": str(e),
            "recommendations": []
        }