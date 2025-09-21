# ASB Shared Memory System - Fixed and Working! ✅

## 🎯 Problem Solved
The issue where agents (Claude, Gemini, Codex) couldn't access shared memory has been fixed. The system now provides a robust Redis-based shared memory infrastructure for multi-agent collaboration.

## 📁 New Files Created

### 1. Core Shared Memory Module
**Location:** `shared/asb-memory.js`
- Full-featured shared memory class
- Agent registration and discovery
- Task queue management
- Context sharing
- Real-time messaging via Pub/Sub
- Heartbeat monitoring

### 2. Agent Bridge Example
**Location:** `.claude/agent-bridge.js`
- Claude agent implementation
- Shows how agents connect to shared memory
- Task processing example
- Context sharing patterns

### 3. Test Scripts
- `test-shared-memory.js` - Basic Redis connectivity test
- `test-agent-communication.js` - Full agent communication demo
- `init-shared-memory.js` - Initialize shared memory system

## 🚀 Quick Start

### Step 1: Initialize Shared Memory
```bash
node init-shared-memory.js
```

### Step 2: Test Agent Communication
```bash
node test-agent-communication.js
```

### Step 3: Run Agent
```bash
node .claude/agent-bridge.js
```

## 📋 How It Works

### Redis Structure
The system uses Redis DB 2 with the following key patterns:
```
alice-semantic-bridge:agent:{agentName}     # Agent registration data
alice-semantic-bridge:context:{key}         # Shared context
alice-semantic-bridge:queue:{taskType}      # Task queues
alice-semantic-bridge:processing:{taskId}   # Tasks being processed
alice-semantic-bridge:completed:{taskId}    # Completed tasks
alice-semantic-bridge:messages              # Pub/Sub channel
```

### Agent Integration Pattern

```javascript
// 1. Import the shared memory module
const ASBSharedMemory = require('./shared/asb-memory');

// 2. Create instance with project key
const memory = new ASBSharedMemory('alice-semantic-bridge');

// 3. Connect to Redis
await memory.connect();

// 4. Register agent
await memory.registerAgent('myAgent', ['capability1', 'capability2']);

// 5. Share context
await memory.setContext('myData', { key: 'value' });

// 6. Get shared context
const data = await memory.getContext('otherAgentData');

// 7. Queue task
await memory.queueTask('taskType', { taskData: 'value' });

// 8. Process tasks
const task = await memory.getNextTask('taskType');
// ... do work ...
await memory.completeTask(task.id, { result: 'success' });

// 9. Send messages
await memory.broadcast({ type: 'notification', data: 'Hello all' });
await memory.sendToAgent('targetAgent', { type: 'request', data: 'value' });

// 10. Cleanup
await memory.disconnect();
```

## 🔧 MCP Integration

### For Claude Desktop
The ASB-CLI MCP server can now access this shared memory. Configure in `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "asb-cli": {
      "command": "node",
      "args": ["C:\\mcp-servers\\asb-cli\\index.js"],
      "env": {
        "REDIS_HOST": "localhost",
        "REDIS_PORT": "6379",
        "REDIS_DB": "2",
        "PROJECT_KEY": "alice-semantic-bridge"
      }
    }
  }
}
```

### MCP Commands Available
Through the ASB-CLI MCP server, you can:
- `asb_project("current")` - Get current project
- `asb_file("read", ["shared/asb-memory.js"])` - Read files
- `asb_exec("node test-agent-communication.js")` - Execute commands

## 🎭 Agent Roles

### Claude (CTO Agent)
- Architecture design
- Code review
- Documentation
- System integration

### Gemini (Performance Agent)
- Performance optimization
- Load testing
- Resource monitoring
- Caching strategies

### Codex (Generator Agent)
- Code generation
- Template creation
- Refactoring
- Automation scripts

## 📊 Monitoring

### Check System Status
```javascript
const stats = await memory.getStats();
console.log(stats);
// Output:
// {
//   projectKey: 'alice-semantic-bridge',
//   activeAgents: 3,
//   agents: [...],
//   contextKeys: 5,
//   queues: { ... },
//   timestamp: '2025-01-28T...'
// }
```

### View Active Agents
```javascript
const agents = await memory.getAgents();
agents.forEach(agent => {
  console.log(`${agent.name}: ${agent.status}`);
});
```

## 🐛 Troubleshooting

### Issue: Redis Connection Failed
```bash
# Check if Redis is running
redis-cli ping

# Check Redis DB 2
redis-cli -n 2 ping
```

### Issue: Agents Not Visible
```bash
# Run initialization
node init-shared-memory.js

# Check agent registration
redis-cli -n 2 keys "alice-semantic-bridge:agent:*"
```

### Issue: Tasks Not Processing
```bash
# Check task queues
redis-cli -n 2 keys "alice-semantic-bridge:queue:*"

# Check queue length
redis-cli -n 2 llen "alice-semantic-bridge:queue:code-review"
```

## 🔄 Next Steps

1. **Integrate with n8n workflows**
   - Create n8n nodes that interact with shared memory
   - Build workflows that coordinate agents

2. **Add DeepSeek Agent**
   - Create `.deepseek/agent-bridge.js`
   - Register with shared memory system

3. **Build Dashboard**
   - Real-time agent monitoring
   - Task queue visualization
   - Performance metrics

4. **Implement Advanced Features**
   - Agent voting mechanisms
   - Consensus protocols
   - Load balancing

## 📚 API Reference

### ASBSharedMemory Class

| Method | Description | Parameters | Returns |
|--------|-------------|------------|---------|
| `connect()` | Connect to Redis | None | Promise<void> |
| `registerAgent(name, capabilities)` | Register agent | name: string, capabilities: string[] | Promise<AgentData> |
| `getAgents()` | Get all active agents | None | Promise<Agent[]> |
| `setContext(key, value, ttl?)` | Share context | key: string, value: any, ttl?: number | Promise<{key, stored}> |
| `getContext(key)` | Get shared context | key: string | Promise<any> |
| `queueTask(type, data)` | Queue a task | type: string, data: object | Promise<Task> |
| `getNextTask(type)` | Get task from queue | type: string | Promise<Task|null> |
| `completeTask(id, result)` | Mark task complete | id: string, result: object | Promise<Task> |
| `broadcast(message)` | Broadcast to all | message: object | Promise<void> |
| `sendToAgent(name, message)` | Send to specific agent | name: string, message: object | Promise<void> |
| `heartbeat(name)` | Update agent heartbeat | name: string | Promise<void> |
| `cleanupInactiveAgents(ms)` | Remove inactive agents | ms: number | Promise<string[]> |
| `getStats()` | Get system stats | None | Promise<Stats> |
| `disconnect()` | Close connections | None | Promise<void> |

## ✅ Summary

The shared memory system is now fully operational! All agents can:
- ✅ Connect to Redis DB 2
- ✅ Register themselves
- ✅ Share context data
- ✅ Exchange messages
- ✅ Process tasks collaboratively
- ✅ Monitor system status

The ASB-CLI MCP server provides the bridge between Claude Desktop and this shared memory system, enabling seamless multi-agent collaboration.

---
*Last Updated: January 28, 2025*
*Version: 2.0.0*
*Status: WORKING ✅*
