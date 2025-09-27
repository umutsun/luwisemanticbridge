# ASEM Deployment Guide

## Architecture Overview

### Production (CentOS Server)
- **Frontend**: Docker container (Next.js)
- **Backend API**: Docker container (Node.js/Express)
- **Database**: PostgreSQL with pgvector (Docker)
- **Cache**: Redis (Docker)
- **Proxy**: Nginx (Docker)
- **Workflows**: n8n (Docker)

### Development (Windows Local)
- **Frontend**: Local Next.js dev server
- **Backend API**: Local Node.js server
- **Database**: Docker containers (PostgreSQL + Redis)

## Quick Commands

### Development (Windows)
```bash
# Option 1: Quick start with databases in Docker
scripts\local-dev.bat

# Option 2: No Docker required (uses remote DB)
scripts\dev-no-docker.bat

# Option 3: Test production config locally
scripts\prod-test.bat
```

### Production (CentOS)
```bash
# Update and deploy
git pull origin main
docker-compose -f docker-compose.prod.yml down
docker-compose -f docker-compose.prod.yml --env-file .env.asemb up -d --build

# Check logs
docker-compose -f docker-compose.prod.yml logs -f [service]
```

## Service Ports

### Production
- Main Application: https://asemb.luwi.dev
- API: https://asemb.luwi.dev/api/*
- n8n: https://asemb.luwi.dev:5678
- Grafana: http://asemb.luwi.dev:3030

### Development
- Frontend: http://localhost:3000
- API: http://localhost:8083
- Database: localhost:5432
- Redis: localhost:6379

## Environment Variables

### Production (.env.asemb)
```
POSTGRES_USER=asemb_user
POSTGRES_PASSWORD=Semsiye!22
POSTGRES_DB=asemb
REDIS_PASSWORD=Semsiye!22
# ... all API keys
```

### Development (.env)
```
# Uses local database or remote
DATABASE_URL=postgresql://asemb_user:Semsiye!22@localhost:5432/asemb
# ... API keys
```

## Troubleshooting

### Common Issues

1. **Frontend build fails**
   - Check if jsconfig.json exists
   - Ensure all dependencies are installed
   - Check Next.js config for standalone output

2. **Database connection issues**
   - Verify Docker containers are running
   - Check connection strings in config.json
   - Ensure correct credentials

3. **API not reachable**
   - Check if API container is healthy
   - Verify Nginx configuration
   - Check network connectivity between containers

### Health Checks

```bash
# Production
curl https://asemb.luwi.dev/health

# Container health
docker ps
docker inspect asemb-frontend
docker inspect asemb-api
```

## Backup and Recovery

### Database Backup
```bash
# Automated backup runs daily
# Manual backup:
docker exec asemb-postgres pg_dump -U asemb_user asemb > backup.sql
```

### Recovery
```bash
# Restore from backup
docker exec -i asemb-postgres psql -U asemb_user asemb < backup.sql
```