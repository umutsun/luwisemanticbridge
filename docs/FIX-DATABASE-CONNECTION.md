# Database Connection Fix for LSEMB

## Problem
LSEMB can't connect to its own database because it can't find the database configuration in `.env.lsemb`.

## Solution Steps

### 1. Update Environment Configuration

The `.env.lsemb` file has been updated with the correct database connection:

```env
# === Database Configuration ===
POSTGRES_USER=postgres
POSTGRES_PASSWORD=Semsiye!22
POSTGRES_DB=lsemb
DATABASE_URL=postgresql://postgres:Semsiye!22@localhost:5432/lsemb
```

### 2. Restart the Server

**Option A: Using the restart script (Recommended)**
```bash
# Linux/Mac
./restart-server.sh

# Windows
restart-server.bat
```

**Option B: Manual restart**
```bash
# Stop all processes
pm2 stop all
pm2 delete all
pm2 kill

# Start fresh
pm2 start ecosystem.config.js
pm2 save
```

### 3. Verify Database Connection

After restart, check if the database connection works:

```bash
# Check API logs
pm2 logs lsemb-api

# Test API endpoint
curl http://localhost:8083/api/v1/health
```

### 4. Test Settings Save

Once the API is running, test if you can save settings in the frontend:

1. Open the frontend at `http://localhost:3002`
2. Go to Settings
3. Try to save some configuration
4. Check if it saves successfully

### 5. Production Deployment

For production deployment, use the updated deployment scripts:

```bash
# Production deployment
./deploy-lsemb.sh prod

# Or for Windows
deploy-lsemb.bat prod
```

## Configuration Files Updated

### 1. `api/server.js`
- Added dotenv configuration loading from `.env.lsemb`
- Now properly loads environment variables

### 2. `.env.lsemb`
- Updated database credentials to match server configuration
- Now uses: `postgres:Semsiye!22@localhost:5432/lsemb`

### 3. `docker-compose.prod.yml`
- Updated to use `.env.lsemb.production` for production deployments

## Troubleshooting

### If API doesn't start:
1. Check logs: `pm2 logs lsemb-api`
2. Verify `.env.lsemb` file exists in the project root
3. Check database is running on port 5432

### If database connection fails:
1. Verify PostgreSQL is running: `pg_isready -U postgres -h localhost`
2. Check database exists: `psql -U postgres -h localhost -l`
3. Create database if needed: `createdb -U postgres -h localhost lsemb`

### If settings still don't save:
1. Check browser console for errors
2. Verify CORS is properly configured
3. Check API logs for database errors

## Service URLs After Fix

- **Frontend:** http://localhost:3002 (local) or https://lsemb.luwi.dev (production)
- **API:** http://localhost:8083 (local) or https://lsemb.luwi.dev/api (production)
- **Health Check:** http://localhost:8083/api/v1/health

## Verification Commands

```bash
# Check if services are running
pm2 status

# Check database connection
psql -U postgres -h localhost -d lsemb -c "SELECT version();"

# Test API
curl http://localhost:8083/api/v1/health

# View all logs
pm2 logs
```

The database connection issue should now be resolved, and you should be able to save settings in the ASEM interface.