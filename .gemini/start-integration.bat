@echo off
REM Gemini Backend Startup Script for Windows

echo.
echo ======================================
echo 🚀 Starting Gemini Backend for Integration
echo ======================================
echo.

REM Check backend directory
IF NOT EXIST "backend" (
    echo ❌ Backend directory not found!
    exit /b 1
)

cd backend

REM Check .env file
IF NOT EXIST ".env" (
    echo ❌ .env file not found!
    echo Please create .env from .env.example
    exit /b 1
) ELSE (
    echo ✅ Environment file found
)

REM Create demo data script
echo Creating demo data...
echo const { Pool } = require('pg'); > create-demo-data.js
echo const pool = new Pool({ connectionString: process.env.DATABASE_URL }); >> create-demo-data.js
echo. >> create-demo-data.js
echo async function createDemoData() { >> create-demo-data.js
echo   try { >> create-demo-data.js
echo     await pool.query(` >> create-demo-data.js
echo       INSERT INTO conversations (id, title, user_id) >> create-demo-data.js
echo       VALUES ('demo-001', 'Demo Conversation', 'demo-user') >> create-demo-data.js
echo       ON CONFLICT (id) DO NOTHING >> create-demo-data.js
echo     `); >> create-demo-data.js
echo     console.log('✅ Demo data created'); >> create-demo-data.js
echo   } catch (error) { >> create-demo-data.js
echo     console.error('❌ Error:', error.message); >> create-demo-data.js
echo   } finally { >> create-demo-data.js
echo     await pool.end(); >> create-demo-data.js
echo   } >> create-demo-data.js
echo } >> create-demo-data.js
echo createDemoData(); >> create-demo-data.js

REM Run demo data creation
node -r dotenv/config create-demo-data.js

REM Clean up
del create-demo-data.js

echo.
echo 🎯 Starting server on port 8080...
echo.
echo Frontend can connect to:
echo   API: http://localhost:8080
echo   WebSocket: ws://localhost:8080
echo   Health: http://localhost:8080/health
echo.
echo Press Ctrl+C to stop the server
echo.

REM Start server
npm run dev
