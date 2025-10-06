const axios = require('axios');

const API_BASE = 'http://localhost:8083';

async function testAuth() {
  console.log('🧪 Testing Authentication System...\n');

  try {
    // Test 1: Register a new user
    console.log('1️⃣ Testing Registration...');
    const registerResponse = await axios.post(`${API_BASE}/api/v2/auth/register`, {
      username: 'testuser',
      email: 'test@example.com',
      password: 'testpassword123',
      first_name: 'Test',
      last_name: 'User'
    });

    console.log('✅ Registration successful!');
    console.log('User:', registerResponse.data.user.username);
    console.log('AccessToken:', registerResponse.data.accessToken.substring(0, 20) + '...\n');

    const accessToken = registerResponse.data.accessToken;

    // Test 2: Get current user
    console.log('2️⃣ Testing Get Current User...');
    const userResponse = await axios.get(`${API_BASE}/api/v2/auth/me`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });

    console.log('✅ Get current user successful!');
    console.log('User:', userResponse.data.user.username, '-', userResponse.data.user.email);
    console.log('Role:', userResponse.data.user.role, '\n');

    // Test 3: Login with the same user
    console.log('3️⃣ Testing Login...');
    const loginResponse = await axios.post(`${API_BASE}/api/v2/auth/login`, {
      email: 'test@example.com',
      password: 'testpassword123'
    });

    console.log('✅ Login successful!');
    console.log('User:', loginResponse.data.user.username);
    console.log('New AccessToken:', loginResponse.data.accessToken.substring(0, 20) + '...\n');

    // Test 4: Test with wrong password
    console.log('4️⃣ Testing Invalid Login...');
    try {
      await axios.post(`${API_BASE}/api/v2/auth/login`, {
        email: 'test@example.com',
        password: 'wrongpassword'
      });
    } catch (error) {
      if (error.response && error.response.status === 401) {
        console.log('✅ Invalid login correctly rejected!');
      }
    }

    // Test 5: Register duplicate user
    console.log('\n5️⃣ Testing Duplicate Registration...');
    try {
      await axios.post(`${API_BASE}/api/v2/auth/register`, {
        username: 'testuser',
        email: 'test@example.com',
        password: 'anotherpassword'
      });
    } catch (error) {
      if (error.response && error.response.status === 400) {
        console.log('✅ Duplicate registration correctly rejected!');
      }
    }

    console.log('\n🎉 All tests passed! Authentication system is working correctly.');

  } catch (error) {
    console.error('❌ Test failed:', error.response?.data || error.message);
  }
}

// Check if backend is running
async function checkBackend() {
  try {
    await axios.get(`${API_BASE}/health`);
    console.log('✅ Backend is running');
    await testAuth();
  } catch (error) {
    console.error('❌ Backend is not running. Please start the backend first.');
    console.log('Run: cd backend && npm run dev');
  }
}

checkBackend();