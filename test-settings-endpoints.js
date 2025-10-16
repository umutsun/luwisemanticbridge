// Test script for settings endpoints
// Run with: node test-settings-endpoints.js

const axios = require('axios');

const BASE_URL = 'http://localhost:8083';

// Test endpoints
async function testSettingsEndpoints() {
  console.log('🧪 Testing Settings Endpoints\n');

  try {
    // Test 1: GET all settings
    console.log('1. Testing GET /api/v2/settings');
    try {
      const response = await axios.get(`${BASE_URL}/api/v2/settings`, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 5000
      });
      console.log('✅ SUCCESS:', response.status);
      console.log('Response:', JSON.stringify(response.data, null, 2));
    } catch (error) {
      console.log('❌ FAILED:', error.code || error.message);
      if (error.response) {
        console.log('Status:', error.response.status);
        console.log('Data:', error.response.data);
      }
    }

    console.log('\n' + '='.repeat(50) + '\n');

    // Test 2: POST update single setting
    console.log('2. Testing POST /api/v2/settings (single setting)');
    try {
      const updateData = {
        key: 'llm.maxTokens',
        value: 4000
      };
      const response = await axios.post(`${BASE_URL}/api/v2/settings`, updateData, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 5000
      });
      console.log('✅ SUCCESS:', response.status);
      console.log('Response:', response.data);
    } catch (error) {
      console.log('❌ FAILED:', error.code || error.message);
      if (error.response) {
        console.log('Status:', error.response.status);
        console.log('Data:', error.response.data);
      }
    }

    console.log('\n' + '='.repeat(50) + '\n');

    // Test 3: POST update multiple settings
    console.log('3. Testing POST /api/v2/settings (multiple settings)');
    try {
      const updateData = {
        settings: {
          'llm.provider': 'openai',
          'llm.model': 'gpt-4o-mini',
          'embeddings.provider': 'openai',
          'embeddings.model': 'text-embedding-ada-002'
        }
      };
      const response = await axios.post(`${BASE_URL}/api/v2/settings`, updateData, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 5000
      });
      console.log('✅ SUCCESS:', response.status);
      console.log('Response:', response.data);
    } catch (error) {
      console.log('❌ FAILED:', error.code || error.message);
      if (error.response) {
        console.log('Status:', error.response.status);
        console.log('Data:', error.response.data);
      }
    }

    console.log('\n' + '='.repeat(50) + '\n');

    // Test 4: GET specific category settings
    console.log('4. Testing GET /api/v2/settings?category=llm');
    try {
      const response = await axios.get(`${BASE_URL}/api/v2/settings?category=llm`, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 5000
      });
      console.log('✅ SUCCESS:', response.status);
      console.log('Response:', JSON.stringify(response.data, null, 2));
    } catch (error) {
      console.log('❌ FAILED:', error.code || error.message);
      if (error.response) {
        console.log('Status:', error.response.status);
        console.log('Data:', error.response.data);
      }
    }

  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

// Run tests
testSettingsEndpoints();