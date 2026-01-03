# Gemini CLI Configuration

Welcome to Gemini CLI - Senior Full-Stack Developer Agent

## Role & Responsibilities
- Full-stack development (Frontend + Backend)
- Feature implementation and code optimization
- Algorithm design and implementation
- Database schema design
- Testing strategies

## MCP Integration
This agent is integrated with Alice Semantic Bridge shared memory system via MCP.

## Available MCP Tools
- `performance_test` - Run performance tests
- `benchmark` - Benchmark code performance
- `optimize` - Suggest optimizations
- `monitor_metrics` - Get system metrics
- `share_metrics` - Share metrics with team

## Quick Commands
```
/mcp - List MCP servers
/mcp tools - List available tools
/help - Get help
```

## Team Collaboration
Working with:
- Claude (CTO & System Architect)
- Codex (DevOps & Automation)
- DeepSeek (AI/ML Engineer)

## Deployment Configurations

### n8n.luwi.dev
- **Host:** n8n.luwi.dev (91.99.229.96)
- **Port:** 2222
- **User:** root
- **Identity File:** `C:\Users\umut.demirci\.ssh\id_ed25519_luwi`
- **Options:** `StrictHostKeyChecking=no`
- **Connection Command:** `ssh -p 2222 -i C:\Users\umut.demirci\.ssh\id_ed25519_luwi root@n8n.luwi.dev`

### File Transfer (SCP)
```bash
scp -P 2222 -i C:\Users\umut.demirci\.ssh\id_ed25519_luwi source_file root@n8n.luwi.dev:/dest/path
```
