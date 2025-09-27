# ASEM Development Environment Setup

This guide will help you set up a local development environment that matches the production server configuration.

## Quick Start

### Option 1: Using the startup script (Recommended)

**Windows:**
```bash
# Run the batch file
scripts\dev-start.bat
```

**Linux/Mac:**
```bash
# Make the script executable and run it
chmod +x scripts/dev-start.sh
./scripts/dev-start.sh
```

### Option 2: Manual startup

1. **Start core services:**
```bash
docker-compose -f docker-compose.dev.yml up -d postgres redis api
```

2. **Start frontend:**
```bash
docker-compose -f docker-compose.dev.yml up -d frontend
```

## Access Points

Once started, you can access the services at:

- 🌐 **Frontend**: http://localhost:3000
- 📊 **API**: http://localhost:8083
- 🗄️ **Database**: localhost:5432
- 📦 **Redis**: localhost:6379

## Development Tools

To start additional services:

```bash
# n8n workflow automation
docker-compose -f docker-compose.dev.yml --profile with-n8n up -d
# Access at: http://localhost:5678

# Nginx reverse proxy (production-like)
docker-compose -f docker-compose.dev.yml --profile with-nginx up -d
# Access at: http://localhost:8088

# Database management tools
docker-compose -f docker-compose.dev.yml --profile dev-tools up -d
# Adminer at: http://localhost:8080
```

## Environment Variables

Create a `.env` file in the root directory:

```bash
cp .env.example .env
```

Then add your API keys to the `.env` file:
- GOOGLE_AI_API_KEY
- OPENAI_API_KEY
- ANTHROPIC_API_KEY
- GROQ_API_KEY
- HUGGINGFACE_API_KEY

## Common Commands

```bash
# View logs for all services
docker-compose -f docker-compose.dev.yml logs -f

# View logs for specific service
docker-compose -f docker-compose.dev.yml logs -f api
docker-compose -f docker-compose.dev.yml logs -f frontend

# Stop all services
docker-compose -f docker-compose.dev.yml down

# Restart a specific service
docker-compose -f docker-compose.dev.yml restart api

# Rebuild a service (after code changes)
docker-compose -f docker-compose.dev.yml build --no-cache api
docker-compose -f docker-compose.dev.yml up -d --build api
```

## Development Workflow

1. **Frontend Development**
   - Code is mounted at `./frontend`
   - Hot-reload is enabled
   - Access at http://localhost:3000

2. **Backend Development**
   - Code is mounted at `./api`
   - Nodemon is enabled for auto-restart
   - Access at http://localhost:8083

3. **Database Changes**
   - Schema changes should be added to `./scripts/init-db.sql`
   - Use Adminer at http://localhost:8080 for manual operations

## Troubleshooting

1. **Port conflicts**
   - Check if ports 3000, 5432, 6379, 8083 are available
   - Change ports in `docker-compose.dev.yml` if needed

2. **Permission issues**
   - On Linux/Mac, you might need to adjust folder permissions
   - Run: `chmod -R 755 ./scripts`

3. **Database connection issues**
   - Ensure PostgreSQL is healthy: `docker-compose -f docker-compose.dev.yml ps`
   - Check logs: `docker-compose -f docker-compose.dev.yml logs postgres`

4. **API key errors**
   - Verify your `.env` file has all required API keys
   - Restart the API service after updating keys: `docker-compose -f docker-compose.dev.yml restart api`

## Production Deployment

When you're ready to deploy to production:

1. Update the production configuration in `docker-compose.prod.yml`
2. Set up the production environment variables in `.env.asemb`
3. Follow the deployment guide in `installation.md`