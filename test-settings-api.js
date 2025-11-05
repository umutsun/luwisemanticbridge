/**
 * Test Settings API - Check if embedding models are correct
 */

const API_URL = 'http://localhost:8083'; // Local
// const API_URL = 'https://lsemb.luwi.dev'; // Production

async function testSettingsAPI() {
  console.log('🧪 Testing Settings API\n');
  console.log('='.repeat(80));

  try {
    // Test 1: Get all settings
    console.log('\n📊 Test 1: GET /api/v2/settings\n');
    const response = await fetch(`${API_URL}/api/v2/settings`, {
      headers: {
        'Cache-Control': 'no-cache'
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const settings = await response.json();

    // Test 2: Check embedding settings
    console.log('📋 Embedding Settings:');
    console.log(`  ├─ activeEmbeddingModel: ${settings.llmSettings?.activeEmbeddingModel || 'NOT SET'}`);
    console.log(`  ├─ embeddingProvider:    ${settings.llmSettings?.embeddingProvider || 'NOT SET'}`);
    console.log(`  └─ embeddingModel:       ${settings.llmSettings?.embeddingModel || 'NOT SET'}`);

    // Test 3: Validate embedding model is correct
    console.log('\n✅ Validation:');
    const activeEmbedding = settings.llmSettings?.activeEmbeddingModel || '';

    const chatModels = ['gpt-4', 'gpt-3.5', 'gpt-4o', 'claude', 'gemini'];
    const isWrongModel = chatModels.some(cm => activeEmbedding.includes(cm) && !activeEmbedding.includes('embedding'));

    if (isWrongModel) {
      console.log(`  ❌ WRONG MODEL DETECTED: ${activeEmbedding}`);
      console.log(`     This is a CHAT model, not an embedding model!`);
      console.log(`     Run: node fix-embedding-settings.js`);
    } else if (activeEmbedding.includes('embedding') || activeEmbedding.includes('ada-002')) {
      console.log(`  ✅ Correct embedding model: ${activeEmbedding}`);
    } else {
      console.log(`  ⚠️  Unknown model: ${activeEmbedding}`);
    }

    // Test 4: Check chat model (for comparison)
    console.log('\n📋 Chat Settings (for comparison):');
    console.log(`  └─ activeChatModel:      ${settings.llmSettings?.activeChatModel || 'NOT SET'}`);

    // Test 5: Check RAG settings
    console.log('\n📋 RAG Settings:');
    console.log(`  ├─ similarityThreshold:  ${settings.ragSettings?.similarityThreshold || 'NOT SET'}`);
    console.log(`  ├─ maxResults:           ${settings.ragSettings?.maxResults || 'NOT SET'}`);
    console.log(`  └─ enableUnified:        ${settings.ragSettings?.enableUnifiedEmbeddings || 'NOT SET'}`);

    console.log('\n' + '='.repeat(80));
    console.log('\n✅ Settings API test completed!\n');

  } catch (error) {
    console.error('\n❌ Error testing Settings API:', error.message);
    console.log('\nTroubleshooting:');
    console.log('1. Is backend running? Check: npm run dev (in backend folder)');
    console.log('2. Check backend logs: pm2 logs lsemb-backend');
    console.log('3. Test connection: curl http://localhost:8083/api/v2/settings\n');
  }
}

testSettingsAPI();
