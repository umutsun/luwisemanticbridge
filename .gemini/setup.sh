#!/bin/bash
# Gemini Backend Sandbox Initialization Script

echo "🔧 Gemini Backend Sandbox Setup"
echo "==============================="

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if backend directory exists
if [ ! -d "./backend" ]; then
    echo -e "${BLUE}Creating backend directory...${NC}"
    mkdir -p ./backend/{src,tests,dist,uploads}
    mkdir -p ./backend/src/{controllers,services,models,middleware,routes,utils,websocket,config}
fi

# Initialize TypeScript Express project if not exists
if [ ! -f "./backend/package.json" ]; then
    echo -e "${YELLOW}Initializing Express + TypeScript project...${NC}"
    cd backend
    
    # Create package.json
    cat > package.json << 'EOF'
{
  "name": "asb-backend-api",
  "version": "2.0.0",
  "description": "Alice Semantic Bridge Backend API v2",
  "main": "dist/server.js",
  "scripts": {
    "dev": "nodemon",
    "build": "tsc",
    "start": "node dist/server.js",
    "test": "jest",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage",
    "lint": "eslint src --ext .ts",
    "lint:fix": "eslint src --ext .ts --fix",
    "docs:generate": "npx @compodoc/compodoc -p tsconfig.json",
    "migrate": "ts-node src/database/migrate.ts",
    "seed": "ts-node src/database/seed.ts"
  },
  "keywords": ["api", "express", "typescript", "websocket", "pgvector"],
  "author": "Gemini Agent",
  "license": "MIT"
}
EOF

    # Install dependencies
    echo -e "${BLUE}Installing core dependencies...${NC}"
    npm install express cors helmet dotenv morgan compression express-rate-limit
    npm install socket.io ioredis bull
    npm install pg pgvector @prisma/client
    npm install joi express-validator
    npm install jsonwebtoken bcryptjs
    npm install winston pino pino-pretty
    npm install multer uuid
    npm install openai @langchain/openai langchain

    # Install dev dependencies
    echo -e "${BLUE}Installing dev dependencies...${NC}"
    npm install -D typescript @types/node @types/express
    npm install -D @types/cors @types/morgan @types/compression
    npm install -D @types/jsonwebtoken @types/bcryptjs
    npm install -D @types/multer @types/uuid
    npm install -D nodemon ts-node
    npm install -D eslint @typescript-eslint/parser @typescript-eslint/eslint-plugin
    npm install -D prettier eslint-config-prettier eslint-plugin-prettier
    npm install -D jest @types/jest ts-jest supertest @types/supertest
    npm install -D @compodoc/compodoc
    npm install -D prisma

    cd ..
else
    echo -e "${GREEN}✓ Express project already initialized${NC}"
fi

# Create TypeScript configuration
echo -e "${BLUE}Creating TypeScript configuration...${NC}"
cat > backend/tsconfig.json << 'EOF'
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "moduleResolution": "node",
    "allowJs": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true,
    "sourceMap": true,
    "declaration": true,
    "declarationMap": true,
    "types": ["node", "jest"],
    "typeRoots": ["./node_modules/@types", "./src/types"]
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests", "**/*.spec.ts", "**/*.test.ts"]
}
EOF

# Create nodemon configuration
echo -e "${BLUE}Creating nodemon configuration...${NC}"
cat > backend/nodemon.json << 'EOF'
{
  "watch": ["src"],
  "ext": "ts",
  "ignore": ["src/**/*.spec.ts", "src/**/*.test.ts"],
  "exec": "ts-node -r dotenv/config ./src/server.ts",
  "env": {
    "NODE_ENV": "development"
  }
}
EOF

# Create ESLint configuration
echo -e "${BLUE}Creating ESLint configuration...${NC}"
cat > backend/.eslintrc.json << 'EOF'
{
  "parser": "@typescript-eslint/parser",
  "extends": [
    "plugin:@typescript-eslint/recommended",
    "prettier",
    "plugin:prettier/recommended"
  ],
  "parserOptions": {
    "ecmaVersion": 2022,
    "sourceType": "module"
  },
  "rules": {
    "@typescript-eslint/no-explicit-any": "warn",
    "@typescript-eslint/explicit-function-return-type": "off",
    "@typescript-eslint/explicit-module-boundary-types": "off",
    "@typescript-eslint/no-unused-vars": ["error", { "argsIgnorePattern": "^_" }]
  }
}
EOF

# Create Prettier configuration
cat > backend/.prettierrc << 'EOF'
{
  "semi": true,
  "trailingComma": "es5",
  "singleQuote": true,
  "printWidth": 80,
  "tabWidth": 2,
  "useTabs": false,
  "arrowParens": "avoid",
  "endOfLine": "auto"
}
EOF

# Create Jest configuration
echo -e "${BLUE}Creating Jest configuration...${NC}"
cat > backend/jest.config.js << 'EOF'
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/tests'],
  testMatch: ['**/__tests__/**/*.ts', '**/?(*.)+(spec|test).ts'],
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/*.interface.ts',
    '!src/**/index.ts',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  moduleNameMapper: {
    '@/(.*)': '<rootDir>/src/$1',
  },
};
EOF

# Create environment template
echo -e "${BLUE}Creating environment template...${NC}"
cat > backend/.env.example << 'EOF'
# Server Configuration
NODE_ENV=development
PORT=8080
WS_PORT=8081

# Database Configuration
DATABASE_URL=postgresql://user:password@91.99.229.96:5432/postgres
DB_POOL_SIZE=20

# Redis Configuration
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_DB=2
REDIS_PASSWORD=

# Security
JWT_SECRET=your-super-secret-jwt-key
JWT_EXPIRES_IN=24h
BCRYPT_ROUNDS=10

# CORS
CORS_ORIGIN=http://localhost:3000

# API Keys
OPENAI_API_KEY=your-openai-api-key

# Logging
LOG_LEVEL=debug
LOG_FORMAT=json

# Rate Limiting
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=100
EOF

# Create basic server file
echo -e "${BLUE}Creating server setup...${NC}"
cat > backend/src/server.ts << 'EOF'
import express, { Application } from 'express';
import http from 'http';
import { Server as SocketServer } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Initialize Express app
const app: Application = express();
const server = http.createServer(app);
const io = new SocketServer(server, {
  cors: {
    origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
    credentials: true,
  },
});

// Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  credentials: true,
}));
app.use(compression());
app.use(morgan('dev'));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// API v2 base route
app.get('/api/v2', (req, res) => {
  res.json({
    message: 'ASB Backend API v2',
    version: '2.0.0',
    agent: 'gemini',
  });
});

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log('New WebSocket connection:', socket.id);

  socket.on('disconnect', () => {
    console.log('WebSocket disconnected:', socket.id);
  });
});

// Start server
const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
  console.log(`🚀 Gemini Backend Server running on port ${PORT}`);
  console.log(`📡 WebSocket server ready`);
  console.log(`🔧 Environment: ${process.env.NODE_ENV}`);
});

export { app, io };
EOF

# Create OpenAPI specification template
echo -e "${BLUE}Creating OpenAPI specification...${NC}"
mkdir -p backend/docs
cat > backend/docs/openapi.yaml << 'EOF'
openapi: 3.0.0
info:
  title: Alice Semantic Bridge API
  version: 2.0.0
  description: Modern API for semantic search and workflow management
servers:
  - url: http://localhost:8080/api/v2
    description: Development server
paths:
  /health:
    get:
      summary: Health check
      tags: [System]
      responses:
        200:
          description: Service is healthy
  /dashboard/stats:
    get:
      summary: Get dashboard statistics
      tags: [Dashboard]
      responses:
        200:
          description: Dashboard statistics
EOF

echo -e "${GREEN}✅ Gemini Backend Sandbox Setup Complete!${NC}"
echo ""
echo "To start development:"
echo "  1. Open VS Code: code .gemini/gemini.code-workspace"
echo "  2. Copy .env.example to .env and configure"
echo "  3. Run: cd backend && npm run dev"
echo "  4. Or use Docker: docker-compose -f docker-compose.sandbox.yml up gemini-sandbox"
echo ""
echo "API will be available at: http://localhost:8080"
echo "WebSocket server at: ws://localhost:8080"
echo "API Documentation at: http://localhost:8080/api/v2/docs"
echo ""
echo "Happy coding! 🚀"
