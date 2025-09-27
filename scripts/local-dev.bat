@echo off
echo 🚀 Starting ASEM Local Development Environment...

REM Check if Node.js is installed
node --version >nul 2>&1
if errorlevel 1 (
    echo ❌ Node.js is not installed! Please install Node.js first.
    pause
    exit /b 1
)

REM Start database services
echo 📊 Starting database services...
docker-compose -f docker-compose.local.yml up -d postgres redis

REM Wait for databases to be ready
echo ⏳ Waiting for databases to be ready...
timeout /t 5 /nobreak

REM Start API in background
echo 🔧 Starting API server...
start "ASEM API" cmd /k "cd /d %CD%\api && npm install && npm run dev"

REM Start Frontend in background
echo 🌐 Starting Frontend...
start "ASEM Frontend" cmd /k "cd /d %CD%\frontend && npm install && npm run dev"

echo.
echo ✅ Local development environment is starting!
echo.
echo 📊 API: http://localhost:8083
echo 🌐 Frontend: http://localhost:3000
echo 🗄️  Database: localhost:5432
echo 📦 Redis: localhost:6379
echo.
echo Press any key to open services in browser...
pause >nul

REM Open browser
start http://localhost:3000
start http://localhost:8083

echo.
echo 💡 To stop all services:
echo    1. Close the API and Frontend command windows
echo    2. Run: docker-compose -f docker-compose.local.yml down
echo.
pause