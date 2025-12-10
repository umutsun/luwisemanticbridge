"""
Worker Management Router
On-demand Celery worker lifecycle management
"""
import os
import signal
import subprocess
import asyncio
from pathlib import Path
from fastapi import APIRouter, HTTPException
from loguru import logger

router = APIRouter()

# Global variable to track auto-stop task
_auto_stop_task = None

def get_worker_pid():
    """Find running celery worker PID"""
    try:
        result = subprocess.run(
            ["pgrep", "-f", "celery.*worker"],
            capture_output=True,
            text=True
        )
        pids = result.stdout.strip().split('\n') if result.stdout else []
        return [p for p in pids if p]  # Filter empty strings
    except Exception as e:
        logger.error(f"Failed to get worker PID: {e}")
        return []

def is_worker_running():
    """Check if worker is running"""
    return len(get_worker_pid()) > 0

def start_worker_process():
    """Start celery worker in background"""
    if is_worker_running():
        logger.info("Worker already running, skipping start")
        return True

    try:
        # Determine working directory based on APP_NAME
        app_name = os.getenv("APP_NAME", "LSEMB").lower()

        # For production instances, use symlink paths
        if app_name in ["emlakai", "vergilex", "bookie"]:
            cwd = f"/var/www/{app_name}/backend/python-services"
        else:
            # For local development
            cwd = Path(__file__).parent.parent

        # Start worker in background
        subprocess.Popen(
            [
                "celery", "-A", "workers.celery_app", "worker",
                "--loglevel=info",
                "--logfile=/tmp/celery-worker.log"
            ],
            cwd=cwd,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            start_new_session=True  # Detach from parent process
        )

        logger.info(f"✅ Worker started for {app_name}")
        return True
    except Exception as e:
        logger.error(f"Failed to start worker: {e}")
        return False

def stop_worker_process():
    """Stop celery worker"""
    pids = get_worker_pid()
    if not pids:
        logger.info("No worker to stop")
        return True

    try:
        for pid in pids:
            os.kill(int(pid), signal.SIGTERM)
        logger.info(f"✅ Worker stopped (PIDs: {pids})")
        return True
    except Exception as e:
        logger.error(f"Failed to stop worker: {e}")
        return False

async def auto_stop_worker_after_idle(minutes: int = 40):
    """Auto-stop worker after idle time"""
    global _auto_stop_task

    # Cancel previous auto-stop task if exists
    if _auto_stop_task and not _auto_stop_task.done():
        _auto_stop_task.cancel()

    async def stop_after_delay():
        await asyncio.sleep(minutes * 60)
        if is_worker_running():
            logger.info(f"⏱️ Auto-stopping worker after {minutes} minutes idle")
            stop_worker_process()

    _auto_stop_task = asyncio.create_task(stop_after_delay())

@router.get("/status")
async def worker_status():
    """Check worker status"""
    pids = get_worker_pid()
    running = len(pids) > 0

    return {
        "running": running,
        "pids": pids,
        "count": len(pids)
    }

@router.post("/start")
async def start_worker():
    """Manually start worker"""
    if is_worker_running():
        return {"status": "already_running", "message": "Worker is already running"}

    success = start_worker_process()
    if success:
        # Auto-stop after 40 minutes
        await auto_stop_worker_after_idle(minutes=40)
        return {"status": "started", "message": "Worker started successfully"}
    else:
        raise HTTPException(status_code=500, detail="Failed to start worker")

@router.post("/stop")
async def stop_worker():
    """Manually stop worker"""
    global _auto_stop_task

    # Cancel auto-stop task
    if _auto_stop_task and not _auto_stop_task.done():
        _auto_stop_task.cancel()

    pids = get_worker_pid()
    if not pids:
        return {"status": "not_running", "message": "Worker is not running"}

    success = stop_worker_process()
    if success:
        return {"status": "stopped", "message": "Worker stopped successfully"}
    else:
        raise HTTPException(status_code=500, detail="Failed to stop worker")

@router.post("/restart")
async def restart_worker():
    """Restart worker"""
    stop_worker_process()
    await asyncio.sleep(2)  # Wait for clean shutdown
    success = start_worker_process()

    if success:
        await auto_stop_worker_after_idle(minutes=40)
        return {"status": "restarted", "message": "Worker restarted successfully"}
    else:
        raise HTTPException(status_code=500, detail="Failed to restart worker")

# Helper function to ensure worker is running before import
async def ensure_worker_running():
    """Ensure worker is running, start if needed"""
    if not is_worker_running():
        logger.info("🚀 Starting worker for import job")
        start_worker_process()
        await asyncio.sleep(3)  # Wait for worker to initialize

    # Reset auto-stop timer
    await auto_stop_worker_after_idle(minutes=40)
