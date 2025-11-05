/**
 * Fix Embedding Settings - CRITICAL FIX
 *
 * This script fixes the wrong embedding model in database
 */

const { Pool } = require('pg');

const pool = new Pool({
  connectionString: 'postgresql://postgres:Semsiye!22@91.99.229.96:5432/lsemb'
});

async function fixEmbeddingSettings() {
  console.log('🔧 Fixing Embedding Settings\n');
  console.log('='.repeat(80));

  try {
    // 1. Fix activeEmbeddingModel (CRITICAL)
    console.log('\n📝 Step 1: Fixing activeEmbeddingModel');
    console.log('   FROM: openai/gpt-4o-mini (WRONG - chat model!)');
    console.log('   TO:   openai/text-embedding-3-small (CORRECT - embedding model)');

    await pool.query(`
      UPDATE settings
      SET value = 'openai/text-embedding-3-small', updated_at = CURRENT_TIMESTAMP
      WHERE key = 'llmSettings.activeEmbeddingModel'
    `);
    console.log('   ✅ activeEmbeddingModel updated');

    // 2. Ensure embeddingProvider is set
    console.log('\n📝 Step 2: Ensuring embeddingProvider is set');
    const providerCheck = await pool.query(`
      SELECT value FROM settings WHERE key = 'llmSettings.embeddingProvider'
    `);

    if (providerCheck.rows.length === 0) {
      await pool.query(`
        INSERT INTO settings (key, value, category, updated_at)
        VALUES ('llmSettings.embeddingProvider', 'openai', 'llm', CURRENT_TIMESTAMP)
      `);
      console.log('   ✅ embeddingProvider inserted (openai)');
    } else {
      console.log(`   ℹ️  embeddingProvider already set: ${providerCheck.rows[0].value}`);
    }

    // 3. Ensure embeddingModel is set
    console.log('\n📝 Step 3: Ensuring embeddingModel is set');
    const modelCheck = await pool.query(`
      SELECT value FROM settings WHERE key = 'llmSettings.embeddingModel'
    `);

    if (modelCheck.rows.length === 0) {
      await pool.query(`
        INSERT INTO settings (key, value, category, updated_at)
        VALUES ('llmSettings.embeddingModel', 'text-embedding-3-small', 'llm', CURRENT_TIMESTAMP)
      `);
      console.log('   ✅ embeddingModel inserted (text-embedding-3-small)');
    } else {
      // Update if it's wrong
      const currentModel = modelCheck.rows[0].value;
      if (currentModel.includes('gpt-') || currentModel.includes('4o')) {
        await pool.query(`
          UPDATE settings
          SET value = 'text-embedding-3-small', updated_at = CURRENT_TIMESTAMP
          WHERE key = 'llmSettings.embeddingModel'
        `);
        console.log(`   ✅ embeddingModel updated from ${currentModel} to text-embedding-3-small`);
      } else {
        console.log(`   ℹ️  embeddingModel already correct: ${currentModel}`);
      }
    }

    // 4. Verify the fix
    console.log('\n📝 Step 4: Verifying the fix');
    const verification = await pool.query(`
      SELECT key, value FROM settings
      WHERE key IN (
        'llmSettings.activeEmbeddingModel',
        'llmSettings.embeddingProvider',
        'llmSettings.embeddingModel'
      )
      ORDER BY key
    `);

    console.log('\n   Current values:');
    verification.rows.forEach(row => {
      const status = row.value.includes('gpt-') && !row.value.includes('embedding') ? '❌' : '✅';
      console.log(`   ${status} ${row.key.padEnd(40)} = ${row.value}`);
    });

    console.log('\n' + '='.repeat(80));
    console.log('\n✅ Embedding settings fixed successfully!');
    console.log('\nNext steps:');
    console.log('1. Restart your backend server');
    console.log('2. Test semantic search in ChatInterface');
    console.log('3. Check that sources have proper similarity scores\n');

  } catch (error) {
    console.error('\n❌ Error fixing settings:', error.message);
    throw error;
  } finally {
    await pool.end();
  }
}

fixEmbeddingSettings();
