const { spawn } = require('child_process');
const path = require('path');

// Start Next.js development server
const nextProcess = spawn('npx', ['next', 'dev'], {
  cwd: __dirname,
  stdio: 'inherit',
  shell: true
});

nextProcess.on('close', (code) => {
  console.log(`Next.js process exited with code ${code}`);
});

nextProcess.on('error', (err) => {
  console.error('Failed to start Next.js:', err);
});