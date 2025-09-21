const Redis = require('ioredis');

const redis = new Redis({
  host: 'localhost',
  port: 6379,
  db: 0
});

async function clearProgress() {
  console.log('Clearing embedding progress data...');

  // Clear progress data
  await redis.del('embedding:progress');
  await redis.del('embedding:status');

  console.log('Progress data cleared');

  await redis.quit();
}

clearProgress().catch(console.error);