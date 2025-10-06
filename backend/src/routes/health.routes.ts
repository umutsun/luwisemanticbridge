import { Router, Request, Response } from 'express';
import { asembPool, initializeConfigs } from '../config/database.config';
import { initializeRedis } from '../config/redis';
import { SettingsService } from '../services/settings.service';

const router = Router();

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
        asemb_database: {
          status: serverStatus.database || 'unknown',
          message: serverStatus.database === 'connected' ? 'Connected' : serverStatus.error || 'Checking...',
          responseTime: null
        },
        settings: {
          status: serverStatus.settings || 'unknown',
          message: serverStatus.settings === 'loaded' ? 'Settings loaded' : (serverStatus.settings === 'failed' ? 'Failed to load settings' : 'Checking...'),
          responseTime: null
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
    const asembStart = Date.now();
    try {
      const client = await asembPool.connect();
      const result = await client.query('SELECT 1 as test');
      client.release();
      healthStatus.services.asemb_database.status = 'healthy';
      healthStatus.services.asemb_database.message = 'Connected';
      healthStatus.services.asemb_database.responseTime = Date.now() - asembStart;
    } catch (error) {
      healthStatus.services.asemb_database.status = 'error';
      healthStatus.services.asemb_database.message = error.message;
      healthStatus.services.asemb_database.responseTime = Date.now() - asembStart;
      healthStatus.status = 'degraded';
    }

    // Check Redis connection
    const redisStart = Date.now();
    try {
      const redis = await initializeRedis();
      await redis.ping();
      healthStatus.services.redis.status = 'healthy';
      healthStatus.services.redis.message = 'Connected';
      healthStatus.services.redis.responseTime = Date.now() - redisStart;
    } catch (error) {
      healthStatus.services.redis.status = 'error';
      healthStatus.services.redis.message = error.message;
      healthStatus.services.redis.responseTime = Date.now() - redisStart;
      healthStatus.status = 'degraded';
    }

    // Check Settings Service
    const settingsStart = Date.now();
    try {
      const settingsService = SettingsService.getInstance();
      const settings = await settingsService.getAllSettings();
      healthStatus.services.settings.status = 'healthy';
      healthStatus.services.settings.message = 'Settings loaded';
      healthStatus.services.settings.responseTime = Date.now() - settingsStart;
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

// Detailed service status
router.get('/services', async (req: Request, res: Response) => {
  try {
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
            total: asembPool.totalCount,
            idle: asembPool.idleCount,
            waiting: asembPool.waitingCount
          }
        },
        redis: {
          status: 'healthy',
          config: {
            host: process.env.REDIS_HOST || 'localhost',
            port: process.env.REDIS_PORT || 6379,
            db: process.env.REDIS_DB || 2
          }
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
        memory: process.memoryUsage()
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
    const configStatus = {
      timestamp: new Date().toISOString(),
      asemb_database: {
        host: process.env.POSTGRES_HOST || 'asemb.luwi.dev',
        port: process.env.POSTGRES_PORT || '5432',
        database: process.env.POSTGRES_DB || 'asemb',
        connected: false
      },
      customer_database: {
        host: 'Loaded from settings',
        port: 'Loaded from settings',
        database: 'Loaded from settings',
        connected: false
      },
      redis: {
        host: process.env.REDIS_HOST || 'localhost',
        port: process.env.REDIS_PORT || 6379,
        db: process.env.REDIS_DB || 2,
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
      const client = await asembPool.connect();
      await client.query('SELECT 1');
      client.release();
      configStatus.asemb_database.connected = true;
    } catch (error) {
      configStatus.asemb_database.connected = false;
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

      if (settings.customer_database) {
        configStatus.customer_database = {
          ...configStatus.customer_database,
          ...settings.customer_database,
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