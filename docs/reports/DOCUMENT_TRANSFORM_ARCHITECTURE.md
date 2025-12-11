# Document Transform System - Architecture Analysis

**Date**: 2025-12-11
**Status**: CRITICAL - Current implementation cannot handle large CSV files
**Issue**: 870MB CSV stuck at 0% for hours

---

## 1. Problem Statement

### Current Situation
- **File**: `DANISTAYKARARLARI.csv` (870.8 MB, 142,678 rows)
- **Status**: Batch 1/2854 stuck at 25 rows, 0% progress for hours
- **Root Cause**: Node.js single-threaded architecture with synchronous file loading

### Why It's Stuck

```
┌─────────────────────────────────────────────────────────────────────┐
│                    CURRENT BOTTLENECK FLOW                          │
│                                                                     │
│  CSV File (870MB)                                                   │
│       ↓                                                             │
│  readFileSync() ─────────────► BLOCKS EVENT LOOP (minutes)          │
│       ↓                                                             │
│  Papa.parse() (sync) ─────────► ALL 142K rows into memory          │
│       ↓                                                             │
│  FOR LOOP ──────────────────────────────────────────────────────┐   │
│       │                                                          │   │
│       ↓ (row by row)                                            │   │
│  INSERT INTO table VALUES ($1,$2,$3...) ◄── NETWORK ROUNDTRIP   │   │
│       ↓                                                          │   │
│  Wait for response                                               │   │
│       ↓                                                          │   │
│  REPEAT 142,678 times ──────────────────────────────────────────┘   │
│                                                                     │
│  Estimated time: 142,678 rows × 20ms/row = 47+ HOURS               │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 2. Current Architecture

### 2.1 Document Transform Flow (Node.js)

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Frontend  │────►│   GraphQL   │────►│ Document    │────►│ PostgreSQL  │
│   React     │     │   Mutation  │     │ Transform   │     │  Database   │
│             │◄────│             │◄────│ Service     │◄────│             │
└─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘
      │                                       │
      │         WebSocket Progress            │
      ◄───────────────────────────────────────┘
              (via Redis pub/sub)
```

### 2.2 Current Components

| Component | Technology | Role | Issue |
|-----------|------------|------|-------|
| Frontend | React + Next.js | UI, file upload | N/A |
| GraphQL | Apollo Server | API mutations | Fine for small data |
| DocumentTransformService | Node.js | File parsing, insert | **BOTTLENECK** |
| TableCreationService | Node.js | CREATE TABLE, INSERT | Slow row-by-row |
| PostgreSQL | pg driver | Database | Waiting for rows |
| Redis | ioredis | Progress pub/sub | Working OK |

### 2.3 Code Analysis

**document-transform.service.ts** - Problem Areas:

```typescript
// PROBLEM 1: Reads entire 870MB file into memory
const fileContent = readFileSync(doc.file_path, 'utf-8');

// PROBLEM 2: Parses all 142K rows synchronously
const parseResult = Papa.parse(fileContent, {
  header: true,
  delimiter,
  skipEmptyLines: true,
});
parsedData = parseResult.data as any[];  // 142K items in array

// PROBLEM 3: Inserts row by row
for (const row of data) {
  await client.query(
    `INSERT INTO ${tableName} (${columnNames}) VALUES (${placeholders})`,
    values
  );
}
```

**Performance Numbers (Estimated)**:
| Operation | Time per Unit | Total Time |
|-----------|---------------|------------|
| readFileSync(870MB) | 30-60 seconds | 60 sec |
| Papa.parse(142K rows) | 10-20 seconds | 20 sec |
| 142K individual INSERTs | 20ms/row | **47+ hours** |

---

## 3. pgai Integration Status

### What is pgai?
pgai is a PostgreSQL extension that enables automatic embedding generation directly in the database.

### Current Implementation
```
backend/src/services/pgai-migration.service.ts
backend/python-services/services/pgai_service.py
backend/python-services/routers/pgai_router.py
```

### pgai is used for:
- Automatic vector embedding generation
- Vectorizer management (pgai.vectorizers table)
- Integration with pgvectorscale for optimized search

### pgai is NOT used for:
- Bulk CSV import (this is the problem)
- Document transformation
- Large file processing

### Current pgai Status Check:
```sql
-- Check if pgai is installed
SELECT EXISTS (
  SELECT 1 FROM pg_extension WHERE extname = 'pgai'
) as installed;

-- Check vectorizers
SELECT id, implementation, config
FROM pgai.vectorizers
WHERE active = true;
```

---

## 4. GraphQL Usage

### Current Queries/Mutations

```graphql
# Upload document
mutation UploadDocument($file: Upload!, $filename: String!) {
  uploadDocument(file: $file, filename: $filename) {
    id, filename, rowCount, columnHeaders
  }
}

# Transform documents to source DB
mutation TransformDocumentsToSourceDb(
  $documentIds: [ID!]!
  $sourceDbId: String!
  $tableName: String
  $batchSize: Int
) {
  transformDocumentsToSourceDb(
    documentIds: $documentIds
    sourceDbId: $sourceDbId
    tableName: $tableName
    batchSize: $batchSize
  ) {
    jobId, status, message
  }
}

# Get transform progress
query GetTransformProgress($jobId: ID!) {
  transformProgress(jobId: $jobId) {
    status, progress, rowsProcessed, totalRows
  }
}

# WebSocket subscription
subscription TransformProgressUpdates($jobId: ID!) {
  transformProgressUpdates(jobId: $jobId) {
    status, progress, rowsProcessed, totalRows
  }
}
```

### GraphQL is fine for:
- Small mutations (upload metadata, start job)
- Progress queries
- WebSocket subscriptions

### GraphQL is NOT suitable for:
- Bulk data transfer (use direct file path)
- Large file streaming (use REST multipart)

---

## 5. Proposed Solution: Python CSV Transform Worker

### 5.1 Why Python?

| Feature | Node.js | Python | Winner |
|---------|---------|--------|--------|
| CSV streaming | Limited | pandas/polars chunked | **Python** |
| Memory efficiency | JS heap limits | Native memory mgmt | **Python** |
| PostgreSQL COPY | No native support | psycopg3 copy_from | **Python** |
| Parallel processing | Worker threads | multiprocessing | **Python** |
| Data processing libs | Limited | pandas, polars, dask | **Python** |

### 5.2 Proposed Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                    NEW ARCHITECTURE                                  │
│                                                                     │
│  ┌──────────┐   GraphQL    ┌──────────┐   REST    ┌──────────────┐  │
│  │ Frontend │─────────────►│ Node.js  │─────────►│ Python       │  │
│  │ React    │              │ Backend  │          │ CSV Worker   │  │
│  └──────────┘              └──────────┘          └──────┬───────┘  │
│       │                          │                       │          │
│       │                          │                       │          │
│       │                    Redis │                       │ COPY     │
│       │◄─────────────────────────┘                       │          │
│       │   WebSocket Progress                             ▼          │
│       │                                           ┌──────────────┐  │
│       │                                           │ PostgreSQL   │  │
│       └──────────────────────────────────────────►│              │  │
│                                                   └──────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

### 5.3 Python CSV Worker Implementation

```python
# backend/python-services/services/csv_transform_worker.py

import polars as pl
import psycopg
from psycopg import sql
import redis
import json
from io import StringIO

class CSVTransformWorker:
    def __init__(self, redis_client, db_config):
        self.redis = redis_client
        self.db_config = db_config

    async def transform_csv(
        self,
        job_id: str,
        file_path: str,
        table_name: str,
        batch_size: int = 50000
    ):
        """
        Transform CSV to PostgreSQL using COPY command
        870MB file: ~2-3 minutes instead of 47 hours
        """

        # 1. Stream CSV in chunks (never loads entire file)
        reader = pl.read_csv_batched(
            file_path,
            batch_size=batch_size,
            encoding="utf8",
            ignore_errors=True
        )

        total_rows = 0
        processed_rows = 0

        # Count total rows (streaming)
        for batch in reader:
            total_rows += len(batch)

        # Reset reader
        reader = pl.read_csv_batched(file_path, batch_size=batch_size)

        # 2. Connect to PostgreSQL
        async with await psycopg.AsyncConnection.connect(
            self.db_config,
            autocommit=False
        ) as conn:
            async with conn.cursor() as cur:

                for batch_num, batch in enumerate(reader):
                    # 3. Convert to CSV buffer for COPY
                    csv_buffer = StringIO()
                    batch.write_csv(csv_buffer)
                    csv_buffer.seek(0)

                    # 4. Use PostgreSQL COPY (100-1000x faster)
                    async with cur.copy(
                        f"COPY {table_name} FROM STDIN WITH CSV HEADER"
                    ) as copy:
                        while data := csv_buffer.read(8192):
                            await copy.write(data)

                    processed_rows += len(batch)

                    # 5. Update progress via Redis
                    progress = {
                        "job_id": job_id,
                        "status": "processing",
                        "progress": (processed_rows / total_rows) * 100,
                        "rows_processed": processed_rows,
                        "total_rows": total_rows,
                        "current_batch": batch_num + 1
                    }
                    self.redis.publish(
                        f"document_transform_progress:{job_id}",
                        json.dumps(progress)
                    )

                await conn.commit()

        return {
            "status": "completed",
            "rows_inserted": processed_rows
        }
```

### 5.4 Performance Comparison

| Method | 870MB CSV (142K rows) | Memory Usage |
|--------|----------------------|--------------|
| Current (row-by-row INSERT) | **47+ hours** | 2-4 GB |
| Batch INSERT (1000 rows) | 30-60 min | 1-2 GB |
| PostgreSQL COPY (Python) | **2-3 min** | 100-200 MB |
| PostgreSQL COPY + Parallel | **< 1 min** | 200-400 MB |

---

## 6. Implementation Plan

### Phase 1: Immediate Fix (Python CSV Worker)

```bash
# New files to create
backend/python-services/
├── services/
│   └── csv_transform_worker.py
├── routers/
│   └── csv_transform_router.py
└── models/
    └── transform_models.py
```

**API Endpoints**:
```python
POST /api/python/csv/transform
{
    "file_path": "/path/to/file.csv",
    "table_name": "danistaykararlari",
    "database": "vergilex_db",
    "job_id": "transform_xxx"
}

GET /api/python/csv/progress/{job_id}
```

### Phase 2: Node.js Integration

```typescript
// backend/src/services/document-transform.service.ts

// Replace current implementation
async transformDocumentsToSourceDb(options: TransformOptions) {
    // For large files (>10MB), delegate to Python worker
    if (doc.file_size > 10_000_000) {
        return await pythonService.transformCSV({
            filePath: doc.file_path,
            tableName: finalTableName,
            database: sourceDbId,
            jobId
        });
    }

    // Small files can use existing Node.js implementation
    return await this.processTransformationBatch(jobId, options);
}
```

### Phase 3: pgai Integration (Post-Import)

After CSV is imported, trigger pgai vectorization:

```sql
-- Create vectorizer for imported table
SELECT pgai.create_vectorizer(
    'danistaykararlari',
    destination_table => 'danistaykararlari_embeddings',
    source_columns => ARRAY['konu', 'icerik'],
    embedding_model => 'openai/text-embedding-3-small'
);
```

---

## 7. Decision Matrix

### Do We Need Python Microservice for CSV Transform?

| Factor | Score (1-5) | Notes |
|--------|-------------|-------|
| Performance gain | **5** | 100-1000x faster |
| Memory efficiency | **5** | Streaming vs full load |
| Development effort | **3** | ~2-3 days |
| Maintenance cost | **2** | Adds complexity |
| Alternative exists? | **1** | No good Node.js alternative |
| **Total** | **16/25** | **YES, IMPLEMENT** |

### Recommendation: **IMPLEMENT PYTHON CSV WORKER**

---

## 8. Quick Win: Temporary Fix

While developing Python worker, we can apply a quick fix to Node.js:

```typescript
// Use pg COPY via raw SQL
const copyCommand = `
    COPY ${tableName} (${columnNames.join(',')})
    FROM '${filePath}'
    WITH (FORMAT csv, HEADER true, DELIMITER ',')
`;
await client.query(copyCommand);
```

**Limitations**:
- File must be accessible from PostgreSQL server
- Less control over progress reporting
- No streaming (still loads entire file on DB side)

---

## 9. Summary

### Current State
- Node.js cannot efficiently handle large CSV files
- 870MB file taking hours (should take minutes)
- Memory and CPU bottlenecks in single-threaded architecture

### Proposed Solution
1. **Immediate**: Python CSV Transform Worker with psycopg3 COPY
2. **Integration**: REST endpoint called from Node.js for large files
3. **Progress**: Redis pub/sub for real-time updates
4. **Post-Import**: pgai for automatic embeddings

### Expected Outcome
- 870MB CSV: 47 hours → **2-3 minutes**
- Memory: 2-4 GB → **100-200 MB**
- User experience: Stuck at 0% → **Smooth progress bar**

---

## 10. Implementation Status

### Completed Tasks
- [x] Architecture approved
- [x] Created `csv_transform_service.py` - PostgreSQL COPY based worker
- [x] Created `csv_transform_router.py` - FastAPI REST endpoints
- [x] Created `transform_models.py` - Pydantic models
- [x] Updated `main.py` to include new router
- [x] Added CSV transform methods to `python-integration.service.ts`
- [x] Updated `document-transform.service.ts` to delegate large files (>10MB)

### Pending Tasks
- [ ] Test with 870MB CSV
- [ ] Deploy to production
- [ ] Add pgai post-import vectorization

---

## 11. Files Created/Modified

### New Files
| File | Description |
|------|-------------|
| `backend/python-services/services/csv_transform_service.py` | PostgreSQL COPY based CSV worker |
| `backend/python-services/routers/csv_transform_router.py` | FastAPI REST endpoints |
| `backend/python-services/models/transform_models.py` | Pydantic request/response models |
| `backend/python-services/models/__init__.py` | Models package init |

### Modified Files
| File | Changes |
|------|---------|
| `backend/python-services/main.py` | Added csv_transform_router |
| `backend/python-services/routers/__init__.py` | Exported csv_transform_router |
| `backend/python-services/requirements.txt` | Added polars |
| `backend/src/services/python-integration.service.ts` | Added CSV transform methods |
| `backend/src/services/document-transform.service.ts` | Large file delegation to Python |

---

## 12. API Reference

### POST /api/python/csv/transform
Start CSV transformation job.

**Request:**
```json
{
  "file_path": "/path/to/file.csv",
  "table_name": "target_table",
  "database_url": "postgresql://user:pass@host:port/db",
  "job_id": "transform_xxx",
  "batch_size": 50000,
  "delimiter": ",",
  "encoding": "utf-8"
}
```

**Response:**
```json
{
  "job_id": "transform_xxx",
  "status": "processing",
  "message": "Transform job started",
  "estimated_rows": 142678
}
```

### GET /api/python/csv/progress/{job_id}
Get job progress.

**Response:**
```json
{
  "job_id": "transform_xxx",
  "status": "processing",
  "progress": 45.5,
  "rows_processed": 65000,
  "total_rows": 142678,
  "rows_per_second": 25000,
  "estimated_remaining_seconds": 3
}
```

### POST /api/python/csv/cancel/{job_id}
Cancel running job.

---

**Author**: Claude Code Analysis
**Version**: 2.0
**Last Updated**: 2025-12-11
**Status**: IMPLEMENTED - Ready for testing
