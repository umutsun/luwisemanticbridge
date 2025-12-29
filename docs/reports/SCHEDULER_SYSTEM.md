# LSEMB Scheduler System

**Date:** 2025-12-29
**Status:** Production Ready
**Library:** APScheduler 3.10.4 (MIT License)

## Overview

Python-based job scheduling system replacing system crontab for security reasons. Uses APScheduler with PostgreSQL persistence for reliable, distributed job execution.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      Frontend (Next.js)                      │
│                  Settings > Scheduler Tab                    │
└─────────────────────────────┬───────────────────────────────┘
                              │ HTTP
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   Node.js Backend (Express)                  │
│              /api/v2/scheduler/* (Proxy Router)              │
└─────────────────────────────┬───────────────────────────────┘
                              │ HTTP (Internal)
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                  Python FastAPI Service                      │
│           /api/python/scheduler/* (Scheduler Router)         │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │               APScheduler AsyncIO                       │ │
│  │  - SQLAlchemyJobStore (PostgreSQL)                     │ │
│  │  - CronTrigger / IntervalTrigger / DateTrigger         │ │
│  │  - Event listeners for execution tracking               │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────┬───────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      PostgreSQL                              │
│  - scheduled_jobs (job definitions)                          │
│  - job_execution_logs (execution history)                    │
│  - apscheduler_jobs (APScheduler internal state)             │
└─────────────────────────────────────────────────────────────┘
```

## Database Schema

### scheduled_jobs
```sql
CREATE TABLE scheduled_jobs (
    id UUID PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    job_type VARCHAR(50) NOT NULL,  -- 'cleanup', 'crawler', 'embedding_sync', 'rag_query', 'custom_script'
    schedule_type VARCHAR(20) NOT NULL,  -- 'cron', 'interval', 'date'
    cron_expression VARCHAR(100),
    interval_seconds INTEGER,
    run_date TIMESTAMP WITH TIME ZONE,
    timezone VARCHAR(50) DEFAULT 'Europe/Istanbul',
    job_config JSONB NOT NULL DEFAULT '{}',
    enabled BOOLEAN DEFAULT true,
    -- Execution stats
    last_run_at TIMESTAMP WITH TIME ZONE,
    last_run_status VARCHAR(20),
    next_run_at TIMESTAMP WITH TIME ZONE,
    total_runs INTEGER DEFAULT 0,
    successful_runs INTEGER DEFAULT 0,
    failed_runs INTEGER DEFAULT 0,
    -- Retry config
    max_retries INTEGER DEFAULT 3,
    retry_delay_seconds INTEGER DEFAULT 60,
    -- Audit
    created_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE
);
```

### job_execution_logs
```sql
CREATE TABLE job_execution_logs (
    id UUID PRIMARY KEY,
    job_id UUID REFERENCES scheduled_jobs(id),
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    duration_ms INTEGER,
    status VARCHAR(20),  -- 'running', 'completed', 'failed', 'timeout'
    trigger_type VARCHAR(20),  -- 'scheduled', 'manual', 'retry'
    result JSONB,
    error_message TEXT,
    logs TEXT
);
```

## API Endpoints

### Job Management
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v2/scheduler/jobs` | List all jobs |
| POST | `/api/v2/scheduler/jobs` | Create new job |
| GET | `/api/v2/scheduler/jobs/:id` | Get job details |
| PATCH | `/api/v2/scheduler/jobs/:id` | Update job |
| DELETE | `/api/v2/scheduler/jobs/:id` | Delete job |

### Job Actions
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v2/scheduler/jobs/:id/toggle` | Enable/disable job |
| POST | `/api/v2/scheduler/jobs/:id/run-now` | Trigger immediate execution |
| GET | `/api/v2/scheduler/jobs/:id/logs` | Get execution logs |

### Quick Create
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v2/scheduler/quick/cleanup` | Create cleanup job |
| POST | `/api/v2/scheduler/quick/crawler` | Create crawler job |
| POST | `/api/v2/scheduler/quick/embedding-sync` | Create embedding sync job |

### Statistics
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v2/scheduler/health` | Health check |
| GET | `/api/v2/scheduler/stats` | Scheduler statistics |

## Job Types

### 1. Cleanup (`cleanup`)
Removes old records from specified tables.

```json
{
  "job_type": "cleanup",
  "job_config": {
    "retention_days": 90,
    "tables": ["message_embeddings", "job_execution_logs", "activity_log"],
    "vacuum_after": false
  }
}
```

### 2. Crawler (`crawler`)
Runs web crawlers for data collection.

```json
{
  "job_type": "crawler",
  "job_config": {
    "crawler_name": "sahibinden_list_crawler",
    "url": "https://www.sahibinden.com/arsa/izmir",
    "pages": 100,
    "export_to_db": true
  }
}
```

### 3. Embedding Sync (`embedding_sync`)
Generates embeddings for new records.

```json
{
  "job_type": "embedding_sync",
  "job_config": {
    "source_table": "csv_ozelge",
    "batch_size": 100,
    "skip_existing": true,
    "model": "text-embedding-3-small"
  }
}
```

### 4. RAG Query (`rag_query`)
Executes scheduled RAG queries.

```json
{
  "job_type": "rag_query",
  "job_config": {
    "prompt": "Son 24 saatte eklenen gayrimenkul ilanlarını özetle",
    "model": "gpt-4",
    "temperature": 0.7,
    "save_response": true
  }
}
```

### 5. Custom Script (`custom_script`)
Runs custom Python scripts.

```json
{
  "job_type": "custom_script",
  "job_config": {
    "script_path": "scripts/custom/my_script.py",
    "args": ["--verbose"],
    "timeout": 300
  }
}
```

## Schedule Types

### Cron Expression
```json
{
  "schedule_type": "cron",
  "cron_expression": "0 2 * * *",  // Daily at 02:00
  "timezone": "Europe/Istanbul"
}
```

Common cron patterns:
- `0 2 * * *` - Daily at 02:00
- `0 */6 * * *` - Every 6 hours
- `0 0 * * 0` - Weekly on Sunday
- `0 0 1 * *` - Monthly on 1st

### Interval
```json
{
  "schedule_type": "interval",
  "interval_seconds": 3600  // Every hour (minimum 60)
}
```

### One-time
```json
{
  "schedule_type": "date",
  "run_date": "2025-01-01T00:00:00+03:00"
}
```

## File Locations

```
backend/python-services/
├── scheduler/
│   ├── __init__.py           # Module exports
│   ├── scheduler_service.py  # Main APScheduler service
│   ├── job_types.py          # Enums and Pydantic models
│   └── job_executor.py       # Job execution logic
├── routers/
│   └── scheduler_router.py   # FastAPI endpoints
└── main.py                   # Scheduler initialization

backend/src/
├── routes/
│   └── scheduler.routes.ts   # Node.js proxy router
└── server.ts                 # Route registration

frontend/src/
├── components/settings/
│   └── SchedulerSection.tsx  # Scheduler UI
└── app/dashboard/settings/
    └── settings.tsx          # Settings page (scheduler tab)

backend/database/migrations/
└── 20251229_add_scheduled_jobs.sql  # Database migration
```

## Security Notes

1. **node-cron removed** - All Node.js cron dependencies removed for security
2. **Python APScheduler** - Battle-tested library with MIT license
3. **PostgreSQL persistence** - Jobs survive service restarts
4. **API key protection** - Production endpoints require authentication

## Usage Examples

### Create Daily Cleanup Job (cURL)
```bash
curl -X POST http://localhost:8001/api/python/scheduler/quick/cleanup \
  -H "Content-Type: application/json" \
  -d '{
    "cron_expression": "0 2 * * *",
    "retention_days": 90
  }'
```

### Toggle Job
```bash
curl -X POST http://localhost:8001/api/python/scheduler/jobs/{job_id}/toggle
```

### Run Job Immediately
```bash
curl -X POST http://localhost:8001/api/python/scheduler/jobs/{job_id}/run-now
```

### Get Statistics
```bash
curl http://localhost:8001/api/python/scheduler/stats
```

## Monitoring

### Check Scheduler Health
```bash
curl http://localhost:8001/api/python/scheduler/health
# {"status":"healthy","running":true}
```

### View PM2 Logs
```bash
pm2 logs geolex-python --lines 50 | grep -i scheduler
```

### Database Queries
```sql
-- Active jobs
SELECT name, job_type, cron_expression, next_run_at
FROM scheduled_jobs WHERE enabled = true;

-- Recent executions
SELECT j.name, l.status, l.duration_ms, l.started_at
FROM job_execution_logs l
JOIN scheduled_jobs j ON j.id = l.job_id
ORDER BY l.started_at DESC LIMIT 10;

-- Failed jobs in last 24h
SELECT j.name, l.error_message, l.started_at
FROM job_execution_logs l
JOIN scheduled_jobs j ON j.id = l.job_id
WHERE l.status = 'failed' AND l.started_at > NOW() - INTERVAL '24 hours';
```

## Troubleshooting

### Job Not Running
1. Check if job is enabled: `GET /api/v2/scheduler/jobs/{id}`
2. Verify Python service is running: `pm2 status`
3. Check logs: `pm2 logs {service}-python`

### Scheduler Not Starting
1. Check database connection
2. Verify `scheduled_jobs` table exists
3. Check Python service startup logs

### Job Failing
1. Check execution logs: `GET /api/v2/scheduler/jobs/{id}/logs`
2. Verify job_config is correct
3. Check for missing dependencies

## Changelog

- **2025-12-29**: Initial implementation
  - APScheduler 3.10.4 integration
  - PostgreSQL persistence
  - Frontend UI in dashboard settings
  - node-cron removed for security
