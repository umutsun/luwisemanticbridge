# 🚀 ASB MVP Deployment Guide

## 📋 Pre-Deployment Checklist

### 1. Environment Preparation
```bash
# Verify all dependencies
npm run verify-deps

# Run test suite
npm test

# Build the n8n node
npm run build
```

### 2. Configuration Check
- [ ] `.env.asemb` configured with production values
- [ ] PostgreSQL with pgvector extension ready
- [ ] Redis server accessible
- [ ] n8n instance configured
- [ ] All API keys and credentials set

## 🐳 Docker Deployment

### Quick Start
```bash
# Start all services
docker-compose up -d

# With optional services
docker-compose --profile with-neo4j --profile with-dashboard up -d

# Check status
docker-compose ps
```

### Service URLs
- **API**: http://localhost:3000
- **Dashboard**: http://localhost:3001
- **n8n**: http://localhost:5678
- **Redis Commander**: http://localhost:8001
- **Adminer**: http://localhost:8080

## 🔧 Manual Deployment

### 1. Database Setup
```sql
-- Create database and enable pgvector
CREATE DATABASE asemb;
\c asemb;
CREATE EXTENSION IF NOT EXISTS vector;

-- Run migrations
psql -U asemb_user -d asemb -f scripts/init-db.sql
```

### 2. Redis Setup
```bash
# Start Redis with persistence
redis-server --appendonly yes --requirepass your_password

# Verify connection
redis-cli -a your_password ping
```

### 3. API Server
```bash
cd api
npm install
npm run start:prod
```

### 4. n8n Node Installation
```bash
# Build the node
npm run build

# Copy to n8n custom nodes
cp -r dist/* ~/.n8n/nodes/

# Restart n8n
n8n start
```

## 📊 Dashboard Access

### Local Development
```bash
cd dashboard
# Open index.html in browser
# Or use a local server:
python -m http.server 8000
```

### Production Setup
```bash
# Using Nginx
cp -r dashboard /var/www/asb-dashboard
# Configure nginx to serve static files
```

## 🔍 Verification Steps

### 1. Health Checks
```bash
# API Health
curl http://localhost:3000/api/v1/health

# Redis Connection
curl http://localhost:3000/api/v1/redis/ping

# Database Connection
curl http://localhost:3000/api/v1/db/status
```

### 2. n8n Node Test
1. Open n8n UI (http://localhost:5678)
2. Create new workflow
3. Add "Alice Semantic Bridge" node
4. Test Upsert operation with sample data

### 3. Agent Communication Test
```javascript
// Test shared memory
const testData = {
    projectKey: 'alice-semantic-bridge',
    agent: 'claude',
    data: { test: 'Hello from deployment' }
};

// POST to API
fetch('http://localhost:3000/api/v1/agents/memory', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(testData)
});
```

## 🚨 Troubleshooting

### Common Issues

1. **PostgreSQL Connection Error**
   ```bash
   # Check PostgreSQL status
   pg_isready -h localhost -p 5432
   # Verify credentials
   psql -U asemb_user -d asemb -c "SELECT 1;"
   ```

2. **Redis Connection Failed**
   ```bash
   # Test Redis
   redis-cli -a your_password ping
   # Check Redis logs
   docker logs asemb-redis
   ```

3. **n8n Node Not Appearing**
   ```bash
   # Clear n8n cache
   rm -rf ~/.n8n/.cache
   # Restart n8n
   n8n start --tunnel
   ```

4. **Dashboard Not Loading Data**
   - Check browser console for CORS errors
   - Verify API is running: `curl http://localhost:3000/api/v1/health`
   - Check network tab for failed requests

## 🔐 Security Considerations

1. **Environment Variables**
   - Never commit `.env` files
   - Use strong passwords
   - Rotate API keys regularly

2. **Network Security**
   - Use HTTPS in production
   - Configure firewall rules
   - Limit Redis/PostgreSQL access

3. **n8n Security**
   - Enable authentication
   - Use webhook authentication
   - Restrict node access

## 📈 Performance Optimization

### 1. Database Tuning
```sql
-- Optimize for read-heavy workloads
ALTER TABLE documents SET (fillfactor = 90);
CREATE INDEX CONCURRENTLY idx_documents_search 
  ON documents USING GIN(to_tsvector('english', content));
```

### 2. Redis Optimization
```bash
# Set memory limits
redis-cli CONFIG SET maxmemory 2gb
redis-cli CONFIG SET maxmemory-policy allkeys-lru
```

### 3. Connection Pooling
```javascript
// In API configuration
const poolConfig = {
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
};
```

## 🎯 Post-Deployment Tasks

1. **Monitor System**
   - Check dashboard metrics
   - Review logs for errors
   - Test all workflows

2. **Backup Configuration**
   ```bash
   # Backup database
   pg_dump -U asemb_user asemb > backup_$(date +%Y%m%d).sql
   
   # Backup Redis
   redis-cli -a your_password BGSAVE
   ```

3. **Documentation**
   - Update API documentation
   - Document any custom configurations
   - Create runbooks for common tasks

## 🆘 Support Resources

- **Logs Location**:
  - API: `./logs/api.log`
  - n8n: `~/.n8n/logs/`
  - PostgreSQL: `/var/log/postgresql/`
  - Redis: `/var/log/redis/`

- **Debug Mode**:
  ```bash
  # Enable debug logging
  export DEBUG=asb:*
  export NODE_ENV=development
  ```

- **Health Endpoints**:
  - `/api/v1/health` - Overall system health
  - `/api/v1/metrics` - Performance metrics
  - `/api/v1/agents/status` - Agent status

## ✅ Success Criteria

- [ ] All services running without errors
- [ ] Dashboard shows all agents online
- [ ] n8n workflow executes successfully
- [ ] Search latency < 100ms
- [ ] Cache hit rate > 60%
- [ ] No errors in last 24 hours

---

## 🎉 Deployment Complete!

Once all checks pass, your ASB MVP is ready for production use.

For ongoing monitoring, keep the dashboard open and watch for any anomalies.

Happy semantic bridging! 🌉