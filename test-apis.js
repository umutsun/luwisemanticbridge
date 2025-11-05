// Real-time API validation and status update
const fetch = require('fetch');

async function testAPIs() {
  console.log('🔄 Testing all API providers...\n');

  const results = {};

  // Test OpenAI
  try {
    console.log('Testing OpenAI...');
    const startTime = Date.now();
    const response = await fetch('http://localhost:8083/api/v2/api-validation/status');
    const data = await response.json();

    console.log('✅ OpenAI Status:', data.providers.openai);
    results.openai = data.providers.openai;
  } catch (error) {
    console.log('❌ OpenAI Error:', error.message);
    results.openai = { available: false, error: error.message };
  }

  // Summary
  console.log('\n📊 API STATUS SUMMARY:');
  console.log('====================');
  Object.entries(results).forEach(([provider, status]) => {
    const icon = status.available ? '✅' : '❌';
    console.log(`${icon} ${provider.toUpperCase()}: ${status.available ? 'ACTIVE' : 'INACTIVE'}`);
    if (status.error) {
      console.log(`   Error: ${status.error}`);
    }
  });

  return results;
}

testAPIs().catch(console.error);
