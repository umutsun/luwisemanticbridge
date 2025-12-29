# Feature Specification: APScheduler Job Scheduling System

**Feature ID:** 003-scheduler-system
**Specification Level:** COMPLETE
**Estimated Time:** 8-12 hours
**Priority:** HIGH
**Status:** COMPLETED
**Created:** 2025-12-29
**Completed:** 2025-12-29

---

## 1. Executive Summary

### Problem Statement
System crontab poses security risks and lacks visibility:
- Security vulnerability: Crontab used by malware/viruses
- No UI visibility for scheduled jobs
- Difficult to manage across multi-tenant instances
- No execution history or failure tracking
- node-cron dependency in Node.js backend

### Implemented Solution
**Python APScheduler System**: Secure, persistent job scheduling with PostgreSQL backend and dashboard UI.

```
+-----------------------------------------------------------+
|                  Dashboard Settings UI                     |
|              Settings > Scheduler Tab                      |
+---------------------------+-------------------------------+
                            | HTTP
                            v
+-----------------------------------------------------------+
|                Node.js Backend (Express)                   |
|           /api/v2/scheduler/* (Proxy Router)               |
+---------------------------+-------------------------------+
                            | HTTP (Internal)
                            v
+-----------------------------------------------------------+
|               Python FastAPI Service                       |
|        /api/python/scheduler/* (Scheduler Router)          |
|                                                            |
|  +------------------------------------------------------+ |
|  |              APScheduler AsyncIO                      | |
|  |  - SQLAlchemyJobStore (PostgreSQL)                   | |
|  |  - CronTrigger / IntervalTrigger / DateTrigger       | |
|  |  - Event listeners for execution tracking             | |
|  +------------------------------------------------------+ |
+---------------------------+-------------------------------+
                            |
                            v
+-----------------------------------------------------------+
|                      PostgreSQL                            |
|  - scheduled_jobs (job definitions)                        |
|  - job_execution_logs (execution history)                  |
|  - apscheduler_jobs (APScheduler internal state)           |
+-----------------------------------------------------------+
```

### Key Benefits
- Security: node-cron removed, Python-based scheduling
- Persistence: Jobs survive service restarts
- Visibility: Dashboard UI for job management
- History: Full execution logs with success/failure tracking
- Multi-tenant: Works across GeoLex, Vergilex, Bookie

---

## 2. Implementation Details

### 2.1 Database Schema

**Tables Created:**
```sql
-- Job definitions
CREATE TABLE scheduled_jobs (
    id UUID PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    job_type VARCHAR(50) NOT NULL,  -- cleanup, crawler, embedding_sync, rag_query, custom_script
    schedule_type VARCHAR(20),       -- cron, interval, date
    cron_expression VARCHAR(100),
    interval_seconds INTEGER,
    job_config JSONB NOT NULL,
    enabled BOOLEAN DEFAULT true,
    last_run_at TIMESTAMP,
    next_run_at TIMESTAMP,
    total_runs INTEGER DEFAULT 0,
    successful_runs INTEGER DEFAULT 0,
    failed_runs INTEGER DEFAULT 0,
    ...
);

-- Execution history
CREATE TABLE job_execution_logs (
    id UUID PRIMARY KEY,
    job_id UUID REFERENCES scheduled_jobs(id),
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    status VARCHAR(20),  -- running, completed, failed, timeout
    result JSONB,
    error_message TEXT,
    ...
);

-- APScheduler internal
CREATE TABLE apscheduler_jobs (
    id VARCHAR(255) PRIMARY KEY,
    next_run_time DOUBLE PRECISION,
    job_state BYTEA NOT NULL
);
```

### 2.2 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v2/scheduler/health` | Health check |
| GET | `/api/v2/scheduler/stats` | Statistics |
| GET | `/api/v2/scheduler/jobs` | List all jobs |
| POST | `/api/v2/scheduler/jobs` | Create job |
| GET | `/api/v2/scheduler/jobs/:id` | Get job |
| PATCH | `/api/v2/scheduler/jobs/:id` | Update job |
| DELETE | `/api/v2/scheduler/jobs/:id` | Delete job |
| POST | `/api/v2/scheduler/jobs/:id/toggle` | Enable/disable |
| POST | `/api/v2/scheduler/jobs/:id/run-now` | Run immediately |
| GET | `/api/v2/scheduler/jobs/:id/logs` | Execution logs |
| POST | `/api/v2/scheduler/quick/cleanup` | Quick create cleanup job |
| POST | `/api/v2/scheduler/quick/crawler` | Quick create crawler job |
| POST | `/api/v2/scheduler/quick/embedding-sync` | Quick create embedding job |

### 2.3 Job Types

1. **cleanup** - Delete old records
2. **crawler** - Run web crawlers
3. **embedding_sync** - Generate embeddings
4. **rag_query** - Execute RAG queries
5. **custom_script** - Run Python scripts

### 2.4 Schedule Types

1. **cron** - Cron expression (e.g., "0 2 * * *")
2. **interval** - Every N seconds (minimum 60)
3. **date** - One-time execution

---

## 3. Files Created/Modified

### New Files
```
backend/python-services/scheduler/
├── __init__.py           # Module exports
├── scheduler_service.py  # Main APScheduler service
├── job_types.py          # Enums and Pydantic models
└── job_executor.py       # Job execution logic

backend/python-services/routers/
└── scheduler_router.py   # FastAPI endpoints

backend/src/routes/
└── scheduler.routes.ts   # Node.js proxy router

frontend/src/components/settings/
└── SchedulerSection.tsx  # Scheduler UI

backend/database/migrations/
└── 20251229_add_scheduled_jobs.sql  # Database migration
```

### Modified Files
```
backend/python-services/main.py          # Scheduler initialization
backend/python-services/requirements.txt # Added apscheduler, croniter
backend/src/server.ts                    # Added scheduler routes
backend/package.json                     # Removed node-cron
backend/src/services/message-cleanup.service.ts  # Converted to on-demand
frontend/src/app/dashboard/settings/settings.tsx # Added scheduler tab
```

---

## 4. Dependencies

### Python
```
apscheduler==3.10.4
croniter==2.0.1
sqlalchemy==2.0.23
```

### Removed
```
node-cron (security risk)
@types/node-cron
```

---

## 5. Security Considerations

1. **node-cron Removed** - All Node.js cron dependencies removed
2. **Python APScheduler** - Battle-tested library, MIT license
3. **PostgreSQL Persistence** - Jobs survive service restarts
4. **Module-level Functions** - APScheduler serialization fix

---

## 6. Deployment

### Migration Applied To:
- GeoLex (geolex_lsemb database)
- Vergilex (vergilex_lsemb database)
- Bookie (bookie_lsemb database)

### Services Restarted:
- geolex-python, vergilex-python, bookie-python
- geolex-backend, vergilex-backend, bookie-backend
- geolex-frontend, vergilex-frontend

---

## 7. Testing

### API Tests
```bash
# Health check
curl http://localhost:8001/api/python/scheduler/health
# {"status":"healthy","running":true}

# Create cleanup job
curl -X POST http://localhost:8001/api/python/scheduler/quick/cleanup \
  -H "Content-Type: application/json" \
  -d '{"cron_expression": "0 2 * * *", "retention_days": 90}'

# List jobs
curl http://localhost:8001/api/python/scheduler/jobs

# Toggle job
curl -X POST http://localhost:8001/api/python/scheduler/jobs/{id}/toggle

# Run now
curl -X POST http://localhost:8001/api/python/scheduler/jobs/{id}/run-now
```

---

## 8. Documentation

Full documentation: `docs/reports/SCHEDULER_SYSTEM.md`

---

## 9. Success Criteria

### Completed
- [x] APScheduler integration with PostgreSQL persistence
- [x] Database migration for all instances
- [x] FastAPI router with full CRUD
- [x] Node.js proxy router
- [x] Frontend UI in dashboard settings
- [x] node-cron removed for security
- [x] Job execution logging
- [x] Quick create endpoints
- [x] Multi-tenant deployment
- [x] Documentation

---

## 10. Commits

1. `feat(scheduler): Add APScheduler-based job scheduling system`
2. `fix(scheduler): Serialize job_config and result as JSON for JSONB columns`
3. `fix(scheduler): Add ::jsonb cast and parse JSON on read`
4. `fix(scheduler): Use module-level function for APScheduler jobs`

---

**Feature Complete**
