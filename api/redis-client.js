const Redis = require('ioredis');

let redisClient = null;

function getRedisClient() {
  if (!redisClient) {
    const redisUrl = process.env.REDIS_URL;
    
    if (redisUrl) {
      redisClient = new Redis(redisUrl);
    } else {
      redisClient = new Redis({
        host: process.env.REDIS_HOST || 'localhost',
        port: process.env.REDIS_PORT || 6379,
        db: process.env.REDIS_DB || 0,
        password: process.env.REDIS_PASSWORD || undefined
      });
    }
    
    redisClient.on('error', (err) => {
      console.error('Redis Client Error:', err);
    });
    
    redisClient.on('connect', () => {
      console.log('Redis Client Connected');
    });
  }
  
  return redisClient;
}

module.exports = {
  getRedisClient
};