"""
Celery Application Configuration
Redis DB 2 for LSEMB import jobs
"""
import os
from pathlib import Path
from celery import Celery
from dotenv import load_dotenv

# Load .env.lsemb from project root (multi-tenant setup)
env_path = Path(__file__).parent.parent.parent / '.env.lsemb'
load_dotenv(dotenv_path=env_path)

# Celery app with Redis broker (DB 2)
celery_app = Celery(
    'lsemb_workers',
    broker=os.getenv('CELERY_BROKER_URL', 'redis://localhost:6379/2'),
    backend=os.getenv('CELERY_RESULT_BACKEND', 'redis://localhost:6379/2')
)

# Celery configuration
celery_app.conf.update(
    task_serializer='json',
    accept_content=['json'],
    result_serializer='json',
    timezone='UTC',
    enable_utc=True,
    task_track_started=True,
    task_time_limit=3600,  # 1 hour max
    worker_prefetch_multiplier=1,  # One task at a time
    worker_max_tasks_per_child=10,  # Restart worker after 10 tasks (prevent memory leaks)
)

# Auto-discover tasks
celery_app.autodiscover_tasks(['workers'])

if __name__ == '__main__':
    celery_app.start()
