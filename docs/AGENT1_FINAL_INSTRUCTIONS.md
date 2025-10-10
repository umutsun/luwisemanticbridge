# Agent 1 - WebSocket Fix Final Instructions

---

# 🔧 Agent 1: WebSocket Fix - Final Instructions

## 📋 Current Status

**Problem:** Frontend tries to connect to `ws://localhost:3002` instead of `ws://localhost:8083`

**What's Been Done:**
- ✅ Identified port mismatch issue
- ✅ Cleared `.next` cache directory
- ✅ Created `WEBSOCKET_FIX.md` documentation
- ✅ Environment files are correctly configured

**What Needs to Be Done:**
1. Restart services with fresh cache
2. Verify WebSocket connection
3. Document final status

---

## 🎯 Step-by-Step Instructions

### Step 1: Stop All Running Services

First, make sure nothing is running on ports 8083 or 3001:

**Windows:**
```powershell
# Check what's running
netstat -ano | findstr "8083"
netstat -ano | findstr "3001"

# Kill processes if needed (replace <PID> with actual process ID)
taskkill /PID <PID> /F
```

**Or simply close the terminal windows** where backend and frontend are running.

---

### Step 2: Start Backend

```bash
cd C:\xampp\htdocs\alice-semantic-bridge\backend
python -m uvicorn main:app --reload --port 8083
```

**Expected Output:**
```
INFO:     Uvicorn running on http://127.0.0.1:8083
INFO:     Application startup complete
✅ WebSocket server is ready on port 8083
```

**Wait for this message before proceeding!**

---

### Step 3: Start Frontend (Fresh Build)

Open a **NEW terminal window**:

```bash
cd C:\xampp\htdocs\alice-semantic-bridge\frontend
npm run dev
```

**Expected Output:**
```
- ready started server on 0.0.0.0:3001, url: http://localhost:3001
- info  Loaded env from .env.local
```

---

### Step 4: Verify in Browser

1. **Open browser:** http://localhost:3001
2. **Open DevTools:** Press F12
3. **Go to Console tab**

**Look for these logs:**

✅ **GOOD - What you SHOULD see:**
```
🔌 useSocketIO: Connecting to Socket.IO server at: http://localhost:8083
🔌 useSocketIO: Environment NEXT_PUBLIC_API_URL: http://localhost:8083
Socket.IO connected
```

❌ **BAD - What you should NOT see:**
```
WebSocket connection to 'ws://localhost:3002/socket.io/' failed
Error: timeout
Reconnection attempt 1/5
```

---

### Step 5: Additional Checks

If you still see port 3002 errors:

**Option A: Clear Browser Cache**
```
Chrome: Ctrl + Shift + Delete
Select: Last hour
Check: Cached images and files
Click: Clear data
```

**Option B: Use Incognito/Private Mode**
```
Chrome: Ctrl + Shift + N
Edge: Ctrl + Shift + P
Firefox: Ctrl + Shift + P
```

**Option C: Hard Refresh**
```
Ctrl + Shift + R (Windows)
Cmd + Shift + R (Mac)
```

**Option D: Check Environment Variables Are Loaded**
```javascript
// In browser console, type:
console.log(process.env.NEXT_PUBLIC_API_URL)
// Should output: http://localhost:8083
```

---

### Step 6: Test WebSocket Functionality

Once connected, test if WebSocket is actually working:

1. **Check Connection Status**
   - Look for green dot indicator on NotificationCenter bell icon
   - Console should show: "Socket.IO connected"

2. **Test Backend Health**
   - Open: http://localhost:8083/health
   - Should return: `{"status": "healthy", "websocket": "available"}`

3. **Test Frontend**
   - Navigate around the app
   - Check console for any errors
   - Verify no timeout messages

---

### Step 7: Document Results

Create a file: `C:\xampp\htdocs\alice-semantic-bridge\WEBSOCKET_STATUS.md`

**Template:**

```markdown
# WebSocket Connection Status Report

**Date:** 2025-10-06
**Tested By:** Agent 1 (Claude Code)

## Test Results

### Backend Status
- **Port:** 8083
- **Status:** ✅ Running / ❌ Not Running
- **WebSocket:** ✅ Available / ❌ Not Available
- **Logs:** [Include relevant startup logs]

### Frontend Status
- **Port:** 3001
- **Status:** ✅ Running / ❌ Not Running
- **Build:** ✅ Fresh build / ⚠️ Using cache

### Browser Console Logs
```
[Include actual console logs here]
```

### Connection Test Results

#### Attempt 1
- **URL Attempted:** [e.g., ws://localhost:8083]
- **Result:** ✅ Success / ❌ Failed
- **Error (if any):** [Error message]

#### Connection Details
- **Transport:** websocket / polling
- **Connected:** Yes / No
- **Ping/Pong:** Working / Not Working

## Issues Found

### Issue 1: [Description]
- **Symptom:** [What happened]
- **Cause:** [Why it happened]
- **Fix Applied:** [What was done]
- **Result:** ✅ Fixed / ⚠️ Partial / ❌ Not Fixed

## Final Status

✅ **SUCCESS:** WebSocket connects to correct port (8083)
✅ **SUCCESS:** No port 3002 errors
✅ **SUCCESS:** No timeout errors
✅ **SUCCESS:** Frontend and backend communicate properly

OR

❌ **ISSUE:** [Description of remaining issues]

## Recommendations

[Any suggestions for future improvements or monitoring]

## Configuration Used

**Backend (.env):**
```
PORT=8083
WEBSOCKET_PORT=8083
ENABLE_WEBSOCKET=true
```

**Frontend (.env.local):**
```
NEXT_PUBLIC_API_URL=http://localhost:8083
NEXT_PUBLIC_WEBSOCKET_URL=ws://localhost:8083
NEXT_PUBLIC_PORT=3001
```

---

**Test Completed:** ✅ / ⚠️ / ❌
**Ready for Production:** ✅ / ❌
```

---

## 🚨 Troubleshooting Guide

### Problem: Still seeing port 3002

**Solution 1: Check for multiple .env files**
```bash
dir C:\xampp\htdocs\alice-semantic-bridge\frontend\.env*
```

Make sure only `.env.local` exists and has correct values.

**Solution 2: Kill all Node processes**
```bash
tasklist | findstr "node"
taskkill /IM node.exe /F
```

**Solution 3: Delete and rebuild**
```bash
cd frontend
rmdir /s /q .next
rmdir /s /q node_modules
npm install
npm run build
npm run dev
```

---

### Problem: Backend not starting

**Solution 1: Check if port is in use**
```bash
netstat -ano | findstr "8083"
```

**Solution 2: Check Python/uvicorn installation**
```bash
python --version
pip install uvicorn
```

**Solution 3: Check backend .env file**
```bash
type backend\.env
```

Make sure it contains:
```
PORT=8083
ENABLE_WEBSOCKET=true
```

---

### Problem: Frontend build fails

**Solution 1: Clear npm cache**
```bash
npm cache clean --force
```

**Solution 2: Delete lock file and reinstall**
```bash
del package-lock.json
npm install
```

**Solution 3: Check TypeScript errors**
```bash
npx tsc --noEmit
```

---

## ✅ Success Criteria

Your WebSocket setup is successful when ALL of these are true:

- [ ] Backend starts on port 8083 without errors
- [ ] Frontend starts on port 3001 without errors
- [ ] Browser console shows: "Connecting to Socket.IO server at: http://localhost:8083"
- [ ] NO errors about port 3002
- [ ] NO timeout errors
- [ ] Socket.IO connects successfully (green indicator visible)
- [ ] Backend logs show: "WebSocket server is ready on port 8083"
- [ ] Health endpoint returns: `{"websocket": "available"}`
- [ ] Application works normally
- [ ] WEBSOCKET_STATUS.md document created

---

## 🎯 After Completion

Once all tests pass:

1. **Save the working configuration**
   ```bash
   # Save PM2 config if using PM2
   pm2 save
   ```

2. **Update the main project status**
   - Mark WebSocket fix as ✅ COMPLETE in PROJECT_STATUS.md

3. **Commit changes**
   ```bash
   git add .
   git commit -m "fix: WebSocket connection port mismatch resolved"
   ```

4. **Notify the team**
   - WebSocket is now working correctly
   - Both frontend and backend on correct ports
   - Ready for production deployment

---

## 📞 Need Help?

If you encounter issues:

1. Check `WEBSOCKET_FIX.md` for background information
2. Review backend logs: Check terminal where uvicorn is running
3. Review frontend logs: Check browser DevTools console
4. Check network tab in DevTools for WebSocket connection attempts
5. Verify environment variables are loaded correctly

---

**Good luck! 🚀**

Once you complete this, the entire Alice Semantic Bridge system will be production-ready with both WebSocket and LLM integrations working perfectly!


---
*Generated by Alice Shell Bridge*