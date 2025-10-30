const { Pool } = require('pg');

const lsembPool = new Pool({
  host: '91.99.229.96',
  port: 5432,
  database: 'lsemb',
  user: 'postgres',
  password: 'Semsiye!22',
  ssl: false
});

async function checkSettings() {
  try {
    console.log('\n=== CHECKING SETTINGS TABLE ===\n');

    // Check RAG settings
    const ragSettings = await lsembPool.query(
      "SELECT key, value FROM settings WHERE key LIKE 'ragSettings.%' ORDER BY key"
    );
    console.log('\n📊 RAG Settings:');
    ragSettings.rows.forEach(row => {
      console.log(`  ${row.key} = ${row.value}`);
    });

    // Check Embeddings settings
    const embeddingSettings = await lsembPool.query(
      "SELECT key, value FROM settings WHERE key LIKE 'embeddings.%' OR key LIKE 'embedding_%' ORDER BY key"
    );
    console.log('\n📊 Embedding Settings:');
    embeddingSettings.rows.forEach(row => {
      console.log(`  ${row.key} = ${row.value}`);
    });

    // Check LLM settings
    const llmSettings = await lsembPool.query(
      "SELECT key, value FROM settings WHERE key LIKE 'llmSettings.%' ORDER BY key"
    );
    console.log('\n📊 LLM Settings:');
    llmSettings.rows.forEach(row => {
      console.log(`  ${row.key} = ${row.value}`);
    });

    // Check API provider settings
    const providers = ['openai', 'google', 'anthropic', 'deepseek'];
    for (const provider of providers) {
      const providerSettings = await lsembPool.query(
        `SELECT key, value FROM settings WHERE key LIKE '${provider}.%' ORDER BY key`
      );
      console.log(`\n📊 ${provider.toUpperCase()} Settings:`);
      providerSettings.rows.forEach(row => {
        const maskedValue = row.key.includes('apiKey') ? '***MASKED***' : row.value;
        console.log(`  ${row.key} = ${maskedValue}`);
      });
    }

    // Check all categories to see what exists
    const allCategories = await lsembPool.query(
      "SELECT DISTINCT category FROM settings WHERE category IS NOT NULL ORDER BY category"
    );
    console.log('\n📂 All Categories in Database:');
    allCategories.rows.forEach(row => {
      console.log(`  - ${row.category}`);
    });

    await lsembPool.end();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

checkSettings();
