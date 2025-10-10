# Port Configuration Troubleshooting Guide

## Problem: Failed to Fetch Error on Login Screen

### Symptoms
- Application stuck on login screen
- Console error: `TypeError: Failed to fetch`
- Error originating from `src/lib/auth-fetch.ts` at line 87
- Frontend unable to communicate with backend API

### Root Cause Analysis
The issue occurs when there's a **port mismatch** between the frontend and backend configurations. The frontend is trying to connect to a different port than where the backend server is actually running.

### Diagnosis Steps

1. **Check Backend Status**
   ```bash
   # Test if backend is responding on different ports
   curl -s http://localhost:8084/api/v2/health || echo "Backend 8084 not responding"
   curl -s http://localhost:8083/api/v2/health || echo "Backend 8083 not responding"
   ```

2. **Check Running Processes**
   ```bash
   # List all Node.js processes
   tasklist | findstr node
   # Check port usage
   netstat -ano | findstr :8083
   netstat -ano | findstr :8084
   ```

3. **Verify Configuration Files**
   - Check `frontend/.env.local` for API URLs
   - Check `backend/.env` for API_PORT setting
   - Verify `frontend/src/config/api.config.ts` and `frontend/src/config/index.ts`

### The Fix

In our case, the issue was:
- Frontend `.env.local` was configured for port **8084**
- Backend was actually running on port **8083**
- Configuration mismatch caused failed API calls

**Solution:** Update `frontend/.env.local`

```env
# FROM (incorrect):
NEXT_PUBLIC_API_URL=http://localhost:8084
NEXT_PUBLIC_WEBSOCKET_URL=ws://localhost:8084
NEXT_PUBLIC_API_PORT=8084

# TO (correct):
NEXT_PUBLIC_API_URL=http://localhost:8083
NEXT_PUBLIC_WEBSOCKET_URL=ws://localhost:8083
NEXT_PUBLIC_API_PORT=8083
```

### Common Port Configuration Issues

| Symptom | Cause | Solution |
|---------|-------|----------|
| Failed to fetch | Frontend pointing to wrong port | Sync ports in `.env.local` |
| CORS errors | CORS origins don't include frontend port | Update `CORS_ORIGINS` in backend `.env` |
| WebSocket connection failed | WebSocket URL wrong port | Update `NEXT_PUBLIC_WEBSOCKET_URL` |
| Database connection failed | Wrong database port | Check PostgreSQL configuration |

### Port Configuration Map

| Service | Default Port | Environment Variable |
|---------|-------------|---------------------|
| Frontend (Next.js) | 3002 | `NEXT_PUBLIC_PORT` |
| Backend API | 8083 | `API_PORT` / `NEXT_PUBLIC_API_PORT` |
| PostgreSQL | 5432 | `POSTGRES_PORT` |
| Redis | 6380 | `REDIS_PORT` |
| Adminer | 8080 | `ADMINER_PORT` |
| Redis Commander | 8081 | `REDIS_COMMANDER_PORT` |
| n8n | 5678 | `N8N_PORT` |

### Preventive Measures

1. **Always check backend health first:**
   ```bash
   curl http://localhost:8083/api/v2/health
   ```

2. **Verify port consistency across files:**
   - `frontend/.env.local`
   - `backend/.env`
   - `frontend/src/config/api.config.ts`
   - `frontend/src/config/index.ts`

3. **Use the same port in:**
   - `NEXT_PUBLIC_API_URL`
   - `NEXT_PUBLIC_WEBSOCKET_URL`
   - `NEXT_PUBLIC_API_PORT`

4. **Ensure CORS origins include frontend port:**
   ```env
   CORS_ORIGINS=http://localhost:3002,http://localhost:3000,...
   ```

5. **After changing configuration:**
   - Restart frontend server
   - Restart backend server (if backend config changed)
   - Clear browser cache

### Quick Troubleshooting Commands

```bash
# 1. Check all Node.js processes
tasklist | findstr node

# 2. Check specific ports
netstat -ano | findstr :8083
netstat -ano | findstr :3002

# 3. Test backend connectivity
curl -v http://localhost:8083/api/v2/health

# 4. Check environment variables
echo %NEXT_PUBLIC_API_PORT%
```

### When to Use This Guide

Use this troubleshooting guide when:
- Application stuck on loading/login screen
- "Failed to fetch" errors in console
- API calls returning connection refused
- WebSocket connection failures
- CORS errors in browser console

### Related Documentation

- [API Configuration Guide](./api-configuration.md)
- [Development Setup Guide](./development-setup.md)
- [Environment Variables Reference](./environment-variables.md)

---

**Last Updated:** 2025-10-09
**Issue:** Port mismatch between frontend (8084) and backend (8083)
**Resolution:** Synced frontend configuration to use port 8083