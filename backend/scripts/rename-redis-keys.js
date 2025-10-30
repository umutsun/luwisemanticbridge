const { createClient } = require('redis');

async function renameRedisKeys() {
  const client = createClient({
    url: 'redis://localhost:6379'
  });

  try {
    await client.connect();
    console.log('✅ Connected to Redis');

    // Get all keys matching the pattern
    const keys = await client.keys('Crawl4AI:*');
    console.log(`\n📊 Found ${keys.length} keys to rename\n`);

    if (keys.length === 0) {
      console.log('ℹ️ No keys found to rename');
      return;
    }

    // Rename each key
    let successCount = 0;
    let errorCount = 0;

    for (const oldKey of keys) {
      const newKey = oldKey.replace(/^Crawl4AI:/, 'crawl_logs:');

      try {
        await client.rename(oldKey, newKey);
        console.log(`✅ Renamed: ${oldKey}`);
        console.log(`   ->      ${newKey}\n`);
        successCount++;
      } catch (error) {
        console.error(`❌ Failed to rename: ${oldKey}`);
        console.error(`   Error: ${error.message}\n`);
        errorCount++;
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log(`✅ Successfully renamed: ${successCount} keys`);
    if (errorCount > 0) {
      console.log(`❌ Failed to rename: ${errorCount} keys`);
    }
    console.log('='.repeat(60));

    // Verify the rename
    const newKeys = await client.keys('crawl_logs:*');
    console.log(`\n📊 Total crawl_logs:* keys now: ${newKeys.length}`);

    const remainingOldKeys = await client.keys('Crawl4AI:*');
    console.log(`📊 Remaining Crawl4AI:* keys: ${remainingOldKeys.length}`);

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await client.quit();
    console.log('\n✅ Disconnected from Redis');
  }
}

renameRedisKeys();
