# Advanced Scraper Database Schema

## Tables Created

### 1. advanced_scraping_projects
```sql
CREATE TABLE advanced_scraping_projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    category TEXT,
    auto_process BOOLEAN DEFAULT true,
    auto_embeddings BOOLEAN DEFAULT true,
    real_time BOOLEAN DEFAULT true,
    status TEXT DEFAULT 'active',
    stats JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### 2. advanced_site_configurations
```sql
CREATE TABLE advanced_site_configurations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    base_url TEXT NOT NULL,
    type TEXT NOT NULL, -- 'wiki', 'news', 'ecommerce', 'blog', 'forum', 'custom'
    category TEXT,
    selectors JSONB DEFAULT '{}', -- CSS selectors for content extraction
    auth_config JSONB DEFAULT '{}', -- Authentication configuration
    rate_limit INTEGER DEFAULT 10, -- Requests per minute
    pagination_config JSONB DEFAULT '{}', -- Pagination settings
    filters JSONB DEFAULT '{}', -- Content filters
    transforms JSONB DEFAULT '{}', -- Content transformations
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### 3. advanced_scraped_content
```sql
CREATE TABLE advanced_scraped_content (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES advanced_scraping_projects(id),
    site_id UUID REFERENCES advanced_site_configurations(id),
    url TEXT NOT NULL,
    title TEXT,
    content TEXT,
    category TEXT,
    metadata JSONB DEFAULT '{}',
    processed BOOLEAN DEFAULT false,
    embedding_generated BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

## Indexes

```sql
-- Performance indexes
CREATE INDEX idx_advanced_scraped_content_category ON advanced_scraped_content(category);
CREATE INDEX idx_advanced_scraped_content_project ON advanced_scraped_content(project_id);
CREATE INDEX idx_advanced_scraped_content_url ON advanced_scraped_content(url);
CREATE INDEX idx_advanced_scraped_content_processed ON advanced_scraped_content(processed);
```

## Example Data Structure

### Project Example
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "name": "Pinokyo Analysis",
  "description": "Comprehensive scraping of Pinocchio related content",
  "category": "pinokyo",
  "auto_process": true,
  "auto_embeddings": true,
  "real_time": true,
  "status": "active",
  "stats": {
    "sites": 3,
    "items": 150,
    "processed": 120
  }
}
```

### Site Configuration Example
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440001",
  "name": "Wikipedia - Pinocchio",
  "base_url": "https://en.wikipedia.org/wiki/Pinocchio",
  "type": "wiki",
  "category": "pinokyo",
  "selectors": {
    "content": "#mw-content-text",
    "title": "#firstHeading",
    "description": ".mw-parser-output > p:first-child",
    "links": "#mw-content-text a",
    "wait": "#mw-content-text"
  },
  "auth": {
    "type": "none"
  },
  "rate_limit": 5,
  "pagination": {},
  "filters": {
    "min_length": 100
  },
  "transforms": {
    "clean_html": true,
    "extract_metadata": true
  },
  "active": true
}
```

### Scraped Content Example
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440002",
  "project_id": "550e8400-e29b-41d4-a716-446655440000",
  "site_id": "550e8400-e29b-41d4-a716-446655440001",
  "url": "https://en.wikipedia.org/wiki/Pinocchio",
  "title": "Pinocchio - Wikipedia",
  "content": "Pinocchio is a fictional character...",
  "category": "pinokyo",
  "metadata": {
    "scrapingMethod": "crawl4ai-advanced",
    "projectId": "550e8400-e29b-41d4-a716-446655440000",
    "scrapedAt": "2025-10-13T14:00:00.000Z",
    "siteType": "wiki",
    "contentLength": 5000
  },
  "processed": false,
  "embedding_generated": false
}
```

## API Endpoints

### Projects
- `GET /api/v2/advanced-scraper/projects` - List all projects
- `POST /api/v2/advanced-scraper/projects` - Create new project

### Site Configurations
- `GET /api/v2/advanced-scraper/configs` - List site configurations
- `POST /api/v2/advanced-scraper/configs` - Create site configuration

### Scraping
- `POST /api/v2/advanced-scraper/start` - Start scraping job
- `GET /api/v2/advanced-scraper/job/:jobId` - Get job status
- `POST /api/v2/advanced-scraper/job/:jobId/cancel` - Cancel job
- `GET /api/v2/advanced-scraper/export/:projectId` - Export scraped data

### Tables
- `POST /api/v2/advanced-scraper/init-tables` - Initialize database tables

## Redis Keys Used

### Job Tracking
- `scraping_job:{jobId}` - Job data and progress
- `scraping_jobs_queue` - Queue of pending jobs

### LLM Processing
- `llm_processing_queue` - Queue for LLM processing

## Real-time Events (Socket.IO)

### Client to Server
- Connect to `http://localhost:8083`

### Server to Client Events
- `scraping-progress` - Progress updates
  ```json
  {
    "jobId": "scrape_123",
    "progress": {
      "total": 5,
      "completed": 2,
      "current": "Wikipedia",
      "items": 45,
      "elapsed": "02:15"
    }
  }
  ```

- `scraping-complete` - Scraping finished
  ```json
  {
    "jobId": "scrape_123",
    "results": [...],
    "stats": {...}
  }
  ```

- `scraping-error` - Error occurred
  ```json
  {
    "jobId": "scrape_123",
    "error": "Site blocked"
  }
  ```

## Frontend URL
**Correct URL:** `http://localhost:3002/dashboard/scraper`

This is a Next.js page located at:
- File: `frontend/src/app/scraper/page.tsx`
- Access via dashboard navigation