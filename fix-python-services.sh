#!/bin/bash
echo "=== Fixing Python Microservices Configuration ==="

# Stop all Python services
echo "1. Stopping Python services..."
pm2 stop lsemb-python bookie-python 2>/dev/null

# Kill any process on port 8002 and 8003
echo "2. Freeing ports..."
fuser -k 8002/tcp 2>/dev/null
fuser -k 8003/tcp 2>/dev/null

# Update ecosystem.config.js for LSEMB
echo "3. Updating LSEMB ecosystem config..."
cd /var/www/lsemb
cat > ecosystem-python-fix.js <<'EOF'
module.exports = {
  apps: [
    {
      name: 'lsemb-python',
      script: 'main.py',
      interpreter: 'python3',
      cwd: '/var/www/lsemb/backend/python-services',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '2G',
      env: {
        PYTHONUNBUFFERED: '1',
        PYTHON_ENV: 'production',
        PORT: '8002',
        DATABASE_URL: 'postgresql://postgres:Semsiye!22@91.99.229.96:5432/lsemb',
        REDIS_HOST: 'localhost',
        REDIS_PORT: '6379',
        REDIS_PASSWORD: 'Semsiye!22',
        REDIS_DB: '2',
        ENVIRONMENT: 'production',
        LOG_LEVEL: 'INFO',
        CORS_ORIGINS: 'http://localhost:3002,http://localhost:8083,https://lsemb.luwi.dev',
        INTERNAL_API_KEY: 'lsemb-internal-key-2024'
      },
      error_file: '/var/www/lsemb/backend/python-services/logs/python-error.log',
      out_file: '/var/www/lsemb/backend/python-services/logs/python-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      restart_delay: 4000,
      listen_timeout: 20000,
      kill_timeout: 10000,
    }
  ]
};
EOF

# Create Python service environment file
echo "4. Creating Python service .env files..."
cd /var/www/lsemb/backend/python-services
cat > .env <<'EOF'
PORT=8002
DATABASE_URL=postgresql://postgres:Semsiye!22@91.99.229.96:5432/lsemb
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=Semsiye!22
REDIS_DB=2
ENVIRONMENT=production
LOG_LEVEL=INFO
CORS_ORIGINS=http://localhost:3002,http://localhost:8083,https://lsemb.luwi.dev
INTERNAL_API_KEY=lsemb-internal-key-2024

# OpenAI (for Whisper) - Set via environment variable
# Do not hardcode API keys

# Embeddings
EMBEDDING_PROVIDER=openai
EMBEDDING_MODEL=text-embedding-3-small
EOF

# Fix for Bookie Python (port 8003)
echo "5. Fixing Bookie Python service..."
cd /var/www/bookie/backend/python-services
cat > .env <<'EOF'
PORT=8003
DATABASE_URL=postgresql://postgres:Semsiye!22@91.99.229.96:5432/bookie_lsemb
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=Semsiye!22
REDIS_DB=3
ENVIRONMENT=production
LOG_LEVEL=INFO
CORS_ORIGINS=http://localhost:3004,http://localhost:8085,https://bookie.luwi.dev
INTERNAL_API_KEY=bookie-internal-key-2024
EOF

# Install missing Python dependencies if needed
echo "6. Checking Python dependencies..."
cd /var/www/lsemb/backend/python-services
if [ ! -f "venv/bin/python" ]; then
    echo "Creating virtual environment..."
    python3 -m venv venv
fi

# Install requirements
echo "7. Installing Python packages..."
./venv/bin/pip install --upgrade pip
./venv/bin/pip install -r requirements.txt 2>/dev/null

# Create logs directory if not exists
mkdir -p logs

# Delete and recreate PM2 apps
echo "8. Restarting Python services with PM2..."
pm2 delete lsemb-python 2>/dev/null
cd /var/www/lsemb
pm2 start ecosystem-python-fix.js

# Check status
echo ""
echo "=== Service Status ==="
sleep 3
pm2 list | grep python

# Test endpoints
echo ""
echo "=== Testing Python Endpoints ==="
echo "LSEMB Python (8002):"
curl -s http://localhost:8002/health | head -c 200 || echo "Not responding yet"
echo ""
echo "Bookie Python (8003):"
curl -s http://localhost:8003/health | head -c 200 || echo "Not responding yet"

echo ""
echo "✅ Python services configuration complete!"