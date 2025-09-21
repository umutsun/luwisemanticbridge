# Database Setup Guide

## Option 1: Install PostgreSQL locally (Recommended)

### Using Windows Installer:
1. Download PostgreSQL from https://www.postgresql.org/download/windows/
2. Run the installer
3. Set password to 'postgres' (to match .env file)
4. Keep default port 5432
5. Install pgAdmin 4 (included)

### Using Chocolatey (if installed):
```bash
choco install postgresql --params '/Password:postgres'
```

### After Installation:
1. Open pgAdmin 4
2. Connect to the local server (localhost:5432)
3. Create databases:
   - `postgres` (usually created by default)
   - `asemb`
   - `customer_db`

## Option 2: Use Docker

```bash
# Run PostgreSQL in Docker
docker run --name postgres-asb -e POSTGRES_PASSWORD=postgres -p 5432:5432 -d postgres

# Create databases
docker exec -it postgres-asb createdb -U postgres asemb
docker exec -it postgres-asb createdb -U postgres customer_db
```

## Option 3: Use a cloud PostgreSQL service

Services like:
- ElephantSQL (free tier available)
- Supabase
- Heroku Postgres
- AWS RDS Free Tier

Update the .env file with your cloud database credentials.

## Current Issue

The application is trying to connect to a remote PostgreSQL server (91.99.229.96:5432) which is unreachable. You need to either:

1. Install PostgreSQL locally as described above
2. Update the .env file with working database credentials
3. Use a cloud PostgreSQL service

The application will work properly once it can connect to a PostgreSQL database.