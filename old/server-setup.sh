#!/bin/bash

# Server Setup Script for alice-semantic-bridge backend
# Run this script as root on the server: asemb.luwi.dev

set -e

echo "=== Starting Server Setup ==="

# 1. Test current backend API endpoints
echo "1. Testing current backend API endpoints..."
curl -X GET http://localhost:3000/health || echo "Backend not responding on port 3000"
curl -X GET http://localhost:8080/health || echo "Backend not responding on port 8080"
curl -X GET http://localhost:5000/health || echo "Backend not responding on port 5000"

# 2. Install PM2 globally
echo "2. Installing PM2 globally..."
npm install -g pm2 || echo "Node.js/npm not found, installing..."
if ! command -v node &> /dev/null; then
    echo "Installing Node.js..."
    curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
    sudo apt-get install -y nodejs
fi

npm install -g pm2

# 3. Find the backend application directory
echo "3. Finding backend application directory..."
echo "Searching for common backend directories..."
for dir in /var/www /opt /home/*/backend /home/*/api /home/*/app; do
    if [ -d "$dir" ]; then
        echo "Found directory: $dir"
        find "$dir" -name "package.json" -type f 2>/dev/null | head -10
    fi
done

echo "Searching for process running on common ports..."
lsof -i :3000 -i :8080 -i :5000 2>/dev/null || echo "No processes found on common ports"

# 4. Common backend locations to check
echo "4. Checking common backend locations..."
locations=(
    "/var/www/backend"
    "/opt/backend"
    "/home/ubuntu/backend"
    "/home/ubuntu/api"
    "/home/ubuntu/app"
    "/root/backend"
    "/root/api"
    "/root/app"
)

found_dir=""
for location in "${locations[@]}"; do
    if [ -d "$location" ]; then
        echo "Checking $location..."
        if [ -f "$location/package.json" ]; then
            echo "✓ Found backend at: $location"
            found_dir="$location"
            break
        fi
    fi
done

if [ -z "$found_dir" ]; then
    echo "❌ No backend directory found with package.json"
    echo "Please specify the backend directory manually"
    exit 1
fi

# 5. Navigate to backend directory and install dependencies
echo "5. Setting up backend application..."
cd "$found_dir"
echo "Current directory: $(pwd)"

# Install dependencies
npm install

# 6. Start the backend with PM2
echo "6. Starting backend with PM2..."

# Check if package.json has start script
if grep -q '"start"' package.json; then
    echo "Found start script in package.json"
    pm2 start npm --name "backend" -- start
elif grep -q '"dev"' package.json; then
    echo "Found dev script in package.json"
    pm2 start npm --name "backend" -- dev
elif [ -f "server.js" ]; then
    echo "Starting server.js"
    pm2 start server.js --name "backend"
elif [ -f "index.js" ]; then
    echo "Starting index.js"
    pm2 start index.js --name "backend"
elif [ -f "app.js" ]; then
    echo "Starting app.js"
    pm2 start app.js --name "backend"
else
    echo "❌ No start method found. Please check the backend configuration."
    exit 1
fi

# 7. Configure PM2 to start on boot
echo "7. Configuring PM2 to start on boot..."

# Generate PM2 startup script
pm2 startup

# Save current PM2 process list
pm2 save

# 8. Display status
echo "8. Displaying PM2 status..."
pm2 status
pm2 list

# 9. Test the backend after starting
echo "9. Testing backend after PM2 start..."
sleep 5
if command -v curl &> /dev/null; then
    echo "Testing backend health endpoint..."
    curl -f http://localhost:3000/health || curl -f http://localhost:8080/health || curl -f http://localhost:5000/health || echo "Health endpoint not accessible"
fi

# 10. Show logs
echo "10. Showing PM2 logs..."
pm2 logs backend --lines 20

echo "=== Setup Complete ==="
echo ""
echo "PM2 Commands:"
echo "  pm2 status          - Show all processes"
echo "  pm2 logs backend    - Show backend logs"
echo "  pm2 restart backend - Restart backend"
echo "  pm2 stop backend    - Stop backend"
echo "  pm2 monit          - Open PM2 monitor"
echo ""
echo "Backend should now be running and configured to start on boot."