@echo off
echo Starting Alice Semantic Bridge Backend Services...

REM Check if Python is installed
python --version >nul 2>&1
if errorlevel 1 (
    echo Python is not installed. Please install Python 3.8 or higher.
    pause
    exit /b 1
)

REM Create logs directory if it doesn't exist
if not exist "logs" mkdir logs

REM Start LightRAG Service
echo Starting LightRAG service on port 8083...
start "LightRAG Service" /B python backend/lightrag_service.py --port 8083 > logs/lightrag.log 2>&1

REM Wait for service to start
timeout /t 5 /nobreak >nul

REM Check if service is running
:check_service
curl -s http://localhost:8083/health >nul 2>&1
if errorlevel 1 (
    echo Waiting for LightRAG to start...
    timeout /t 3 /nobreak >nul
    goto check_service
)

echo LightRAG service started successfully!
echo.
echo Service URLs:
echo - LightRAG API: http://localhost:8083
echo - Frontend: http://localhost:3001 (start separately with npm run dev)
echo.
echo To stop services, close this window or press Ctrl+C

REM Keep window open
pause