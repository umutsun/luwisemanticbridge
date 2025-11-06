#!/bin/bash
echo "========================================="
echo "   FIX NGINX BAD GATEWAY ISSUES"
echo "========================================="
echo ""

# 1. Check which ports are actually being used
echo "=== Step 1: Checking actual ports in use ==="
echo ""
echo "Ports in use:"
ss -tulpn | grep -E ':(3000|3002|3003|3004|8083|8084|8085)' | grep LISTEN

# 2. Fix EmlakAI Frontend Port
echo ""
echo "=== Step 2: Fixing EmlakAI Frontend Port ==="
cd /var/www/emlakai/frontend
# Update package.json to use correct port
sed -i 's/"start": "next start"/"start": "next start -p 3003"/' package.json
echo "✅ Updated EmlakAI to use port 3003"

# 3. Fix Bookie Frontend Port
echo ""
echo "=== Step 3: Fixing Bookie Frontend Port ==="
cd /var/www/bookie/frontend
sed -i 's/"start": "next start"/"start": "next start -p 3004"/' package.json
echo "✅ Updated Bookie to use port 3004"

# 4. Create/Update Luwi.dev (if missing)
echo ""
echo "=== Step 4: Setting up Luwi.dev ==="
if [ ! -d "/var/www/luwi-dev" ]; then
    mkdir -p /var/www/luwi-dev
    cd /var/www/luwi-dev

    # Create a simple Next.js landing page
    cat > package.json <<'EOF'
{
  "name": "luwi-dev",
  "version": "1.0.0",
  "scripts": {
    "start": "next start -p 3000",
    "build": "next build",
    "dev": "next dev -p 3000"
  },
  "dependencies": {
    "next": "14.2.5",
    "react": "^18",
    "react-dom": "^18"
  }
}
EOF
    echo "✅ Created Luwi.dev package.json"
else
    cd /var/www/luwi-dev
    # Ensure correct port in existing setup
    if [ -f "package.json" ]; then
        sed -i 's/"start": "next start"/"start": "next start -p 3000"/' package.json
    fi
fi

# 5. Fix Nginx configurations
echo ""
echo "=== Step 5: Updating Nginx Configurations ==="

# EmlakAI nginx config
cat > /etc/nginx/sites-available/emlakai.luwi.dev <<'EOF'
server {
    listen 80;
    server_name emlakai.luwi.dev;

    location / {
        proxy_pass http://127.0.0.1:3003;
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
        proxy_pass http://127.0.0.1:8084;
        proxy_http_version 1.1;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
EOF
echo "✅ Updated emlakai.luwi.dev nginx config"

# Bookie nginx config
cat > /etc/nginx/sites-available/bookie.luwi.dev <<'EOF'
server {
    listen 80;
    server_name bookie.luwi.dev;

    location / {
        proxy_pass http://127.0.0.1:3004;
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
        proxy_pass http://127.0.0.1:8085;
        proxy_http_version 1.1;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
EOF
echo "✅ Updated bookie.luwi.dev nginx config"

# Luwi.dev nginx config
cat > /etc/nginx/sites-available/luwi.dev <<'EOF'
server {
    listen 80;
    server_name luwi.dev www.luwi.dev;

    location / {
        proxy_pass http://127.0.0.1:3000;
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
EOF
echo "✅ Created luwi.dev nginx config"

# LSEMB nginx config (for completeness)
cat > /etc/nginx/sites-available/lsemb.luwi.dev <<'EOF'
server {
    listen 80;
    server_name lsemb.luwi.dev;

    location / {
        proxy_pass http://127.0.0.1:3002;
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
        proxy_pass http://127.0.0.1:8083;
        proxy_http_version 1.1;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
EOF
echo "✅ Updated lsemb.luwi.dev nginx config"

# 6. Enable sites
echo ""
echo "=== Step 6: Enabling Nginx Sites ==="
ln -sf /etc/nginx/sites-available/lsemb.luwi.dev /etc/nginx/sites-enabled/
ln -sf /etc/nginx/sites-available/emlakai.luwi.dev /etc/nginx/sites-enabled/
ln -sf /etc/nginx/sites-available/bookie.luwi.dev /etc/nginx/sites-enabled/
ln -sf /etc/nginx/sites-available/luwi.dev /etc/nginx/sites-enabled/

# 7. Test nginx configuration
echo ""
echo "=== Step 7: Testing Nginx Configuration ==="
nginx -t

# 8. Reload nginx
echo ""
echo "=== Step 8: Reloading Nginx ==="
systemctl reload nginx
echo "✅ Nginx reloaded"

# 9. Restart PM2 services with correct ports
echo ""
echo "=== Step 9: Restarting Frontend Services ==="
pm2 delete emlakai-frontend bookie-frontend luwi-frontend 2>/dev/null

# Start EmlakAI Frontend
cd /var/www/emlakai/frontend
pm2 start npm --name emlakai-frontend -- start
echo "✅ Started EmlakAI frontend on port 3003"

# Start Bookie Frontend
cd /var/www/bookie/frontend
pm2 start npm --name bookie-frontend -- start
echo "✅ Started Bookie frontend on port 3004"

# Start Luwi.dev if exists
if [ -d "/var/www/luwi-dev" ]; then
    cd /var/www/luwi-dev
    if [ -f "package.json" ]; then
        pm2 start npm --name luwi-frontend -- start
        echo "✅ Started Luwi.dev frontend on port 3000"
    fi
fi

# Save PM2
pm2 save

# 10. Test services
echo ""
echo "=== Step 10: Testing Services ==="
sleep 5

echo ""
echo "Testing luwi.dev (port 3000):"
curl -I http://localhost:3000 2>/dev/null | head -1

echo ""
echo "Testing lsemb.luwi.dev (port 3002):"
curl -I http://localhost:3002 2>/dev/null | head -1

echo ""
echo "Testing emlakai.luwi.dev (port 3003):"
curl -I http://localhost:3003 2>/dev/null | head -1

echo ""
echo "Testing bookie.luwi.dev (port 3004):"
curl -I http://localhost:3004 2>/dev/null | head -1

echo ""
echo "========================================="
echo "         FIX COMPLETED!"
echo "========================================="
echo ""
echo "Services should now be accessible at:"
echo "  - https://luwi.dev (port 3000)"
echo "  - https://lsemb.luwi.dev (port 3002)"
echo "  - https://emlakai.luwi.dev (port 3003)"
echo "  - https://bookie.luwi.dev (port 3004)"
echo ""
echo "Current PM2 Status:"
pm2 list | grep -E "frontend|luwi"
echo ""
echo "========================================="