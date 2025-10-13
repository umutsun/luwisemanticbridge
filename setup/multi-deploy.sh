#!/bin/bash

# Multi-Project Deployment Script for Luwi Semantic Bridge
# Supports 4 domains: lsemb.luwi.dev, musavir.luwi.dev, cocuk.luwi.dev, emlak.luwi.dev

DOMAIN=$1
PROJECT_NAME=$2

if [ -z "$DOMAIN" ] || [ -z "$PROJECT_NAME" ]; then
    echo "Usage: ./multi-deploy.sh <domain> <project-name>"
    echo "Example: ./multi-deploy.sh lsemb.luwi.dev lsemb"
    echo "Available domains:"
    echo "  - lsemb.luwi.dev (Development)"
    echo "  - musavir.luwi.dev (Customer)"
    echo "  - cocuk.luwi.dev (Customer)"
    echo "  - emlak.luwi.dev (Customer)"
    exit 1
fi

echo "🚀 Deploying $PROJECT_NAME to $DOMAIN..."

# Create project directory
PROJECT_DIR="/var/www/$DOMAIN"
echo "📁 Creating project directory: $PROJECT_DIR"
mkdir -p $PROJECT_DIR
cd $PROJECT_DIR

# Clone repository
echo "📦 Cloning repository..."
git clone https://github.com/umutsun/asemb.git .

# Create environment variables
echo "🔧 Creating environment variables..."

# Database name from domain
DB_NAME=$(echo $DOMAIN | tr '.' '_')
DB_USER=${DB_NAME}
DB_PASSWORD=$(openssl rand -base64 32)

# Create .env file
cat > .env.$PROJECT_NAME << EOF
# Luwi Semantic Bridge Configuration
# Project: $PROJECT_NAME
# Domain: $DOMAIN
NODE_ENV=production

# Database Configuration
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=$DB_NAME
POSTGRES_USER=$DB_USER
POSTGRES_PASSWORD=$DB_PASSWORD

# Redis Configuration
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_DB=2

# Server Configuration
SERVER_PORT=8083
FRONTEND_PORT=3002

# Project Configuration
PROJECT_NAME=$PROJECT_NAME
PROJECT_DOMAIN=$DOMAIN
PROJECT_TYPE=${PROJECT_NAME}

# CORS Configuration
CORS_ORIGINS=https://$DOMAIN,https://www.$DOMAIN

# WebSocket Configuration
ENABLE_WEBSOCKET=true

# Security
JWT_SECRET=$(openssl rand -base64 64)
ENCRYPTION_KEY=$(openssl rand -hex 32)

# SSL Configuration
SSL_CERT_PATH=/etc/letsencrypt/live/$DOMAIN/fullchain.pem
SSL_KEY_PATH=/etc/letsencrypt/live/$DOMAIN/privkey.pem
EOF

echo "✅ Environment file created: .env.$PROJECT_NAME"

# Create PM2 ecosystem
echo "⚙️ Creating PM2 ecosystem..."
cat > ecosystem.config.js << EOF
module.exports = {
  apps: [
    {
      name: '$PROJECT_NAME-backend',
      script: 'src/server.ts',
      cwd: './backend',
      interpreter: 'node',
      interpreter_args: '-r ts-node/register',
      env: {
        NODE_ENV: 'production',
        PORT: 8083,
        PROJECT_NAME: '$PROJECT_NAME',
        DOMAIN: '$DOMAIN'
      },
      env_file: '.env.$PROJECT_NAME',
      error_file: './logs/backend-error.log',
      out_file: './logs/backend-out.log',
      log_file: './logs/backend-combined.log',
      time: true
    },
    {
      name: '$PROJECT_NAME-frontend',
      script: 'node_modules/next/dist/bin/next',
      args: 'start',
      cwd: './frontend',
      env: {
        NODE_ENV: 'production',
        PORT: 3002,
        NEXT_PUBLIC_API_URL: 'https://$DOMAIN',
        NEXT_PUBLIC_PROJECT_NAME: '$PROJECT_NAME',
        NEXT_PUBLIC_DOMAIN: '$DOMAIN'
      },
      env_file: '../.env.$PROJECT_NAME',
      error_file: './logs/frontend-error.log',
      out_file: './logs/frontend-out.log',
      log_file: './logs/frontend-combined.log',
      time: true
    }
  ]
};
EOF

# Create nginx config
echo "🌐 Creating nginx configuration..."
cat > /etc/nginx/sites-available/$DOMAIN.conf << EOF
server {
    listen 80;
    listen [::]:80;
    server_name $DOMAIN www.$DOMAIN;
    return 301 https://\$server_name\$request_uri;
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name $DOMAIN www.$DOMAIN;

    # SSL Configuration
    ssl_certificate /etc/letsencrypt/live/$DOMAIN/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$DOMAIN/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers off;

    # Security Headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header X-Content-Type-Options "nosniff" always;

    # Proxy to Next.js Frontend
    location / {
        proxy_pass http://localhost:3002;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
    }

    # Static Files (Next.js)
    location /_next/static/ {
        alias $PROJECT_DIR/frontend/.next/static/;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # API Routes to Backend
    location /api/ {
        proxy_pass http://localhost:8083;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
    }

    # WebSocket Support
    location /ws {
        proxy_pass http://localhost:8083;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
    }
}
EOF

# Create logs directory
mkdir -p logs

# Create SSL certificate
echo "🔒 Creating SSL certificate..."
certbot --nginx -d $DOMAIN -d www.$DOMAIN --non-interactive --agree-tos --email admin@luwi.dev

# Activate nginx site
ln -s /etc/nginx/sites-available/$DOMAIN.conf /etc/nginx/sites-enabled/

# Install dependencies
echo "📦 Installing dependencies..."
cd backend && npm ci --production
cd ../frontend && npm ci

# Build frontend
echo "🏗️ Building frontend..."
npm run build

# Start with setup mode
echo "⚙️ Starting in setup mode..."
cd ..

# Setup flag for first run
echo "SETUP_REQUIRED=true" > setup.flag

# Start services
pm2 start ecosystem.config.js

# Save PM2 configuration
pm2 save

# Setup completion message
echo "✅ Deployment completed for $PROJECT_NAME!"
echo "🌐 Visit: https://$DOMAIN/setup"
echo "📝 Database: $DB_NAME"
echo "👤 User: $DB_USER"
echo "🔑 Password: $DB_PASSWORD"
echo ""
echo "Next steps:"
echo "1. Visit https://$DOMAIN/setup to complete configuration"
echo "2. Enter database credentials"
echo "3. Create admin user"
echo "4. Configure API keys"
echo ""
echo "Deployment script finished!"