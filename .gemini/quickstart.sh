#!/bin/bash
# Gemini Quick Start Script

echo "🚨 GEMINI URGENT BACKEND SETUP"
echo "=============================="
echo ""

cd backend

# Create .env file if not exists
if [ ! -f .env ]; then
    echo "Creating .env file..."
    cat > .env << 'EOF'
PORT=8080
DATABASE_URL=postgresql://user:password@91.99.229.96:5432/postgres
OPENAI_API_KEY=sk-your-openai-key-here
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_DB=2
JWT_SECRET=your-super-secret-jwt-key
CORS_ORIGIN=http://localhost:3000
EOF
    echo "⚠️  UPDATE .env with your actual credentials!"
fi

# Create source structure
echo "Creating directory structure..."
mkdir -p src/{controllers,services,models,routes,middleware,utils,websocket,config}

# Create tsconfig if not exists
if [ ! -f tsconfig.json ]; then
    echo "Creating TypeScript config..."
    cat > tsconfig.json << 'EOF'
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "moduleResolution": "node"
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
EOF
fi

# Create nodemon.json
if [ ! -f nodemon.json ]; then
    cat > nodemon.json << 'EOF'
{
  "watch": ["src"],
  "ext": "ts",
  "exec": "ts-node -r dotenv/config ./src/server.ts"
}
EOF
fi

echo ""
echo "✅ Setup complete!"
echo ""
echo "Next steps:"
echo "1. Update .env with your credentials"
echo "2. npm install (if not done)"
echo "3. npm run dev"
echo ""
echo "🔥 START CODING THE CHAT API NOW!"
