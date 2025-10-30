const http = require('http');

// Test the dashboard stats endpoint directly
const options = {
  hostname: 'localhost',
  port: 8083,
  path: '/api/v2/dashboard/stats',
  method: 'GET',
  headers: {
    'Content-Type': 'application/json',
    // Add a mock auth header for testing (if needed)
    'Authorization': 'Bearer test-token'
  }
};

const req = http.request(options, (res) => {
  console.log(`Status Code: ${res.statusCode}`);
  console.log('Headers:', res.headers);

  let data = '';
  res.on('data', (chunk) => {
    data += chunk;
  });

  res.on('end', () => {
    try {
      const parsed = JSON.parse(data);
      console.log('\nResponse Data:');
      console.log('==============');
      console.log('Total Tokens Used:', parsed.totalTokensUsed?.toLocaleString() || '0');
      console.log('Total Cost: $', parsed.totalCost?.toFixed(4) || '0.0000');
      console.log('Total Conversations:', parsed.totalConversations);
      console.log('Total Messages:', parsed.totalMessages);
      console.log('\nFull Response:', JSON.stringify(parsed, null, 2));
    } catch (error) {
      console.log('Raw Response:', data);
    }
  });
});

req.on('error', (error) => {
  console.error('Request Error:', error);
});

req.end();