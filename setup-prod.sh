#!/bin/bash
# Alice Semantic Bridge Production Setup Script
# This script will clone the repository, create configuration files, and start the services.

# Exit immediately if a command exits with a non-zero status.
set -e

# --- Configuration ---
GIT_REPO_URL="https://github.com/your-username/alice-semantic-bridge.git" # <-- TODO: Burayı kendi GitHub repo URL'niz ile değiştirin
PROJECT_DIR="alice-semantic-bridge"
DOMAIN_NAME="asemb.luwi.dev"

# --- Script Start ---
echo "🚀 Starting Alice Semantic Bridge setup for $DOMAIN_NAME..."

# 1. Clone the repository
if [ -d "$PROJECT_DIR" ]; then
    echo "-> Directory '$PROJECT_DIR' already exists. Skipping clone."
else
    echo "-> Cloning repository from $GIT_REPO_URL..."
    git clone "$GIT_REPO_URL" "$PROJECT_DIR"
fi

cd "$PROJECT_DIR"
echo "-> Entered directory: $(pwd)"

# 2. Create the .env.asemb file
echo "-> Creating production environment file (.env.asemb)..."
cat <<EOF > .env.asemb
# .env.asemb
# Environment variables for production

# PostgreSQL - TODO: Change to a secure password
POSTGRES_USER=asemb_user
POSTGRES_PASSWORD=your_secure_password_here 
POSTGRES_DB=asemb

# Redis - TODO: Change to a secure password
REDIS_PASSWORD=sprint_MVP_2025!

# n8n - TODO: Change to secure credentials
N8N_USER=admin
N8N_PASSWORD=admin
N8N_WEBHOOK_URL=https://$DOMAIN_NAME/

# CORS
CORS_ORIGIN=https://$DOMAIN_NAME

# Grafana - TODO: Change to secure credentials
GRAFANA_USER=admin
GRAFANA_PASSWORD=admin
EOF
echo "-> .env.asemb file created successfully."

# 3. Create Nginx configuration
echo "-> Creating Nginx configuration..."
mkdir -p nginx

cat <<EOF > nginx/nginx.conf
server {
    listen 80;
    server_name $DOMAIN_NAME;
    
    # Redirect HTTP to HTTPS
    location / {
        return 301 https://\$host\$request_uri;
    }
}

server {
    listen 443 ssl http2;
    server_name $DOMAIN_NAME;

    # --- SSL Certificate Paths ---
    # TODO: Uncomment these lines after you have placed your SSL certificates.
    # ssl_certificate /etc/letsencrypt/live/$DOMAIN_NAME/fullchain.pem;
    # ssl_certificate_key /etc/letsencrypt/live/$DOMAIN_NAME/privkey.pem;
    
    # Recommended SSL settings
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;
    
    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header X-Content-Type-Options "nosniff" always;
    
    client_max_body_size 100M;

    location / {
        # This configuration assumes your frontend is served by the 'api' service or another container.
        # If you have a separate frontend service (e.g., 'dashboard'), you might proxy to that instead.
        # For example: proxy_pass http://asemb-dashboard:3000;
        proxy_pass http://asemb-api:3000; # Assuming API serves the UI or acts as the main entry point
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
    }

    # Add other locations like /api, /ws, /webhook if Nginx is handling routing for them
    # Example for API:
    location /api {
        proxy_pass http://asemb-api:3000;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        # ... other headers
    }
}
EOF
echo "-> Nginx configuration created successfully."
echo "-> IMPORTANT: You will need to set up SSL certificates and uncomment the SSL lines in nginx/nginx.conf."

# 4. Start the Docker containers
echo "-> Starting Docker services in production mode..."
docker-compose -f docker-compose.prod.yml --env-file .env.asemb up -d

echo "✅ Setup complete!"
echo "-> Your services should be starting up."
echo "-> Run 'docker ps' to check the status of the containers."
echo "-> Run 'docker-compose -f docker-compose.prod.yml logs -f' to see the logs."
