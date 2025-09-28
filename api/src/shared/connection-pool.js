/**
 * Simple Redis connection for CacheManager
 * JavaScript compatibility layer
 */

const Redis = require('ioredis');

class RedisPool {
    constructor() {
        this.clients = new Map();
        this.defaultConfig = {
            host: process.env.REDIS_HOST || 'localhost',
            port: parseInt(process.env.REDIS_PORT || '6379'),
            db: parseInt(process.env.REDIS_DB || '2'),
            password: process.env.REDIS_PASSWORD || null,
            retryDelayOnFailover: 100,
            enableReadyCheck: false,
            maxRetriesPerRequest: 3
        };
    }

    static getInstance() {
        if (!RedisPool.instance) {
            RedisPool.instance = new RedisPool();
        }
        return RedisPool.instance;
    }

    getClient(name = 'default') {
        if (!this.clients.has(name)) {
            const client = new Redis(this.defaultConfig);

            client.on('error', (err) => {
                console.warn(`Redis client ${name} error:`, err.message);
            });

            client.on('connect', () => {
                console.log(`Redis client ${name} connected`);
            });

            this.clients.set(name, client);
        }

        return this.clients.get(name);
    }
}

module.exports = { RedisPool };