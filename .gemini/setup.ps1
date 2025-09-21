# Gemini Backend Sandbox Setup PowerShell Script

Write-Host ""
Write-Host "==============================" -ForegroundColor Cyan
Write-Host "🔧 Gemini Backend Sandbox Setup" -ForegroundColor Yellow
Write-Host "==============================" -ForegroundColor Cyan
Write-Host ""

# Function to create directory if not exists
function Ensure-Directory {
    param($Path)
    if (!(Test-Path $Path)) {
        New-Item -ItemType Directory -Path $Path -Force | Out-Null
    }
}

# Create backend directory structure
Write-Host "Creating directory structure..." -ForegroundColor Blue
Ensure-Directory ".\backend"
Ensure-Directory ".\backend\src"
Ensure-Directory ".\backend\src\controllers"
Ensure-Directory ".\backend\src\services"
Ensure-Directory ".\backend\src\models"
Ensure-Directory ".\backend\src\middleware"
Ensure-Directory ".\backend\src\routes"
Ensure-Directory ".\backend\src\utils"
Ensure-Directory ".\backend\src\websocket"
Ensure-Directory ".\backend\src\config"
Ensure-Directory ".\backend\tests"
Ensure-Directory ".\backend\dist"
Ensure-Directory ".\backend\uploads"
Ensure-Directory ".\backend\docs"

# Navigate to backend
Set-Location backend

# Check if package.json exists
if (!(Test-Path "package.json")) {
    Write-Host "Initializing Express + TypeScript project..." -ForegroundColor Yellow
    
    # Initialize npm project
    npm init -y | Out-Null
    
    Write-Host "Installing dependencies..." -ForegroundColor Blue
    
    # Core dependencies
    npm install express cors helmet dotenv morgan compression express-rate-limit
    npm install socket.io ioredis bull
    npm install pg pgvector @prisma/client
    npm install joi express-validator
    npm install jsonwebtoken bcryptjs
    npm install winston pino pino-pretty
    npm install multer uuid
    npm install openai @langchain/openai langchain
    
    # Dev dependencies
    npm install -D typescript @types/node @types/express
    npm install -D @types/cors @types/morgan @types/compression
    npm install -D @types/jsonwebtoken @types/bcryptjs
    npm install -D @types/multer @types/uuid
    npm install -D nodemon ts-node
    npm install -D eslint @typescript-eslint/parser @typescript-eslint/eslint-plugin
    npm install -D prettier eslint-config-prettier eslint-plugin-prettier
    npm install -D jest @types/jest ts-jest supertest @types/supertest
    npm install -D prisma
    
    Write-Host "✓ Dependencies installed successfully" -ForegroundColor Green
} else {
    Write-Host "✓ Express project already initialized" -ForegroundColor Green
}

# Create initial server file if not exists
if (!(Test-Path ".\src\server.ts")) {
    Write-Host "Creating initial server file..." -ForegroundColor Blue
    
    $serverContent = @'
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 8080;

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
    res.json({ 
        status: 'healthy',
        agent: 'gemini',
        timestamp: new Date().toISOString()
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 Gemini Backend Server running on port ${PORT}`);
});

export default app;
'@
    
    Set-Content -Path ".\src\server.ts" -Value $serverContent
}

# Return to root
Set-Location ..

Write-Host ""
Write-Host "✅ Gemini Backend Sandbox Setup Complete!" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "  1. cd backend" -ForegroundColor Cyan
Write-Host "  2. Update .env file with your configuration" -ForegroundColor Cyan
Write-Host "  3. npm run dev" -ForegroundColor Cyan
Write-Host ""
Write-Host "API: http://localhost:8080" -ForegroundColor Magenta
Write-Host "Health Check: http://localhost:8080/health" -ForegroundColor Magenta
Write-Host ""

Read-Host "Press Enter to continue..."
