# PM2 Production Deployment Guide

---

# 🚀 PM2 Production Deployment Guide

## 📋 Overview

Alice Semantic Bridge is now equipped with a professional PM2 orchestration system for production-ready deployment.

## 🛠️ Prerequisites

### Required Software
- ✅ Node.js 16+ installed
- ✅ NPM 8+ installed
- ✅ PM2 installed globally: `npm install -g pm2`
- ✅ Git (for deployment)

### System Requirements
- **RAM**: Minimum 2GB, Recommended 4GB+
- **CPU**: 2+ cores recommended
- **Disk**: 10GB+ free space
- **OS**: Windows 10/11, Linux, or macOS

---

## 📁 Project Structure

```
alice-semantic-bridge/
├── backend/                  # Node.js/TypeScript backend
│   ├── src/
│   │   └── server.ts        # Main server entry
│   ├── .env                 # Backend environment variables
│   └── package.json
├── frontend/                # Next.js frontend
│   ├── .env.local          # Frontend environment variables
│   └── package.json
├── logs/                    # PM2 logs directory
├── ecosystem.config.js      # PM2 configuration
└── pm2-*.bat               # Management scripts
```

---

## 🎯 Quick Start

### 1️⃣ First Time Setup

```bash
# 1. Install dependencies
cd backend
npm install

cd ../frontend
npm install

# 2. Configure environment
# Copy and edit .env files
cp .env.example .env        # Backend
cp .env.local.example .env.local  # Frontend

# 3. Run pre-deployment check
cd ..
pm2-pre-deploy.bat
```

### 2️⃣ Start All Services

```bash
pm2-start-all.bat
```

This will:
- ✅ Build frontend (production)
- ✅ Start backend API (port 8083)
- ✅ Start frontend (port 3001)
- ✅ Configure auto-restart
- ✅ Setup logging
- ✅ Open browser to http://localhost:3001

### 3️⃣ Verify Deployment

```bash
pm2-health.bat
```

---

## 🎮 Management Commands

### Basic Operations

| Command | Description |
|---------|-------------|
| `pm2-start-all.bat` | Start all services |
| `pm2-stop-all.bat` | Stop all services |
| `pm2-restart.bat` | Restart all services |
| `pm2-status.bat` | Check service status |
| `pm2-health.bat` | Run health checks |

### Monitoring & Logs

| Command | Description |
|---------|-------------|
| `pm2-monitor.bat` | Open PM2 dashboard |
| `pm2-logs.bat` | Interactive log viewer |
| `pm2 logs` | View all logs (realtime) |
| `pm2 logs asb-backend` | Backend logs only |
| `pm2 logs asb-frontend` | Frontend logs only |

### Advanced Commands

```bash
# Restart specific service
pm2 restart asb-backend

# Reload with zero-downtime
pm2 reload all

# Show detailed info
pm2 describe asb-backend

# Monitor CPU/Memory
pm2 monit

# Clear all logs
pm2 flush

# Save PM2 process list
pm2 save

# Auto-start on system boot
pm2 startup
pm2 save
```

---

## ⚙️ Configuration

### Backend Configuration (ecosystem.config.js)

```javascript
{
  name: 'asb-backend',
  script: 'node_modules/.bin/ts-node',
  args: 'src/server.ts',
  instances: 1,              // Single instance
  max_memory_restart: '1G',  // Restart if exceeds 1GB
  node_args: '--max-old-space-size=2048',
}
```

### Frontend Configuration

```javascript
{
  name: 'asb-frontend',
  script: 'node_modules/.bin/next',
  args: 'start -p 3001',
  instances: 1,              // Single instance
  max_memory_restart: '1G',  // Restart if exceeds 1GB
}
```

### Environment Variables

**Backend (.env)**
```env
NODE_ENV=production
PORT=8083
DATABASE_URL=postgresql://...
REDIS_URL=redis://...
```

**Frontend (.env.local)**
```env
NEXT_PUBLIC_API_URL=http://localhost:8083
NEXT_PUBLIC_WEBSOCKET_URL=ws://localhost:8083
NEXT_PUBLIC_FRONTEND_URL=http://localhost:3001
```

---

## 🔍 Health Checks

### Automated Health Check Endpoints

- **Backend API**: `http://localhost:8083/health`
- **Frontend**: `http://localhost:3001`

### Manual Health Check

```bash
# Full system health check
pm2-health.bat

# Quick status
pm2 list

# Individual service check
curl http://localhost:8083/health
```

### Health Check Response Example

```json
{
  "status": "healthy",
  "timestamp": "2025-10-06T20:00:00Z",
  "services": {
    "database": "connected",
    "redis": "connected",
    "websocket": "available"
  },
  "uptime": "2h 45m"
}
```

---

## 📊 Monitoring & Logging

### PM2 Built-in Monitoring

```bash
# Real-time monitoring dashboard
pm2 monit

# Process list with stats
pm2 list

# Detailed process info
pm2 describe asb-backend
```

### Log Management

**Log Files Location:**
```
logs/
├── backend-out.log      # Backend stdout
├── backend-error.log    # Backend errors
├── frontend-out.log     # Frontend stdout
└── frontend-error.log   # Frontend errors
```

**Log Rotation (Recommended):**
```bash
npm install -g pm2-logrotate
pm2 install pm2-logrotate

# Configure log rotation
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 7
pm2 set pm2-logrotate:compress true
```

### Monitoring Solutions

**Option 1: PM2 Plus (Cloud)**
```bash
pm2 link <secret> <public>  # Get keys from pm2.io
```

**Option 2: Self-hosted Monitoring**
- Grafana + Prometheus
- ELK Stack (Elasticsearch, Logstash, Kibana)
- Custom dashboard with PM2 API

---

## 🚢 Deployment Strategies

### Local Production

```bash
# 1. Pre-deployment check
pm2-pre-deploy.bat

# 2. Start services
pm2-start-all.bat

# 3. Verify health
pm2-health.bat

# 4. Save PM2 config
pm2 save

# 5. Setup auto-start on boot
pm2 startup
```

### Remote Server Deployment

```bash
# Using PM2 ecosystem deploy
pm2 deploy ecosystem.config.js production setup
pm2 deploy ecosystem.config.js production

# Manual deployment
git pull origin main
npm install
pm2 reload ecosystem.config.js --env production
```

### Docker Deployment

```bash
# Build and deploy with Docker
docker-compose up -d

# With PM2 inside container
docker run -d \
  -v $(pwd):/app \
  -p 8083:8083 \
  -p 3001:3001 \
  node:16 \
  pm2-runtime start ecosystem.config.js
```

---

## 🔧 Troubleshooting

### Common Issues

**Issue 1: Services won't start**
```bash
# Check ports availability
netstat -ano | findstr "8083"
netstat -ano | findstr "3001"

# Check logs
pm2 logs --err

# Check environment
pm2 env <process-id>
```

**Issue 2: High memory usage**
```bash
# Check current memory
pm2 list

# Restart to clear memory
pm2 restart all

# Adjust max memory in ecosystem.config.js
max_memory_restart: '2G'
```

**Issue 3: Database connection fails**
```bash
# Test database connection
node backend/check-db.js

# Check environment variables
echo %DATABASE_URL%

# Review backend logs
pm2 logs asb-backend --lines 50
```

**Issue 4: Frontend build errors**
```bash
# Clear Next.js cache
cd frontend
rmdir /s /q .next

# Rebuild
npm run build

# Check for TypeScript errors
npm run lint
```

### Emergency Recovery

```bash
# Stop everything
pm2 stop all

# Delete all processes
pm2 delete all

# Clear logs
pm2 flush

# Restart fresh
pm2-start-all.bat
```

---

## 📈 Performance Optimization

### Backend Optimization

```javascript
// ecosystem.config.js
{
  instances: 4,              // Use CPU cores
  exec_mode: 'cluster',      // Cluster mode for load balancing
  max_memory_restart: '1G',
  node_args: '--max-old-space-size=2048 --optimize-for-size',
}
```

### Frontend Optimization

```bash
# Enable Next.js production optimizations
npm run build

# Use CDN for static assets
# Configure next.config.js with assetPrefix

# Enable compression
# Already configured in ecosystem.config.js
```

### Database Connection Pooling

```javascript
// Increase pool size for production
const pool = new Pool({
  max: 20,          // Maximum connections
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});
```

---

## 🔐 Security Checklist

- [ ] Change default passwords
- [ ] Enable HTTPS (reverse proxy)
- [ ] Configure CORS properly
- [ ] Set secure headers (Helmet.js)
- [ ] Use environment variables for secrets
- [ ] Enable rate limiting
- [ ] Setup firewall rules
- [ ] Regular security updates
- [ ] Backup database regularly
- [ ] Monitor for suspicious activity

---

## 📚 Additional Resources

### PM2 Documentation
- [PM2 Official Docs](https://pm2.keymetrics.io/docs/usage/quick-start/)
- [Ecosystem File Reference](https://pm2.keymetrics.io/docs/usage/application-declaration/)
- [PM2 Plus Monitoring](https://pm2.io/)

### Best Practices
- Keep PM2 updated: `npm install -g pm2@latest`
- Use environment-specific configs
- Monitor logs regularly
- Setup alerts for downtime
- Test deployment process in staging
- Document custom configurations
- Keep backups of working configs

---

## 🆘 Support

### Getting Help

1. **Check logs first**: `pm2-logs.bat`
2. **Run health check**: `pm2-health.bat`
3. **Review this guide**: Search for your issue
4. **Check PM2 docs**: https://pm2.keymetrics.io/
5. **Contact team**: support@lsemb.ai

### Reporting Issues

When reporting issues, include:
- PM2 process list: `pm2 list`
- Error logs: `pm2 logs --err --lines 100`
- System info: `pm2 info <process-name>`
- Environment details: OS, Node version, PM2 version

---

## ✅ Deployment Checklist

### Pre-Deployment
- [ ] All tests passing
- [ ] Environment variables configured
- [ ] Dependencies installed
- [ ] Database migrations run
- [ ] Frontend built successfully
- [ ] PM2 installed globally
- [ ] Pre-deploy checklist passed

### Deployment
- [ ] Code pulled from repository
- [ ] Services started with PM2
- [ ] Health checks passing
- [ ] Logs showing no errors
- [ ] All endpoints responding
- [ ] WebSocket connected

### Post-Deployment
- [ ] Monitor logs for 10 minutes
- [ ] Test critical user flows
- [ ] Check system resources
- [ ] Verify database connections
- [ ] Save PM2 configuration
- [ ] Document any issues
- [ ] Update team on status

---

**Last Updated**: 2025-10-06  
**Version**: 1.0.0  
**Maintainer**: ASB DevOps Team


---
*Generated by Alice Shell Bridge*