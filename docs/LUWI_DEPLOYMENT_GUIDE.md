# 🌐 ASB Deployment Guide for luwi.dev

## Server Information
- **n8n URL**: https://n8n.luwi.dev
- **Server IP**: 91.99.229.96
- **PostgreSQL**: Already running on server
- **Target Directory**: `/opt/alice-semantic-bridge`

## 🛠️ Quick Deployment Steps

### 1. Prepare Environment File
```bash
# Copy and edit the luwi environment file
cp .env.luwi .env.production

# Edit with your actual credentials:
# - N8N_API_KEY
# - POSTGRES_PASSWORD 
# - REDIS_PASSWORD
# - CLAUDE_API_KEY
# - GEMINI_API_KEY
# - CODEX_API_KEY
```

### 2. Build Project Locally
```bash
# Install dependencies and build
npm install
npm run build

# Run tests
npm test
```

### 3. Deploy to Server

#### Option A: Using Deployment Script
```bash
# Make script executable
chmod +x deploy-to-luwi-updated.sh

# Run deployment
./deploy-to-luwi-updated.sh
```

#### Option B: Manual Deployment
```bash
# 1. Create deployment package
tar -czf asb-deploy.tar.gz \
  dist/ api/ dashboard/ scripts/ \
  package.json package-lock.json \
  .env.production docker-compose.yml

# 2. Transfer to server
scp asb-deploy.tar.gz root@91.99.229.96:/tmp/

# 3. SSH to server
ssh root@91.99.229.96

# 4. Extract and setup
cd /opt
mkdir -p alice-semantic-bridge
cd alice-semantic-bridge
tar -xzf /tmp/asb-deploy.tar.gz

# 5. Install dependencies
npm install --production

# 6. Setup database
PGPASSWORD=$POSTGRES_PASSWORD psql -U postgres -c "CREATE DATABASE IF NOT EXISTS asemb;"
PGPASSWORD=$POSTGRES_PASSWORD psql -U postgres -d asemb -c "CREATE EXTENSION IF NOT EXISTS vector;"
PGPASSWORD=$POSTGRES_PASSWORD psql -U postgres -d asemb < scripts/init-db.sql

# 7. Start services
# Using PM2 (recommended)
npm install -g pm2
pm2 start api/server.js --name asb-api
pm2 save
pm2 startup

# Or using systemd service (created by deployment script)
systemctl start asb-api
systemctl enable asb-api
```

### 4. Install n8n Node
```bash
# On the server, find n8n custom nodes directory
find / -name ".n8n" -type d 2>/dev/null

# Copy the built node
cp -r /opt/alice-semantic-bridge/dist/* /root/.n8n/nodes/

# Restart n8n
# If using Docker:
docker restart n8n

# If using PM2:
pm2 restart n8n

# If using systemd:
systemctl restart n8n
```

### 5. Setup Nginx (Optional)
```bash
# Install Nginx if not present
apt update && apt install -y nginx

# Create configuration
cat > /etc/nginx/sites-available/asb << 'EOF'
server {
    listen 80;
    server_name asb.luwi.dev;

    # Dashboard
    location / {
        root /opt/alice-semantic-bridge/dashboard;
        try_files $uri $uri/ /index-luwi.html;
    }

    # API Proxy
    location /api {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
EOF

# Enable site
ln -s /etc/nginx/sites-available/asb /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
```

### 6. Configure Firewall
```bash
# Allow required ports
ufw allow 3000/tcp  # API
ufw allow 8080/tcp  # Dashboard (if not using Nginx)
ufw allow 80/tcp    # HTTP
ufw allow 443/tcp   # HTTPS
```

## 🔍 Verification

### Check Services
```bash
# API Health
curl http://91.99.229.96:3000/api/v1/health

# Redis Connection
curl http://91.99.229.96:3000/api/v1/redis/ping

# Database Status
curl http://91.99.229.96:3000/api/v1/db/status
```

### Test n8n Integration
1. Go to https://n8n.luwi.dev
2. Create new workflow
3. Search for "Alice Semantic Bridge" node
4. Configure and test the node

### Access Dashboard
- **Direct**: http://91.99.229.96:8080/index-luwi.html
- **Via Nginx**: http://asb.luwi.dev (if configured)

## 📡 API Endpoints

### Base URL
```
http://91.99.229.96:3000/api/v1
```

### Key Endpoints
- `GET /health` - System health check
- `GET /agents/status` - Agent status
- `GET /metrics/performance` - Performance metrics
- `GET /workflows` - n8n workflow list
- `POST /documents/upsert` - Upsert documents
- `POST /documents/search` - Search documents

## 🔒 Security Notes

1. **Production Checklist**:
   - [ ] Change all default passwords
   - [ ] Enable SSL certificates
   - [ ] Configure firewall rules
   - [ ] Set up regular backups
   - [ ] Enable monitoring

2. **SSL Setup** (Using Let's Encrypt):
   ```bash
   apt install certbot python3-certbot-nginx
   certbot --nginx -d asb.luwi.dev
   ```

3. **Backup Script**:
   ```bash
   # Create backup script
   cat > /opt/backup-asb.sh << 'EOF'
   #!/bin/bash
   DATE=$(date +%Y%m%d_%H%M%S)
   BACKUP_DIR="/opt/backups"
   mkdir -p $BACKUP_DIR
   
   # Backup database
   PGPASSWORD=$POSTGRES_PASSWORD pg_dump -U postgres asemb > $BACKUP_DIR/asemb_$DATE.sql
   
   # Backup Redis
   redis-cli -a $REDIS_PASSWORD BGSAVE
   cp /var/lib/redis/dump.rdb $BACKUP_DIR/redis_$DATE.rdb
   
   # Keep only last 7 days
   find $BACKUP_DIR -mtime +7 -delete
   EOF
   
   chmod +x /opt/backup-asb.sh
   
   # Add to crontab
   echo "0 2 * * * /opt/backup-asb.sh" | crontab -
   ```

## 🔄 Maintenance

### Update Deployment
```bash
# Pull latest changes
git pull origin main

# Rebuild and redeploy
npm run build
./deploy-to-luwi-updated.sh
```

### Monitor Logs
```bash
# API logs
tail -f /opt/alice-semantic-bridge/logs/api.log

# PM2 logs
pm2 logs asb-api

# System logs
journalctl -u asb-api -f
```

### Restart Services
```bash
# API
systemctl restart asb-api
# or
pm2 restart asb-api

# Redis
systemctl restart redis

# n8n
docker restart n8n
```

## 🆘 Troubleshooting

### API Not Responding
```bash
# Check if running
systemctl status asb-api
ps aux | grep node

# Check logs
tail -100 /opt/alice-semantic-bridge/logs/api-error.log

# Test database connection
PGPASSWORD=$POSTGRES_PASSWORD psql -h localhost -U postgres -d asemb -c "SELECT 1;"
```

### n8n Node Not Appearing
```bash
# Check installation path
ls -la /root/.n8n/nodes/

# Restart n8n with clean cache
docker exec n8n rm -rf /home/node/.n8n/.cache
docker restart n8n
```

### Dashboard Connection Issues
```bash
# Check CORS settings
curl -H "Origin: http://91.99.229.96:8080" \
     -H "Access-Control-Request-Method: GET" \
     -H "Access-Control-Request-Headers: X-Requested-With" \
     -X OPTIONS \
     http://91.99.229.96:3000/api/v1/health -v
```

---

## 🎆 Success!

Once deployed, you should have:
- ✅ API running at http://91.99.229.96:3000
- ✅ Dashboard accessible at http://91.99.229.96:8080
- ✅ n8n node available at https://n8n.luwi.dev
- ✅ Multi-agent system with Redis shared memory

For support or issues, check the logs and ensure all services are running correctly.