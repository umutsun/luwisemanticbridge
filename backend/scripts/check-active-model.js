const { Pool } = require('pg');
require('dotenv').config({ path: '../.env.lsemb' });

const pool = new Pool({
  host: process.env.POSTGRES_HOST || '91.99.229.96',
  port: parseInt(process.env.POSTGRES_PORT || '5432'),
  database: process.env.POSTGRES_DB || 'lsemb',
  user: process.env.POSTGRES_USER || 'postgres',
  password: process.env.POSTGRES_PASSWORD || '12Kemal1221'
});

async function checkActiveModel() {
  try {
    console.log('🔍 Checking active LLM models...\n');

    const result = await pool.query(`
      SELECT key, value
      FROM settings
      WHERE key IN ('llmSettings.activeChatModel', 'llmSettings.activeEmbeddingModel')
      ORDER BY key
    `);

    console.log('📊 Current Active Models:');
    console.log('─'.repeat(80));

    result.rows.forEach(row => {
      if (row.key === 'llmSettings.activeChatModel') {
        console.log(`🤖 Chat Model (used for generating questions):`);
        console.log(`   ${row.value || 'NOT SET'}\n`);
      } else if (row.key === 'llmSettings.activeEmbeddingModel') {
        console.log(`📝 Embedding Model (used for search):`);
        console.log(`   ${row.value || 'NOT SET'}\n`);
      }
    });

    // Parse the chat model
    if (result.rows[0]?.value) {
      const [provider, model] = result.rows[0].value.split('/');
      console.log('📌 Chat Model Details:');
      console.log(`   Provider: ${provider}`);
      console.log(`   Model: ${model}`);
      console.log(`\n💡 This model is used for:`);
      console.log(`   - Generating questions for search results (the clickable questions)`);
      console.log(`   - Processing user queries`);
      console.log(`   - Summarizing content`);
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await pool.end();
  }
}

checkActiveModel();
