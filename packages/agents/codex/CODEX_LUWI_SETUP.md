# 🤖 Codex Setup for ASB luwi.dev Deployment

## 🚀 Quick Start

### 1. Environment Setup
```bash
# Copy and configure environment
cp .codex/.env.example .codex/.env
# Edit .codex/.env with your actual credentials
```

### 2. MCP Configuration

#### For luwi.dev deployment:
```bash
# Use the luwi-specific MCP config
cp .codex/mcp-config-luwi.json .codex/mcp-config.json
```

#### Local development:
```bash
# Use the default local config
cp .codex/mcp-config.json.backup .codex/mcp-config.json
```

### 3. Install MCP Servers

```bash
# Install required MCP servers
npm install -g @modelcontextprotocol/server-filesystem
npm install -g @modelcontextprotocol/server-fetch
npm install -g @modelcontextprotocol/server-postgres
npm install -g @modelcontextprotocol/server-n8n

# For Git MCP (Python)
pip install mcp-server-git
```

## 📋 Available Commands

### Deployment Commands
```bash
# Deploy to luwi.dev
codex deploy luwi
# or use alias
codex dl

# Test remote deployment
codex test remote
# or
codex tl

# View logs
codex logs luwi
# or
codex ll

# Backup server
codex backup luwi
# or
codex bl
```

### MCP Tools Available

#### ASB-CLI Tools:
- `asb_status` - Get project status
- `asb_search` - Search with pgvector
- `asb_embed` - Generate embeddings
- `asb_webscrape` - Scrape and embed web content
- `asb_workflow` - Manage n8n workflows
- `asb_database` - Database operations
- `asb_redis` - Redis cache operations
- `asb_deploy_luwi` - Deploy to luwi.dev

#### Standard MCP Tools:
- Filesystem access (project root)
- Git operations
- HTTP/Web fetching
- Direct PostgreSQL access
- n8n workflow management

## 🔧 Configuration Details

### Remote Server Connection
```json
{
  "remoteServer": {
    "host": "91.99.229.96",
    "name": "luwi.dev",
    "n8nUrl": "https://n8n.luwi.dev"
  }
}
```

### Database Connection
- **Host**: 91.99.229.96
- **Port**: 5432
- **Database**: lsemb
- **User**: lsemb_user
- **SSL**: Required

### Redis Connection
- **Host**: 91.99.229.96
- **Port**: 6379
- **Database**: 2
- **Auth**: Password required

## 🎯 Common Tasks

### 1. Deploy New Version
```bash
# Build and deploy
codex deploy luwi

# Verify deployment
codex test remote
```

### 2. Debug Issues
```bash
# Check API health
curl http://91.99.229.96:3000/api/v1/health

# View logs
codex logs luwi

# Check database connection
codex run "asb_database --status"
```

### 3. Sync Data
```bash
# Sync Redis cache
codex sync redis

# Backup before major changes
codex backup luwi
```

## 🔐 Security Notes

1. **SSH Keys**: Ensure SSH key authentication is set up for root@91.99.229.96
2. **Environment Variables**: Never commit `.env` files
3. **API Keys**: Use strong, unique API keys for production
4. **Firewall**: Ensure only necessary ports are open (3000, 8080)

## 🐛 Troubleshooting

### MCP Server Not Starting
```bash
# Check MCP server installation
npm list -g | grep modelcontextprotocol

# Verify config syntax
jq . .codex/mcp-config.json

# Test ASB-CLI directly
node C:\mcp-servers\asb-cli\index.js
```

### Connection Issues
```bash
# Test PostgreSQL connection
PGPASSWORD=$POSTGRES_PASSWORD psql -h 91.99.229.96 -U lsemb_user -d lsemb -c "SELECT 1;"

# Test Redis connection
redis-cli -h 91.99.229.96 -a $REDIS_PASSWORD ping

# Test n8n API
curl -I https://n8n.luwi.dev
```

### Deployment Failures
```bash
# Check server disk space
ssh root@91.99.229.96 'df -h'

# Check service status
ssh root@91.99.229.96 'systemctl status asb-api'

# View error logs
ssh root@91.99.229.96 'tail -100 /opt/alice-semantic-bridge/logs/error.log'
```

## 📚 Resources

- [MCP Documentation](https://modelcontextprotocol.io/)
- [ASB Project Documentation](../README.md)
- [luwi.dev Deployment Guide](../LUWI_DEPLOYMENT_GUIDE.md)
- [n8n API Documentation](https://docs.n8n.io/api/)

---

## 🎉 Ready to Deploy!

With Codex configured, you can now:
1. ✅ Deploy to luwi.dev with a single command
2. ✅ Monitor and debug remotely
3. ✅ Manage n8n workflows
4. ✅ Access all MCP tools for development

Happy coding! 🚀