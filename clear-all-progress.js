const Redis = require('ioredis');

const redis = new Redis({
  host: 'localhost',
  port: 6379,
  db: 0
});

async function clearAllProgress() {
  console.log('Clearing all embedding progress data...');

  // Clear all progress-related keys
  const keys = [
    'embedding:progress',
    'migration:progress',
    'embedding:status',
    'embedding:operation'
  ];

  for (const key of keys) {
    const result = await redis.del(key);
    console.log(`${key}: ${result > 0 ? 'Cleared' : 'Not found'}`);
  }

  console.log('\nAll progress data cleared');

  await redis.quit();
}

clearAllProgress().catch(console.error);