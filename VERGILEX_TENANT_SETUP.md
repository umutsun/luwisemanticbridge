# Vergilex Tenant Setup Guide

## Overview
Creating a new LSEMB tenant for **Vergilex** with isolated databases, services, and configuration.

## Port Allocation

Based on existing tenants, the next available ports:

- **Backend Port**: 8087
- **Frontend Port**: 3006
- **Python Service Port**: 8005
- **Redis DB Index**: 5

## Database Configuration

### Primary Databases
1. **vergilex_lsemb** - Main LSEMB database (schema, users, documents)
2. **vergilex_db** - Source database (migration target, custom data)

### Database Creation Steps

```bash
# SSH into server
ssh root@91.99.229.96

# Connect to PostgreSQL
psql -U postgres

# Create databases
CREATE DATABASE vergilex_lsemb OWNER postgres;
CREATE DATABASE vergilex_db OWNER postgres;

# Copy schema from lsemb to vergilex_lsemb
pg_dump -U postgres -h 91.99.229.96 lsemb --schema-only | \
  psql -U postgres -h 91.99.229.96 vergilex_lsemb

# Exit psql
\q
```

## File Structure Setup

```bash
# Create tenant directory
mkdir -p /var/www/vergilex
cd /var/www/vergilex

# Clone repository (or copy from lsemb)
git clone <your-repo-url> .
# OR
cp -r /var/www/lsemb/* /var/www/vergilex/
rm -rf /var/www/vergilex/.git
```

## Configuration Files

### 1. `.env.vergilex` (Backend)

Create `/var/www/vergilex/.env.vergilex`:

```env
# Database Configuration
POSTGRES_HOST=91.99.229.96
POSTGRES_PORT=5432
POSTGRES_USER=postgres
POSTGRES_PASSWORD=Semsiye!22
POSTGRES_DB=vergilex_lsemb

# Source Database (for migrations/transform)
SOURCE_DB_HOST=91.99.229.96
SOURCE_DB_PORT=5432
SOURCE_DB_USER=postgres
SOURCE_DB_PASSWORD=Semsiye!22
SOURCE_DB_NAME=vergilex_db

# Redis Configuration
REDIS_HOST=91.99.229.96
REDIS_PORT=6379
REDIS_PASSWORD=Semsiye!22
REDIS_DB=5

# API Configuration
PORT=8087
NODE_ENV=production
JWT_SECRET=<generate-unique-secret>
API_KEY=<generate-unique-key>

# LLM Configuration (copy from lsemb)
OPENAI_API_KEY=<your-key>
DEEPSEEK_API_KEY=<your-key>
GEMINI_API_KEY=<your-key>
GOOGLE_API_KEY=<your-key>

# File Storage
DOCUMENTS_PATH=/var/www/vergilex/docs
UPLOAD_LIMIT_MB=100

# Frontend URL
FRONTEND_URL=https://vergilex.luwi.dev

# Python Service
PYTHON_SERVICE_URL=http://localhost:8005
```

### 2. `frontend/config.json`

Update `/var/www/vergilex/frontend/config.json`:

```json
{
  "backendUrl": "https://vergilex.luwi.dev/api",
  "app": {
    "name": "Vergilex",
    "description": "Vergi Hukuku RAG Sistemi",
    "logoUrl": "/vergilex-logo.png"
  },
  "database": {
    "type": "postgresql",
    "host": "91.99.229.96",
    "port": 5432,
    "user": "postgres",
    "password": "Semsiye!22",
    "name": "vergilex_db"
  },
  "llm": {
    "provider": "deepseek",
    "model": "deepseek/deepseek-chat"
  }
}
```

### 3. `frontend/.env.local`

Create `/var/www/vergilex/frontend/.env.local`:

```env
NEXT_PUBLIC_API_URL=https://vergilex.luwi.dev/api
NEXT_PUBLIC_API_PORT=8087
NEXT_PUBLIC_APP_NAME=Vergilex
```

## PM2 Ecosystem Configuration

### Update `ecosystem.config.js`

Add vergilex services to `/var/www/vergilex/ecosystem.config.js`:

```javascript
module.exports = {
  apps: [
    // Vergilex Backend
    {
      name: 'vergilex-backend',
      script: './backend/src/server.ts',
      interpreter: 'node',
      interpreter_args: '--require ts-node/register --require tsconfig-paths/register',
      cwd: '/var/www/vergilex/backend',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: 8087,
        TS_NODE_PROJECT: './tsconfig.json'
      },
      env_file: '/var/www/vergilex/.env.vergilex',
      log_file: '/var/www/vergilex/backend/logs/backend.log',
      error_file: '/var/www/vergilex/backend/logs/backend-error.log',
      out_file: '/var/www/vergilex/backend/logs/backend-out.log',
      time: true,
      max_memory_restart: '500M',
      watch: false,
      autorestart: true
    },
    // Vergilex Frontend
    {
      name: 'vergilex-frontend',
      script: 'npm',
      args: 'start -- -p 3006',
      cwd: '/var/www/vergilex/frontend',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: 3006
      },
      log_file: '/var/www/vergilex/frontend/logs/frontend.log',
      error_file: '/var/www/vergilex/frontend/logs/frontend-error.log',
      out_file: '/var/www/vergilex/frontend/logs/frontend-out.log',
      time: true,
      max_memory_restart: '1G',
      watch: false,
      autorestart: true
    },
    // Vergilex Python Service
    {
      name: 'vergilex-python',
      script: 'python3',
      args: 'app.py',
      cwd: '/var/www/vergilex/python',
      instances: 1,
      exec_mode: 'fork',
      env: {
        PORT: 8005,
        FLASK_ENV: 'production'
      },
      log_file: '/var/www/vergilex/python/logs/python.log',
      error_file: '/var/www/vergilex/python/logs/python-error.log',
      out_file: '/var/www/vergilex/python/logs/python-out.log',
      time: true,
      max_memory_restart: '500M',
      watch: false,
      autorestart: true
    }
  ]
};
```

## luwi-devops.py Configuration

Add vergilex tenant to `/var/www/vergilex/luwi-devops.py`:

```python
TENANTS = {
    # ... existing tenants ...

    'vergilex': {
        'name': 'Vergilex',
        'path': '/var/www/vergilex',
        'db': 'vergilex_lsemb',
        'source_db': 'vergilex_db',  # Added source_db field
        'redis_db': 5,
        'backend_port': 8087,
        'frontend_port': 3006,
        'python_port': 8005,
        'url': 'https://vergilex.luwi.dev',
        'services': ['vergilex-backend', 'vergilex-frontend', 'vergilex-python']
    }
}
```

## Nginx Configuration

Create `/etc/nginx/sites-available/vergilex.luwi.dev`:

```nginx
# Vergilex Frontend (Next.js)
server {
    listen 80;
    listen [::]:80;
    server_name vergilex.luwi.dev;

    location / {
        proxy_pass http://localhost:3006;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

# Vergilex Backend API
server {
    listen 80;
    listen [::]:80;
    server_name api.vergilex.luwi.dev;

    location / {
        proxy_pass http://localhost:8087;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # CORS headers
        add_header Access-Control-Allow-Origin https://vergilex.luwi.dev always;
        add_header Access-Control-Allow-Methods "GET, POST, PUT, DELETE, OPTIONS" always;
        add_header Access-Control-Allow-Headers "Authorization, Content-Type" always;
        add_header Access-Control-Allow-Credentials true always;
    }
}
```

Enable site:
```bash
ln -s /etc/nginx/sites-available/vergilex.luwi.dev /etc/nginx/sites-enabled/
nginx -t
systemctl reload nginx
```

## Cloudflare DNS Configuration

Add DNS records in Cloudflare:

### A Records
- **vergilex.luwi.dev** → 91.99.229.96 (Proxied)
- **api.vergilex.luwi.dev** → 91.99.229.96 (Proxied)

### SSL/TLS Settings
- Mode: **Full (strict)**
- Always Use HTTPS: **On**
- Minimum TLS Version: **1.2**

## SSL Certificate (Certbot)

```bash
# Install SSL certificates
certbot --nginx -d vergilex.luwi.dev -d api.vergilex.luwi.dev

# Auto-renewal is configured via cron
```

## Deployment Steps

### Step 1: Prepare Server
```bash
# SSH into server
ssh root@91.99.229.96

# Create directory
mkdir -p /var/www/vergilex
cd /var/www/vergilex
```

### Step 2: Setup Databases
```bash
# Create databases
psql -U postgres -c "CREATE DATABASE vergilex_lsemb OWNER postgres;"
psql -U postgres -c "CREATE DATABASE vergilex_db OWNER postgres;"

# Copy schema from lsemb
pg_dump -U postgres -h 91.99.229.96 lsemb --schema-only | \
  psql -U postgres -h 91.99.229.96 vergilex_lsemb
```

### Step 3: Deploy Code
```bash
# Copy code from lsemb (or clone fresh)
cp -r /var/www/lsemb/* /var/www/vergilex/
cd /var/www/vergilex

# Clean up
rm -rf .git backend/node_modules frontend/node_modules frontend/.next
```

### Step 4: Configure Environment
```bash
# Create .env.vergilex
nano /var/www/vergilex/.env.vergilex
# Paste configuration from above

# Update frontend config
nano /var/www/vergilex/frontend/config.json
# Update with vergilex config

# Create frontend .env
nano /var/www/vergilex/frontend/.env.local
# Paste frontend env from above
```

### Step 5: Install Dependencies
```bash
# Backend
cd /var/www/vergilex/backend
npm install

# Frontend
cd /var/www/vergilex/frontend
npm install
npm run build

# Python (if needed)
cd /var/www/vergilex/python
pip3 install -r requirements.txt
```

### Step 6: Setup Nginx
```bash
# Create nginx config
nano /etc/nginx/sites-available/vergilex.luwi.dev
# Paste nginx config from above

# Enable site
ln -s /etc/nginx/sites-available/vergilex.luwi.dev /etc/nginx/sites-enabled/
nginx -t
systemctl reload nginx
```

### Step 7: Configure Cloudflare DNS
1. Login to Cloudflare
2. Select luwi.dev domain
3. Add DNS records:
   - vergilex.luwi.dev → 91.99.229.96
   - api.vergilex.luwi.dev → 91.99.229.96

### Step 8: Setup SSL
```bash
# Install certbot if not already installed
apt install certbot python3-certbot-nginx

# Get certificates
certbot --nginx -d vergilex.luwi.dev -d api.vergilex.luwi.dev
```

### Step 9: Start Services with PM2
```bash
cd /var/www/vergilex

# Start all services
pm2 start ecosystem.config.js

# Save PM2 configuration
pm2 save

# Check status
pm2 list
```

### Step 10: Test Deployment
```bash
# Test backend health
curl http://localhost:8087/api/v2/health

# Test frontend
curl http://localhost:3006

# Test via domain (after DNS propagation)
curl https://vergilex.luwi.dev
curl https://api.vergilex.luwi.dev/api/v2/health
```

## Post-Deployment Verification

### 1. Database Connectivity
```bash
# Test database connection
psql -U postgres -h 91.99.229.96 -d vergilex_lsemb -c "SELECT version();"
psql -U postgres -h 91.99.229.96 -d vergilex_db -c "SELECT version();"
```

### 2. Service Health
```bash
# Check PM2 status
pm2 status

# Check logs
pm2 logs vergilex-backend --lines 50
pm2 logs vergilex-frontend --lines 50
pm2 logs vergilex-python --lines 50
```

### 3. API Endpoints
```bash
# Health check
curl https://api.vergilex.luwi.dev/api/v2/health

# Settings
curl https://api.vergilex.luwi.dev/api/v2/settings
```

### 4. Frontend Access
- Open browser: https://vergilex.luwi.dev
- Login and verify:
  - System status shows "vergilex_db" as source database
  - All services are connected
  - Dashboard loads correctly

## Troubleshooting

### Backend won't start
```bash
# Check logs
pm2 logs vergilex-backend

# Check port availability
netstat -tulpn | grep 8087

# Verify .env file
cat /var/www/vergilex/.env.vergilex

# Test database connection
psql -U postgres -h 91.99.229.96 -d vergilex_lsemb
```

### Frontend build errors
```bash
cd /var/www/vergilex/frontend

# Clear cache
rm -rf .next node_modules
npm install
npm run build
```

### Database connection errors
```bash
# Check PostgreSQL is running
systemctl status postgresql

# Check Redis is running
systemctl status redis

# Test connections
psql -U postgres -h 91.99.229.96 -d vergilex_lsemb
redis-cli -h 91.99.229.96 -a Semsiye!22 ping
```

### SSL certificate issues
```bash
# Renew certificates
certbot renew

# Force renewal
certbot renew --force-renewal

# Check certificate status
certbot certificates
```

## Maintenance Commands

### Using luwi-devops.py
```bash
# Run devops tool
cd /var/www/vergilex
python3 luwi-devops.py

# Select tenant: vergilex
# Available actions:
# 1. Start services
# 2. Stop services
# 3. Restart services
# 4. View logs
# 5. Pull from GitHub
# 6. Build TypeScript
# 7. Clear Next.js cache
# 8. Rebuild frontend
# 9. Update .env configuration
# 10. Test health endpoint
```

### Quick Restart Scripts
```bash
# Restart all vergilex services
pm2 restart vergilex-backend vergilex-frontend vergilex-python

# Restart backend only
pm2 restart vergilex-backend

# Restart frontend only
pm2 restart vergilex-frontend

# View all logs
pm2 logs
```

## Success Checklist

- [ ] Databases created (vergilex_lsemb, vergilex_db)
- [ ] Schema copied from lsemb to vergilex_lsemb
- [ ] Code deployed to /var/www/vergilex
- [ ] .env.vergilex configured
- [ ] frontend/config.json updated
- [ ] Dependencies installed (backend, frontend, python)
- [ ] Frontend built successfully
- [ ] ecosystem.config.js configured
- [ ] Nginx configuration created and enabled
- [ ] Cloudflare DNS records added
- [ ] SSL certificates installed
- [ ] PM2 services started
- [ ] Backend health check passes
- [ ] Frontend loads at https://vergilex.luwi.dev
- [ ] System status shows "vergilex_db"
- [ ] luwi-devops.py updated with vergilex tenant

## Next Steps After Deployment

1. **Import Initial Data**: Load vergi hukuku documents into vergilex_db
2. **Configure Templates**: Customize legal templates for Turkish tax law
3. **Setup Crawlers**: Configure crawlers for tax law websites
4. **User Management**: Create admin users for Vergilex
5. **Monitoring**: Setup monitoring and alerts for vergilex services
6. **Backup**: Configure automated backups for vergilex databases

---

**Created**: 2025-01-14
**Last Updated**: 2025-01-14
**Maintainer**: LSEMB DevOps Team
