@echo off
echo 🚀 Starting ASEM Development (No Docker Required)...

REM Create .env file if it doesn't exist
if not exist .env (
    echo Creating .env file from template...
    copy .env.example .env
    echo Please update .env file with your API keys
)

REM Check if we need to use remote database
set USE_REMOTE_DB=true
if "%USE_REMOTE_DB%"=="true" (
    echo 🌐 Using remote database at 91.99.229.96
) else (
    echo 💿 Local database would require Docker
)

REM Start API
echo 🔧 Starting API server...
start "ASEM API" cmd /k "cd /d %CD%\api && npm install && npm run dev"

REM Start Frontend
echo 🌐 Starting Frontend...
start "ASEM Frontend" cmd /k "cd /d %CD%\frontend && npm install && npm run dev"

echo.
echo ✅ Development environment is starting!
echo.
echo 📊 API: http://localhost:8083
echo 🌐 Frontend: http://localhost:3000
echo 🗄️  Database: Remote (91.99.229.96)
echo.
echo Press any key to open browser...
pause >nul

start http://localhost:3000
start http://localhost:8083

echo.
echo 💡 Services are running in separate windows.
echo    Close the windows to stop the services.
echo.
pause