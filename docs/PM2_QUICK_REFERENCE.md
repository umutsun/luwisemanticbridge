# PM2 Quick Reference Card

---

# 🎯 PM2 Quick Reference Card

## 🚀 Essential Commands

### Start/Stop/Restart
```bash
pm2 start ecosystem.config.js    # Start all services
pm2 stop all                      # Stop all services
pm2 restart all                   # Restart all services
pm2 reload all                    # Zero-downtime reload
pm2 delete all                    # Remove all processes
```

### Individual Service Control
```bash
pm2 start asb-backend            # Start backend only
pm2 stop asb-backend             # Stop backend only
pm2 restart asb-backend          # Restart backend only
pm2 reload asb-frontend          # Reload frontend (zero-downtime)
```

---

## 📊 Monitoring

### View Status
```bash
pm2 list                         # List all processes
pm2 status                       # Same as list
pm2 describe asb-backend         # Detailed info for one process
pm2 monit                        # Real-time monitoring dashboard
```

### Logs
```bash
pm2 logs                         # All logs (realtime)
pm2 logs asb-backend             # Backend logs only
pm2 logs --err                   # Error logs only
pm2 logs --lines 100             # Last 100 lines
pm2 flush                        # Clear all logs
```

---

## 🔧 Management

### Process Management
```bash
pm2 save                         # Save process list
pm2 resurrect                    # Restore saved processes
pm2 startup                      # Enable startup script
pm2 unstartup                    # Disable startup script
pm2 update                       # Update PM2
```

### Environment
```bash
pm2 restart app --env production # Start with production env
pm2 env 0                        # Show environment for process 0
pm2 reset <app-name>             # Reset restart counter
```

---

## 📈 Scaling

### Cluster Mode
```bash
pm2 start app.js -i 4            # Start 4 instances
pm2 start app.js -i max          # Use all CPU cores
pm2 scale asb-backend 4          # Scale to 4 instances
pm2 scale asb-backend +2         # Add 2 more instances
```

---

## 🔍 Debugging

### Process Information
```bash
pm2 describe asb-backend         # Full process details
pm2 show asb-backend             # Same as describe
pm2 info asb-backend             # Same as describe
```

### Performance
```bash
pm2 monit                        # CPU/Memory live monitor
pm2 list --sort memory           # Sort by memory usage
pm2 list --sort cpu              # Sort by CPU usage
```

---

## 🛠️ Custom Scripts (Windows)

### Our Management Scripts
```bash
pm2-start-all.bat               # Start all services
pm2-stop-all.bat                # Stop all services
pm2-restart.bat                 # Restart services
pm2-status.bat                  # Check status + health
pm2-health.bat                  # Full health check
pm2-logs.bat                    # Interactive log viewer
pm2-monitor.bat                 # Open PM2 dashboard
pm2-pre-deploy.bat              # Pre-deployment checklist
pm2-setup-startup.bat           # Configure auto-start
```

---

## ⚡ One-Liners

### Quick Actions
```bash
# Restart all and show logs
pm2 restart all && pm2 logs

# Stop all and clear logs
pm2 stop all && pm2 flush

# Restart and monitor
pm2 restart all && pm2 monit

# Show all error logs
pm2 logs --err --lines 50

# Kill everything and start fresh
pm2 kill && pm2 start ecosystem.config.js

# Save and setup startup
pm2 save && pm2 startup
```

---

## 🎨 Ecosystem File Snippets

### Basic App Configuration
```javascript
{
  name: 'my-app',
  script: 'app.js',
  instances: 1,
  exec_mode: 'fork',
  watch: false,
  max_memory_restart: '1G',
}
```

### Cluster Mode
```javascript
{
  name: 'my-app',
  script: 'app.js',
  instances: 'max',        // Use all CPUs
  exec_mode: 'cluster',
  max_memory_restart: '1G',
}
```

### With Environment Variables
```javascript
{
  name: 'my-app',
  script: 'app.js',
  env: {
    NODE_ENV: 'development',
    PORT: 3000,
  },
  env_production: {
    NODE_ENV: 'production',
    PORT: 80,
  },
}
```

---

## 🔐 Environment Management

### Switch Environments
```bash
pm2 restart app --env production
pm2 restart app --env staging
pm2 restart app --env development
```

### View Environment
```bash
pm2 env 0                       # Show env for process ID 0
pm2 show app-name | grep env    # Filter env variables
```

---

## 📦 Deployment

### Remote Deployment
```bash
# Setup deployment
pm2 deploy ecosystem.config.js production setup

# Deploy
pm2 deploy ecosystem.config.js production

# Deploy with custom commands
pm2 deploy ecosystem.config.js production exec "npm install"
pm2 deploy ecosystem.config.js production update
```

### Local Deployment
```bash
# Pull latest code
git pull origin main

# Install dependencies
npm install

# Reload without downtime
pm2 reload ecosystem.config.js
```

---

## 🚨 Emergency Commands

### Service Down?
```bash
# Quick diagnosis
pm2 list                        # Check process status
pm2 logs --err --lines 50       # Check recent errors
pm2 restart all                 # Restart everything

# Nuclear option
pm2 kill                        # Kill PM2 daemon
pm2 resurrect                   # Restore saved processes
```

### Memory Issues?
```bash
# Check memory usage
pm2 list

# Restart high-memory process
pm2 restart asb-backend

# Clear logs to free disk space
pm2 flush
```

### Port Conflicts?
```bash
# Find process using port (Windows)
netstat -ano | findstr :8083

# Kill process by PID
taskkill /PID <pid> /F

# Restart PM2 services
pm2 restart all
```

---

## 📱 PM2 Web Dashboard

### Setup PM2 Plus
```bash
# Link to PM2.io (cloud monitoring)
pm2 link <secret> <public>

# Unlink
pm2 unlink

# Monitor link status
pm2 info
```

---

## 🎓 Pro Tips

1. **Always save after changes**: `pm2 save`
2. **Use ecosystem file for consistency**: `pm2 start ecosystem.config.js`
3. **Monitor logs regularly**: `pm2 logs --lines 100`
4. **Setup startup script**: `pm2 startup && pm2 save`
5. **Use reload for zero-downtime**: `pm2 reload` instead of `pm2 restart`
6. **Check memory usage**: `pm2 monit` or `pm2 list`
7. **Clear logs periodically**: `pm2 flush`
8. **Test before deploying**: `pm2-pre-deploy.bat`

---

## 📞 Getting Help

```bash
pm2 --help                      # General help
pm2 start --help                # Help for specific command
pm2 examples                    # Show examples
```

---

## 🔗 Useful Links

- **PM2 Docs**: https://pm2.keymetrics.io/docs/
- **PM2 GitHub**: https://github.com/Unitech/pm2
- **PM2 Plus**: https://pm2.io/
- **Our Guide**: PM2_DEPLOYMENT_GUIDE.md

---

**Print this page and keep it handy! 📄**

*Last Updated: 2025-10-06*


---
*Generated by Alice Shell Bridge*