import { Router, Request, Response } from 'express';
import { redis, subscriber } from '../config/redis';

const router = Router();

// Redis health check
router.get('/health', async (req: Request, res: Response) => {
  try {
    const startTime = Date.now();

    if (!redis || !subscriber) {
      return res.status(503).json({
        status: 'unhealthy',
        service: 'Redis',
        error: 'Redis client not initialized',
        timestamp: new Date().toISOString()
      });
    }

    // Test basic connectivity
    await redis.ping();

    const responseTime = Date.now() - startTime;

    // Get Redis info
    const info = await redis.info('server');
    const memory = await redis.info('memory');

    res.json({
      status: 'healthy',
      service: 'Redis',
      responseTime: `${responseTime}ms`,
      info: {
        version: info.split('\r\n').find(line => line.startsWith('redis_version:'))?.split(':')[1],
        uptime: info.split('\r\n').find(line => line.startsWith('uptime_in_seconds:'))?.split(':')[1],
        usedMemory: memory.split('\r\n').find(line => line.startsWith('used_memory_human:'))?.split(':')[1]
      },
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    res.status(503).json({
      status: 'unhealthy',
      service: 'Redis',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Get Redis info
router.get('/info', async (req: Request, res: Response) => {
  try {
    if (!redis) {
      return res.status(503).json({
        status: 'error',
        message: 'Redis client not initialized'
      });
    }

    const info = await redis.info();
    const infoLines = info.split('\r\n').filter(line => line && !line.startsWith('#'));

    // Parse info into sections
    const parsedInfo: any = {};
    let currentSection = '';

    infoLines.forEach(line => {
      if (line.includes(':')) {
        const [key, value] = line.split(':');

        // Determine section
        if (['server', 'clients', 'memory', 'persistence', 'stats', 'replication', 'cpu', 'cluster', 'keyspace'].includes(key)) {
          currentSection = key;
          parsedInfo[currentSection] = {};
        } else if (currentSection) {
          parsedInfo[currentSection][key] = isNaN(Number(value)) ? value : Number(value);
        } else {
          if (!parsedInfo.general) parsedInfo.general = {};
          parsedInfo.general[key] = isNaN(Number(value)) ? value : Number(value);
        }
      }
    });

    res.json({
      status: 'success',
      redis: parsedInfo,
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    console.error('Redis info error:', error);
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

export default router;