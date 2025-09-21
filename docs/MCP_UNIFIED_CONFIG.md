# 🔗 Unified MCP Configuration for All Agents

## 🎯 Goal
All three agents (Claude, Gemini, Codex) will use the same ASB-CLI MCP server with Redis-based inter-agent communication.

## 📦 Configuration Files

### 1. Claude Configuration
**File**: `.claude/mcp-config.json`
```json
{
  "mcpServers": {
    "asb-cli": {
      "command": "node",
      "args": [
        "C:\\xampp\\htdocs\\alice-semantic-bridge\\scripts\\asb-mcp-wrapper.js"
      ],
      "env": {
        "AGENT_NAME": "claude",
        "PROJECT_KEY": "alice-semantic-bridge",
        "REDIS_HOST": "localhost",
        "REDIS_PORT": "6379",
        "REDIS_DB": "2",
        "POSTGRES_HOST": "localhost",
        "POSTGRES_PORT": "5432",
        "POSTGRES_DB": "asemb",
        "POSTGRES_USER": "postgres",
        "POSTGRES_PASSWORD": "${POSTGRES_PASSWORD}",
        "NODE_ENV": "development"
      }
    }
  }
}
```

### 2. Gemini Configuration
**File**: `.gemini/mcp-config.json`
```json
{
  "mcpServers": {
    "asb-cli": {
      "command": "node",
      "args": [
        "C:\\xampp\\htdocs\\alice-semantic-bridge\\scripts\\asb-mcp-wrapper.js"
      ],
      "env": {
        "AGENT_NAME": "gemini",
        "PROJECT_KEY": "alice-semantic-bridge",
        "REDIS_HOST": "localhost",
        "REDIS_PORT": "6379",
        "REDIS_DB": "2",
        "POSTGRES_HOST": "localhost",
        "POSTGRES_PORT": "5432",
        "POSTGRES_DB": "asemb",
        "POSTGRES_USER": "postgres",
        "POSTGRES_PASSWORD": "${POSTGRES_PASSWORD}",
        "NODE_ENV": "development"
      }
    }
  }
}
```

### 3. Codex Configuration
**File**: `.codex/mcp-config.json`
```json
{
  "mcpServers": {
    "asb-cli": {
      "command": "node",
      "args": [
        "C:\\xampp\\htdocs\\alice-semantic-bridge\\scripts\\asb-mcp-wrapper.js"
      ],
      "env": {
        "AGENT_NAME": "codex",
        "PROJECT_KEY": "alice-semantic-bridge",
        "REDIS_HOST": "localhost",
        "REDIS_PORT": "6379",
        "REDIS_DB": "2",
        "POSTGRES_HOST": "localhost",
        "POSTGRES_PORT": "5432",
        "POSTGRES_DB": "asemb",
        "POSTGRES_USER": "postgres",
        "POSTGRES_PASSWORD": "${POSTGRES_PASSWORD}",
        "NODE_ENV": "development"
      }
    }
  }
}
```

## 🔧 Setup Instructions

### 1. Install Dependencies
```bash
cd C:\xampp\htdocs\alice-semantic-bridge
npm install redis
```

### 2. Apply Configuration
```bash
# Claude
copy .claude\mcp-config.json .claude\mcp-config.json.backup
# Update with the wrapper path

# Gemini  
ren .gemini\mcp_config.json .gemini\mcp_config.json.old
# Use only mcp-config.json with wrapper

# Codex
copy .codex\mcp-config-simple.json .codex\mcp-config.json
# Update with the wrapper path
```

### 3. Test Communication
```bash
# Terminal 1 - Test Claude
set AGENT_NAME=claude
node scripts\agent-communication.js claude

# Terminal 2 - Test Gemini
set AGENT_NAME=gemini  
node scripts\agent-communication.js gemini

# Terminal 3 - Test Codex
set AGENT_NAME=codex
node scripts\agent-communication.js codex
```

## 📊 Redis Communication Channels

### Channel Structure
- **Agent-specific**: `alice-semantic-bridge:agent:{agent_name}`
- **Broadcast**: `alice-semantic-bridge:broadcast`
- **Status**: `alice-semantic-bridge:agent:{agent_name}:status`
- **Shared Memory**: `alice-semantic-bridge:memory:{key}`

### Message Types
1. **Task Assignment**
   ```json
   {
     "type": "task",
     "id": "task-123",
     "name": "Generate embeddings",
     "sender": "claude",
     "data": {}
   }
   ```

2. **Query/Response**
   ```json
   {
     "type": "query",
     "id": "query-456",
     "question": "What's the status of embedding task?",
     "sender": "gemini"
   }
   ```

3. **Status Update**
   ```json
   {
     "type": "status-update",
     "agent": "codex",
     "status": "busy",
     "currentTask": "Building n8n node",
     "memory": 45.2,
     "uptime": 3600
   }
   ```

## 🔍 Monitoring

### Check Agent Status
```bash
# Using Redis CLI
redis-cli -n 2
GET alice-semantic-bridge:agent:claude:status
GET alice-semantic-bridge:agent:gemini:status  
GET alice-semantic-bridge:agent:codex:status

# Monitor all messages
redis-cli -n 2 MONITOR | grep "alice-semantic-bridge"
```

### Dashboard Integration
The dashboard at `http://localhost:8080` will automatically show:
- Agent online/offline status
- Current tasks
- Memory usage
- Inter-agent messages

## 🌐 Production Deployment (luwi.dev)

For production on luwi.dev, update the environment variables:
```json
"REDIS_HOST": "91.99.229.96",
"POSTGRES_HOST": "91.99.229.96",
"NODE_ENV": "production"
```

## ✅ Benefits

1. **Unified Configuration**: All agents use the same setup
2. **Inter-agent Communication**: Agents can collaborate via Redis
3. **Status Monitoring**: Real-time agent status tracking
4. **Shared Memory**: Agents can share data and context
5. **Scalable**: Easy to add more agents or scale horizontally

## 🐛 Troubleshooting

### ASB-CLI Not Starting
```bash
# Check if ASB-CLI exists
dir C:\mcp-servers\asb-cli\index.js

# Test directly
node C:\mcp-servers\asb-cli\index.js
```

### Redis Connection Issues
```bash
# Test Redis
redis-cli ping

# Check Redis is using correct database
redis-cli -n 2 INFO keyspace
```

### Agent Not Communicating
```bash
# Check wrapper is running
ps aux | findstr asb-mcp-wrapper

# Check Redis subscriptions
redis-cli -n 2 PUBSUB CHANNELS
```

---

🎆 With this setup, all three agents can work together seamlessly through Redis-based communication while sharing the same ASB-CLI MCP server!