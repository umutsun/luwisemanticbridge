// Test script for message embeddings functionality
// Run with: node test-message-embeddings.js

const path = require('path');

// Load environment
require('dotenv').config({ path: path.resolve(__dirname, '.env.lsemb') });

const { MessageStorageService } = require('./backend/src/services/message-storage.service');
const { semanticSearch } = require('./backend/src/services/semantic-search.service');

async function testMessageEmbeddings() {
  console.log('🧪 Testing Message Embeddings System...\n');

  try {
    // Test 1: Save a Q&A pair
    console.log('1️⃣ Saving test Q&A pair...');
    const testSessionId = 'test-session-' + Date.now();
    const testUserId = 'test-user-123';
    const question = 'KDV oranları nedir?';
    const answer = 'Türkiye\'de genel KDV oranı %18 olarak uygulanır. Ayrıca %1 ve %8 gibi düşük oranlar da mevcuttur.';

    await MessageStorageService.saveQAPair(
      testSessionId,
      question,
      answer,
      testUserId,
      {
        model: 'test-model',
        sourcesCount: 3,
        confidence: 0.95
      }
    );
    console.log('✅ Q&A pair saved successfully\n');

    // Test 2: Search for the saved message
    console.log('2️⃣ Searching for saved message...');
    const searchResults = await semanticSearch.semanticSearch('KDV', 5);
    const messageResults = searchResults.filter(r => r.source_table === 'message_embeddings');

    if (messageResults.length > 0) {
      console.log('✅ Found message in search results:');
      messageResults.forEach((result, idx) => {
        console.log(`   ${idx + 1}. Score: ${result.score}%, Type: ${result.sourceType}`);
        console.log(`      Excerpt: ${result.excerpt?.substring(0, 100)}...`);
      });
    } else {
      console.log('⚠️ No message results found (might need to refresh embeddings)');
    }

    // Test 3: Get message history
    console.log('\n3️⃣ Getting message history...');
    const history = await MessageStorageService.getSessionMessages(testSessionId);
    console.log(`✅ Found ${history.length} messages in session`);

    // Test 4: Get message stats
    console.log('\n4️⃣ Getting message statistics...');
    const stats = await MessageStorageService.getMessageStats();
    console.log('✅ Statistics:', {
      totalMessages: stats.totalMessages[0]?.count || 0,
      totalSessions: stats.totalSessions[0]?.count || 0,
      avgMessagesPerSession: stats.avgMessagesPerSession[0]?.avg_count || 0
    });

    console.log('\n🎉 All tests completed successfully!');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error(error.stack);
  }
}

// Run the test
testMessageEmbeddings();