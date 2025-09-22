@echo off
echo 🚀 Alice Semantic Bridge - Windows Deployment Script
echo.

REM Check if domain parameter is provided
if "%1"=="" (
    set DOMAIN=localhost
) else (
    set DOMAIN=%1
)

echo Domain: %DOMAIN%
echo.

REM 1. Stop existing services
echo 🛑 Stopping existing services...
pm2 stop all
pm2 delete all
echo.

REM 2. Create logs directory
echo 📁 Creating logs directory...
if not exist "logs" mkdir logs
echo.

REM 3. Update ecosystem config with domain
echo ⚙️  Updating configuration for domain: %DOMAIN%
powershell -Command "(Get-Content ecosystem.config.js) -replace 'your-domain.com', '%DOMAIN%' | Set-Content ecosystem.config.js"
echo.

REM 4. Install dependencies
echo 📦 Installing dependencies...
cd backend
call npm install
cd ..
cd frontend
call npm install
cd ..
echo.

REM 5. Build applications
echo 🔨 Building applications...
cd backend
call npm run build
cd ..
cd frontend
call npm run build
cd ..
echo.

REM 6. Initialize database
echo 🗄️  Initializing database...
node backend/dist/scripts/init-db.js
echo.

REM 7. Start services with PM2
echo 🚀 Starting services...
pm2 start ecosystem.config.js
echo.

REM 8. Save PM2 configuration
echo 💾 Saving PM2 configuration...
pm2 save
echo.

REM 9. Show status
echo ✅ Deployment complete!
echo.
echo 📊 Service Status:
pm2 status
echo.
echo 🌐 Application URLs:
echo    Frontend: https://%DOMAIN%
echo    Backend API: https://%DOMAIN%/api
echo.
echo 📋 Useful Commands:
echo    pm2 logs          - View logs
echo    pm2 monit         - Monitor processes
echo    pm2 restart all  - Restart all services
echo    pm2 stop all     - Stop all services
echo.

pause