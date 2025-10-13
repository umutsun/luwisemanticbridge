const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🔧 Fixing port conflicts and fetch issues...\n');

// 1. Kill all processes on problematic ports
console.log('1️⃣ Stopping all Node.js processes...');
try {
  execSync('taskkill /F /IM node.exe', { stdio: 'inherit' });
  console.log('✅ All Node.js processes stopped\n');
} catch (e) {
  console.log('⚠️  No Node.js processes to kill\n');
}

// 2. Clean .next folders
console.log('2️⃣ Cleaning Next.js cache...');
function cleanDirectory(dir) {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
    console.log(`✅ Cleaned ${dir}`);
  }
}

// Clean frontend .next
cleanDirectory(path.join(__dirname, 'frontend', '.next'));

// Clean backend dist
cleanDirectory(path.join(__dirname, 'backend', 'dist'));

console.log('\n3️⃣ Setting up environment...');

// 3. Check environment variables
const frontendEnvPath = path.join(__dirname, 'frontend', '.env.local');
const backendEnvPath = path.join(__dirname, '.env.asemb');

console.log('\n📋 Environment Configuration:');
console.log(`Frontend .env.local: ${fs.existsSync(frontendEnvPath) ? '✅ Exists' : '❌ Missing'}`);
console.log(`Backend .env.asemb: ${fs.existsSync(backendEnvPath) ? '✅ Exists' : '❌ Missing'}`);

// 4. Create or update frontend .env.local if needed
if (!fs.existsSync(frontendEnvPath)) {
  console.log('\n4️⃣ Creating frontend .env.local...');
  const frontendEnv = `
# API Configuration
NEXT_PUBLIC_API_URL=http://localhost:8083
NEXT_PUBLIC_API_PORT=8083
NEXT_PUBLIC_WS_URL=ws://localhost:8083
NEXT_PUBLIC_WEBSOCKET_URL=ws://localhost:8083

# Port Configuration
PORT=3002

# Development
NODE_ENV=development
`;
  fs.writeFileSync(frontendEnvPath, frontendEnv.trim());
  console.log('✅ Created frontend .env.local');
}

// 5. Instructions for starting services
console.log('\n🚀 Startup Instructions:');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('\n1️⃣ Start Backend (run in Terminal 1):');
console.log('   cd backend');
console.log('   npm run dev');
console.log('   → Backend will run on http://localhost:8083\n');

console.log('2️⃣ Start Frontend (run in Terminal 2):');
console.log('   cd frontend');
console.log('   npm run dev');
console.log('   → Frontend will run on http://localhost:3002\n');

console.log('3️⃣ Access Scraper:');
console.log('   → URL: http://localhost:3002/dashboard/scraper\n');

console.log('✨ Done! Port configuration complete.\n');
console.log('💡 If you still get fetch errors, try:');
console.log('   • Clear browser cache');
console.log('   • Open browser in incognito mode');
console.log('   • Check if both services are running without errors');