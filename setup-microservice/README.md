# LSEMB Multi-Tenant Setup Microservice

🚀 Automated setup tool for deploying multiple LSEMB instances on a single server.

## Features

✅ **Automated Everything**:
- Git repository cloning
- Environment file generation
- Database schema initialization
- Default settings insertion
- Admin user creation
- PM2 ecosystem configuration
- Service deployment

✅ **Multi-Tenant Ready**:
- Each project gets its own databases
- Separate ports for all services
- Independent Redis DB allocation
- Isolated PM2 processes

✅ **Production Ready**:
- Secure JWT token generation
- Password hashing with bcrypt
- PostgreSQL + pgvector support
- Comprehensive error handling

## Quick Start

### 1. Install Dependencies

```bash
cd /var/www/lsemb/setup-microservice
pip3 install -r requirements.txt
```

### 2. Set Environment Variables (Optional)

For non-interactive mode, set these:

```bash
export DB_HOST="91.99.229.96"
export DB_PORT="5432"
export DB_USER="postgres"
export DB_PASSWORD="your_password"
export REDIS_HOST="localhost"
export REDIS_PORT="6379"
export REDIS_PASSWORD=""
```

### 3. Run Setup

**Interactive Mode** (recommended for first time):
```bash
python3 setup_lsemb_instance.py --project emlakai --interactive
```

**Automated Mode** (uses defaults):
```bash
python3 setup_lsemb_instance.py --project emlakai
```

**For Bookie project**:
```bash
python3 setup_lsemb_instance.py --project bookie
```

## Default Configuration

| Project  | Frontend | Backend | Python | Redis DB | Domain              |
|----------|----------|---------|--------|----------|---------------------|
| lsemb    | 3002     | 8083    | 8001   | 2        | lsemb.luwi.dev      |
| emlakai  | 3003     | 8084    | 8002   | 3        | emlakai.luwi.dev    |
| bookie   | 3004     | 8085    | 8003   | 4        | bookie.luwi.dev     |

## What Gets Created

### Directory Structure
```
/var/www/{project}/
├── .env.lsemb                    # Main config
├── ecosystem.config.js           # PM2 config
├── logs/                         # Service logs
├── backend/
│   ├── .env -> ../.env.lsemb    # Symlink
│   └── python-services/
│       └── .env                 # Python config
└── frontend/
    └── .env.production.local    # Frontend config
```

### Databases

**Settings Database**: `{project}_lsemb`
- Users & authentication
- Application settings
- Embeddings (unified_embeddings)

**Source Database**: `{project}_db`
- Your application data
- Configured via settings table

### PM2 Services

- `{project}-backend` - Express.js API server
- `{project}-frontend` - Next.js application
- `{project}-python` - Python microservices

## Step-by-Step Process

The script performs these steps in order:

1. **📋 Configuration Collection**
   - Loads defaults or asks interactively
   - Validates inputs

2. **📦 Repository Setup**
   - Clones from GitHub if new
   - Updates with `git pull` if exists

3. **📝 Environment Files**
   - `.env.lsemb` with all settings
   - Frontend `.env.production.local`
   - Python services `.env`

4. **🗄️ Database Initialization**
   - Creates databases if missing
   - Runs schema SQL (users, settings, embeddings)
   - Inserts default settings

5. **👤 Admin User Creation**
   - Email: `admin@{project}.com`
   - Password: `admin123` (change after first login!)
   - Role: admin
   - Status: active

6. **⚙️ PM2 Configuration**
   - Generates `ecosystem.config.js`
   - Configures all 3 services
   - Sets up logging

7. **📦 Dependency Installation**
   - `npm install` for backend
   - `npm install` for frontend
   - `pip3 install` for Python

8. **🏗️ Frontend Build**
   - Runs `npm run build`
   - Creates optimized production build

9. **🚀 Service Launch**
   - Starts all services with PM2
   - Saves PM2 configuration

## Usage Examples

### Setup EmlakAI with Custom Admin

```bash
python3 setup_lsemb_instance.py --project emlakai --interactive
```

Then answer:
```
Domain name [emlakai.luwi.dev]: emlakai.luwi.dev
Frontend port [3003]: 3003
Backend port [8084]: 8084
Python port [8002]: 8002
LSEMB database name [emlakai_lsemb]: emlakai_lsemb
Source database name [emlakai_db]: emlakai_db
Database host [localhost]: 91.99.229.96
Database port [5432]: 5432
Database user [postgres]: postgres
Database password: your_db_password
Redis host [localhost]: localhost
Redis port [6379]: 6379
Redis password (optional):
Redis DB [3]: 3
Admin email [admin@emlakai.com]: admin@emlakai.com
Admin password [admin123]: SecurePassword123!
```

### Automated Setup

```bash
# Set environment variables first
export DB_PASSWORD="your_db_password"

# Run automated setup
python3 setup_lsemb_instance.py --project bookie
```

## After Setup

### 1. Configure Nginx

Add server block for the new domain:

```nginx
server {
    listen 80;
    server_name emlakai.luwi.dev;

    location / {
        proxy_pass http://localhost:3003;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    location /api {
        proxy_pass http://localhost:8084;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Then:
```bash
sudo nginx -t
sudo systemctl reload nginx
sudo certbot --nginx -d emlakai.luwi.dev
```

### 2. Verify Services

```bash
pm2 list
pm2 logs emlakai-backend
pm2 logs emlakai-frontend
```

### 3. Test Application

```bash
curl http://localhost:8084/api/v2/health
```

Visit: `https://emlakai.luwi.dev`

### 4. Change Admin Password

1. Login with default credentials
2. Go to Settings → Profile
3. Change password immediately

## Managing Services

### View Status
```bash
pm2 list | grep emlakai
```

### View Logs
```bash
pm2 logs emlakai-backend --lines 100
pm2 logs emlakai-frontend --lines 100
pm2 logs emlakai-python --lines 100
```

### Restart Services
```bash
pm2 restart emlakai-backend
pm2 restart emlakai-frontend
pm2 restart emlakai-python
```

### Stop Services
```bash
pm2 stop emlakai-backend
pm2 stop emlakai-frontend
pm2 stop emlakai-python
```

### Delete Services
```bash
pm2 delete emlakai-backend
pm2 delete emlakai-frontend
pm2 delete emlakai-python
```

## Troubleshooting

### Database Connection Failed

Check credentials in `.env.lsemb`:
```bash
cat /var/www/emlakai/.env.lsemb
```

Test connection:
```bash
psql -h 91.99.229.96 -U postgres -d emlakai_lsemb
```

### Port Already in Use

Check what's using the port:
```bash
sudo ss -tlnp | grep 8084
```

Kill the process or change port in interactive setup.

### Frontend Build Failed

Try manual build:
```bash
cd /var/www/emlakai/frontend
npm run build
```

Check for errors and fix dependencies.

### PM2 Services Not Starting

Check PM2 logs:
```bash
pm2 logs emlakai-backend --err --lines 50
```

Verify environment files exist:
```bash
ls -la /var/www/emlakai/.env.lsemb
ls -la /var/www/emlakai/backend/.env
```

## Database Schema

### Users Table
```sql
- id (UUID)
- username (unique)
- email (unique)
- password (hashed)
- name
- role (admin/user)
- status (active/inactive)
- email_verified (boolean)
- created_at, updated_at
```

### Settings Table
```sql
- id
- category (database/server/redis/embedding)
- key
- value
- type (string/number/boolean)
- description
- is_secret (boolean)
- created_at, updated_at
```

### Unified Embeddings Table
```sql
- id
- source_id, source_name, source_type
- record_type
- content (text)
- embedding (vector 768)
- metadata (jsonb)
- tokens, model
- created_at, updated_at
```

## Security Notes

⚠️ **Important**:
- Change admin password after first login
- Keep `.env.lsemb` files secure (contains secrets)
- Don't commit `.env` files to Git
- Use strong database passwords
- Enable Redis password in production
- Configure firewall to restrict port access

## CI/CD Integration

This setup script is designed to work with Git-based deployments:

```bash
# On server, add to deployment script:
cd /var/www/emlakai
git pull origin main
npm install --prefix backend
npm install --prefix frontend
npm run build --prefix frontend
pm2 restart emlakai-backend
pm2 restart emlakai-frontend
```

## Contributing

To modify the setup script:

1. Edit `setup_lsemb_instance.py`
2. Test with `--interactive` mode first
3. Verify all services start correctly
4. Document any new configuration options

## Support

For issues or questions:
- Check logs: `/var/www/{project}/logs/`
- PM2 logs: `pm2 logs {project}-backend`
- Database logs: Check PostgreSQL logs

---

**Generated by LSEMB Setup Microservice**
🤖 Built with Claude Code
