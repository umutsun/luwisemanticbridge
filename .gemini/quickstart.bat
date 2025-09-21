@echo off
REM Gemini Quick Start Script for Windows

echo.
echo ================================
echo 🚨 GEMINI URGENT BACKEND SETUP
echo ================================
echo.

cd backend

REM Create .env file if not exists
IF NOT EXIST ".env" (
    echo Creating .env file...
    (
        echo PORT=8080
        echo DATABASE_URL=postgresql://user:password@91.99.229.96:5432/postgres
        echo OPENAI_API_KEY=sk-your-openai-key-here
        echo REDIS_HOST=localhost
        echo REDIS_PORT=6379
        echo REDIS_DB=2
        echo JWT_SECRET=your-super-secret-jwt-key
        echo CORS_ORIGIN=http://localhost:3000
    ) > .env
    echo.
    echo ⚠️  UPDATE .env with your actual credentials!
    echo.
)

REM Create directory structure
echo Creating directory structure...
mkdir src\controllers 2>nul
mkdir src\services 2>nul
mkdir src\models 2>nul
mkdir src\routes 2>nul
mkdir src\middleware 2>nul
mkdir src\utils 2>nul
mkdir src\websocket 2>nul
mkdir src\config 2>nul

REM Create basic server file
IF NOT EXIST "src\server.ts" (
    echo Creating server.ts...
    mkdir src 2>nul
    echo import express from 'express'; > src\server.ts
    echo console.log('Gemini Backend Starting...'); >> src\server.ts
)

echo.
echo ✅ Setup complete!
echo.
echo Next steps:
echo 1. Update .env with your credentials
echo 2. npm install (if packages missing)
echo 3. npm run dev
echo.
echo 🔥 START CODING THE CHAT API NOW!
echo    Deadline: September 5, 2025
echo    Time remaining: 2 DAYS!
echo.
pause
