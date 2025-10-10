# Manual Process Cleanup Instructions

The automated scripts couldn't kill all background processes. Please follow these steps manually:

## 1. Open PowerShell as Administrator
- Right-click on Start menu
- Select "PowerShell (Administrator)"
- Navigate to project directory: `cd c:\xampp\htdocs\alice-semantic-bridge`

## 2. Kill All Node Processes
Run this command in PowerShell:
```powershell
Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force
```

## 3. Kill Processes on Specific Ports (if needed)
```powershell
# Port 3002 (Frontend)
Get-NetTCPConnection -LocalPort 3002 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }

# Port 8084 (Backend)
Get-NetTCPConnection -LocalPort 8084 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }

# Port 8083 (Backend alternative)
Get-NetTCPConnection -LocalPort 8083 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }

# Port 8085 (Backend alternative)
Get-NetTCPConnection -LocalPort 8085 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }
```

## 4. Verify All Processes Are Killed
```powershell
Get-Process node -ErrorAction SilentlyContinue
```
Should return no processes.

## 5. Start Services Manually in Separate Terminals

### Terminal 1: Backend (Port 8084)
```bash
cd c:\xampp\htdocs\alice-semantic-bridge\backend
PORT=8084 npm start
```

### Terminal 2: Frontend (Port 3002)
```bash
cd c:\xampp\htdocs\alice-semantic-bridge\frontend
PORT=3002 npm run dev
```

## 6. Check Services
- Frontend should be available at: http://localhost:3002
- Backend API should be available at: http://localhost:8084
- Check browser console for any connection errors

## Current Configuration
- Frontend .env.local is configured for backend on port 8084
- Frontend runs on port 3002
- All debug logs are disabled for clean console output

After starting services manually, you should be able to see the actual logs and debug any connection issues.