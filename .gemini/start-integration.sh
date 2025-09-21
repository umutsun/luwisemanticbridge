#!/bin/bash
# Gemini Backend Startup Script

echo "🚀 Starting Gemini Backend for Integration"
echo "========================================="

# Check if backend directory exists
if [ ! -d "backend" ]; then
    echo "❌ Backend directory not found!"
    exit 1
fi

cd backend

# Load environment variables
if [ -f .env ]; then
    export $(cat .env | grep -v '^#' | xargs)
    echo "✅ Environment loaded"
else
    echo "❌ .env file not found!"
    exit 1
fi

# Test database connection
echo "🔍 Testing PostgreSQL connection..."
psql $DATABASE_URL -c "SELECT 1;" > /dev/null 2>&1
if [ $? -eq 0 ]; then
    echo "✅ PostgreSQL connected"
else
    echo "❌ PostgreSQL connection failed!"
fi

# Test Redis connection
echo "🔍 Testing Redis connection..."
redis-cli -h $REDIS_HOST -p $REDIS_PORT ping > /dev/null 2>&1
if [ $? -eq 0 ]; then
    echo "✅ Redis connected"
else
    echo "❌ Redis connection failed!"
fi

# Create sample data
echo "📊 Creating demo data..."
node -e "
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function createDemoData() {
    try {
        // Create sample conversation
        await pool.query(\`
            INSERT INTO conversations (id, title, user_id)
            VALUES ('demo-001', 'Demo Conversation', 'demo-user')
            ON CONFLICT (id) DO NOTHING
        \`);
        
        console.log('✅ Demo data created');
    } catch (error) {
        console.error('❌ Error creating demo data:', error);
    } finally {
        await pool.end();
    }
}

createDemoData();
"

# Start the server
echo ""
echo "🎯 Starting server on port 8080..."
echo "Frontend can connect to: http://localhost:8080"
echo "WebSocket available at: ws://localhost:8080"
echo ""

# Run with nodemon for hot reload
npm run dev
