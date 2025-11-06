#!/bin/bash
# Smart Frontend Deployment Script
# Minimizes SSH connections by batching all commands

echo "========================================="
echo "   SMART FRONTEND DEPLOYMENT"
echo "========================================="

# Build EmlakAI and Bookie frontends locally first if needed
# Then deploy via single SSH session

cat <<'DEPLOYMENT_SCRIPT' | ssh root@91.99.229.96 bash
echo "=== Starting Frontend Deployment ==="

# 1. Build EmlakAI Frontend
echo ""
echo "[1/4] Building EmlakAI Frontend..."
cd /var/www/emlakai/frontend
if [ ! -d ".next" ]; then
  echo "Building production build..."
  npm run build 2>&1 | tail -5
else
  echo "Production build exists, skipping..."
fi

# 2. Build Bookie Frontend
echo ""
echo "[2/4] Building Bookie Frontend..."
cd /var/www/bookie/frontend
if [ ! -d ".next" ]; then
  echo "Building production build..."
  npm run build 2>&1 | tail -5
else
  echo "Production build exists, skipping..."
fi

# 3. Setup Luwi.dev if needed
echo ""
echo "[3/4] Setting up Luwi.dev..."
if [ ! -d "/var/www/luwi-dev" ]; then
  mkdir -p /var/www/luwi-dev
  cd /var/www/luwi-dev

  # Create simple landing page
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

  # Create pages directory
  mkdir -p pages

  # Create index page
  cat > pages/index.js <<'EOF'
export default function Home() {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100vh',
      fontFamily: 'system-ui, -apple-system, sans-serif'
    }}>
      <h1 style={{fontSize: '3rem', margin: '0'}}>Luwi.dev</h1>
      <p style={{fontSize: '1.2rem', color: '#666'}}>Multi-Tenant Platform</p>
      <div style={{marginTop: '2rem'}}>
        <a href="https://lsemb.luwi.dev" style={{margin: '0 1rem'}}>LSEMB</a>
        <a href="https://emlakai.luwi.dev" style={{margin: '0 1rem'}}>EmlakAI</a>
        <a href="https://bookie.luwi.dev" style={{margin: '0 1rem'}}>Bookie</a>
      </div>
    </div>
  );
}
EOF

  npm install
  npm run build
  echo "Luwi.dev created and built"
else
  echo "Luwi.dev already exists"
fi

# 4. Restart all frontends
echo ""
echo "[4/4] Restarting all frontend services..."
pm2 delete emlakai-frontend bookie-frontend luwi-frontend 2>/dev/null

# Start EmlakAI
cd /var/www/emlakai/frontend
pm2 start npm --name emlakai-frontend -- start

# Start Bookie
cd /var/www/bookie/frontend
pm2 start npm --name bookie-frontend -- start

# Start Luwi.dev
if [ -d "/var/www/luwi-dev" ]; then
  cd /var/www/luwi-dev
  pm2 start npm --name luwi-frontend -- start
fi

pm2 save

# 5. Verify port bindings
echo ""
echo "=== Port Verification ==="
sleep 5
ss -tulpn | grep -E ':(3000|3002|3003|3004)' | grep LISTEN

# 6. Test endpoints
echo ""
echo "=== Testing Endpoints ==="
echo "LSEMB (3002):" && curl -I http://localhost:3002 2>/dev/null | head -1
echo "EmlakAI (3003):" && curl -I http://localhost:3003 2>/dev/null | head -1
echo "Bookie (3004):" && curl -I http://localhost:3004 2>/dev/null | head -1
echo "Luwi.dev (3000):" && curl -I http://localhost:3000 2>/dev/null | head -1

echo ""
echo "=== Deployment Complete ==="
pm2 list | grep frontend
DEPLOYMENT_SCRIPT