#!/bin/bash
echo "=== Complete Tenant Fix Script ==="

# 1. Start Frontend Services
echo ""
echo "=== Step 1: Starting Frontend Services ==="

# Start Bookie Frontend
echo "Starting Bookie frontend on port 3004..."
cd /var/www/bookie/frontend
pm2 delete bookie-frontend 2>/dev/null
pm2 start npm --name bookie-frontend -- start
sleep 2

# Start EmlakAI Frontend
echo "Starting EmlakAI frontend on port 3003..."
cd /var/www/emlakai/frontend
pm2 delete emlakai-frontend 2>/dev/null
pm2 start npm --name emlakai-frontend -- start
sleep 2

# Save PM2
pm2 save

# 2. Create Nginx Configurations
echo ""
echo "=== Step 2: Creating Nginx Configurations ==="

# Create Bookie nginx config
cat > /etc/nginx/sites-available/bookie.luwi.dev <<'EOF'
server {
    listen 80;
    server_name bookie.luwi.dev;

    location / {
        proxy_pass http://localhost:3004;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /api {
        proxy_pass http://localhost:8085;
        proxy_http_version 1.1;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /graphql {
        proxy_pass http://localhost:8085/graphql;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    location /socket.io {
        proxy_pass http://localhost:8085;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
EOF

# Create EmlakAI nginx config
cat > /etc/nginx/sites-available/emlakai.luwi.dev <<'EOF'
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
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /api {
        proxy_pass http://localhost:8084;
        proxy_http_version 1.1;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /graphql {
        proxy_pass http://localhost:8084/graphql;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    location /socket.io {
        proxy_pass http://localhost:8084;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
EOF

# 3. Enable nginx sites
echo ""
echo "=== Step 3: Enabling Nginx Sites ==="
ln -sf /etc/nginx/sites-available/bookie.luwi.dev /etc/nginx/sites-enabled/
ln -sf /etc/nginx/sites-available/emlakai.luwi.dev /etc/nginx/sites-enabled/

# 4. Test and reload nginx
echo ""
echo "=== Step 4: Testing and Reloading Nginx ==="
nginx -t && systemctl reload nginx

# 5. Check services
echo ""
echo "=== Step 5: Checking All Services ==="
echo ""
echo "PM2 Services:"
pm2 list

echo ""
echo "Port Usage:"
ss -tulpn | grep -E ':(3002|3003|3004|8083|8084|8085)'

echo ""
echo "Nginx Sites:"
ls -la /etc/nginx/sites-enabled/

echo ""
echo "=== ✅ Configuration Complete! ==="
echo "Bookie: https://bookie.luwi.dev (Frontend: 3004, Backend: 8085)"
echo "EmlakAI: https://emlakai.luwi.dev (Frontend: 3003, Backend: 8084)"
echo "LSEMB: https://lsemb.luwi.dev (Frontend: 3002, Backend: 8083)"