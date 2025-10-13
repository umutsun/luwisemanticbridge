# LSEMB Deployment Troubleshooting

## Common Issues and Solutions

### 1. lsemb.luwi.dev Not Working

**Problem:** `lsemb.luwi.dev` domain doesn't work but `luwi.dev` works

**Solution:**
1. **DNS Configuration:** Ensure DNS records are properly configured
   - A record: `lsemb.luwi.dev` → Your server IP
   - CNAME: `www.lsemb.luwi.dev` → `lsemb.luwi.dev`

2. **Nginx Configuration:** The nginx config has been updated to properly route:
   - API requests (`/api/*`) → Backend (port 8083)
   - Frontend requests (`/*`) → Next.js (port 3000)

3. **SSL Certificate:** Ensure SSL certificate covers `lsemb.luwi.dev`

### 2. Port Conflicts

**Problem:** Services not starting due to port conflicts

**Solution:**
```bash
# Check what's using ports
netstat -ano | findstr :8083
netstat -ano | findstr :3000

# Kill conflicting processes
taskkill /PID <process_id> /F
```

### 3. Docker Container Issues

**Problem:** Containers not starting or unhealthy

**Solution:**
```bash
# Check container status
docker-compose -f docker-compose.prod.yml --env-file .env.lsemb.production ps

# View logs
docker-compose -f docker-compose.prod.yml --env-file .env.lsemb.production logs <service_name>

# Restart specific service
docker-compose -f docker-compose.prod.yml --env-file .env.lsemb.production restart <service_name>
```

### 4. Database Connection Issues

**Problem:** API can't connect to database

**Solution:**
1. Check database container is running
2. Verify connection string in `.env.lsemb.production`
3. Check network connectivity between containers

### 5. PM2 Issues (Local Development)

**Problem:** PM2 commands hanging or not working

**Solution:**
```bash
# Reset PM2 completely
pm2 kill
pm2 start ecosystem.config.js
pm2 save
```

## Deployment Commands

### Production Deployment
```bash
# Using the deployment script
./deploy-lsemb.sh prod

# Or manually
docker-compose -f docker-compose.prod.yml --env-file .env.lsemb.production up --build -d
```

### Development Deployment
```bash
# Using the deployment script
./deploy-lsemb.sh dev

# Or manually
docker-compose -f docker-compose.dev.yml --env-file .env.lsemb up --build -d
```

## Service URLs

- **Frontend:** https://lsemb.luwi.dev
- **API:** https://lsemb.luwi.dev/api
- **Health Check:** https://lsemb.luwi.dev/health
- **N8N:** https://n8n.luwi.dev

## Local Development

### Using PM2 (Recommended)
```bash
# Start all services
pm2 start ecosystem.config.js

# Check status
pm2 status

# View logs
pm2 logs

# Stop all services
pm2 stop all
```

### Using Batch Scripts
```bash
# Start services
start-local.bat

# Stop services
stop-local.bat
```

## Environment Variables

Key environment variables that need to be configured:

- `DOMAIN=lsemb.luwi.dev`
- `NEXT_PUBLIC_API_URL=https://lsemb.luwi.dev/api`
- `NEXT_PUBLIC_APP_URL=https://lsemb.luwi.dev`
- `DATABASE_URL` (PostgreSQL connection)
- `REDIS_*` (Redis configuration)
- `OPENAI_API_KEY` (AI provider)

## Health Checks

- **Frontend:** `GET /` → Should return Next.js app
- **API:** `GET /api/v1/health` → Should return `{"status":"ok"}`
- **Nginx:** `GET /health` → Should return `healthy`