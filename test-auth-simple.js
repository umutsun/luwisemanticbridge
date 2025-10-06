const axios = require('axios');

async function testLogin() {
  console.log('🧪 Testing Admin Login...\n');

  try {
    // Test login with admin user
    const loginResponse = await axios.post('http://localhost:8083/api/v2/auth/login', {
      email: 'admin@asemb.com',
      password: 'admin123'
    });

    console.log('✅ Admin login successful!');
    console.log('User:', loginResponse.data.user.username);
    console.log('Role:', loginResponse.data.user.role);
    console.log('AccessToken:', loginResponse.data.accessToken.substring(0, 20) + '...\n');

    // Test accessing admin routes
    const token = loginResponse.data.accessToken;
    console.log('2️⃣ Testing Admin Routes...');

    const usersResponse = await axios.get('http://localhost:8083/api/v2/admin/users', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    console.log('✅ Admin users route accessible!');
    console.log('Total users:', usersResponse.data.pagination.total);
    console.log('Sample user:', usersResponse.data.users[0]?.username || 'No users found');

    console.log('\n🎉 Authentication system is working correctly!');

  } catch (error) {
    console.error('❌ Test failed:', error.response?.data || error.message);
    if (error.response?.status === 401) {
      console.log('\n💡 Hint: Check admin credentials');
    }
  }
}

// Check if backend is running
async function checkBackend() {
  try {
    await axios.get('http://localhost:8083/health');
    console.log('✅ Backend is running\n');
    await testLogin();
  } catch (error) {
    console.error('❌ Backend is not running. Please start the backend first.');
    console.log('Run: cd backend && npm run dev');
  }
}

checkBackend();