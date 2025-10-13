# 🚨 Complete System Cleanup and Restart Guide

## Current Situation
- 18+ background Node.js processes are running simultaneously
- Redis connection conflicts occurring
- Port conflicts across multiple services
- Git push completed successfully ✅

## Immediate Cleanup Required

### Step 1: Kill All Processes (Run as Administrator)
Open PowerShell **as Administrator** and run:

```powershell
# Force kill all Node processes
Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force

# Kill processes on specific ports
$ports = @(3002, 8083, 8084, 8085)
foreach ($port in $ports) {
    Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue | ForEach-Object {
        Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue
    }
}

# Kill Redis if running
Get-Process redis -ErrorAction SilentlyContinue | Stop-Process -Force

# Wait for processes to terminate
Start-Sleep -Seconds 5

# Verify cleanup
Get-Process node -ErrorAction SilentlyContinue
```

### Step 2: Clean System
```powershell
# Clear Next.js cache
Remove-Item -Recurse -Force "frontend\.next" -ErrorAction SilentlyContinue

# Clear node_modules if needed (optional)
# Remove-Item -Recurse -Force "node_modules" -ErrorAction SilentlyContinue
```

## Clean Startup Instructions

### Option A: Manual Terminal Startup (Recommended)
Open **3 separate terminals**:

#### Terminal 1: Backend (Port 8083)
```bash
cd c:\xampp\htdocs\alice-semantic-bridge\backend
PORT=8084 npm start
```

#### Terminal 2: Frontend (Port 3002)
```bash
cd c:\xampp\htdocs\alice-semantic-bridge\frontend
PORT=3002 npm run dev
```

#### Terminal 3: Monitor
```bash
# Monitor processes
Get-Process node | Select-Object Id, ProcessName, CPU
```

### Option B: Use PM2 (Production Style)
```bash
# Install PM2 globally if not installed
npm install -g pm2

# Start with ecosystem
pm2 start ecosystem.config.js

# Monitor
pm2 status
pm2 logs
```

## Verification Steps

1. **Backend Check**: http://localhost:8084/api/v2/health
2. **Frontend Check**: http://localhost:3002
3. **Dashboard**: Check statistics page
4. **Browser Console**: Should show no connection errors

## Production Deployment Status

✅ **Git Push Complete**: Changes are in remote repository
✅ **Fixes Deployed**: Port and database issues resolved
⏳ **Server Update Needed**: Run `git pull && pm2 restart` on server

## Server Commands

```bash
# On production server (lsemb.luwi.dev)
ssh root@lsemb.luwi.dev
cd /path/to/alice-semantic-bridge
git pull origin main
pm2 restart ecosystem.config.js
pm2 status
```

## Key Changes Deployed

1. Frontend API routing fixed (port 8083)
2. Next.js rewrite rules added for /api/v2/
3. Chat stats database connection fixed
4. Environment variables updated

The system should work cleanly after proper process cleanup.