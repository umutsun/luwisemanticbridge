const { LLMManager } = require('./backend/src/services/llm-manager.service');
const dotenv = require('dotenv');

// Load environment
dotenv.config({ path: './.env.lsemb' });

async function testLLMs() {
  console.log('🧪 Testing LLM services...\n');

  const llmManager = LLMManager.getInstance();

  // Test OpenAI with Turkish
  console.log('1️⃣ Testing OpenAI (Turkish)...');
  try {
    const response1 = await llmManager.generateResponse('openai', 'Merhaba dünya, nasılsın?', 'user');
    console.log('✅ OpenAI (Turkish):', response1.content?.substring(0, 100) + '...');
  } catch (error) {
    console.error('❌ OpenAI (Turkish):', error.message);
  }

  // Test OpenAI with English
  console.log('\n2️⃣ Testing OpenAI (English)...');
  try {
    const response2 = await llmManager.generateResponse('openai', 'Hello world, how are you?', 'user');
    console.log('✅ OpenAI (English):', response2.content?.substring(0, 100) + '...');
  } catch (error) {
    console.error('❌ OpenAI (English):', error.message);
  }

  // Test Gemini with Turkish
  console.log('\n3️⃣ Testing Gemini (Turkish)...');
  try {
    const response3 = await llmManager.generateResponse('gemini', 'Merhaba dünya, nasılsın?', 'user');
    console.log('✅ Gemini (Turkish):', response3.content?.substring(0, 100) + '...');
  } catch (error) {
    console.error('❌ Gemini (Turkish):', error.message);
  }

  // Test Gemini with English
  console.log('\n4️⃣ Testing Gemini (English)...');
  try {
    const response4 = await llmManager.generateResponse('gemini', 'Hello world, how are you?', 'user');
    console.log('✅ Gemini (English):', response4.content?.substring(0, 100) + '...');
  } catch (error) {
    console.error('❌ Gemini (English):', error.message);
  }

  console.log('\n🏁 LLM tests completed!');
}

// Test embeddings
async function testEmbeddings() {
  console.log('\n\n🔤 Testing Embeddings...\n');

  const llmManager = LLMManager.getInstance();

  // Test OpenAI embeddings with Turkish
  console.log('5️⃣ Testing OpenAI Embeddings (Turkish)...');
  try {
    const embedding1 = await llmManager.generateEmbedding('openai', 'Bu bir test metnidir.');
    console.log('✅ OpenAI Embeddings (Turkish):', embedding1.length, 'dimensions');
  } catch (error) {
    console.error('❌ OpenAI Embeddings (Turkish):', error.message);
  }

  // Test OpenAI embeddings with English
  console.log('\n6️⃣ Testing OpenAI Embeddings (English)...');
  try {
    const embedding2 = await llmManager.generateEmbedding('openai', 'This is a test text.');
    console.log('✅ OpenAI Embeddings (English):', embedding2.length, 'dimensions');
  } catch (error) {
    console.error('❌ OpenAI Embeddings (English):', error.message);
  }

  console.log('\n🏁 Embedding tests completed!');
}

// Run tests
(async () => {
  await testLLMs();
  await testEmbeddings();
  process.exit(0);
})();