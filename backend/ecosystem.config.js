const path = require('path');

module.exports = {
  apps: [
    // Backend API (Node.js + TypeScript)
    {
      name: 'lsemb-backend',
      cwd: __dirname,
      script: './src/server.ts',
      interpreter: 'node',
      interpreter_args: '-r ts-node/register -r dotenv/config',
      env: {
        NODE_ENV: 'development',
        PORT: 8083,
        dotenv_config_path: '../.env.lsemb'
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 8083,
        dotenv_config_path: '../.env.lsemb'
      },
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '1G',
      error_file: './logs/backend-err.log',
      out_file: './logs/backend-out.log',
      log_file: './logs/backend-combined.log',
      time: true,
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      kill_timeout: 5000,
      wait_ready: true,
      listen_timeout: 10000
    },

    // Frontend (Next.js)
    {
      name: 'lsemb-frontend',
      cwd: path.join(__dirname, '..', 'frontend'),
      script: './node_modules/next/dist/bin/next',
      args: 'dev -p 3002',
      interpreter: 'node',
      env: {
        NODE_ENV: 'development',
        PORT: 3002
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 3002
      },
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '2G',
      error_file: '../backend/logs/frontend-err.log',
      out_file: '../backend/logs/frontend-out.log',
      log_file: '../backend/logs/frontend-combined.log',
      time: true,
      autorestart: true,
      max_restarts: 10,
      min_uptime: '30s',
      kill_timeout: 5000,
      restart_delay: 5000
    },

    // Python Microservices (FastAPI + Uvicorn)
    {
      name: 'lsemb-python',
      cwd: path.join(__dirname, 'python-services'),
      script: 'main.py',
      interpreter: 'python',
      env: {
        PYTHON_SERVICE_PORT: 8089,
        PYTHON_API_HOST: '0.0.0.0',
        ENVIRONMENT: 'development',
        LOG_LEVEL: 'INFO',
        PYTHONUNBUFFERED: '1'
      },
      env_production: {
        PYTHON_SERVICE_PORT: 8089,
        PYTHON_API_HOST: '0.0.0.0',
        ENVIRONMENT: 'production',
        LOG_LEVEL: 'WARNING',
        PYTHONUNBUFFERED: '1'
      },
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '2G',
      error_file: '../logs/python-err.log',
      out_file: '../logs/python-out.log',
      log_file: '../logs/python-combined.log',
      time: true,
      autorestart: true,
      max_restarts: 5,
      min_uptime: '20s',
      kill_timeout: 10000,
      restart_delay: 10000,
      exp_backoff_restart_delay: 100
    }
  ]
};
