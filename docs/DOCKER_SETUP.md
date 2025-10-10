# Docker Development Setup

This setup runs PostgreSQL and Redis in Docker containers while the API and frontend run locally for hot-reload development.

## Quick Start

1. **Start databases:**
   ```bash
   ./start-docker-dev.sh
   # or manually:
   docker-compose -f docker-compose.db-only.yml up -d
   ```

2. **Copy environment variables:**
   ```bash
   cp .env.docker .env
   ```

3. **Start API:**
   ```bash
   cd api
   npm run dev
   ```

4. **Start Frontend:**
   ```bash
   cd frontend
   npm run dev
   ```

## Database Details

- **PostgreSQL:** `localhost:5433`
  - User: `asemb_user`
  - Password: `asemb_password_2025`
  - Database: `asemb`
  - Extensions: `pgvector`

- **Redis:** `localhost:6380`
  - No authentication (development)

## Management

- **View logs:** `docker-compose -f docker-compose.db-only.yml logs -f`
- **Stop databases:** `docker-compose -f docker-compose.db-only.yml down`
- **Check status:** `docker-compose -f docker-compose.db-only.yml ps`

## Full Docker Setup

If you want to run everything in Docker (slower for development):

```bash
# Note: This may take a while to build
docker-compose -f docker-compose.working.yml up --build
```

Ports:
- API: `http://localhost:8083`
- Frontend: `http://localhost:3000`