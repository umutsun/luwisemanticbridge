const { Pool } = require('pg');

const lsembPool = new Pool({
  host: '91.99.229.96',
  port: 5432,
  database: 'lsemb',
  user: 'postgres',
  password: 'Semsiye!22',
  ssl: false
});

async function checkDynamicMetadata() {
  try {
    console.log('\n=== CHECKING DYNAMIC METADATA SETTINGS ===\n');

    // Check App Settings (for title and description)
    console.log('📱 APP SETTINGS (Title & Description):');
    const appQuery = `SELECT key, value FROM settings WHERE key LIKE 'app.%' ORDER BY key`;
    const appResult = await lsembPool.query(appQuery);
    appResult.rows.forEach(row => {
      console.log(`   ${row.key} = "${row.value}"`);
    });

    // Check Chatbot Settings (for chatbot page title)
    console.log('\n💬 CHATBOT SETTINGS (Chatbot Page Title):');
    const chatbotQuery = `SELECT key, value FROM settings WHERE key LIKE 'chatbot.%' ORDER BY key`;
    const chatbotResult = await lsembPool.query(chatbotQuery);

    if (chatbotResult.rows.length === 0) {
      console.log('   ⚠️  No chatbot settings found in database!');
      console.log('   💡 Chatbot title should be in chatbot.title or fetched from /api/v2/chatbot/settings');
    } else {
      chatbotResult.rows.forEach(row => {
        const displayValue = row.value.length > 100 ? row.value.substring(0, 100) + '...' : row.value;
        console.log(`   ${row.key} = "${displayValue}"`);
      });
    }

    // Check if chatbot.title exists in settings table
    console.log('\n🔍 CHECKING CHATBOT TITLE SPECIFICALLY:');
    const chatbotTitleQuery = `SELECT key, value FROM settings WHERE key = 'chatbot.title'`;
    const titleResult = await lsembPool.query(chatbotTitleQuery);

    if (titleResult.rows.length > 0) {
      console.log(`   ✅ chatbot.title = "${titleResult.rows[0].value}"`);
    } else {
      console.log('   ⚠️  chatbot.title NOT FOUND in settings table!');
      console.log('   💡 This should be set in Settings → RAG → Chatbot Settings → Branding → Title');
      console.log('   💡 Fetched from /api/v2/chatbot/settings endpoint');
    }

    console.log('\n📊 SUMMARY FOR DYNAMIC METADATA:');
    console.log('   ✅ App Name (app.name): Used for page titles');
    console.log('   ✅ App Description (app.description): Used for meta description');
    console.log('   ✅ Chatbot Title (chatbot_settings.title): Used for chatbot page title');
    console.log('\n   DynamicTitle component will use these values dynamically!\n');

    await lsembPool.end();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

checkDynamicMetadata();
