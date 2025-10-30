const { Pool } = require('pg');

const lsembPool = new Pool({
  host: '91.99.229.96',
  port: 5432,
  database: 'lsemb',
  user: 'postgres',
  password: 'Semsiye!22',
  ssl: false
});

async function testLLMSettingsAPI() {
  try {
    console.log('\n=== TESTING LLM SETTINGS API QUERY ===\n');

    // Same query as in settings.routes.ts for LLM category
    const llmQuery = `SELECT key, value FROM settings
             WHERE key LIKE 'openai.%' OR key LIKE 'google.%' OR key LIKE 'anthropic.%'
                OR key LIKE 'deepseek.%' OR key LIKE 'llmSettings.%'
                OR key LIKE 'ollama.%' OR key LIKE 'huggingface.%' OR key LIKE 'openrouter.%'
                OR key LIKE 'apiStatus.%' OR key LIKE 'llmStatus.%'
                OR key LIKE 'ocrSettings.%' OR key LIKE 'ocrProvider%'`;

    const result = await lsembPool.query(llmQuery);
    console.log(`Found ${result.rows.length} LLM settings`);

    // Build category-specific response (same logic as backend)
    const config = {};

    result.rows.forEach(row => {
      const [section, ...keyParts] = row.key.split('.');
      const key = keyParts.join('.');

      if (!config[section]) {
        config[section] = {};
      }

      // Parse value
      try {
        config[section][key] = JSON.parse(row.value);
      } catch {
        config[section][key] = row.value;
      }
    });

    // Add embedding settings to LLM category
    const embeddingQuery = `SELECT key, value FROM settings WHERE key LIKE 'embeddings.%' OR key LIKE 'embedding_provider' OR key LIKE 'embedding_model'`;
    const embeddingResult = await lsembPool.query(embeddingQuery);

    embeddingResult.rows.forEach(row => {
      const [section, ...keyParts] = row.key.split('.');
      const key = keyParts.join('.') || row.key;

      if (section === 'embeddings' || row.key.startsWith('embedding_')) {
        if (!config.llmSettings) config.llmSettings = {};

        // Map to expected field names
        if (key === 'provider' || row.key === 'embedding_provider') {
          config.llmSettings.embeddingProvider = row.value;
        } else if (key === 'model' || row.key === 'embedding_model') {
          config.llmSettings.embeddingModel = row.value;
        }
      }
    });

    // Construct activeEmbeddingModel from provider and model
    if (config.llmSettings?.embeddingProvider && config.llmSettings?.embeddingModel) {
      config.llmSettings.activeEmbeddingModel = `${config.llmSettings.embeddingProvider}/${config.llmSettings.embeddingModel}`;
    }

    console.log('\n📊 LLM Settings Config (llmSettings object):');
    console.log(JSON.stringify(config.llmSettings, null, 2));

    console.log('\n📊 Specific Values for Frontend:');
    console.log(`  activeChatModel: ${config.llmSettings?.activeChatModel}`);
    console.log(`  activeEmbeddingModel: ${config.llmSettings?.activeEmbeddingModel}`);
    console.log(`  embeddingProvider: ${config.llmSettings?.embeddingProvider}`);
    console.log(`  embeddingModel: ${config.llmSettings?.embeddingModel}`);
    console.log(`  temperature: ${config.llmSettings?.temperature}`);
    console.log(`  maxTokens: ${config.llmSettings?.maxTokens}`);

    console.log('\n📊 Provider Configs:');
    console.log(`  openai.model: ${config.openai?.model}`);
    console.log(`  google.model: ${config.google?.model}`);
    console.log(`  anthropic.model: ${config.anthropic?.model}`);
    console.log(`  deepseek.model: ${config.deepseek?.model}`);

    await lsembPool.end();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

testLLMSettingsAPI();
