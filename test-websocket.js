// WebSocket Test Script
const io = require('socket.io-client');

console.log('🔌 Testing WebSocket connection to backend...');

const backendUrl = 'http://localhost:8083';
const socket = io(backendUrl, {
  transports: ['websocket'],
  reconnection: false
});

let connected = false;

socket.on('connect', () => {
  console.log('✅ WebSocket connected successfully!');
  console.log(`   Socket ID: ${socket.id}`);
  connected = true;

  // Test sending a message
  setTimeout(() => {
    console.log('📤 Sending test message...');
    socket.emit('notification:test', { message: 'Test from client' });
  }, 1000);
});

socket.on('disconnect', (reason) => {
  console.log(`❌ WebSocket disconnected: ${reason}`);
  connected = false;
});

socket.on('connect_error', (error) => {
  console.error('❌ WebSocket connection failed:', error.message);
});

socket.on('notification', (data) => {
  console.log('📥 Received notification:', data);
});

// Set timeout
setTimeout(() => {
  if (connected) {
    console.log('✅ Test completed - WebSocket is working!');
    socket.disconnect();
  } else {
    console.log('❌ Test failed - Could not connect to WebSocket');
  }
  process.exit(0);
}, 5000);