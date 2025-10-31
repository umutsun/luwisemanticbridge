# LSEMB PM2 Management Guide

## Quick Start (Windows)

### Starting All Services
```bash
.\start-pm2.bat
```
or
```bash
pm2 start ecosystem.config.js
```

### Stopping All Services
```bash
.\stop-pm2.bat
```
or
```bash
pm2 stop all
```

### Viewing Logs
```bash
.\logs-pm2.bat
```
or
```bash
pm2 logs
```

## Services Overview

The LSEMB project consists of 3 main services:

1. **lsemb-backend** (Port 8083)
   - Node.js/TypeScript API server
   - GraphQL + REST endpoints
   - Database operations

2. **lsemb-frontend** (Port 3002)
   - Next.js 14 application
   - Server-side rendering
   - User interface

3. **lsemb-python** (Port 8001)
   - Python FastAPI services
   - Crawl4AI web scraping
   - Whisper transcription
   - pgai embeddings

## PM2 Commands

### Process Management
```bash
pm2 list                    # List all processes
pm2 start ecosystem.config.js  # Start all services
pm2 stop all                # Stop all services
pm2 restart all             # Restart all services
pm2 delete all              # Delete all processes

# Individual service control
pm2 start lsemb-backend
pm2 stop lsemb-frontend
pm2 restart lsemb-python
```

### Monitoring
```bash
pm2 monit                   # Real-time monitoring dashboard
pm2 logs                    # View all logs
pm2 logs lsemb-backend      # View specific service logs
pm2 logs --lines 100        # View last 100 lines
```

### Process Information
```bash
pm2 describe lsemb-backend  # Detailed process info
pm2 show lsemb-python       # Show process details
```

### Persistence
```bash
pm2 save                    # Save process list
pm2 resurrect               # Restore saved processes
pm2 startup                 # Generate startup script
```

## Troubleshooting

### Service Not Starting

**Backend:**
```bash
# Check if TypeScript is built
cd backend
npm run build

# Check logs
pm2 logs lsemb-backend --lines 50
```

**Frontend:**
```bash
# Check if Next.js is built
cd frontend
npm run build

# Check logs
pm2 logs lsemb-frontend --lines 50
```

**Python:**
```bash
# Check virtual environment
cd backend/python-services
.\venv\Scripts\activate
python main.py  # Test manually

# Check logs
pm2 logs lsemb-python --lines 50
```

### Port Already in Use
```bash
# Windows: Find process using port
netstat -ano | findstr :8083
taskkill /PID <PID> /F

# Kill process using port
pm2 stop all
pm2 delete all
```

### Memory Issues
```bash
# Check memory usage
pm2 list

# Restart service
pm2 restart lsemb-backend
```

### Clear Logs
```bash
pm2 flush               # Clear all logs
pm2 flush lsemb-backend # Clear specific service logs
```

## Environment Variables

Edit `ecosystem.config.js` to customize:

- Port numbers
- Node memory limits (`--max-old-space-size`)
- Auto-restart behavior
- Log file locations

## Development vs Production

### Development Mode
```bash
pm2 start ecosystem.config.js
```

### Production Mode
```bash
pm2 start ecosystem.config.js --env production
```

## Log Files

Logs are stored in:
- Backend: `./logs/backend-*.log`
- Frontend: `./logs/frontend-*.log`
- Python: `./logs/python-*.log`

## Useful PM2 Features

### Process Metrics
```bash
pm2 web                     # Web-based monitoring (port 9615)
```

### Cluster Mode (Backend Only)
```bash
# Edit ecosystem.config.js:
# instances: 2,           # Number of instances
# exec_mode: 'cluster'    # Cluster mode
```

### Auto-restart on File Changes
```bash
# Edit ecosystem.config.js:
# watch: true,            # Enable watch mode
# ignore_watch: ['node_modules', 'logs']
```

## Best Practices

1. Always use `pm2 save` after starting services
2. Check logs regularly with `pm2 logs`
3. Use `pm2 monit` for real-time monitoring
4. Restart services after code changes
5. Use `pm2 list` to verify all services are running

## Common Issues

### Python Service Fails to Start
- Check if virtual environment exists: `backend/python-services/venv`
- Check if requirements are installed: `pip list`
- Check Python version: `python --version`

### Backend TypeScript Errors
- Rebuild TypeScript: `cd backend && npm run build`
- Check for syntax errors in logs

### Frontend Build Errors
- Clear Next.js cache: `cd frontend && rm -rf .next`
- Rebuild: `npm run build`

## Support

For more information:
- PM2 Documentation: https://pm2.keymetrics.io/docs/usage/quick-start/
- LSEMB Issues: https://github.com/umutsun/asemb/issues
