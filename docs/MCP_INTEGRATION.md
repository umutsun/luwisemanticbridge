# MCP Server Integration Guide for ASB-CLI

## Problem
- Claude Desktop uses JSON format for config (`claude_desktop_config.json`)
- Codex CLI uses TOML format for config (`config.toml`)
- Different tools need different configuration formats

## Solution

### 1. For Claude Desktop (JSON)
Add this to your `%APPDATA%\Claude\claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "asb-cli": {
      "command": "node",
      "args": ["C:\\xampp\\htdocs\\alice-semantic-bridge\\tools\\asb-cli\\dist\\index.js"],
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
        "NODE_ENV": "development"
      }
    }
  }
}
```

### 2. For Codex CLI (TOML)
Your `.codex/config.toml` should contain:

```toml
# MCP Server configuration for ASB-CLI
[mcp_servers.asb-cli]
command = "node"
args = ["C:\\xampp\\htdocs\\alice-semantic-bridge\\tools\\asb-cli\\dist\\index.js"]

[mcp_servers.asb-cli.env]
AGENT_NAME = "codex"
PROJECT_KEY = "alice-semantic-bridge"
REDIS_HOST = "localhost"
REDIS_PORT = "6379"
REDIS_DB = "2"
```

### 3. ASB-CLI MCP Server Setup

First, ensure ASB-CLI is built and ready:

```bash
cd tools/asb-cli
npm install
npm run build
```

The MCP server should export the following tools:
- `project_status` - Get project status
- `list_agents` - List active agents
- `create_task` - Create tasks
- `share_context` - Share context between agents
- `get_context` - Get shared context
- `broadcast_message` - Broadcast to all agents

### 4. Testing

Test the MCP server directly:
```bash
node tools/asb-cli/dist/index.js
```

Test from Claude:
```
/mcp call asb-cli project_status
```

Test from Codex:
```bash
codex mcp asb-cli project_status
```

## Current Status
- ✅ ASB-CLI configuration created
- ✅ MCP server structure defined
- ⚠️ Claude Desktop may need restart to recognize new MCP server
- ⚠️ Codex needs proper TOML format (not JSON)

## Notes
- Each tool has its own config format requirements
- MCP servers communicate over stdio
- Redis is used for shared memory between agents
- PostgreSQL stores persistent data