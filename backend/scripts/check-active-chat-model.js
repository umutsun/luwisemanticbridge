const { lsembPool } = require('../src/config/database.config');

async function checkActiveChatModel() {
  try {
    const result = await lsembPool.query(
      "SELECT key, value FROM settings WHERE key LIKE '%activeChatModel%' OR key LIKE '%activeEmbedding%' OR key = 'llmSettings.provider' OR key = 'llmSettings.model'"
    );

    console.log('\n=== Active Model Settings ===\n');
    result.rows.forEach(row => {
      console.log(`${row.key}: ${row.value}`);
    });

    if (result.rows.length === 0) {
      console.log('❌ No active model settings found in database!');
      console.log('\n💡 This might be why the UI is showing empty model values.');
    }

    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkActiveChatModel();
