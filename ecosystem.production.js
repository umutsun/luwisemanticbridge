module.exports = {
  apps: [
    {
      name: 'lsemb-backend',
      script: 'src/server.ts',
      cwd: '/var/www/lsemb/backend',
      interpreter: 'node',
      interpreter_args: '-r dotenv/config -r ts-node/register',
      env: {
        NODE_ENV: 'production',
        PORT: 8083,
        PYTHON_SERVICE_URL: 'http://localhost:8004',
        ENABLE_WEBSOCKET: 'true',
        WEBSOCKET_PORT: '8083',
        WEBSOCKET_PATH: '/socket.io',
        dotenv_config_path: '../.env.lsemb'
      },
      error_file: './logs/backend-error.log',
      out_file: './logs/backend-out.log',
      log_file: './logs/backend-combined.log',
      time: true,
      watch: false,
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s'
    },
    {
      name: 'lsemb-frontend',
      script: 'node_modules/next/dist/bin/next',
      args: 'dev -p 3002',
      cwd: '/var/www/lsemb/frontend',
      interpreter: 'node',
      env: {
        NODE_ENV: 'development',
        PORT: 3002,
        NEXT_PUBLIC_API_URL: 'http://localhost:8083'
      },
      node_args: '--max-old-space-size=2048',
      error_file: './logs/frontend-error.log',
      out_file: './logs/frontend-out.log',
      log_file: './logs/frontend-combined.log',
      time: true,
      autorestart: true,
      max_restarts: 5,
      min_uptime: '10s'
    },
    {
      name: 'lsemb-python',
      script: 'main.py',
      cwd: '/var/www/lsemb/backend/python-services',
      interpreter: 'python3',
      env: {
        PORT: 8004,
        PYTHON_SERVICE_PORT: '8004',
        PYTHONUNBUFFERED: '1',
        PYTHON_ENV: 'production',
        ENVIRONMENT: 'production'
      },
      error_file: './logs/python-error.log',
      out_file: './logs/python-out.log',
      log_file: './logs/python-combined.log',
      time: true,
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s'
    },
    {
      name: 'lsemb-worker',
      script: 'celery',
      args: '-A workers.celery_app worker --loglevel=info --concurrency=2 --include=workers.google_drive_worker',
      cwd: '/var/www/lsemb/backend/python-services',
      interpreter: 'python3',
      env: {
        PYTHONUNBUFFERED: '1',
        PYTHON_ENV: 'production',
        ENVIRONMENT: 'production'
      },
      error_file: './logs/worker-error.log',
      out_file: './logs/worker-out.log',
      log_file: './logs/worker-combined.log',
      time: true,
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s'
    }
  ]
};
