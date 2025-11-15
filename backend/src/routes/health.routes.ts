import { Router, Request, Response } from 'express';
import { lsembPool, initializeConfigs } from '../config/database.config';
import { initializeRedis } from '../config/redis';
import { SettingsService } from '../services/settings.service';
import { settingsCache } from '../services/cache.service';
import fs from 'fs';
import path from 'path';

const router = Router();

// Load version info from version.json
let versionInfo: any = null;
try {
  const versionPath = path.join(__dirname, '../../..', 'version.json');
  versionInfo = JSON.parse(fs.readFileSync(versionPath, 'utf-8'));
} catch (error) {
  console.warn('Failed to load version.json, using default version');
  versionInfo = {
    version: '1.1.1',
    codename: 'Context Engine',
    releaseDate: '2025-01-11'
  };
}

// Version endpoint
router.get('/version', (req: Request, res: Response) => {
  res.json(versionInfo);
});

// Basic health check for load balancers
router.get('/', async (req: Request, res: Response) => {
  try {
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      service: 'lsemb-context-engine',
      version: versionInfo?.version || '1.1.1',
      codename: versionInfo?.codename || 'Context Engine',
      uptime: process.uptime()
    });
  } catch (error) {
    res.status(500).json({
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// API health check
router.get('/api', async (req: Request, res: Response) => {
  try {
    const timestamp = new Date().toISOString();

    // Check database connection
    let dbStatus = 'connected';
    try {
      await lsembPool.query('SELECT 1');
    } catch (error) {
      dbStatus = 'disconnected';
    }

    // Check Redis connection
    let redisStatus = 'connected';
    try {
      const redis = await initializeRedis();
      if (redis && redis.status === 'ready') {
        await redis.ping();
      } else {
        redisStatus = 'disconnected';
      }
    } catch (error) {
      redisStatus = 'disconnected';
    }

    res.json({
      status: dbStatus === 'connected' && redisStatus === 'connected' ? 'healthy' : 'degraded',
      timestamp,
      services: {
        database: dbStatus,
        redis: redisStatus
      },
      uptime: process.uptime()
    });
  } catch (error) {
    res.status(500).json({
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// System health status
router.get('/system', async (req: Request, res: Response) => {
  try {
    // Get server status from global variable
    const serverStatus = (global as any).serverStatus || {};

    // Determine overall status based on server status
    let overallStatus = 'healthy';
    if (serverStatus.loading) {
      overallStatus = 'loading';
    } else if (serverStatus.database === 'disconnected') {
      overallStatus = 'unhealthy';
    } else if (serverStatus.settings === 'failed') {
      overallStatus = 'degraded';
    }

    const healthStatus = {
      timestamp: new Date().toISOString(),
      status: overallStatus,
      serverStatus: serverStatus,
      services: {
        database: {
          status: serverStatus.database || 'unknown',
          message: serverStatus.database === 'connected' ? 'Connected' : serverStatus.error || 'Checking...',
          responseTime: null
        },
        redis: {
          status: serverStatus.redis || 'unknown',
          message: serverStatus.redis === 'connected' ? 'Connected' : serverStatus.redisError || 'Checking...',
          responseTime: null
        },
        lsemb_database: {
          status: serverStatus.database || 'unknown',
          message: serverStatus.database === 'connected' ? 'Connected' : serverStatus.error || 'Checking...',
          responseTime: null
        },
        settings: {
          status: serverStatus.settings || 'unknown',
          message: serverStatus.settings === 'loaded' ? 'Settings loaded' : (serverStatus.settings === 'failed' ? 'Failed to load settings' : 'Checking...'),
          responseTime: null
        },
        active_llm: {
          status: 'unknown',
          message: 'Checking active LLM...',
          responseTime: null,
          provider: null,
          model: null
        }
      },
      uptime: process.uptime(),
      memory: {
        used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
        external: Math.round(process.memoryUsage().external / 1024 / 1024)
      },
      load: {
        average: require('os').loadavg(),
        cpus: require('os').cpus().length
      }
    };

    // Check ASEM Database connection
    const lsembStart = Date.now();
    try {
      const client = await lsembPool.connect();
      const result = await client.query('SELECT 1 as test');
      client.release();
      healthStatus.services.lsemb_database.status = 'connected';
      healthStatus.services.database = { ...healthStatus.services.lsemb_database };
      healthStatus.services.lsemb_database.message = 'Connected';
      healthStatus.services.database.message = 'Connected';
      healthStatus.services.lsemb_database.responseTime = Date.now() - lsembStart;
      healthStatus.services.database.responseTime = healthStatus.services.lsemb_database.responseTime;
    } catch (error) {
      healthStatus.services.lsemb_database.status = 'disconnected';
      healthStatus.services.database = { ...healthStatus.services.lsemb_database };
      healthStatus.services.lsemb_database.message = error.message;
      healthStatus.services.database.message = error.message;
      healthStatus.services.lsemb_database.responseTime = Date.now() - lsembStart;
      healthStatus.services.database.responseTime = healthStatus.services.lsemb_database.responseTime;
      healthStatus.status = 'degraded';
    }

    // Check Redis connection
    const redisStart = Date.now();
    try {
      const redis = await initializeRedis();
      await redis.ping();
      healthStatus.services.redis.status = 'connected';
      healthStatus.services.redis.message = 'Connected';
      healthStatus.services.redis.responseTime = Date.now() - redisStart;
    } catch (error) {
      healthStatus.services.redis.status = 'disconnected';
      healthStatus.services.redis.message = error.message;
      healthStatus.services.redis.responseTime = Date.now() - redisStart;
      healthStatus.status = 'degraded';
    }

    // Check Settings Service
    const settingsStart = Date.now();
    try {
      const settingsService = SettingsService.getInstance();
      const settings = await settingsService.getAllSettings();
      healthStatus.services.settings.status = 'loaded';
      healthStatus.services.settings.message = 'Settings loaded';
      healthStatus.services.settings.responseTime = Date.now() - settingsStart;

      // Check Active LLM Status
      const llmStart = Date.now();
      const activeModel = await settingsService.getSetting('llmSettings.activeChatModel');
      if (activeModel) {
        const [provider, model] = activeModel.split('/');
        const llmStatus = settings?.llmStatus?.[provider];

        healthStatus.services.active_llm.provider = provider;
        healthStatus.services.active_llm.model = model;
        healthStatus.services.active_llm.responseTime = Date.now() - llmStart;

        if (llmStatus?.status === 'error') {
          healthStatus.services.active_llm.status = 'error';
          healthStatus.services.active_llm.message = llmStatus.error || 'Active LLM provider failed';
          healthStatus.status = 'degraded';
        } else {
          healthStatus.services.active_llm.status = 'connected';
          healthStatus.services.active_llm.message = `Connected to ${provider}`;
        }
      }
    } catch (error) {
      healthStatus.services.settings.status = 'error';
      healthStatus.services.settings.message = error.message;
      healthStatus.services.settings.responseTime = Date.now() - settingsStart;
      healthStatus.status = 'degraded';
    }

    res.json(healthStatus);
  } catch (error) {
    res.status(500).json({
      timestamp: new Date().toISOString(),
      status: 'error',
      message: error.message
    });
  }
});

// Detailed service status with cache statistics
router.get('/services', async (req: Request, res: Response) => {
  try {
    // Get Redis instance for cache stats
    let cacheStats = {
      status: 'disconnected',
      hitRate: 0,
      hits: 0,
      misses: 0,
      totalKeys: 0,
      memory: 'unknown'
    };

    try {
      const redis = await initializeRedis();
      if (redis && redis.status === 'ready') {
        // Get cache statistics
        const hits = await redis.get('cache:hits') || '0';
        const misses = await redis.get('cache:misses') || '0';
        const embeddingHits = await redis.get('cache:embedding_hits') || '0';
        const embeddingMisses = await redis.get('cache:embedding_misses') || '0';

        const totalHits = parseInt(hits) + parseInt(embeddingHits);
        const totalMisses = parseInt(misses) + parseInt(embeddingMisses);
        const totalRequests = totalHits + totalMisses;

        cacheStats = {
          status: 'connected',
          hitRate: totalRequests > 0 ? Math.round((totalHits / totalRequests) * 100) : 0,
          hits: totalHits,
          misses: totalMisses,
          totalKeys: await redis.dbsize(),
          memory: 'info not available'
        };

        // Try to get memory usage
        try {
          const info = await redis.info('memory');
          const match = info.match(/used_memory_human:(.+)/);
          if (match) {
            cacheStats.memory = match[1].trim();
          }
        } catch (memErr) {
          // Ignore memory info errors
        }
      }
    } catch (redisErr) {
      console.error('Redis stats error:', redisErr);
    }

    const serviceStatus = {
      timestamp: new Date().toISOString(),
      services: {
        api: {
          status: 'healthy',
          version: process.env.npm_package_version || '1.0.0',
          environment: process.env.NODE_ENV || 'development',
          port: process.env.API_PORT || 8083
        },
        database: {
          status: 'healthy',
          connectionPool: {
            total: lsembPool.totalCount,
            idle: lsembPool.idleCount,
            waiting: lsembPool.waitingCount
          }
        },
        redis: {
          status: cacheStats.status,
          config: {
            host: process.env.REDIS_HOST || 'localhost',
            port: process.env.REDIS_PORT || 6379,
            db: process.env.REDIS_DB || 2
          },
          cache: cacheStats
        },
        embeddings: {
          status: 'healthy',
          cacheHitRate: `${cacheStats.hitRate}%`,
          performance: cacheStats.hitRate > 50 ? 'good' : cacheStats.hitRate > 20 ? 'fair' : 'poor'
        },
        llm_providers: {
          openai: !!process.env.OPENAI_API_KEY,
          claude: !!process.env.CLAUDE_API_KEY,
          gemini: !!process.env.GEMINI_API_KEY,
          deepseek: !!process.env.DEEPSEEK_API_KEY
        }
      },
      system: {
        nodeVersion: process.version,
        platform: process.platform,
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        load: {
          average: require('os').loadavg(),
          cpus: require('os').cpus().length
        }
      },
      performance: {
        cacheEfficiency: cacheStats.hitRate,
        recommendation: cacheStats.hitRate < 30 ? 'Consider increasing cache TTL or warming up cache with common queries' : 'Cache performance is acceptable',
        metrics: {
          cacheStats,
          settingsCacheStats: settingsCache.getStats(),
          memoryUsage: {
            heap: {
              used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
              total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
              percentage: Math.round((process.memoryUsage().heapUsed / process.memoryUsage().heapTotal) * 100)
            },
            external: Math.round(process.memoryUsage().external / 1024 / 1024),
            rss: Math.round(process.memoryUsage().rss / 1024 / 1024)
          },
          cpu: {
            loadAverage: require('os').loadavg(),
            cpuCount: require('os').cpus().length,
            usage: Math.round((require('os').loadavg()[0] / require('os').cpus().length) * 100)
          },
          database: {
            poolEfficiency: {
              utilization: Math.round((lsembPool.totalCount / 25) * 100), // Out of max 25
              idleRatio: lsembPool.totalCount > 0 ? Math.round((lsembPool.idleCount / lsembPool.totalCount) * 100) : 0,
              waitingRequests: lsembPool.waitingCount
            }
          }
        }
      },
      alerts: {
        warnings: [
          ...(cacheStats.hitRate < 30 ? ['Low cache hit rate detected'] : []),
          ...(process.memoryUsage().heapUsed / process.memoryUsage().heapTotal > 0.8 ? ['High memory usage'] : []),
          ...((lsembPool.totalCount / 25) > 0.8 ? ['High database pool utilization'] : [])
        ],
        errors: [
          ...(cacheStats.status === 'disconnected' ? ['Redis disconnected'] : [])
        ]
      }
    };

    res.json(serviceStatus);
  } catch (error) {
    res.status(500).json({
      timestamp: new Date().toISOString(),
      status: 'error',
      message: error.message
    });
  }
});

// Configuration status
router.get('/config', async (req: Request, res: Response) => {
  try {
    // Load database and redis settings from settings table
    let dbSettings: any = {};
    let redisSettings: any = {};
    try {
      const settingsService = SettingsService.getInstance();
      const settings = await settingsService.getAllSettings();
      dbSettings = settings.database || settings.lsemb_database || {};
      redisSettings = settings.redis || settings.redis_config || {};
    } catch (error) {
      console.error('Failed to load settings:', error);
    }

    const configStatus = {
      timestamp: new Date().toISOString(),
      lsemb_database: {
        host: dbSettings.host || process.env.POSTGRES_HOST || 'localhost',
        port: dbSettings.port || process.env.POSTGRES_PORT || '5432',
        database: dbSettings.database || dbSettings.name || process.env.POSTGRES_DB || 'lsemb',
        connected: false
      },
      source_database: {
        host: dbSettings.host || 'Not configured',
        port: dbSettings.port || 'Not configured',
        database: dbSettings.database || dbSettings.name || 'Not configured',
        connected: false
      },
      redis: {
        host: redisSettings.host || process.env.REDIS_HOST || 'localhost',
        port: redisSettings.port || process.env.REDIS_PORT || 6379,
        db: redisSettings.db || process.env.REDIS_DB || 2,
        connected: false
      },
      app_config: {
        name: 'Alice Semantic Bridge',
        version: '1.0.0',
        environment: process.env.NODE_ENV || 'development'
      }
    };

    // Test connections
    try {
      const client = await lsembPool.connect();
      await client.query('SELECT 1');
      client.release();
      configStatus.lsemb_database.connected = true;
    } catch (error) {
      configStatus.lsemb_database.connected = false;
    }

    try {
      const redis = await initializeRedis();
      await redis.ping();
      configStatus.redis.connected = true;
    } catch (error) {
      configStatus.redis.connected = false;
    }

    // Load dynamic configurations
    try {
      await initializeConfigs();
      const settingsService = SettingsService.getInstance();
      const settings = await settingsService.getAllSettings();

      if (settings.source_database || settings.customer_database) {
        const dbSettings = settings.source_database || settings.customer_database;
        configStatus.source_database = {
          ...configStatus.source_database,
          ...dbSettings,
          connected: false // Would need separate connection test
        };
      }

      if (settings.app_config) {
        configStatus.app_config = {
          ...configStatus.app_config,
          ...settings.app_config
        };
      }
    } catch (error) {
      console.error('Failed to load dynamic config:', error);
    }

    res.json(configStatus);
  } catch (error) {
    res.status(500).json({
      timestamp: new Date().toISOString(),
      status: 'error',
      message: error.message
    });
  }
});

export default router;