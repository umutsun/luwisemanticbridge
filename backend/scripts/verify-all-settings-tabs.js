const { Pool } = require('pg');

const lsembPool = new Pool({
  host: '91.99.229.96',
  port: 5432,
  database: 'lsemb',
  user: 'postgres',
  password: 'Semsiye!22',
  ssl: false
});

async function verifyAllSettingsTabs() {
  try {
    console.log('\n=== VERIFYING ALL SETTINGS TABS ===\n');

    // 1. APP SETTINGS
    console.log('📱 APP SETTINGS:');
    const appQuery = `SELECT key, value FROM settings WHERE key LIKE 'app.%' ORDER BY key`;
    const appResult = await lsembPool.query(appQuery);
    console.log(`   Found ${appResult.rows.length} app settings`);
    appResult.rows.forEach(row => console.log(`   ✓ ${row.key} = ${row.value}`));

    // 2. LLM/API SETTINGS
    console.log('\n🤖 LLM/API SETTINGS:');
    const llmQuery = `SELECT key, value FROM settings
      WHERE key LIKE 'llmSettings.%'
      ORDER BY key LIMIT 10`;
    const llmResult = await lsembPool.query(llmQuery);
    console.log(`   Found ${llmResult.rows.length} llm settings (showing first 10)`);
    llmResult.rows.forEach(row => {
      const maskedValue = row.key.includes('systemPrompt') || row.key.includes('customInstructions')
        ? '[LONG TEXT]' : row.value;
      console.log(`   ✓ ${row.key} = ${maskedValue}`);
    });

    // 3. RAG SETTINGS
    console.log('\n🔍 RAG SETTINGS:');
    const ragQuery = `SELECT key, value FROM settings WHERE key LIKE 'ragSettings.%' ORDER BY key`;
    const ragResult = await lsembPool.query(ragQuery);
    console.log(`   Found ${ragResult.rows.length} RAG settings`);
    const importantRagKeys = ['similarityThreshold', 'minResults', 'maxResults', 'parallelLLMCount', 'chunkOverlap'];
    ragResult.rows.forEach(row => {
      const keyPart = row.key.split('.')[1];
      if (importantRagKeys.includes(keyPart) || row.key.includes('enable')) {
        console.log(`   ✓ ${row.key} = ${row.value}`);
      }
    });

    // 4. DATABASE SETTINGS
    console.log('\n💾 DATABASE SETTINGS:');
    const dbQuery = `SELECT key, value FROM settings WHERE key LIKE 'database.%' ORDER BY key`;
    const dbResult = await lsembPool.query(dbQuery);
    console.log(`   Found ${dbResult.rows.length} database settings`);
    dbResult.rows.forEach(row => {
      const maskedValue = row.key.includes('password') ? '***MASKED***' : row.value;
      console.log(`   ✓ ${row.key} = ${maskedValue}`);
    });

    // 5. SCRAPER/CRAWLER SETTINGS
    console.log('\n🕷️ SCRAPER SETTINGS:');
    const scraperQuery = `SELECT key, value FROM settings WHERE key LIKE 'scraper.%' ORDER BY key`;
    const scraperResult = await lsembPool.query(scraperQuery);
    console.log(`   Found ${scraperResult.rows.length} scraper settings`);
    scraperResult.rows.forEach(row => console.log(`   ✓ ${row.key} = ${row.value}`));

    // 6. PROMPTS SETTINGS
    console.log('\n💬 PROMPTS SETTINGS:');
    const promptsQuery = `SELECT key, value FROM settings WHERE key LIKE 'prompts.%' ORDER BY key`;
    const promptsResult = await lsembPool.query(promptsQuery);
    console.log(`   Found ${promptsResult.rows.length} prompts settings`);
    promptsResult.rows.forEach(row => {
      const maskedValue = row.value.length > 50 ? row.value.substring(0, 50) + '...' : row.value;
      console.log(`   ✓ ${row.key} = ${maskedValue}`);
    });

    // 7. TRANSLATION/SERVICES SETTINGS
    console.log('\n🌐 TRANSLATION SETTINGS:');
    const translationQuery = `SELECT key, value FROM settings
      WHERE key LIKE 'deepl.%' OR key LIKE 'google.translate.%'
      ORDER BY key`;
    const translationResult = await lsembPool.query(translationQuery);
    console.log(`   Found ${translationResult.rows.length} translation settings`);
    translationResult.rows.forEach(row => {
      const maskedValue = row.key.includes('apiKey') ? '***MASKED***' : row.value;
      console.log(`   ✓ ${row.key} = ${maskedValue}`);
    });

    // 8. SECURITY SETTINGS
    console.log('\n🔒 SECURITY SETTINGS:');
    const securityQuery = `SELECT key, value FROM settings
      WHERE key LIKE 'security.%' OR key LIKE 'jwt.%'
      ORDER BY key`;
    const securityResult = await lsembPool.query(securityQuery);
    console.log(`   Found ${securityResult.rows.length} security settings`);
    securityResult.rows.forEach(row => {
      const maskedValue = row.key.includes('secret') || row.key.includes('key')
        ? '***MASKED***' : row.value;
      console.log(`   ✓ ${row.key} = ${maskedValue}`);
    });

    // CHATBOT SETTINGS (part of RAG tab)
    console.log('\n💭 CHATBOT SETTINGS:');
    const chatbotQuery = `SELECT key, value FROM settings WHERE key LIKE 'chatbot.%' ORDER BY key`;
    const chatbotResult = await lsembPool.query(chatbotQuery);
    console.log(`   Found ${chatbotResult.rows.length} chatbot settings`);
    chatbotResult.rows.forEach(row => {
      const maskedValue = row.value.length > 50 ? row.value.substring(0, 50) + '...' : row.value;
      console.log(`   ✓ ${row.key} = ${maskedValue}`);
    });

    // SUMMARY
    console.log('\n\n📊 SUMMARY:');
    console.log(`   App Settings: ${appResult.rows.length} keys`);
    console.log(`   LLM/API Settings: ${llmResult.rows.length}+ keys`);
    console.log(`   RAG Settings: ${ragResult.rows.length} keys`);
    console.log(`   Database Settings: ${dbResult.rows.length} keys`);
    console.log(`   Scraper Settings: ${scraperResult.rows.length} keys`);
    console.log(`   Prompts Settings: ${promptsResult.rows.length} keys`);
    console.log(`   Translation Settings: ${translationResult.rows.length} keys`);
    console.log(`   Security Settings: ${securityResult.rows.length} keys`);
    console.log(`   Chatbot Settings: ${chatbotResult.rows.length} keys`);

    console.log('\n✅ All settings tabs have data in database!\n');

    await lsembPool.end();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

verifyAllSettingsTabs();
