// Test script for category-based settings loading
// Run with: node test-category-settings.js

const axios = require('axios');

const BASE_URL = 'http://localhost:8083';

async function testCategorySettings() {
  console.log('🚀 Testing Category-Based Settings Loading\n');

  const categories = ['llm', 'embeddings', 'rag', 'database', 'security', 'app'];

  for (const category of categories) {
    console.log(`\n📂 Testing category: ${category}`);
    console.log('='.repeat(50));

    const startTime = Date.now();

    try {
      const response = await axios.get(`${BASE_URL}/api/v2/settings?category=${category}`, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 5000
      });

      const endTime = Date.now();
      const loadTime = endTime - startTime;

      console.log(`✅ SUCCESS: ${response.status} (${loadTime}ms)`);
      console.log(`📊 Response size: ${JSON.stringify(response.data).length} characters`);
      console.log(`📦 Sections returned: ${Object.keys(response.data).join(', ')}`);

      // Show first few keys of each section
      Object.entries(response.data).forEach(([section, data]) => {
        if (typeof data === 'object' && data !== null) {
          const keys = Object.keys(data).slice(0, 3);
          console.log(`  - ${section}: ${keys.join(', ')}${keys.length < Object.keys(data).length ? '...' : ''}`);
        }
      });

    } catch (error) {
      const endTime = Date.now();
      const loadTime = endTime - startTime;
      console.log(`❌ FAILED: ${error.code || error.message} (${loadTime}ms)`);
      if (error.response) {
        console.log(`Status: ${error.response.status}`);
      }
    }
  }

  // Test full settings load for comparison
  console.log('\n📂 Testing full settings (no category)');
  console.log('='.repeat(50));

  const startTime = Date.now();

  try {
    const response = await axios.get(`${BASE_URL}/api/v2/settings`, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 5000
    });

    const endTime = Date.now();
    const loadTime = endTime - startTime;

    console.log(`✅ SUCCESS: ${response.status} (${loadTime}ms)`);
    console.log(`📊 Response size: ${JSON.stringify(response.data).length} characters`);
    console.log(`📦 All sections: ${Object.keys(response.data).join(', ')}`);

  } catch (error) {
    const endTime = Date.now();
    const loadTime = endTime - startTime;
    console.log(`❌ FAILED: ${error.code || error.message} (${loadTime}ms)`);
  }
}

// Run tests
testCategorySettings();