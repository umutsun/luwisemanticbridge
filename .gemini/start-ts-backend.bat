@echo off
echo.
echo ========================================
echo 🔧 Gemini Backend TypeScript Setup
echo ========================================
echo.

cd backend

echo Installing dependencies...
call npm install

echo.
echo Installing TypeScript types...
call npm install -D @types/compression

echo.
echo Starting development server...
echo.
call npm run dev
