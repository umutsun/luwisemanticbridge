"""
Import Router - Enqueue background import jobs
Handles Google Drive and local file imports via Celery workers
"""

from fastapi import APIRouter, HTTPException, Depends, Header
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
from loguru import logger
from .worker_router import ensure_worker_running

router = APIRouter()


class GoogleDriveImportRequest(BaseModel):
    """Request to import files from Google Drive"""
    job_id: int
    file_ids: List[str]
    credentials: Dict[str, Any]
    docs_dir: str
    save_to_db: bool = True


class ImportJobResponse(BaseModel):
    """Response after enqueuing import job"""
    success: bool
    job_id: int
    task_id: Optional[str] = None
    message: str


@router.post("/google-drive", response_model=ImportJobResponse)
async def enqueue_google_drive_import(
    request: GoogleDriveImportRequest,
    x_api_key: Optional[str] = Header(None)
):
    """
    Enqueue Google Drive import job to Celery

    This endpoint is called by Node.js backend to start background import.
    The actual import is processed by the Celery worker.
    """
    try:
        logger.info(f"[Import API] Enqueueing Google Drive import job {request.job_id} with {len(request.file_ids)} files")

        # Ensure Celery worker is running (auto-start if needed)
        await ensure_worker_running()

        # Import worker and enqueue task
        from workers.google_drive_worker import import_google_drive_files

        # Enqueue Celery task
        task = import_google_drive_files.delay(
            job_id=request.job_id,
            file_ids=request.file_ids,
            credentials_dict=request.credentials,
            docs_dir=request.docs_dir,
            save_to_db=request.save_to_db
        )

        logger.info(f"[Import API] Job {request.job_id} enqueued with task ID: {task.id}")

        return ImportJobResponse(
            success=True,
            job_id=request.job_id,
            task_id=task.id,
            message=f"Import job enqueued successfully with {len(request.file_ids)} files"
        )

    except Exception as e:
        logger.error(f"[Import API] Failed to enqueue job {request.job_id}: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to enqueue import job: {str(e)}"
        )


@router.get("/health")
async def health_check():
    """Check if Celery worker is available"""
    try:
        from workers.celery_app import celery_app

        # Ping Celery workers
        stats = celery_app.control.inspect().stats()

        if not stats:
            return {
                "status": "warning",
                "message": "No Celery workers available",
                "workers": []
            }

        worker_count = len(stats)
        return {
            "status": "healthy",
            "message": f"{worker_count} worker(s) available",
            "workers": list(stats.keys())
        }

    except Exception as e:
        logger.error(f"[Import API] Health check failed: {e}")
        return {
            "status": "error",
            "message": str(e),
            "workers": []
        }
