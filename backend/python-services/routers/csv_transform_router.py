"""
CSV Transform Router - FastAPI endpoints for high-performance CSV import

Endpoints:
- POST /api/python/csv/transform - Start CSV transformation
- GET /api/python/csv/progress/{job_id} - Get job progress
- POST /api/python/csv/cancel/{job_id} - Cancel running job
"""

import os
import asyncio
from typing import Optional
from datetime import datetime

from fastapi import APIRouter, HTTPException, BackgroundTasks
from loguru import logger

from models.transform_models import (
    CSVTransformRequest,
    CSVTransformResponse,
    TransformProgress,
    TransformStatus
)
from services.csv_transform_service import csv_transform_service


router = APIRouter(prefix="/api/python/csv", tags=["CSV Transform"])


@router.post("/transform", response_model=CSVTransformResponse)
async def transform_csv(
    request: CSVTransformRequest,
    background_tasks: BackgroundTasks
):
    """
    Start a CSV transformation job.

    This endpoint:
    1. Validates the CSV file exists
    2. Estimates total rows and processing time
    3. Starts the transformation in the background
    4. Returns immediately with job ID for progress tracking

    Performance: 870MB CSV (~142K rows) completes in 2-3 minutes.
    """
    try:
        # Validate file exists
        if not os.path.exists(request.file_path):
            raise HTTPException(
                status_code=404,
                detail=f"CSV file not found: {request.file_path}"
            )

        # Get file size
        file_size = os.path.getsize(request.file_path)
        file_size_mb = file_size / (1024 * 1024)

        logger.info(
            f"CSV Transform request: {request.file_path} "
            f"({file_size_mb:.1f} MB) -> {request.table_name}"
        )

        # Estimate rows (rough: ~6KB per row for typical CSV)
        estimated_rows = int(file_size / 6000)

        # Estimate time (rough: 50K rows/second with COPY)
        estimated_time = max(1, estimated_rows // 50000)

        # Start background task
        background_tasks.add_task(
            run_transform_job,
            request
        )

        return CSVTransformResponse(
            job_id=request.job_id,
            status=TransformStatus.PROCESSING,
            message=f"Transform job started for {file_size_mb:.1f} MB CSV file",
            estimated_rows=estimated_rows,
            estimated_time_seconds=estimated_time
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to start transform: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


async def run_transform_job(request: CSVTransformRequest):
    """
    Background task to run the CSV transformation.
    Progress updates are published via Redis pub/sub.
    """
    try:
        result = await csv_transform_service.transform_csv_with_copy(
            job_id=request.job_id,
            file_path=request.file_path,
            table_name=request.table_name,
            database_url=request.database_url,
            batch_size=request.batch_size,
            delimiter=request.delimiter,
            encoding=request.encoding,
            truncate_table=request.truncate_table,
            column_types=request.column_types
        )
        logger.info(f"Transform job {request.job_id} completed: {result}")
    except Exception as e:
        logger.error(f"Transform job {request.job_id} failed: {str(e)}")


@router.get("/progress/{job_id}")
async def get_transform_progress(job_id: str):
    """
    Get the current progress of a transformation job.

    Returns:
    - status: pending | processing | completed | failed | cancelled
    - progress: 0-100 percentage
    - rows_processed: number of rows inserted
    - total_rows: total rows in CSV
    - rows_per_second: current processing speed
    - estimated_remaining_seconds: ETA
    """
    progress = await csv_transform_service.get_job_progress(job_id)

    if not progress:
        raise HTTPException(
            status_code=404,
            detail=f"Job not found: {job_id}"
        )

    return progress


@router.post("/cancel/{job_id}")
async def cancel_transform(job_id: str):
    """
    Cancel a running transformation job.

    Note: Cancellation may take a few seconds as the current batch completes.
    """
    success = await csv_transform_service.cancel_job(job_id)

    if success:
        return {"status": "cancelled", "job_id": job_id}
    else:
        raise HTTPException(
            status_code=500,
            detail="Failed to cancel job"
        )


@router.get("/health")
async def csv_transform_health():
    """Health check for CSV transform service"""
    return {
        "status": "healthy",
        "service": "csv_transform",
        "timestamp": datetime.utcnow().isoformat()
    }


# Initialize service on startup
@router.on_event("startup")
async def startup():
    """Initialize CSV transform service"""
    await csv_transform_service.init()
    logger.info("CSV Transform Router initialized")


@router.on_event("shutdown")
async def shutdown():
    """Cleanup CSV transform service"""
    await csv_transform_service.close()
    logger.info("CSV Transform Router shutdown")
