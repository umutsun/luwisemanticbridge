# ASB CLI - Agent Communication & Shared Memory System

## 📡 Overview

ASB CLI (Alice Semantic Bridge Command Line Interface) is a Redis-backed shared memory system that enables real-time communication and context sharing between multiple AI agents (Claude, Gemini, Codex) working on the same project.

## 🏗️ Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Claude Agent  │     │   Gemini Agent  │     │   Codex Agent   │
│      (CTO)      │     │   (Performance) │     │ (Implementation) │
└────────┬────────┘     └────────┬────────┘     └────────┬────────┘
         │                       │                         │
         └───────────────────────┼─────────────────────────┘
                                 │
                    ┌────────────▼────────────┐
                    │      ASB CLI MCP        │
                    │  (Model Context Proto)  │
                    └────────────┬────────────┘
                                 │
                    ┌────────────▼────────────┐
                    │     Redis Database      │
                    │   (Shared Memory Store) │
                    └─────────────────────────┘
```

## 🔧 Installation & Setup

### 1. Install Redis
```bash
# Windows (using Chocolatey)
choco install redis-64

# Or use Memurai (Windows Redis alternative)
# Download from: https://www.memurai.com/

# Start Redis
redis-server
```

### 2. Configure MCP Server
```json
// Claude Desktop config: %APPDATA%/Claude/claude_desktop_config.json
{
  "mcpServers": {
    "asb-cli": {
      "command": "node",
      "args": ["C:/path/to/asb-cli/index.js"],
      "env": {
        "REDIS_URL": "redis://localhost:6379",
        "PROJECT_KEY": "alice-semantic-bridge"
      }
    }
  }
}
```

### 3. Environment Variables
```bash
# .env file
REDIS_URL=redis://localhost:6379
PROJECT_KEY=alice-semantic-bridge
AGENT_NAME=claude  # or gemini, codex
```

## 📚 Command Reference

### Project Management

#### `asb project list`
Lists all available projects in Redis.
```bash
asb project list
# Output:
# 1. alice-semantic-bridge (active)
# 2. another-project
# 3. test-project
```

#### `asb project switch <name|number>`
Switches the active project context.
```bash
asb project switch alice-semantic-bridge
# or
asb project switch 1
```

#### `asb project create <name>`
Creates a new project namespace.
```bash
asb project create my-new-project
```

#### `asb project current`
Shows the currently active project.
```bash
asb project current
# Output: alice-semantic-bridge
```

### File Operations

#### `asb file read <path>`
Reads a file and stores it in shared context.
```bash
asb file read src/index.ts
# Stores: File content + metadata in Redis
# Other agents can see this file was read
```

#### `asb file write <path> <content>`
Writes content to a file and logs the operation.
```bash
asb file write src/config.ts "export const config = {};"
# Stores: Write operation in history
# Notifies: Other agents about the change
```

#### `asb file list [directory]`
Lists files in a directory with context.
```bash
asb file list src/
# Shows: Files with last modified by which agent
```

### Command Execution

#### `asb exec <command>`
Executes a shell command in project context.
```bash
asb exec "npm install express"
# Logs: Command and output to shared memory
# Context: Available to all agents
```

### Context Management

#### `asb context <type> [limit]`
Views different types of shared context.

Types:
- `command` - Command execution history
- `file_read` - File reading history  
- `file_write` - File writing history
- `development` - Development actions
- `decision` - Architectural decisions
- `performance` - Performance metrics
- `all` - All context types

```bash
asb context development 10
# Shows: Last 10 development actions

asb context decision
# Shows: All architectural decisions made
```

### Agent Communication

#### `agent_context <agent> [limit]`
Retrieves context from specific agents.

Agents:
- `claude` - CTO's context
- `gemini` - Performance engineer's context
- `codex` - Implementation lead's context
- `all` - All agents' context

```bash
agent_context claude 5
# Shows: Claude's last 5 actions

agent_context all
# Shows: Recent actions from all agents
```

#### `agent_broadcast <message> [data]`
Broadcasts a message to all agents.
```bash
agent_broadcast "Starting database migration"
# Notifies: All agents receive this message

agent_broadcast "Performance issue found" '{"query": "slow", "time": 500}'
# Broadcasts: Message with additional JSON data
```

## 📦 Data Structure in Redis

### Key Patterns
```
project:<project_name>:context:command:<timestamp>
project:<project_name>:context:file_read:<timestamp>
project:<project_name>:context:file_write:<timestamp>
project:<project_name>:context:development:<timestamp>
project:<project_name>:agent:<agent_name>:action:<timestamp>
project:<project_name>:broadcast:<timestamp>
```

### Context Object Structure
```json
{
  "action": "file_write",
  "timestamp": "2024-01-20T10:30:00Z",
  "agent": "claude",
  "project": "alice-semantic-bridge",
  "data": {
    "path": "src/index.ts",
    "content": "...",
    "previousContent": "...",
    "diff": "..."
  },
  "metadata": {
    "reason": "Implementing new feature",
    "relatedIssue": "#123"
  }
}
```

## 🔄 Workflow Examples

### Example 1: Collaborative Feature Development
```bash
# Claude (CTO) designs the architecture
asb file write docs/architecture.md "# System Design..."
agent_broadcast "Architecture design complete, please review"

# Gemini (Performance) reviews and optimizes
agent_context claude
asb file read docs/architecture.md
asb file write docs/performance.md "# Optimization Plan..."
agent_broadcast "Performance considerations added"

# Codex (Implementation) implements
agent_context all
asb file read docs/architecture.md
asb file read docs/performance.md
asb file write src/feature.ts "// Implementation..."
asb exec "npm test"
agent_broadcast "Feature implemented and tested"
```

### Example 2: Code Review Process
```bash
# Codex generates code
asb file write src/new-feature.ts "// Generated code..."
agent_broadcast "New feature ready for review"

# Claude reviews for security
agent_context codex
asb file read src/new-feature.ts
asb context file_write 5  # See recent changes
agent_broadcast "Security review: Add input validation on line 45"

# Codex fixes issues
asb file read src/new-feature.ts
asb file write src/new-feature.ts "// Updated with validation..."
agent_broadcast "Security issues addressed"
```

### Example 3: Performance Optimization
```bash
# Gemini identifies bottleneck
asb exec "npm run benchmark"
asb context command 1  # See benchmark results
agent_broadcast "Query performance issue: 500ms for vector search"

# Gemini optimizes
asb file read src/database/queries.ts
asb file write src/database/queries.ts "// Optimized query..."
asb exec "npm run benchmark"
agent_broadcast "Performance improved: 50ms for vector search"
```

## 🎯 Best Practices

### 1. Always Use ASB for File Operations
```bash
# ❌ Don't use direct file system
fs.writeFileSync('file.txt', content)

# ✅ Use ASB CLI
asb file write file.txt "content"
```

### 2. Broadcast Important Decisions
```bash
# After making architectural decisions
agent_broadcast "Decision: Using PostgreSQL with pgvector for embeddings"
```

### 3. Check Other Agents' Context
```bash
# Before starting work
agent_context all 10  # See what others are doing
asb context development  # Check recent development
```

### 4. Document Your Actions
```bash
# Include metadata in operations
asb file write src/api.ts "// code..." --reason "Implementing REST endpoints"
```

### 5. Use Semantic Keys
```bash
# Good context keys
asb context decision:database_choice
asb context performance:vector_search

# Bad context keys
asb context thing1
asb context temp
```

## 🔒 Security Considerations

1. **Redis Security**: Ensure Redis is not exposed publicly
2. **Project Isolation**: Each project has isolated namespace
3. **No Sensitive Data**: Don't store passwords/keys in context
4. **Access Control**: Configure Redis ACL if needed

## 🐛 Troubleshooting

### Redis Connection Issues
```bash
# Check Redis is running
redis-cli ping
# Should return: PONG

# Check connection
asb exec "echo 'Testing connection'"
```

### Context Not Syncing
```bash
# Clear project cache
asb project switch --clear-cache alice-semantic-bridge

# Verify Redis has data
redis-cli
> KEYS project:alice-semantic-bridge:*
```

### MCP Server Not Responding
```bash
# Check MCP server logs
# Windows: %APPDATA%/Claude/logs/
# Look for asb-cli errors
```

## 📊 Monitoring

### View All Project Activity
```bash
# Real-time monitoring
asb context all --watch

# Activity summary
asb context all --summary
```

### Agent Activity Dashboard
```bash
# See what each agent is doing
asb agent status
# Output:
# Claude: Last active 2 min ago - Reviewing code
# Gemini: Last active 5 min ago - Running benchmarks
# Codex: Currently active - Generating tests
```

## 🚀 Advanced Features

### Custom Context Types
```bash
# Store custom context
asb context store "decision:api_design" '{"type": "REST", "reason": "Simplicity"}'

# Retrieve custom context
asb context get "decision:api_design"
```

### Batch Operations
```bash
# Execute multiple commands
asb batch << EOF
file read src/index.ts
file read src/config.ts
exec npm test
EOF
```

### Context Filtering
```bash
# Filter by agent
asb context all --agent claude

# Filter by time
asb context all --since "1 hour ago"

# Filter by action type
asb context all --type file_write
```

---

**Important**: ASB CLI is the backbone of multi-agent collaboration. All agents MUST use it for file operations and communication to maintain shared context and coordination.
