/**
 * Enable LLM-generated summaries for search results
 * This improves the quality of search result descriptions shown in ChatInterface
 */

const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'lsemb',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '12Kemal1221',
});

async function enableLLMSummaries() {
  try {
    console.log('🚀 Enabling LLM-generated summaries for search results...');

    // Add setting to enable LLM summaries
    await pool.query(`
      INSERT INTO settings (key, value, category, description)
      VALUES (
        'ragSettings.enableLLMSummaries',
        'true',
        'rag',
        'Enable LLM-generated natural language summaries for search results (improves quality but adds processing time)'
      )
      ON CONFLICT (key)
      DO UPDATE SET
        value = 'true',
        description = 'Enable LLM-generated natural language summaries for search results (improves quality but adds processing time)'
    `);

    console.log('✅ LLM summaries enabled successfully!');
    console.log('');
    console.log('📝 Setting added:');
    console.log('   Key: ragSettings.enableLLMSummaries');
    console.log('   Value: true');
    console.log('   Effect: Search results will now have contextual, natural language summaries');
    console.log('');
    console.log('ℹ️  Note: This will increase processing time but significantly improve summary quality.');
    console.log('   To disable: Set ragSettings.enableLLMSummaries to "false" in settings');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error enabling LLM summaries:', error);
    process.exit(1);
  }
}

enableLLMSummaries();
