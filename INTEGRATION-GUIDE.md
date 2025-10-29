# LSEMB Integration Guide

## Python Microservices & AI Integrations

### Overview

LSEMB now includes Python microservices for advanced AI capabilities:
- **Crawl4AI**: AI-powered web scraping
- **pgai**: Automatic embedding management
- **pgvectorscale**: Performance optimization

### Architecture

```
Frontend (Next.js :3002)
    ↓
Backend Gateway (Node.js :8083)
    ↓
Python Services (FastAPI :8001)
    ├── Crawl4AI (AI Scraping)
    ├── pgai (Auto Embeddings)
    └── pgvectorscale (Performance)
    ↓
PostgreSQL + pgvector
```

## Quick Start

### 1. Start Backend Services

```bash
# Terminal 1 - Node.js Backend
cd backend
npm install
npm run dev
```

### 2. Start Python Services

```bash
# Terminal 2 - Python Services
cd backend/python-services

# First time setup
python -m venv venv
venv\Scripts\activate  # Windows
# or
source venv/bin/activate  # Linux/Mac

# Install dependencies (minimal for testing)
pip install fastapi uvicorn asyncpg redis python-dotenv loguru psutil aiohttp

# Start service
python main.py
```

### 3. Start Frontend

```bash
# Terminal 3 - Frontend
cd frontend
npm install
npm run dev
```

### 4. Access Services

- **Frontend**: http://localhost:3002
- **Node.js API**: http://localhost:8083
- **Python API**: http://localhost:8001
- **Python API Docs**: http://localhost:8001/docs

## Using the Integration Dashboard

### Navigate to Integrations

1. Login to the dashboard as admin
2. Go to **Integrations** from the sidebar menu
3. You'll see the service management dashboard

### Service Management

#### View Service Status
- Green check: Service running
- Red X: Service stopped
- Yellow warning: Service error
- Spinner: Service starting/stopping

#### Start/Stop Services
- Click **Start** to launch Python services
- Click **Stop** to terminate services
- Click **Restart** to restart services

#### Configure Services

##### Crawl4AI Tab
- Enable/disable Crawl4AI
- Configure LLM model (gpt-4, claude, etc.)
- Set max workers and timeout
- Test scraping functionality

##### pgai Tab
- View installation status
- Create vectorizers for automatic embeddings
- Manage existing vectorizers

##### pgvectorscale Tab
- Check installation status
- Enable/disable performance optimization
- View performance metrics

## Testing the Integration

### Test Health Check

```bash
# Check Python service health
curl http://localhost:8001/health

# Check integration status
curl http://localhost:8083/api/v2/integrations/status
```

### Test Crawl4AI

```bash
# Test AI-powered scraping
curl -X POST http://localhost:8001/api/python/crawl \
  -H "Content-Type: application/json" \
  -H "X-API-Key: dev-api-key-12345" \
  -d '{
    "url": "https://example.com",
    "mode": "auto"
  }'
```

### Test from Frontend

1. Go to Integrations page
2. Navigate to Crawl4AI tab
3. Enter a URL in the test section
4. Click "Test Scraping"
5. View results in the response area

## Configuration

### Environment Variables

#### Node.js Backend (.env)
```env
# Python Service Integration
PYTHON_SERVICE_URL=http://localhost:8001
INTERNAL_API_KEY=dev-api-key-12345
```

#### Python Services (.env)
```env
# Server
PYTHON_API_HOST=0.0.0.0
PYTHON_API_PORT=8001

# Database (same as Node.js)
DATABASE_URL=postgresql://user:pass@host:5432/lsemb

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# Crawl4AI
CRAWL4AI_MAX_WORKERS=5
CRAWL4AI_TIMEOUT=30
```

## Features

### Crawl4AI Integration

- **LLM Extraction**: Extract structured data using AI prompts
- **Auto Mode**: Intelligent automatic extraction
- **Batch Processing**: Process multiple URLs
- **Fallback**: Automatically falls back to Node.js scraper if Python service is unavailable

### pgai Integration (Planned)

- **Automatic Embeddings**: No code needed for embeddings
- **Vectorizer Pipelines**: Define once, run forever
- **Background Processing**: Non-blocking embedding generation

### pgvectorscale (Planned)

- **28x Faster Search**: Dramatic performance improvement
- **75% Cost Reduction**: More efficient than specialized vector DBs
- **DiskANN Index**: Efficient disk-based indexing

## Troubleshooting

### Python Service Won't Start

1. Check Python version (3.10+ required)
```bash
python --version
```

2. Check if port 8001 is available
```bash
netstat -an | findstr 8001
```

3. Check virtual environment
```bash
# Recreate venv
rm -rf venv
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
```

### Integration Not Working

1. Check both services are running
2. Verify INTERNAL_API_KEY matches in both .env files
3. Check CORS settings allow cross-origin requests
4. Review logs in both terminals

### Database Connection Issues

1. Verify DATABASE_URL in Python .env
2. Check pgvector extension is installed
3. Test connection:
```bash
python quick_test.py
```

## Development Tips

### Adding New Python Services

1. Create service in `backend/python-services/services/`
2. Create router in `backend/python-services/routers/`
3. Register in `main.py`
4. Update Node.js integration service
5. Add UI components in frontend

### Testing Integration

```bash
# Run integration tests
cd backend/python-services
python test_integration.py
```

### Monitoring

- View logs in Integration dashboard
- Check service health endpoints
- Monitor Redis for queue status

## Production Deployment

### Using PM2

```bash
# Start all services
pm2 start ecosystem.config.js

# Monitor
pm2 monit
```

### Using Docker

```bash
# Build and run
docker-compose up -d

# Check logs
docker-compose logs -f python-services
```

### Using systemd

See deployment documentation for systemd service files.

## Security Notes

- Always use INTERNAL_API_KEY in production
- Implement rate limiting
- Use HTTPS for all services
- Rotate API keys regularly
- Monitor access logs

## Support

For issues or questions:
1. Check service logs
2. Review this documentation
3. Check API documentation at /docs endpoints
4. Contact development team

## Next Steps

1. Install full Crawl4AI library for production
2. Configure pgai worker
3. Install pgvectorscale extension
4. Set up monitoring
5. Configure production deployment