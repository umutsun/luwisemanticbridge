const { Pool } = require('pg');
require('dotenv').config({ path: '../.env.lsemb' });

const pool = new Pool({
  host: process.env.POSTGRES_HOST || '91.99.229.96',
  port: parseInt(process.env.POSTGRES_PORT || '5432'),
  database: process.env.POSTGRES_DB || 'lsemb',
  user: process.env.POSTGRES_USER || 'postgres',
  password: process.env.POSTGRES_PASSWORD || '12Kemal1221'
});

async function checkPromptSettings() {
  try {
    console.log('🔍 Checking RAG/Prompt settings...\n');

    const result = await pool.query(`
      SELECT key, value, description
      FROM settings
      WHERE key LIKE 'prompts%' OR key LIKE '%temperature%' OR key LIKE '%systemPrompt%'
      ORDER BY key
    `);

    console.log('📊 Prompt & Temperature Settings:');
    console.log('─'.repeat(80));

    if (result.rows.length === 0) {
      console.log('❌ No prompt or temperature settings found!');
      console.log('\n💡 These settings should exist:');
      console.log('   - prompts.systemPrompt (main system prompt)');
      console.log('   - prompts.ragPrompt (RAG-specific prompt)');
      console.log('   - llmSettings.temperature (model temperature)');
    } else {
      result.rows.forEach(row => {
        console.log(`\n📌 ${row.key}:`);
        const displayValue = row.value?.length > 100
          ? row.value.substring(0, 100) + '...'
          : row.value;
        console.log(`   Value: ${displayValue || 'NOT SET'}`);
        if (row.description) {
          console.log(`   Description: ${row.description}`);
        }
      });
    }

    // Check active prompt
    console.log('\n\n🎯 Active Prompt Check:');
    const activePrompt = await pool.query(`
      SELECT key, value
      FROM settings
      WHERE key = 'active_system_prompt' OR key = 'prompts.active'
    `);

    if (activePrompt.rows.length > 0) {
      console.log('✅ Active prompt found:');
      activePrompt.rows.forEach(row => {
        console.log(`   ${row.key}: ${row.value?.substring(0, 100)}...`);
      });
    } else {
      console.log('⚠️  No active prompt setting found');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await pool.end();
  }
}

checkPromptSettings();
