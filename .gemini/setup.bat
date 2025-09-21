@echo off
REM Gemini Backend Sandbox Setup for Windows

echo.
echo ==============================
echo 🔧 Gemini Backend Sandbox Setup
echo ==============================
echo.

REM Check if backend directory exists
IF NOT EXIST ".\backend" (
    echo Creating backend directory structure...
    mkdir backend
    mkdir backend\src
    mkdir backend\src\controllers
    mkdir backend\src\services
    mkdir backend\src\models
    mkdir backend\src\middleware
    mkdir backend\src\routes
    mkdir backend\src\utils
    mkdir backend\src\websocket
    mkdir backend\src\config
    mkdir backend\tests
    mkdir backend\dist
    mkdir backend\uploads
    mkdir backend\docs
)

REM Navigate to backend
cd backend

REM Check if package.json exists
IF NOT EXIST "package.json" (
    echo Initializing Express + TypeScript project...
    
    REM Create package.json
    echo Creating package.json...
    (
        echo {
        echo   "name": "asb-backend-api",
        echo   "version": "2.0.0",
        echo   "description": "Alice Semantic Bridge Backend API v2",
        echo   "main": "dist/server.js",
        echo   "scripts": {
        echo     "dev": "nodemon",
        echo     "build": "tsc",
        echo     "start": "node dist/server.js",
        echo     "test": "jest",
        echo     "test:watch": "jest --watch",
        echo     "test:coverage": "jest --coverage",
        echo     "lint": "eslint src --ext .ts",
        echo     "lint:fix": "eslint src --ext .ts --fix"
        echo   },
        echo   "keywords": ["api", "express", "typescript", "websocket", "pgvector"],
        echo   "author": "Gemini Agent",
        echo   "license": "MIT"
        echo }
    ) > package.json
    
    REM Install dependencies
    echo.
    echo Installing core dependencies...
    call npm install express cors helmet dotenv morgan compression express-rate-limit
    call npm install socket.io ioredis bull
    call npm install pg pgvector @prisma/client
    call npm install joi express-validator
    call npm install jsonwebtoken bcryptjs
    call npm install winston pino pino-pretty
    call npm install multer uuid
    call npm install openai @langchain/openai langchain
    
    REM Install dev dependencies
    echo.
    echo Installing dev dependencies...
    call npm install -D typescript @types/node @types/express
    call npm install -D @types/cors @types/morgan @types/compression
    call npm install -D @types/jsonwebtoken @types/bcryptjs
    call npm install -D @types/multer @types/uuid
    call npm install -D nodemon ts-node
    call npm install -D eslint @typescript-eslint/parser @typescript-eslint/eslint-plugin
    call npm install -D prettier eslint-config-prettier eslint-plugin-prettier
    call npm install -D jest @types/jest ts-jest supertest @types/supertest
    call npm install -D prisma
    
) ELSE (
    echo ✓ Express project already initialized
)

REM Create TypeScript configuration if not exists
IF NOT EXIST "tsconfig.json" (
    echo Creating TypeScript configuration...
    (
        echo {
        echo   "compilerOptions": {
        echo     "target": "ES2022",
        echo     "module": "commonjs",
        echo     "lib": ["ES2022"],
        echo     "outDir": "./dist",
        echo     "rootDir": "./src",
        echo     "strict": true,
        echo     "esModuleInterop": true,
        echo     "skipLibCheck": true,
        echo     "forceConsistentCasingInFileNames": true,
        echo     "resolveJsonModule": true,
        echo     "moduleResolution": "node",
        echo     "allowJs": true,
        echo     "sourceMap": true,
        echo     "declaration": true
        echo   },
        echo   "include": ["src/**/*"],
        echo   "exclude": ["node_modules", "dist", "tests"]
        echo }
    ) > tsconfig.json
)

REM Create .env.example if not exists
IF NOT EXIST ".env.example" (
    echo Creating environment template...
    (
        echo # Server Configuration
        echo NODE_ENV=development
        echo PORT=8080
        echo WS_PORT=8081
        echo.
        echo # Database Configuration
        echo DATABASE_URL=postgresql://user:password@91.99.229.96:5432/postgres
        echo DB_POOL_SIZE=20
        echo.
        echo # Redis Configuration
        echo REDIS_HOST=localhost
        echo REDIS_PORT=6379
        echo REDIS_DB=2
        echo.
        echo # Security
        echo JWT_SECRET=your-super-secret-jwt-key
        echo JWT_EXPIRES_IN=24h
        echo.
        echo # CORS
        echo CORS_ORIGIN=http://localhost:3000
        echo.
        echo # API Keys
        echo OPENAI_API_KEY=your-openai-api-key
    ) > .env.example
)

REM Copy .env.example to .env if not exists
IF NOT EXIST ".env" (
    copy .env.example .env
    echo Created .env file - Please update with your configuration
)

cd ..

echo.
echo ✅ Gemini Backend Sandbox Setup Complete!
echo.
echo To start development:
echo   1. cd backend
echo   2. Update .env with your configuration
echo   3. npm run dev
echo.
echo Or use VS Code: code .gemini\gemini.code-workspace
echo.
echo API will be available at: http://localhost:8080
echo WebSocket server at: ws://localhost:8080
echo.
pause
