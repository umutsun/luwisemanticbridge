/**
 * Integrations Management Routes
 * Handles Python services and AI integrations
 */

import { Router, Request, Response } from 'express';
import { spawn, ChildProcess } from 'child_process';
import { pythonService } from '../services/python-integration.service';
import { logger } from '../utils/logger';
import path from 'path';
import fs from 'fs/promises';
import { exec } from 'child_process';
import { promisify } from 'util';

const router = Router();
const execAsync = promisify(exec);

// Store reference to Python process
let pythonProcess: ChildProcess | null = null;

/**
 * Get Python service URL and port from env
 */
function getPythonServiceConfig() {
  const url = process.env.PYTHON_SERVICE_URL || 'http://localhost:8001';
  const portMatch = url.match(/:(\d+)/);
  const port = portMatch ? parseInt(portMatch[1]) : 8001;
  return { url, port };
}

/**
 * Services list configuration - uses env variables
 */
function getServicesList() {
  const pythonConfig = getPythonServiceConfig();
  const backendPort = parseInt(process.env.PORT || '8084');
  const n8nUrl = process.env.N8N_URL || 'http://localhost:5678';

  return [
    {
      name: 'graphql',
      displayName: 'GraphQL Server',
      description: 'Query API with type safety',
      status: 'stopped',
      port: backendPort,
      url: `http://localhost:${backendPort}/graphql`,
      version: 'Apollo Server 4.0',
      icon: 'GitBranch'
    },
    {
      name: 'python',
      displayName: 'Python Services',
      description: 'AI & ML microservices',
      status: 'stopped',
      port: pythonConfig.port,
      url: pythonConfig.url,
      version: 'FastAPI 0.104.1',
      icon: 'Code'
    },
    {
      name: 'crawl4ai',
      displayName: 'Crawl4AI',
      description: 'AI-powered web scraping',
      status: 'stopped',
      port: pythonConfig.port,
      url: `${pythonConfig.url}/api/python/crawl`,
      icon: 'Globe'
    },
    {
      name: 'whisper',
      displayName: 'Whisper STT',
      description: 'Speech-to-text (OpenAI API)',
      status: 'stopped',
      port: pythonConfig.port,
      url: `${pythonConfig.url}/api/python/whisper`,
      version: 'API + Self-hosted',
      icon: 'Mic'
    },
    {
      name: 'pgai',
      displayName: 'pgai Worker',
      description: 'Automatic embeddings',
      status: 'stopped',
      icon: 'Brain'
    },
    {
      name: 'pgvectorscale',
      displayName: 'pgvectorscale',
      description: 'Performance optimizer (Not installed)',
      status: 'stopped',
      icon: 'Zap'
    },
    {
      name: 'nodejs',
      displayName: 'Node.js Backend',
      description: 'Main API gateway',
      status: 'running',
      port: backendPort,
      url: `http://localhost:${backendPort}`,
      version: 'Express 4.18',
      icon: 'Server'
    },
    {
      name: 'database',
      displayName: 'PostgreSQL',
      description: 'Vector database',
      status: 'running',
      port: parseInt(process.env.POSTGRES_PORT || '5432'),
      host: process.env.POSTGRES_HOST || 'localhost',
      database: process.env.POSTGRES_DB || 'lsemb',
      version: '15.13 + pgvector',
      icon: 'Database'
    },
    {
      name: 'redis',
      displayName: 'Redis Cache',
      description: 'Cache server',
      status: 'running',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      host: process.env.REDIS_HOST || 'localhost',
      version: '7.0+',
      icon: 'Server'
    },
    {
      name: 'n8n',
      displayName: 'n8n Workflow',
      description: 'Automation & workflow orchestration',
      status: 'stopped',
      port: 5678,
      url: n8nUrl,
      version: 'n8n 1.0+',
      icon: 'Zap'
    }
  ];
}

/**
 * GET /api/v2/integrations/services
 * Get list of all available services
 */
router.get('/services', (req: Request, res: Response) => {
  res.json(getServicesList());
});

/**
 * Get status of all integrations
 */
router.get('/status', async (req: Request, res: Response) => {
  try {
    // Get Python service port from env
    const pythonPort = parseInt(process.env.PYTHON_SERVICE_PORT || '8001');
    const backendPort = parseInt(process.env.PORT || '8084');

    // Check Python service status
    const pythonAvailable = await pythonService.isPythonServiceAvailable();

    // GraphQL is part of Node.js server on /graphql endpoint
    const graphqlRunning = true; // Always running with Node.js

    const status: Record<string, any> = {
      graphql: {
        status: graphqlRunning ? 'running' : 'stopped',
        port: backendPort, // Same as Node.js port, runs on /graphql endpoint
      },
      python: {
        status: pythonAvailable ? 'running' : 'stopped',
        port: pythonPort
      },
      crawl4ai: {
        status: pythonAvailable ? 'running' : 'stopped',
        port: pythonPort
      },
      whisper: {
        status: pythonAvailable ? 'running' : 'stopped',
        port: pythonPort
      },
      pgai: {
        status: 'stopped', // Will be updated below
        installed: false
      },
      pgvectorscale: {
        status: 'stopped' // Will need extension check
      },
      nodejs: {
        status: 'running', // Always running if this endpoint is reached
        port: backendPort
      },
      database: {
        status: 'running', // Check if needed
        port: parseInt(process.env.POSTGRES_PORT || '5432')
      },
      redis: {
        status: 'running', // Assume running if backend is up
        port: parseInt(process.env.REDIS_PORT || '6379')
      },
      n8n: {
        status: 'stopped', // Will need health check
        port: 5678
      }
    };

    // Check pgai worker status from Python service
    if (pythonAvailable) {
      try {
        const pgaiWorkerStatus = await pythonService.getPgaiWorkerStatus();
        status.pgai = {
          status: pgaiWorkerStatus.running ? 'running' : 'stopped',
          installed: true,
          processed_count: pgaiWorkerStatus.processed_count || 0,
          last_run: pgaiWorkerStatus.last_run
        };
      } catch (error) {
        logger.error('Error checking pgai worker status:', error);
      }
    }

    // Whisper is available if Python service is running (it's part of the same service)
    if (pythonAvailable) {
      status.whisper = {
        status: 'running',
        port: pythonPort
      };
    }

    // Check pgvectorscale (database extension)
    try {
      const pool = require('../server').pgPool;
      const result = await pool.query(`
        SELECT EXISTS (
          SELECT 1 FROM pg_extension WHERE extname = 'vectorscale'
        )
      `);
      if (result.rows[0]?.exists) {
        status.pgvectorscale.status = 'running';
      }
    } catch (error) {
      logger.error('Error checking pgvectorscale:', error);
    }

    res.json(status);
  } catch (error) {
    logger.error('Error getting integration status:', error);
    res.status(500).json({ error: 'Failed to get integration status' });
  }
});

/**
 * Manage Python service (start/stop/restart)
 */
router.post('/service', async (req: Request, res: Response) => {
  const { service, action } = req.body;

  // Services that can be managed
  const manageableServices = ['pgai'];

  if (!manageableServices.includes(service)) {
    return res.status(400).json({
      error: `Service ${service} cannot be managed from the UI. Please manage it manually.`
    });
  }

  try {
    switch (service) {
      case 'python':
      case 'crawl4ai': // Deprecated - manage these services manually
        res.status(400).json({
          error: 'Python services must be started manually. They are already running.'
        });
        break;

      case 'pgai':
        switch (action) {
          case 'start':
            try {
              await pythonService.startPgaiWorker();
              res.json({ message: 'pgai worker started successfully', status: 'running' });
            } catch (error) {
              logger.error('Failed to start pgai worker:', error);
              res.status(500).json({ error: 'Failed to start pgai worker' });
            }
            break;

          case 'stop':
            try {
              await pythonService.stopPgaiWorker();
              res.json({ message: 'pgai worker stopped successfully', status: 'stopped' });
            } catch (error) {
              logger.error('Failed to stop pgai worker:', error);
              res.status(500).json({ error: 'Failed to stop pgai worker' });
            }
            break;

          case 'restart':
            try {
              await pythonService.stopPgaiWorker();
              await new Promise(resolve => setTimeout(resolve, 2000));
              await pythonService.startPgaiWorker();
              res.json({ message: 'pgai worker restarted successfully', status: 'running' });
            } catch (error) {
              logger.error('Failed to restart pgai worker:', error);
              res.status(500).json({ error: 'Failed to restart pgai worker' });
            }
            break;

          default:
            res.status(400).json({ error: 'Invalid action' });
        }
        break;

      case 'graphql':
        // GraphQL server management would go here
        res.json({ message: 'GraphQL server management not implemented yet', status: 'unknown' });
        break;

      default:
        res.status(400).json({ error: 'Invalid service' });
    }
  } catch (error) {
    logger.error(`Error ${action}ing Python service:`, error);
    res.status(500).json({ error: `Failed to ${action} service` });
  }
});

/**
 * Get service configuration
 */
router.get('/config/:integration', async (req: Request, res: Response) => {
  const { integration } = req.params;

  try {
    const configPath = path.join(
      __dirname,
      '..',
      '..',
      'python-services',
      '.env'
    );

    // Read Python service config
    const configContent = await fs.readFile(configPath, 'utf-8');
    const config = parseEnvFile(configContent);

    switch (integration) {
      case 'crawl4ai':
        res.json({
          enabled: config.CRAWL4AI_ENABLED === 'true',
          model: config.CRAWL4AI_MODEL || 'gpt-4',
          provider: config.CRAWL4AI_PROVIDER || 'openai',
          maxWorkers: parseInt(config.CRAWL4AI_MAX_WORKERS || '5'),
          timeout: parseInt(config.CRAWL4AI_TIMEOUT || '30'),
          useCache: config.CRAWL4AI_USE_CACHE === 'true'
        });
        break;

      case 'pgai':
        const pgaiStatus = await pythonService.getPgaiStatus();
        res.json({
          enabled: config.PGAI_WORKER_ENABLED === 'true',
          installed: pgaiStatus.installed,
          vectorizers: pgaiStatus.vectorizers || [],
          workerStatus: pgaiStatus.worker_status || 'unknown'
        });
        break;

      case 'pgvectorscale':
        const pool = require('../server').pgPool;
        const result = await pool.query(`
          SELECT EXISTS (
            SELECT 1 FROM pg_extension WHERE extname = 'vectorscale'
          )
        `);
        res.json({
          installed: result.rows[0]?.exists || false,
          enabled: result.rows[0]?.exists || false,
          indexType: 'diskann'
        });
        break;

      default:
        res.status(404).json({ error: 'Integration not found' });
    }
  } catch (error) {
    logger.error(`Error getting config for ${integration}:`, error);
    res.status(500).json({ error: 'Failed to get configuration' });
  }
});

/**
 * Update service configuration
 */
router.put('/config', async (req: Request, res: Response) => {
  const { integration, config } = req.body;

  try {
    const configPath = path.join(
      __dirname,
      '..',
      '..',
      'python-services',
      '.env'
    );

    // Read current config
    let configContent = await fs.readFile(configPath, 'utf-8');
    const currentConfig = parseEnvFile(configContent);

    // Update config based on integration
    switch (integration) {
      case 'crawl4ai':
        currentConfig.CRAWL4AI_ENABLED = config.enabled ? 'true' : 'false';
        currentConfig.CRAWL4AI_MODEL = config.model;
        currentConfig.CRAWL4AI_PROVIDER = config.provider;
        currentConfig.CRAWL4AI_MAX_WORKERS = config.maxWorkers.toString();
        currentConfig.CRAWL4AI_TIMEOUT = config.timeout.toString();
        currentConfig.CRAWL4AI_USE_CACHE = config.useCache ? 'true' : 'false';
        break;

      case 'pgai':
        currentConfig.PGAI_WORKER_ENABLED = config.enabled ? 'true' : 'false';
        currentConfig.PGAI_BATCH_SIZE = config.batchSize?.toString() || '100';
        currentConfig.PGAI_EMBEDDING_TIMEOUT = config.embeddingTimeout?.toString() || '30';
        break;

      default:
        return res.status(400).json({ error: 'Invalid integration' });
    }

    // Write updated config
    const newConfigContent = Object.entries(currentConfig)
      .map(([key, value]) => `${key}=${value}`)
      .join('\n');

    await fs.writeFile(configPath, newConfigContent);

    res.json({ message: 'Configuration updated successfully' });
  } catch (error) {
    logger.error(`Error updating config for ${integration}:`, error);
    res.status(500).json({ error: 'Failed to update configuration' });
  }
});

/**
 * Get Python service logs
 */
router.get('/logs/:service', async (req: Request, res: Response) => {
  const { service } = req.params;
  const { lines = 100 } = req.query;

  try {
    const logPath = path.join(
      __dirname,
      '..',
      '..',
      'python-services',
      'logs',
      `${service}.log`
    );

    // Check if log file exists
    try {
      await fs.access(logPath);
    } catch {
      return res.json({ logs: ['No logs available yet'] });
    }

    // Read last N lines of log file
    const content = await fs.readFile(logPath, 'utf-8');
    const logLines = content.split('\n').slice(-Number(lines));

    res.json({ logs: logLines });
  } catch (error) {
    logger.error(`Error getting logs for ${service}:`, error);
    res.status(500).json({ error: 'Failed to get logs' });
  }
});

/**
 * Test Crawl4AI functionality
 */
router.post('/test/crawl4ai', async (req: Request, res: Response) => {
  const { url, extractionPrompt, mode = 'auto' } = req.body;

  try {
    const result = await pythonService.crawlWithAI(url, {
      mode: mode as any,
      extractionPrompt,
      model: 'gpt-4',
      provider: 'openai'
    });

    res.json({
      success: true,
      result
    });
  } catch (error) {
    logger.error('Error testing Crawl4AI:', error);
    res.status(500).json({ error: 'Failed to test Crawl4AI' });
  }
});

/**
 * Create pgai vectorizer
 */
router.post('/pgai/vectorizer', async (req: Request, res: Response) => {
  const config = req.body;

  try {
    const result = await pythonService.createVectorizer(config);
    res.json(result);
  } catch (error) {
    logger.error('Error creating vectorizer:', error);
    res.status(500).json({ error: 'Failed to create vectorizer' });
  }
});

/**
 * Get pgai recommendations
 */
router.get('/pgai/recommendations', async (req: Request, res: Response) => {
  try {
    const recommendations = await pythonService.getPgaiRecommendations();
    res.json(recommendations);
  } catch (error) {
    logger.error('Error getting pgai recommendations:', error);
    res.status(500).json({ error: 'Failed to get recommendations' });
  }
});

// Helper functions

async function startPythonService(): Promise<void> {
  if (pythonProcess) {
    logger.warn('Python service is already running');
    return;
  }

  const pythonPath = path.join(__dirname, '..', '..', 'python-services');
  const isWindows = process.platform === 'win32';

  // Check if virtual environment exists
  const venvPath = path.join(pythonPath, 'venv');
  try {
    await fs.access(venvPath);
  } catch {
    logger.info('Creating Python virtual environment...');
    await execAsync(`python -m venv venv`, { cwd: pythonPath });

    // Install requirements
    const pip = isWindows
      ? path.join(venvPath, 'Scripts', 'pip.exe')
      : path.join(venvPath, 'bin', 'pip');

    await execAsync(`${pip} install -r requirements.txt`, { cwd: pythonPath });
  }

  // Start Python service
  const python = isWindows
    ? path.join(venvPath, 'Scripts', 'python.exe')
    : path.join(venvPath, 'bin', 'python');

  pythonProcess = spawn(python, ['main.py'], {
    cwd: pythonPath,
    env: { ...process.env },
    detached: false
  });

  pythonProcess.stdout?.on('data', (data) => {
    logger.info(`Python service: ${data.toString()}`);
  });

  pythonProcess.stderr?.on('data', (data) => {
    logger.error(`Python service error: ${data.toString()}`);
  });

  pythonProcess.on('exit', (code) => {
    logger.info(`Python service exited with code ${code}`);
    pythonProcess = null;
  });

  // Wait for service to be ready
  await new Promise(resolve => setTimeout(resolve, 3000));
}

async function stopPythonService(): Promise<void> {
  if (!pythonProcess) {
    logger.warn('Python service is not running');
    return;
  }

  return new Promise((resolve) => {
    pythonProcess!.on('exit', () => {
      pythonProcess = null;
      resolve();
    });

    if (process.platform === 'win32') {
      // Windows: Use taskkill
      exec(`taskkill /pid ${pythonProcess!.pid} /f`);
    } else {
      // Unix: Send SIGTERM
      pythonProcess!.kill('SIGTERM');
    }

    // Force kill after 5 seconds if still running
    setTimeout(() => {
      if (pythonProcess) {
        pythonProcess.kill('SIGKILL');
        pythonProcess = null;
      }
      resolve();
    }, 5000);
  });
}

function parseEnvFile(content: string): Record<string, string> {
  const config: Record<string, string> = {};
  const lines = content.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const [key, ...valueParts] = trimmed.split('=');
    if (key) {
      config[key.trim()] = valueParts.join('=').trim();
    }
  }

  return config;
}

export default router;