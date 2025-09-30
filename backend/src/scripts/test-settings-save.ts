import { SettingsService } from '../services/settings.service';

async function testSettingsSave() {
  const settingsService = SettingsService.getInstance();

  try {
    console.log('Testing settings service save functionality...\n');

    // Test saving API key
    console.log('1. Testing API key save...');
    const apiKeyResult = await settingsService.saveApiKey('test_openai', 'sk-test-key-12345', 'test_api_keys');
    console.log(`API key save result: ${apiKeyResult.success ? '✅ SUCCESS' : '❌ FAILED'}`);
    if (!apiKeyResult.success) {
      console.log(`Error: ${apiKeyResult.error}`);
    }

    // Test saving port configuration
    console.log('\n2. Testing port config save...');
    const portConfig = {
      redis: { port: 6379, host: 'localhost', db: 0 },
      postgres: { port: 5432, host: 'localhost', database: 'test_db' }
    };
    const portResult = await settingsService.savePortConfig(portConfig);
    console.log(`Port config save result: ${portResult.success ? '✅ SUCCESS' : '❌ FAILED'}`);
    if (!portResult.success) {
      console.log(`Error: ${portResult.error}`);
    }

    // Test retrieving the saved data
    console.log('\n3. Testing data retrieval...');
    const retrievedPortConfig = await settingsService.getPortConfig();
    console.log('Retrieved port config:', JSON.stringify(retrievedPortConfig, null, 2));

    const retrievedApiKey = await settingsService.getApiKey('test_openai');
    console.log(`Retrieved API key: ${retrievedApiKey}`);

    console.log('\n✅ Settings service test completed!');

  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

testSettingsSave();