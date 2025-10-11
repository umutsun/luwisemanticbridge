# PM2 Management System - Overview

---

# 🚀 PM2 Management System - README

## 📖 Overview

This directory contains a complete PM2 orchestration system for Luwi Semantic Bridge, designed for production-ready deployment on both local and remote environments.

---

## 📂 Files Overview

### 🎮 Core Management Scripts

| File | Purpose | Usage |
|------|---------|-------|
| `ecosystem.config.js` | PM2 configuration file | Defines all services, environments, and deployment settings |
| `pm2-start-all.bat` | Start all services | Run this to start backend + frontend |
| `pm2-stop-all.bat` | Stop all services | Gracefully stop all running services |
| `pm2-restart.bat` | Restart services | Restart all or specific service |
| `pm2-status.bat` | Check service status | View running processes and health |

### 📊 Monitoring & Debugging

| File | Purpose | Usage |
|------|---------|-------|
| `pm2-monitor.bat` | PM2 dashboard | Real-time CPU/Memory monitoring |
| `pm2-logs.bat` | Interactive log viewer | View, filter, and manage logs |
| `pm2-health.bat` | Health check script | Comprehensive system health check |

### 🛠️ Setup & Deployment

| File | Purpose | Usage |
|------|---------|-------|
| `pm2-pre-deploy.bat` | Pre-deployment checklist | Run before deploying to production |
| `pm2-setup-startup.bat` | Auto-start configuration | Enable services to start on Windows boot |

### 📚 Documentation

| File | Purpose |
|------|---------|
| `PM2_DEPLOYMENT_GUIDE.md` | Complete deployment guide (47 pages) |
| `PM2_QUICK_REFERENCE.md` | Quick reference card for PM2 commands |
| `README.md` | This file - overview of the system |

---

## 🎯 Quick Start

### First Time Setup

```bash
# 1. Run pre-deployment check
pm2-pre-deploy.bat

# 2. Start all services
pm2-start-all.bat

# 3. Verify everything is working
pm2-health.bat
```

### Daily Operations

```bash
# Check status
pm2-status.bat

# View logs
pm2-logs.bat

# Monitor resources
pm2-monitor.bat

# Restart if needed
pm2-restart.bat
```

---

## 🌟 Key Features

### ✅ What's Included

- **Automated Service Management**: Start, stop, restart with one command
- **Health Monitoring**: Built-in health checks for all services
- **Log Management**: Centralized logging with rotation
- **Zero-Downtime Deployment**: Reload services without interruption
- **Auto-Recovery**: Automatic restart on failures
- **Memory Management**: Auto-restart if memory threshold exceeded
- **Startup Configuration**: Auto-start on system boot
- **Environment Management**: Separate dev/staging/production configs
- **Comprehensive Documentation**: Detailed guides and quick reference

### 🛡️ Production-Ready Features

- Memory leak protection (auto-restart at 1GB)
- Crash recovery (max 10 restarts)
- Request timeout handling
- Load balancing support (cluster mode)
- Log rotation
- Environment variable management
- CORS configuration
- Security headers

---

## 📋 Service Architecture

```
┌─────────────────────────────────────────┐
│         PM2 Process Manager             │
├─────────────────────────────────────────┤
│                                         │
│  ┌────────────────┐  ┌───────────────┐ │
│  │  asb-backend   │  │ asb-frontend  │ │
│  │  Port: 8083    │  │ Port: 3001    │ │
│  │  Node.js API   │  │  Next.js      │ │
│  └────────────────┘  └───────────────┘ │
│                                         │
│  ┌─────────────────────────────────┐   │
│  │      Centralized Logging        │   │
│  │  - Backend logs                 │   │
│  │  - Frontend logs                │   │
│  │  - Error tracking               │   │
│  └─────────────────────────────────┘   │
│                                         │
│  ┌─────────────────────────────────┐   │
│  │      Health Monitoring          │   │
│  │  - Uptime tracking              │   │
│  │  - Memory usage                 │   │
│  │  - CPU monitoring               │   │
│  └─────────────────────────────────┘   │
└─────────────────────────────────────────┘
```

---

## 🎨 Workflow Examples

### Scenario 1: Starting Fresh

```bash
# Clean slate
pm2 delete all
pm2 flush

# Start services
pm2-start-all.bat

# Verify
pm2-status.bat
```

### Scenario 2: Code Update

```bash
# Pull latest code
git pull origin main

# Install dependencies
cd backend && npm install
cd ../frontend && npm install

# Rebuild frontend
cd frontend && npm run build

# Reload services (zero downtime)
pm2 reload all

# Check logs
pm2 logs --lines 50
```

### Scenario 3: Troubleshooting

```bash
# Check what's wrong
pm2-health.bat

# View error logs
pm2 logs --err --lines 100

# Restart problematic service
pm2 restart asb-backend

# Monitor recovery
pm2 monit
```

### Scenario 4: Production Deployment

```bash
# Pre-flight checks
pm2-pre-deploy.bat

# Deploy
pm2-start-all.bat

# Monitor for 10 minutes
pm2 logs

# Save configuration
pm2 save

# Setup auto-start
pm2-setup-startup.bat
```

---

## 🔍 Monitoring Guide

### What to Monitor

**Critical Metrics:**
- ✅ Service uptime
- ✅ Response time
- ✅ Error rate
- ✅ Memory usage
- ✅ CPU usage

**How to Monitor:**

```bash
# Real-time dashboard
pm2 monit

# Process list with stats
pm2 list

# Detailed service info
pm2 describe asb-backend

# Health endpoint
curl http://localhost:8083/health
```

### Setting Up Alerts

**Option 1: PM2 Plus (Recommended)**
```bash
pm2 link <secret> <public>
# Get keys from pm2.io
```

**Option 2: Email Alerts**
```bash
npm install pm2-email
pm2 install pm2-email
pm2 set pm2-email:from your@email.com
pm2 set pm2-email:to admin@company.com
```

**Option 3: Slack Integration**
```bash
npm install pm2-slack
pm2 install pm2-slack
pm2 set pm2-slack:slack_url https://hooks.slack.com/...
```

---

## 🔧 Configuration Guide

### Environment Variables

**Required Variables:**

Backend (.env):
```env
NODE_ENV=production
PORT=8083
DATABASE_URL=postgresql://...
REDIS_URL=redis://...
CLAUDE_API_KEY=sk-...
OPENAI_API_KEY=sk-...
```

Frontend (.env.local):
```env
NEXT_PUBLIC_API_URL=http://localhost:8083
NEXT_PUBLIC_WEBSOCKET_URL=ws://localhost:8083
```

### Customizing ecosystem.config.js

**Change port:**
```javascript
env: {
  PORT: 9000,  // Change from 8083
}
```

**Add more memory:**
```javascript
max_memory_restart: '2G',  // Change from 1G
```

**Enable cluster mode:**
```javascript
instances: 'max',       // Use all CPU cores
exec_mode: 'cluster',
```

**Add watch mode (development):**
```javascript
watch: true,
ignore_watch: ['node_modules', 'logs'],
```

---

## 🚨 Troubleshooting

### Common Issues

**Issue 1: Services won't start**
```bash
# Check if ports are in use
netstat -ano | findstr "8083"
netstat -ano | findstr "3001"

# Check PM2 daemon
pm2 ping

# Restart PM2
pm2 kill
pm2 resurrect
```

**Issue 2: Out of memory**
```bash
# Check memory usage
pm2 list

# Increase memory limit in ecosystem.config.js
max_memory_restart: '2G'

# Restart
pm2 reload all
```

**Issue 3: Can't access logs**
```bash
# Check log file permissions
dir logs\

# Clear logs
pm2 flush

# View logs directly
type logs\backend-out.log
```

**Issue 4: Auto-start not working**
```bash
# Reinstall startup script
pm2 unstartup
pm2 startup
pm2 save
```

---

## 🎓 Best Practices

### Development
- Use `npm run dev` for hot reload
- Use PM2 only for testing production setup
- Keep separate `.env.development` files

### Production
- Always run `pm2-pre-deploy.bat` before deployment
- Use `pm2 reload` instead of `pm2 restart` for zero-downtime
- Enable log rotation
- Setup monitoring alerts
- Regular backups of PM2 process list: `pm2 save`
- Monitor memory and CPU usage
- Keep PM2 updated: `npm install -g pm2@latest`

### Security
- Never commit `.env` files to git
- Use strong secrets for JWT
- Enable HTTPS in production
- Configure firewall rules
- Regular security updates
- Limit SSH access
- Use non-root user for PM2

---

## 📊 Performance Tips

### Backend Optimization
```javascript
// Enable cluster mode for better CPU utilization
instances: 'max',
exec_mode: 'cluster',

// Optimize Node.js memory
node_args: '--max-old-space-size=2048 --optimize-for-size',
```

### Frontend Optimization
```bash
# Build for production
npm run build

# Use static export if possible
next export
```

### Database Optimization
- Use connection pooling
- Index frequently queried fields
- Enable query caching
- Regular vacuum and analyze

---

## 🔗 Useful Resources

### Official Documentation
- **PM2 Docs**: https://pm2.keymetrics.io/docs/
- **PM2 GitHub**: https://github.com/Unitech/pm2
- **PM2 Plus**: https://pm2.io/

### Our Documentation
- `PM2_DEPLOYMENT_GUIDE.md` - Comprehensive guide
- `PM2_QUICK_REFERENCE.md` - Command cheat sheet
- `WEBSOCKET_FIX.md` - WebSocket configuration

### Community
- PM2 Gitter: https://gitter.im/Unitech/pm2
- Stack Overflow: [pm2] tag
- PM2 Discord: https://discord.gg/pm2

---

## 📞 Support

### Getting Help

1. **Check this README first**
2. **Read the deployment guide**: `PM2_DEPLOYMENT_GUIDE.md`
3. **Check logs**: `pm2-logs.bat`
4. **Run health check**: `pm2-health.bat`
5. **Search PM2 docs**: https://pm2.keymetrics.io/
6. **Contact DevOps team**: devops@asemb.ai

### Reporting Issues

When reporting issues, include:
```bash
# System information
pm2 list
pm2 describe asb-backend
node --version
npm --version

# Logs
pm2 logs --err --lines 100 > error-report.txt

# Environment
pm2 env 0
```

---

## ✅ Maintenance Checklist

### Daily
- [ ] Check service status: `pm2-status.bat`
- [ ] Review error logs: `pm2 logs --err`
- [ ] Monitor resource usage: `pm2 list`

### Weekly
- [ ] Run health check: `pm2-health.bat`
- [ ] Clear old logs: `pm2 flush`
- [ ] Check for updates: `npm outdated`
- [ ] Review monitoring alerts

### Monthly
- [ ] Update dependencies: `npm update`
- [ ] Update PM2: `npm install -g pm2@latest`
- [ ] Review and optimize configuration
- [ ] Backup process list: `pm2 save`
- [ ] Security audit: `npm audit`

---

## 🎉 Success Indicators

You know the system is working well when:
- ✅ All services show "online" in `pm2 list`
- ✅ Health check passes: `pm2-health.bat`
- ✅ No errors in logs: `pm2 logs --err`
- ✅ Memory usage stable under 80%
- ✅ Response time under 200ms
- ✅ Zero unplanned restarts
- ✅ Uptime > 99.9%

---

**Version**: 1.0.0  
**Last Updated**: 2025-10-06  
**Maintainer**: ASB DevOps Team  
**License**: MIT


---
*Generated by Alice Shell Bridge*