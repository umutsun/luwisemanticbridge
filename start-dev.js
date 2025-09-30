const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🚀 Starting Alice Semantic Bridge Development Environment...\n');

// Check if PM2 is installed
const pm2Check = spawn('pm2', ['--version'], { stdio: 'pipe' });

pm2Check.on('close', (code) => {
  if (code !== 0) {
    console.log('❌ PM2 is not installed. Installing PM2 globally...');
    const installPM2 = spawn('npm', ['install', '-g', 'pm2'], { stdio: 'inherit' });
    installPM2.on('close', () => startServices());
  } else {
    startServices();
  }
});

function startServices() {
  console.log('📋 Starting services with PM2...\n');

  // Stop existing processes
  spawn('pm2', ['stop', 'all'], { stdio: 'pipe' });

  // Start API
  console.log('🔧 Starting API service...');
  const apiProcess = spawn('pm2', ['start', './api/server.js', '--name', 'asemb-api'], {
    stdio: 'inherit',
    env: {
      ...process.env,
      NODE_ENV: 'development',
      PORT: 8083,
      DATABASE_URL: 'postgresql://asemb_user:asemb_password_2025@localhost:5432/asemb',
      REDIS_HOST: 'localhost'
    }
  });

  // Start Frontend
  console.log('🌐 Starting Frontend service...');
  const frontendProcess = spawn('pm2', ['start', './frontend/node_modules/.bin/next', '--name', 'asemb-frontend', '--', 'dev'], {
    stdio: 'inherit',
    cwd: './frontend',
    env: {
      ...process.env,
      NODE_ENV: 'development',
      PORT: 3002,
      NEXT_PUBLIC_API_URL: 'http://localhost:8083'
    }
  });

  setTimeout(() => {
    console.log('\n✅ Services started successfully!');
    console.log('📊 API: http://localhost:8083');
    console.log('🌐 Frontend: http://localhost:3002');
    console.log('📋 PM2 Dashboard: pm2 monit');
    console.log('🛑 To stop: pm2 stop all');
    console.log('📝 To view logs: pm2 logs');
  }, 3000);
}