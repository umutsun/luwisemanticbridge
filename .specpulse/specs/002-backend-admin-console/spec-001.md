# Feature Specification: Backend Admin Console

**Feature ID:** 002-backend-admin-console
**Specification Level:** STANDARD
**Estimated Time:** 10-14 hours
**Priority:** HIGH
**Status:** Draft
**Created:** 2025-12-13

---

## 1. Executive Summary

### Problem Statement
Production server crashes and issues are difficult to diagnose and fix:
- ❌ SSH authentication timeouts during emergencies
- ❌ No visibility into PM2 service status without SSH
- ❌ Disk space issues cause unexpected failures
- ❌ Backend logs not accessible when services crash
- ❌ No quick way to restart failed services
- ❌ Manual intervention required for routine maintenance

### Proposed Solution
**Backend Admin Console**: A Python FastAPI microservice with React UI for comprehensive server management:

```
┌─────────────────────────────────────────────────────┐
│           Backend Admin Console (Port 9000)         │
├─────────────────────────────────────────────────────┤
│  Python FastAPI Microservice                        │
│  ├─ PM2 Service Management API                      │
│  ├─ System Monitoring (CPU, RAM, Disk)              │
│  ├─ Log Streaming (WebSocket)                       │
│  ├─ Web Terminal (xterm.js + WebSocket)             │
│  └─ Alert System (Disk, Service Health)             │
├─────────────────────────────────────────────────────┤
│  React Admin UI (/dashboard/admin-console)          │
│  ├─ Service Cards (emlakai, vergilex, bookie)       │
│  ├─ Resource Monitor (gauges, charts)               │
│  ├─ Log Viewer (real-time tail)                     │
│  ├─ Terminal Emulator (web-based SSH)               │
│  └─ Alert Dashboard                                 │
└─────────────────────────────────────────────────────┘
```

### Key Benefits
- ✅ **No SSH Required**: Manage services from web browser
- ✅ **Real-time Monitoring**: Live metrics and logs
- ✅ **Quick Recovery**: One-click service restart
- ✅ **Proactive Alerts**: Disk space warnings before crash
- ✅ **Developer Friendly**: Built-in terminal for debugging
- ✅ **Multi-Instance**: Manage emlakai, vergilex, bookie from one place

---

## 2. Goals & Objectives

### Primary Goals
1. **Provide web-based server management** (no SSH dependency)
2. **Monitor system resources** (CPU, RAM, Disk) in real-time
3. **Manage PM2 services** (start, stop, restart, logs)
4. **Prevent disk space issues** with proactive alerts
5. **Enable quick debugging** with integrated terminal and logs

### Secondary Goals
1. Role-based access (admin only)
2. Audit logging (who restarted what, when)
3. Automated health checks
4. Service dependency management

### Non-Goals (Future Features)
- ❌ Multi-server management (only 91.99.229.96 for now)
- ❌ Database management UI
- ❌ Automated deployment/CI-CD
- ❌ Performance profiling tools

---

## 3. Technical Architecture

### 3.1 Python Microservice (FastAPI)

**Location:** `backend/python-services/admin-console/`
**Port:** 9000
**Process Name:** `admin-console` (PM2)

```python
# File structure
backend/python-services/admin-console/
├── main.py                 # FastAPI app
├── routers/
│   ├── pm2.py             # PM2 management endpoints
│   ├── system.py          # System monitoring endpoints
│   ├── logs.py            # Log streaming endpoints
│   └── terminal.py        # WebSocket terminal
├── services/
│   ├── pm2_manager.py     # PM2 Python wrapper
│   ├── system_monitor.py  # psutil-based monitoring
│   ├── log_streamer.py    # Tail -f implementation
│   └── terminal_pty.py    # PTY for terminal
├── models/
│   └── schemas.py         # Pydantic models
└── requirements.txt
```

### 3.2 API Endpoints

#### PM2 Management
```typescript
GET  /api/admin/pm2/list                // List all PM2 processes
GET  /api/admin/pm2/status/:name        // Get service status
POST /api/admin/pm2/start/:name         // Start service
POST /api/admin/pm2/stop/:name          // Stop service
POST /api/admin/pm2/restart/:name       // Restart service
POST /api/admin/pm2/restart-all         // Restart all services
GET  /api/admin/pm2/logs/:name          // Get recent logs
```

#### System Monitoring
```typescript
GET  /api/admin/system/stats            // CPU, RAM, Disk usage
GET  /api/admin/system/disk             // Detailed disk info
GET  /api/admin/system/processes        // Top processes
GET  /api/admin/system/network          // Network stats
WS   /api/admin/system/stream           // Real-time metrics (WebSocket)
```

#### Log Streaming
```typescript
GET  /api/admin/logs/:service           // Get last N lines
WS   /api/admin/logs/:service/stream    // Tail -f via WebSocket
GET  /api/admin/logs/search             // Search in logs
```

#### Web Terminal
```typescript
WS   /api/admin/terminal                // WebSocket terminal (pty)
POST /api/admin/terminal/resize         // Resize terminal
```

#### Alerts
```typescript
GET  /api/admin/alerts                  // Get active alerts
POST /api/admin/alerts/acknowledge/:id  // Acknowledge alert
GET  /api/admin/alerts/history          // Alert history
```

### 3.3 Frontend UI Component

**Location:** `frontend/src/app/dashboard/admin-console/page.tsx`

```tsx
// Component structure
AdminConsolePage
├─ Header
│  ├─ Server Info (hostname, uptime)
│  └─ Quick Actions (Restart All, Refresh)
├─ MetricsGrid (4 columns)
│  ├─ CPUGauge
│  ├─ RAMGauge
│  ├─ DiskGauge
│  └─ NetworkStats
├─ ServicesPanel
│  ├─ ServiceCard (emlakai-backend, frontend, python) x3
│  ├─ ServiceCard (vergilex-*) x3
│  └─ ServiceCard (bookie-*) x3
├─ TabsPanel
│  ├─ LogsTab (service selector + real-time logs)
│  ├─ TerminalTab (xterm.js terminal)
│  ├─ AlertsTab (active + history)
│  └─ HealthTab (health checks status)
└─ AlertBar (sticky top, disk warnings)
```

---

## 4. Detailed Features

### 4.1 PM2 Service Management

**ServiceCard Component:**
```tsx
┌──────────────────────────────────────┐
│ 🟢 emlakai-backend        [Restart] │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │
│ PID: 56122   CPU: 2%   MEM: 68.8 MB │
│ Uptime: 2h 15m   Restarts: 3        │
│ [View Logs] [Stop] [Start]          │
└──────────────────────────────────────┘
```

**Features:**
- ✅ Color-coded status (🟢 online, 🔴 stopped, 🟡 errored)
- ✅ Real-time metrics (updates every 2s)
- ✅ One-click restart with confirmation
- ✅ Direct link to logs tab
- ✅ Batch operations (select multiple → restart)

### 4.2 System Monitoring

**MetricsGrid:**
```
┌──────────┬──────────┬──────────┬──────────┐
│ CPU      │ RAM      │ DISK     │ NETWORK  │
│ ⭕ 15%   │ ⭕ 57%   │ ⭕ 73%   │ ↑ 2.5MB/s│
│          │          │ ⚠️ HIGH  │ ↓ 1.2MB/s│
└──────────┴──────────┴──────────┴──────────┘
```

**Features:**
- ✅ Circular progress gauges (react-circular-progressbar)
- ✅ Warning thresholds (Disk >80% = ⚠️, >90% = 🔴)
- ✅ Historical charts (last 1 hour, recharts)
- ✅ Click to expand detailed view

**Disk Monitoring:**
```typescript
// Alert thresholds
{
  warning: 80,   // Show yellow warning
  critical: 90,  // Show red alert + notification
  emergency: 95  // Auto-cleanup old logs
}
```

### 4.3 Log Viewer

**LogsTab:**
```
┌─────────────────────────────────────────────────┐
│ Service: [emlakai-backend ▼]  [🔴 Stop] [Clear]│
├─────────────────────────────────────────────────┤
│ [2025-12-13 03:15:23] INFO: Server started     │
│ [2025-12-13 03:15:24] INFO: Connected to DB    │
│ [2025-12-13 03:15:25] ERROR: Cache miss       │ ← Red
│ [2025-12-13 03:15:26] WARN: Slow query        │ ← Yellow
│ [Auto-scroll ☑] [Search: "error"]              │
└─────────────────────────────────────────────────┘
```

**Features:**
- ✅ Real-time streaming (WebSocket)
- ✅ Color-coded by level (INFO, WARN, ERROR)
- ✅ Auto-scroll toggle
- ✅ Search/filter
- ✅ Download logs as .txt
- ✅ Show last 100/500/1000 lines

### 4.4 Web Terminal

**TerminalTab:**
```
┌─────────────────────────────────────────────────┐
│ root@server:~# pm2 list                         │
│ ┌────┬─────────────┬─────────┬───────┬─────┐   │
│ │ id │ name        │ status  │ cpu   │ mem │   │
│ ├────┼─────────────┼─────────┼───────┼─────┤   │
│ │ 5  │ emlakai-be  │ online  │ 2%    │ 68MB│   │
│ └────┴─────────────┴─────────┴───────┴─────┘   │
│ root@server:~# █                                │
└─────────────────────────────────────────────────┘
```

**Tech Stack:**
- Frontend: `xterm.js` + `xterm-addon-fit`
- Backend: `python-pty` (pseudo-terminal)
- Communication: WebSocket

**Features:**
- ✅ Full terminal emulation (bash commands)
- ✅ Auto-resize
- ✅ Command history (↑/↓ arrows)
- ✅ Copy/paste support
- ✅ Color support (ANSI escape codes)

**Security:**
- ⚠️ Admin role required
- ⚠️ Command whitelist option (restrict dangerous commands)
- ⚠️ Session timeout (15 minutes)
- ⚠️ Audit log (all commands logged)

### 4.5 Alert System

**AlertBar (Sticky Top):**
```
┌─────────────────────────────────────────────────┐
│ 🔴 CRITICAL: Disk usage 92% - Free space: 3GB  │
│ [Clean Old Logs] [Acknowledge]                  │
└─────────────────────────────────────────────────┘
```

**Alert Types:**
```typescript
enum AlertLevel {
  INFO = "info",       // Blue
  WARNING = "warning", // Yellow
  CRITICAL = "critical", // Red
  EMERGENCY = "emergency" // Flashing red
}

interface Alert {
  id: string;
  level: AlertLevel;
  title: string;
  message: string;
  service?: string;
  createdAt: Date;
  acknowledgedAt?: Date;
  autoResolve: boolean;
}
```

**Alert Triggers:**
1. Disk >90% → CRITICAL
2. Service restart >5 times/hour → WARNING
3. Service down >5 minutes → CRITICAL
4. CPU >90% for 5 minutes → WARNING
5. RAM >95% → CRITICAL
6. No response from service health check → CRITICAL

---

## 5. Implementation Plan

### Phase 1: Python Microservice (5-6 hours)

**Tasks:**
1. ✅ Setup FastAPI project structure
2. ✅ Implement PM2 manager (subprocess wrapper)
3. ✅ Add system monitoring (psutil)
4. ✅ Create REST API endpoints
5. ✅ Add WebSocket for log streaming
6. ✅ Implement web terminal (pty)
7. ✅ Add alert logic
8. ✅ Write unit tests

**Deliverables:**
- `backend/python-services/admin-console/main.py`
- PM2 ecosystem config entry
- API documentation (auto-generated by FastAPI)

### Phase 2: Frontend UI (4-5 hours)

**Tasks:**
1. ✅ Create AdminConsolePage component
2. ✅ Build ServiceCard components
3. ✅ Implement MetricsGrid with gauges
4. ✅ Add LogsTab with WebSocket
5. ✅ Integrate xterm.js for terminal
6. ✅ Build AlertBar and AlertsTab
7. ✅ Add responsive design (mobile support)
8. ✅ Test on production

**Deliverables:**
- `frontend/src/app/dashboard/admin-console/page.tsx`
- WebSocket hooks (`useLogStream`, `useTerminal`, `useMetrics`)
- Reusable components (Gauge, ServiceCard, LogViewer)

### Phase 3: Integration & Testing (1-2 hours)

**Tasks:**
1. ✅ Deploy Python service to production
2. ✅ Test PM2 restart flows
3. ✅ Verify alert triggers
4. ✅ Test terminal security
5. ✅ Load testing (multiple concurrent connections)
6. ✅ Documentation

---

## 6. Data Models

### PM2 Process Info
```typescript
interface PM2Process {
  id: number;
  name: string;
  status: 'online' | 'stopped' | 'errored' | 'stopping';
  pid: number | null;
  cpu: number;      // Percentage
  memory: number;   // Bytes
  uptime: number;   // Seconds
  restarts: number;
  createdAt: Date;
  pm2_env: {
    version: string;
    restart_time: number;
    unstable_restarts: number;
  };
}
```

### System Metrics
```typescript
interface SystemMetrics {
  timestamp: Date;
  cpu: {
    percent: number;
    count: number;
    perCore: number[];
  };
  memory: {
    total: number;
    used: number;
    free: number;
    percent: number;
  };
  disk: {
    total: number;
    used: number;
    free: number;
    percent: number;
    mountpoint: string;
  }[];
  network: {
    bytesSent: number;
    bytesRecv: number;
    packetsSent: number;
    packetsRecv: number;
  };
}
```

### Log Entry
```typescript
interface LogEntry {
  timestamp: Date;
  service: string;
  level: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG';
  message: string;
  metadata?: Record<string, any>;
}
```

---

## 7. Security Considerations

### Authentication & Authorization
```typescript
// Middleware
@app.middleware("http")
async def verify_admin(request: Request, call_next):
    token = request.headers.get("Authorization")
    user = verify_token(token)
    if not user.is_admin:
        raise HTTPException(403, "Admin access required")
    return await call_next(request)
```

### Rate Limiting
```python
# Prevent abuse
limiter = Limiter(key_func=get_remote_address)
@limiter.limit("10/minute")  # Max 10 restarts per minute
async def restart_service():
    ...
```

### Command Whitelist (Terminal)
```python
DANGEROUS_COMMANDS = ['rm -rf', 'dd', 'mkfs', '> /dev/sda']
ALLOWED_COMMANDS = ['pm2', 'ls', 'cat', 'tail', 'grep', 'df', 'free', 'top']

def validate_command(cmd: str) -> bool:
    if any(danger in cmd for danger in DANGEROUS_COMMANDS):
        return False
    return True
```

### Audit Logging
```python
# Log all admin actions
audit_log.info({
    "user": request.user.email,
    "action": "restart_service",
    "service": "emlakai-backend",
    "timestamp": datetime.utcnow(),
    "ip": request.client.host
})
```

---

## 8. Monitoring & Alerts

### Health Checks
```python
@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "services": await check_all_services(),
        "disk": get_disk_usage(),
        "uptime": get_uptime()
    }
```

### Alert Rules
```python
class AlertRules:
    def check_disk_space():
        usage = psutil.disk_usage('/')
        if usage.percent > 95:
            create_alert("EMERGENCY", "Disk almost full")
        elif usage.percent > 90:
            create_alert("CRITICAL", "Disk usage critical")
        elif usage.percent > 80:
            create_alert("WARNING", "Disk usage high")

    def check_service_health():
        for service in PM2_SERVICES:
            if service.restarts > 5:
                create_alert("WARNING", f"{service.name} restarting frequently")
            if service.status == "errored":
                create_alert("CRITICAL", f"{service.name} has crashed")
```

### Auto-Cleanup (Emergency)
```python
async def emergency_disk_cleanup():
    """Run when disk >95% to prevent crash"""
    # Delete old logs
    await cleanup_old_logs(days=7)
    # Clear PM2 logs
    await run_command("pm2 flush")
    # Clear tmp files
    await cleanup_tmp()
    # Send notification
    await send_alert("Emergency cleanup completed")
```

---

## 9. Dependencies

### Python (requirements.txt)
```txt
fastapi==0.104.1
uvicorn[standard]==0.24.0
websockets==12.0
psutil==5.9.6
python-pty==2.0.1
pydantic==2.5.0
python-multipart==0.0.6
```

### Frontend (package.json)
```json
{
  "xterm": "^5.3.0",
  "xterm-addon-fit": "^0.8.0",
  "recharts": "^2.10.0",
  "react-circular-progressbar": "^2.1.0"
}
```

### System
- PM2 (already installed)
- Node.js (already installed)
- psutil (Python system monitoring)

---

## 10. Success Criteria

### Must Have (MVP)
- ✅ View all PM2 services status
- ✅ Restart services with one click
- ✅ View real-time logs
- ✅ Monitor disk usage with alerts
- ✅ Admin-only access
- ✅ Works without SSH

### Should Have
- ✅ Web terminal
- ✅ Historical metrics charts
- ✅ Alert history
- ✅ Log search
- ✅ Mobile responsive

### Nice to Have (Future)
- ⏸️ Service dependency graph
- ⏸️ Automated health recovery
- ⏸️ Multi-server support
- ⏸️ Performance profiling

---

## 11. Risks & Mitigation

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Terminal security breach | HIGH | MEDIUM | Whitelist commands, audit log, session timeout |
| Resource overhead | MEDIUM | LOW | Lightweight polling, WebSocket optimization |
| PM2 API changes | LOW | LOW | Use subprocess wrapper, version lock |
| WebSocket connection drops | MEDIUM | MEDIUM | Auto-reconnect logic, fallback to polling |

---

## 12. Future Enhancements

1. **Automated Health Recovery**
   - Auto-restart failed services
   - Auto-cleanup when disk critical
   - Send email/Slack notifications

2. **Service Dependencies**
   - Visualize dependencies (backend → python → redis)
   - Smart restart order
   - Impact analysis

3. **Performance Profiling**
   - CPU flame graphs
   - Memory leak detection
   - Query performance analysis

4. **Multi-Server Management**
   - Manage multiple servers from one console
   - Cross-server log aggregation
   - Distributed health monitoring

---

**End of Specification**

**Ready to build?** 🚀
Next steps:
```bash
/sp-plan    # Generate implementation plan
/sp-task    # Break down into tasks
```
