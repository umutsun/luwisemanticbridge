const { Pool } = require('pg');

const lsembPool = new Pool({
  host: '91.99.229.96',
  port: 5432,
  database: 'lsemb',
  user: 'postgres',
  password: 'Semsiye!22',
  ssl: false
});

async function testSettingsAPI() {
  try {
    console.log('\n=== TESTING RAG SETTINGS API QUERY ===\n');

    // Same query as in settings.routes.ts for RAG category
    const ragQuery = `SELECT key, value FROM settings
           WHERE key LIKE 'ragSettings.%' OR key LIKE 'rag.%'`;

    const result = await lsembPool.query(ragQuery);
    console.log(`Found ${result.rows.length} RAG settings`);

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

    console.log('\n📊 Parsed RAG Config:');
    console.log(JSON.stringify(config, null, 2));

    console.log('\n📊 Specific Values:');
    console.log(`  similarityThreshold: ${config.ragSettings?.similarityThreshold}`);
    console.log(`  minResults: ${config.ragSettings?.minResults}`);
    console.log(`  maxResults: ${config.ragSettings?.maxResults}`);
    console.log(`  parallelLLMCount: ${config.ragSettings?.parallelLLMCount}`);
    console.log(`  batchSize: ${config.ragSettings?.batchSize || config.ragSettings?.parallelLLMBatchSize}`);
    console.log(`  chunkOverlap: ${config.ragSettings?.chunkOverlap}`);

    await lsembPool.end();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

testSettingsAPI();
