const { Pool } = require('pg');

const lsembPool = new Pool({
  host: '91.99.229.96',
  port: 5432,
  database: 'lsemb',
  user: 'postgres',
  password: 'Semsiye!22',
  ssl: false
});

async function checkEmbeddingSettings() {
  try {
    console.log('\n=== CHECKING ALL EMBEDDING-RELATED SETTINGS ===\n');

    // Check ALL embedding-related keys
    const query = `
      SELECT key, value, category, created_at, updated_at
      FROM settings
      WHERE key LIKE '%embedding%'
         OR key LIKE '%Embedding%'
         OR key = 'embeddingModel'
         OR key = 'embeddingProvider'
      ORDER BY key, updated_at DESC
    `;

    const result = await lsembPool.query(query);
    console.log(`Found ${result.rows.length} embedding-related settings\n`);

    // Group by key to find duplicates
    const keyGroups = {};
    result.rows.forEach(row => {
      if (!keyGroups[row.key]) {
        keyGroups[row.key] = [];
      }
      keyGroups[row.key].push(row);
    });

    console.log('📊 ALL EMBEDDING SETTINGS:\n');
    Object.entries(keyGroups).forEach(([key, rows]) => {
      if (rows.length > 1) {
        console.log(`⚠️  DUPLICATE KEY: ${key} (${rows.length} entries)`);
        rows.forEach((row, idx) => {
          console.log(`   [${idx + 1}] value="${row.value}" | category=${row.category || 'null'} | updated=${row.updated_at}`);
        });
      } else {
        const row = rows[0];
        console.log(`✅ ${key} = ${row.value}`);
        if (row.category) console.log(`   └─ category: ${row.category}`);
      }
    });

    // Check llmSettings.activeEmbeddingModel specifically
    console.log('\n📊 ACTIVE EMBEDDING MODEL CHECK:\n');
    const activeEmbeddingQuery = `
      SELECT key, value, updated_at
      FROM settings
      WHERE key = 'llmSettings.activeEmbeddingModel'
    `;
    const activeResult = await lsembPool.query(activeEmbeddingQuery);

    if (activeResult.rows.length > 0) {
      activeResult.rows.forEach(row => {
        console.log(`   llmSettings.activeEmbeddingModel = "${row.value}"`);
        console.log(`   Last updated: ${row.updated_at}`);
      });
    } else {
      console.log('   ❌ No llmSettings.activeEmbeddingModel found!');
    }

    // Check what the system status endpoint would return
    console.log('\n📊 WHAT SYSTEM STATUS SEES:\n');
    const statusQuery = `
      SELECT key, value FROM settings
      WHERE key IN (
        'llmSettings.activeChatModel',
        'llmSettings.activeEmbeddingModel',
        'llmSettings.embeddingProvider',
        'llmSettings.embeddingModel',
        'embeddings.provider',
        'embeddings.model',
        'embeddingProvider',
        'embeddingModel'
      )
      ORDER BY key
    `;
    const statusResult = await lsembPool.query(statusQuery);
    statusResult.rows.forEach(row => {
      console.log(`   ${row.key} = "${row.value}"`);
    });

    await lsembPool.end();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

checkEmbeddingSettings();
