/**
 * Services Management Routes
 * PM2, system info, and service status endpoints
 */

import { Router, Request, Response } from 'express';
import { exec } from 'child_process';
import { promisify } from 'util';

const router = Router();
const execAsync = promisify(exec);

/**
 * Execute shell command
 */
const runCommand = async (command: string): Promise<string> => {
  try {
    const { stdout } = await execAsync(command);
    return stdout;
  } catch (error: any) {
    console.error(`Command Error [${command}]:`, error.message);
    throw new Error(error.message || 'Command execution failed');
  }
};

/**
 * GET /api/v2/services/system/info
 * Get system information (Database and Redis)
 */
router.get('/system/info', (req: Request, res: Response) => {
  res.json({
    database: {
      host: process.env.POSTGRES_HOST || 'localhost',
      port: parseInt(process.env.POSTGRES_PORT || '5432'),
      database: process.env.POSTGRES_DB || 'lsemb',
      user: process.env.POSTGRES_USER || 'postgres',
      version: '15.13 + pgvector'
    },
    redis: {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      database: parseInt(process.env.REDIS_DB || '0'),
      version: '7.0+'
    },
    backend: {
      port: parseInt(process.env.PORT || '8083'),
      nodeEnv: process.env.NODE_ENV || 'development'
    },
    frontend: {
      port: parseInt(process.env.FRONTEND_PORT || '3002')
    }
  });
});

/**
 * GET /api/v2/services/pm2/status
 * Get the status of PM2 managed processes
 */
router.get('/pm2/status', async (req: Request, res: Response) => {
  try {
    const stdout = await runCommand('npx pm2 jlist');
    const processes = JSON.parse(stdout);
    const online = processes.filter((p: any) => p.pm2_env.status === 'online').length;

    res.json({
      status: 'running',
      online_processes: online,
      total_processes: processes.length
    });
  } catch (error) {
    console.error('[Services] PM2 status check failed:', error);
    res.json({
      status: 'stopped',
      online_processes: 0,
      total_processes: 0
    });
  }
});

/**
 * GET /api/v2/services/pm2/logs
 * Get the latest PM2 logs
 */
router.get('/pm2/logs', async (req: Request, res: Response) => {
  try {
    const stdout = await runCommand('npx pm2 logs --lines 100 --nostream');
    res.setHeader('Content-Type', 'text/plain');
    res.send(stdout);
  } catch (error: any) {
    console.error('[Services] PM2 logs fetch failed:', error);
    res.status(500).send(error.message);
  }
});

/**
 * POST /api/v2/services/pm2/:action
 * Execute a PM2 action (restart or stop)
 */
router.post('/pm2/:action', async (req: Request, res: Response) => {
  const { action } = req.params;

  let command: string | null = null;
  if (action === 'restart') {
    command = 'restart all';
  } else if (action === 'stop') {
    command = 'stop all';
  }

  if (!command) {
    return res.status(400).json({ error: 'Invalid action. Use "restart" or "stop".' });
  }

  try {
    const output = await runCommand(`npx pm2 ${command}`);
    res.json({
      success: true,
      message: `PM2 '${command}' executed.`,
      output
    });
  } catch (error: any) {
    console.error('[Services] PM2 action failed:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router;
