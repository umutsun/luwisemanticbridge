# Alice Semantic Bridge - Professional Deployment Guide

## Architecture Overview

### Production Environment
- **Frontend**: Docker container (Next.js) - Port 443
- **Backend API**: Docker container (Node.js/Express) - Internal Port 3000
- **Database**: PostgreSQL with pgvector (Docker) - Port 5432
- **Cache**: Redis (Docker) - Port 6379
- **Proxy**: Nginx (Docker) - Ports 80/443
- **Workflows**: n8n (Docker) - Port 5678
- **Monitoring**: Grafana (Optional) - Port 3030

### Development Environment
- **Frontend**: Docker container (Next.js dev mode) - Port 3000
- **Backend API**: Docker container (Node.js dev mode) - Port 8083
- **Database**: PostgreSQL with pgvector (Docker) - Port 5432
- **Cache**: Redis (Docker) - Port 6379
- **Dev Tools**: Adminer, Redis Commander (Optional)

## Quick Start

### Development Environment

```bash
# 1. Setup environment
cp .env.asemb.example .env.asemb
# Edit .env.asemb with your configuration

# 2. Start development services
docker compose --env-file ./.env.asemb -f docker-compose.dev.yml up --build

# 3. Start with optional services
docker compose --env-file ./.env.asemb -f docker-compose.dev.yml --profile with-n8n --profile dev-tools up --build

# 4. Use deployment scripts
chmod +x scripts/deploy-dev.sh
./scripts/deploy-dev.sh
```

### Production Environment

```bash
# 1. Setup SSL certificates
mkdir -p ssl
# Add your SSL certificates: cert.pem, key.pem, chain.pem

# 2. Start production services
docker compose --env-file ./.env.asemb -f docker-compose.prod.yml up -d

# 3. Start with optional services
docker compose --env-file ./.env.asemb -f docker-compose.prod.yml --profile with-n8n up -d

# 4. Use deployment scripts
chmod +x scripts/deploy-prod.sh
./scripts/deploy-prod.sh
```

### Local Development (without Docker)

```bash
# PM2-based local development
npm install -g pm2
npm run dev

# Or manual development
cd api && npm run dev
cd frontend && npm run dev
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