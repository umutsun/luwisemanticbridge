# PM2 Process Management Skill

**Model Recommendation**: Haiku 3.5 ($1/MTok)

## Purpose
LSEMB projesi için tüm servis yönetiminde PM2 kullanılmalıdır. Claude, servisleri başlatma/durdurma işlemlerinde **ASLA** doğrudan `node`, `npm start`, veya `python` komutları kullanmamalıdır.

## Critical Rules

### ✅ YAPILMASI GEREKENLER
- Her zaman PM2 kullan: `pm2 start`, `pm2 stop`, `pm2 restart`
- Servis durumunu kontrol et: `pm2 list`, `pm2 logs`
- ecosystem.config.js'i kullan
- Servisleri yeniden başlatmadan önce durdur

### ❌ YAPILMAMASI GEREKENLER
- **ASLA** `node backend/dist/server.js` gibi komutlar kullanma
- **ASLA** `npm start` doğrudan çalıştırma
- **ASLA** `python backend/python-services/main.py` başlatma
- **ASLA** background process'leri `&` ile başlatma
- Servisleri PM2 dışında yönetmeye çalışma

## Available Services

```javascript
{
  'lsemb-backend': {
    port: 8083,
    type: 'Node.js TypeScript',
    script: 'dist/server.js',
    cwd: './backend'
  },
  'lsemb-frontend': {
    port: 3002,
    type: 'Next.js',
    command: 'npm start',
    cwd: './frontend'
  },
  'lsemb-python': {
    port: 8001,
    type: 'Python FastAPI',
    script: 'main.py',
    interpreter: 'venv/Scripts/python.exe',
    cwd: './backend/python-services'
  }
}
```

## Common Commands

### Start All Services
```bash
# Using batch file (Windows)
.\start-pm2.bat

# Using PM2 directly
pm2 start ecosystem.config.js

# Start specific service only
pm2 start ecosystem.config.js --only lsemb-backend
pm2 start ecosystem.config.js --only lsemb-frontend
pm2 start ecosystem.config.js --only lsemb-python
```

### Stop Services
```bash
# Stop all
pm2 stop all

# Stop specific
pm2 stop lsemb-backend
pm2 stop lsemb-frontend
pm2 stop lsemb-python
```

### Restart Services
```bash
# Restart all
pm2 restart all

# Restart specific
pm2 restart lsemb-backend
```

### Check Status
```bash
# List all processes
pm2 list

# View logs
pm2 logs

# View specific service logs
pm2 logs lsemb-backend
pm2 logs lsemb-frontend
pm2 logs lsemb-python

# Last N lines
pm2 logs --lines 50
```

### Delete/Remove
```bash
# Delete all processes
pm2 delete all

# Delete specific
pm2 delete lsemb-backend
```

## Workflow Examples

### Example 1: User asks to start backend
**❌ WRONG:**
```bash
cd backend && node dist/server.js
```

**✅ CORRECT:**
```bash
pm2 start ecosystem.config.js --only lsemb-backend
pm2 logs lsemb-backend
```

### Example 2: User asks to restart services
**❌ WRONG:**
```bash
# Kill existing processes
pkill -f "node.*server.js"
# Start new process
node backend/dist/server.js &
```

**✅ CORRECT:**
```bash
pm2 restart all
pm2 list
```

### Example 3: User says service crashed
**❌ WRONG:**
```bash
# Try to start directly
cd backend && npm start
```

**✅ CORRECT:**
```bash
# Check status first
pm2 list

# Check logs for errors
pm2 logs lsemb-backend --lines 50

# Restart if needed
pm2 restart lsemb-backend
```

### Example 4: User asks to stop everything
**❌ WRONG:**
```bash
# Kill processes manually
pkill node
pkill python
```

**✅ CORRECT:**
```bash
pm2 stop all
pm2 list
```

## Troubleshooting Pattern

When a service has issues:

1. **Check Status**
   ```bash
   pm2 list
   ```

2. **Check Logs**
   ```bash
   pm2 logs <service-name> --lines 100
   ```

3. **Restart if Needed**
   ```bash
   pm2 restart <service-name>
   ```

4. **If Still Failing**
   ```bash
   pm2 delete <service-name>
   pm2 start ecosystem.config.js --only <service-name>
   ```

## Pre-flight Checks

Before starting services, verify:

### Backend
```bash
# Check if built
dir backend\dist\server.js
# If not exists:
cd backend && npm run build
```

### Frontend
```bash
# Check if built
dir frontend\.next
# If not exists:
cd frontend && npm run build
```

### Python
```bash
# Check virtual environment
dir backend\python-services\venv\Scripts\python.exe
# If not exists:
cd backend\python-services
python -m venv venv
.\venv\Scripts\activate
pip install -r requirements.txt
```

## Common Issues

### Issue: Redis Connection Errors
```bash
# Don't try to restart services individually
# Check if Redis is running first:
redis-cli ping

# If Redis not running, start it:
# Windows: Start Redis service
# Then restart backend:
pm2 restart lsemb-backend
```

### Issue: Port Already in Use
```bash
# Don't kill manually
# Use PM2 to stop properly:
pm2 stop all
pm2 delete all
pm2 start ecosystem.config.js
```

### Issue: Frontend Syntax Error
```bash
# This usually means npm.cmd is being executed as JS
# Solution: Check ecosystem.config.js
# Make sure frontend uses: script: 'npm', args: 'start'
# NOT: script: 'npm.cmd'
```

## What NOT to Do

1. **Never start Node.js processes directly**
   - ❌ `node backend/dist/server.js`
   - ❌ `npm start`
   - ❌ `npm run dev`

2. **Never start Python processes directly**
   - ❌ `python backend/python-services/main.py`
   - ❌ `uvicorn main:app`

3. **Never use background processes**
   - ❌ `command &`
   - ❌ `nohup command`

4. **Never manually kill processes**
   - ❌ `pkill node`
   - ❌ `taskkill /F /IM node.exe`

5. **Never mix PM2 with direct starts**
   - Pick one method and stick with it
   - LSEMB uses PM2 exclusively

## Response Template

When user asks to start/manage services:

```
I'll use PM2 to manage the services:

1. [Checking current status]
   $ pm2 list

2. [Taking appropriate action]
   $ pm2 [start|stop|restart] [service-name]

3. [Verifying status]
   $ pm2 logs [service-name] --lines 20

Services are now running and managed by PM2. You can monitor them with:
- pm2 list: See all processes
- pm2 logs: View real-time logs
- pm2 monit: Real-time monitoring dashboard
```

## Integration with Other Skills

- **backend-service**: After creating service, update ecosystem.config.js
- **quick-debug**: Use `pm2 logs` for debugging
- **database-operations**: Check `pm2 logs lsemb-backend` for DB errors

---

**Token Savings**: ~60%
**Use Case**: All service management operations
**Priority**: CRITICAL - Always use PM2, never direct starts
