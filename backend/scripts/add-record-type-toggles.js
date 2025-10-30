const { Pool } = require('pg');
require('dotenv').config({ path: '../.env.lsemb' });

const pool = new Pool({
  host: process.env.POSTGRES_HOST || '91.99.229.96',
  port: parseInt(process.env.POSTGRES_PORT || '5432'),
  database: process.env.POSTGRES_DB || 'lsemb',
  user: process.env.POSTGRES_USER || 'postgres',
  password: process.env.POSTGRES_PASSWORD || '12Kemal1221'
});

async function addRecordTypeToggles() {
  try {
    console.log('🔧 Adding record type toggle settings...\n');

    const settings = [
      { key: 'ragSettings.enableMessageEmbeddings', value: 'true', category: 'rag', description: 'Enable message embeddings in search results' },
      { key: 'ragSettings.enableDocumentEmbeddings', value: 'true', category: 'rag', description: 'Enable document embeddings in search results' },
      { key: 'ragSettings.enableScrapeEmbeddings', value: 'true', category: 'rag', description: 'Enable web scrape embeddings in search results' },
      { key: 'ragSettings.enableUnifiedEmbeddings', value: 'true', category: 'rag', description: 'Enable unified embeddings (sorucevap, makaleler, etc.) in search results' },
      { key: 'ragSettings.unifiedEmbeddingsPriority', value: '1', category: 'rag', description: 'Priority boost for unified embeddings (1-10, higher = more priority)' }
    ];

    for (const setting of settings) {
      await pool.query(`
        INSERT INTO settings (key, value, category, description)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (key)
        DO UPDATE SET
          value = EXCLUDED.value,
          category = EXCLUDED.category,
          description = EXCLUDED.description,
          updated_at = NOW()
      `, [setting.key, setting.value, setting.category, setting.description]);

      console.log(`✅ ${setting.key}: ${setting.value}`);
    }

    console.log('\n✨ Record type toggle settings added successfully!');

    // Show current state
    const result = await pool.query(`
      SELECT key, value, description
      FROM settings
      WHERE key LIKE 'ragSettings.enable%' OR key LIKE 'ragSettings.%Priority'
      ORDER BY key
    `);

    console.log('\n📊 Current RAG Record Type Settings:');
    result.rows.forEach(row => {
      console.log(`  ${row.key}: ${row.value}`);
      console.log(`    └─ ${row.description}`);
    });

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await pool.end();
  }
}

addRecordTypeToggles();
