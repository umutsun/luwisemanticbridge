# LSEMB Python Microservices

## Overview

This is the Python microservices component of LSEMB, providing advanced AI capabilities including:
- **Crawl4AI**: AI-powered web scraping with LLM extraction
- **pgai**: Automatic embedding management (planned)
- **pgvectorscale**: Performance optimization for vector search (planned)

## Architecture

```
LSEMB Backend (Node.js)
    ↓ HTTP/REST
Python Services (FastAPI)
    ├── Crawl4AI Service
    ├── pgai Worker
    └── Health Monitoring
```

## Quick Start

### Windows
```bash
cd backend/python-services
start.bat
```

### Linux/Mac
```bash
cd backend/python-services
chmod +x start.sh
./start.sh
```

## Manual Setup

### 1. Create Virtual Environment
```bash
python -m venv venv
# Windows
venv\Scripts\activate
# Linux/Mac
source venv/bin/activate
```

### 2. Install Dependencies
```bash
pip install -r requirements.txt
```

### 3. Configure Environment
```bash
cp .env.example .env
# Edit .env and add your API keys
```

### 4. Run the Service
```bash
python main.py
```

The service will start on `http://localhost:8001`

## API Documentation

Once the service is running, visit:
- API Docs: http://localhost:8001/docs
- ReDoc: http://localhost:8001/redoc

## Key Features

### Crawl4AI Integration

#### LLM Mode
Extract structured data using AI:
```python
POST /api/python/crawl
{
  "url": "https://example.com",
  "mode": "llm",
  "extraction_prompt": "Extract the main article title and content",
  "model": "gpt-4"
}
```

#### Auto Mode
Automatic intelligent extraction:
```python
POST /api/python/crawl
{
  "url": "https://example.com",
  "mode": "auto",
  "follow_links": true,
  "max_depth": 2
}
```

#### Batch Processing
Process multiple URLs:
```python
POST /api/python/crawl/batch
{
  "urls": ["url1", "url2", "url3"],
  "mode": "auto",
  "parallel": true
}
```

### pgai Integration (Coming Soon)

Automatic embedding management:
```python
POST /api/python/pgai/vectorizer/create
{
  "name": "document_vectorizer",
  "source_table": "documents",
  "source_columns": ["title", "content"],
  "destination_table": "embeddings_auto"
}
```

## Node.js Integration

The Node.js backend communicates with Python services through the `PythonIntegrationService`:

```typescript
import { pythonService } from './services/python-integration.service';

// Use AI-powered scraping
const result = await pythonService.crawlWithAI(url, {
  mode: 'llm',
  extractionPrompt: 'Extract product information',
  model: 'gpt-4'
});

// With fallback support
const result = await pythonService.crawlWithFallback(
  url,
  options,
  existingScraperService
);
```

## Environment Variables

Key environment variables in `.env`:

```env
# Python Service
PYTHON_API_PORT=8001
ENVIRONMENT=development

# Database (same as Node.js)
DATABASE_URL=postgresql://user:pass@host:port/db

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# API Keys
OPENAI_API_KEY=your-key-here
INTERNAL_API_KEY=shared-secret-key

# Crawl4AI Settings
CRAWL4AI_MAX_WORKERS=5
CRAWL4AI_TIMEOUT=30
```

## Health Monitoring

Check service health:
```bash
curl http://localhost:8001/health
curl http://localhost:8001/health/detailed
```

## Troubleshooting

### Python Service Not Available
1. Check if Python service is running: `http://localhost:8001/health`
2. Verify `.env` configuration
3. Check logs in console output
4. Ensure all dependencies are installed

### Crawl4AI Errors
1. Verify OpenAI API key is set
2. Check network connectivity
3. Review extraction prompt syntax
4. Monitor rate limits

### Database Connection Issues
1. Verify PostgreSQL is running
2. Check connection string in `.env`
3. Ensure pgvector extension is installed
4. Verify network access to database

## Development

### Adding New Services

1. Create new router in `routers/`
2. Create service in `services/`
3. Register in `main.py`
4. Update Node.js integration service

### Testing

```bash
# Run tests
pytest

# With coverage
pytest --cov=services --cov-report=html
```

## Production Deployment

### Using Docker

```dockerfile
FROM python:3.10-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt
COPY . .
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8001"]
```

### Using PM2

```bash
pm2 start "python main.py" --name lsemb-python
```

### Using systemd

Create `/etc/systemd/system/lsemb-python.service`:
```ini
[Unit]
Description=LSEMB Python Services
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/path/to/python-services
Environment="PATH=/path/to/venv/bin"
ExecStart=/path/to/venv/bin/python main.py

[Install]
WantedBy=multi-user.target
```

## Security Notes

- Always use `INTERNAL_API_KEY` in production
- Keep API keys secure and rotate regularly
- Use HTTPS in production
- Implement rate limiting for public endpoints
- Monitor and log all API access

## Support

For issues or questions:
1. Check the logs
2. Review API documentation
3. Consult main LSEMB documentation
4. Contact the development team