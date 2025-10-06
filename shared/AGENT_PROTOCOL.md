# Agent Coordination Protocol

## Shared Memory Structure (Redis)
```
asemb:{project-key}:state     - Current project state
asemb:{project-key}:tasks     - Task queue
asemb:{project-key}:messages  - Inter-agent messages
asemb:{project-key}:locks     - Resource locks
```

## Communication Format
```json
{
  "from": "agent-name",
  "to": "agent-name|broadcast",
  "type": "task|update|query|response",
  "timestamp": "ISO-8601",
  "data": {},
  "priority": 1-5
}
```

## Daily Sync Points
1. **Morning Standup** - Check task queue (09:00 UTC)
2. **Midday Review** - Update progress (13:00 UTC)
3. **Evening Summary** - Commit changes (17:00 UTC)

## Code Review Process
1. Feature branch per task
2. Cross-agent review required
3. All tests must pass
4. Update documentation

## Project Keys
- **Claude (CTO)**: `asemb-claude-project`
- **Gemini (Frontend)**: `asemb-gemini-project`
- **Codex (Backend)**: `asemb-codex-project`

## Message Types

### Task Assignment
```json
{
  "type": "task",
  "from": "claude",
  "to": "gemini",
  "data": {
    "id": "TASK-001",
    "title": "Implement Settings Dashboard",
    "description": "...",
    "priority": 3,
    "due": "2024-01-14T17:00:00Z"
  }
}
```

### Progress Update
```json
{
  "type": "update",
  "from": "gemini",
  "to": "broadcast",
  "data": {
    "task_id": "TASK-001",
    "status": "in_progress",
    "progress": 60,
    "notes": "UI components complete, working on API integration"
  }
}
```

### Query/Response
```json
{
  "type": "query",
  "from": "codex",
  "to": "claude",
  "data": {
    "query": "What's the preferred auth strategy?",
    "context": "Implementing API middleware"
  }
}
```

## Resource Locking
Before modifying shared resources:
```bash
# Acquire lock
SET asemb:{project-key}:locks:{resource} {agent-name} NX EX 300

# Release lock
DEL asemb:{project-key}:locks:{resource}
```

## Health Check Protocol
Each agent should:
1. Update heartbeat every 60 seconds: `asemb:{project-key}:health:{agent}`
2. Check peer health before messaging
3. Alert on missing heartbeats > 5 minutes