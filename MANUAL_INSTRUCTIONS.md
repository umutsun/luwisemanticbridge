# 🚨 MANUAL CLEANUP INSTRUCTIONS

## Current Situation
- 18+ background processes are still running
- Database connections are failing due to multiple instances
- System needs complete manual cleanup

## Step-by-Step Manual Cleanup

### 1. Open PowerShell as Administrator
- Right-click Start menu
- Select "PowerShell (Administrator)"
- Navigate to project: `cd c:\xampp\htdocs\alice-semantic-bridge`

### 2. Run These Commands Sequentially

```powershell
# Kill all node processes
Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force

# Kill processes on specific ports
Get-NetTCPConnection -LocalPort 3002 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
Get-NetTCPConnection -LocalPort 8083 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
Get-NetTCPConnection -LocalPort 8084 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
Get-NetTCPConnection -LocalPort 8085 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }

# Kill Redis if running
Get-Process redis -ErrorAction SilentlyContinue | Stop-Process -Force

# Wait 10 seconds
Start-Sleep -Seconds 10

# Verify no processes remain
Get-Process node -ErrorAction SilentlyContinue
```

### 3. Clean Caches
```powershell
# Clear frontend cache
Remove-Item -Recurse -Force "frontend\.next" -ErrorAction SilentlyContinue

# Clear backend cache
Remove-Item -Recurse -Force "backend\dist" -ErrorAction SilentlyContinue
```

### 4. Start Services Manually

Open **3 separate terminals**:

#### Terminal 1 (Backend)
```bash
cd c:\xampp\htdocs\alice-semantic-bridge\backend
PORT=8084 npm start
```

#### Terminal 2 (Frontend)
```bash
cd c:\xampp\htdocs\alice-semantic-bridge\frontend
PORT=3002 npm run dev
```

#### Terminal 3 (Monitor)
```bash
# Optional: Monitor logs
netstat -ano | findstr :3002
netstat -ano | findstr :8084
```

### 5. Test the System
1. Backend Health: http://localhost:8084/api/v2/health
2. Frontend: http://localhost:3002
3. Dashboard: Check settings loading

## Important Notes
- Backend should run on port **8084**
- Frontend should run on port **3002**
- All database connections fixed in latest commit
- API routing configured correctly

## If Still Having Issues
- Restart computer to clear all processes
- Check if Redis or PostgreSQL services are running locally and stop them
- Use Task Manager to end all node.exe processes manually