const redis = require('redis');

// Redis connection
const redisClient = redis.createClient({
  url: 'redis://localhost:6379'
});

async function checkRedisProgress() {
  try {
    await redisClient.connect();
    console.log('=== REDIS PROGRESS CHECK ===\n');

    // Check all embedding-related keys
    const keys = await redisClient.keys('embedding:*');

    if (keys.length === 0) {
      console.log('No embedding keys found in Redis');
      return;
    }

    console.log('Found Redis keys:');
    for (const key of keys) {
      const type = await redisClient.type(key);
      console.log(`\n${key} (${type}):`);

      if (type === 'hash') {
        const fields = await redisClient.hGetAll(key);
        Object.entries(fields).forEach(([field, value]) => {
          console.log(`  ${field}: ${value}`);
        });
      } else if (type === 'string') {
        const value = await redisClient.get(key);
        console.log(`  Value: ${value}`);
      }
    }

    // Check migration progress specifically
    console.log('\n=== MIGRATION PROGRESS ===');
    const progress = await redisClient.get('migration:progress');
    if (progress) {
      const progressData = JSON.parse(progress);
      console.log(JSON.stringify(progressData, null, 2));
    } else {
      console.log('No migration progress found');
    }

  } catch (error) {
    console.error('Redis error:', error);
  } finally {
    await redisClient.quit();
  }
}

checkRedisProgress().catch(console.error);