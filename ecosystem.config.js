module.exports = {
  apps: [
    {
      name: 'lsemb-backend',
      script: 'src/server.ts',
      cwd: 'c:/xampp/htdocs/lsemb/backend',
      interpreter: 'node',
      interpreter_args: '-r dotenv/config -r ts-node/register',
      env: {
        NODE_ENV: 'development',
        PORT: 8083,
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
      min_uptime: '10s',
      windowsHide: true
    },
    {
      name: 'lsemb-frontend',
      script: 'node_modules/next/dist/bin/next',
      args: 'dev -p 3002',
      cwd: 'c:/xampp/htdocs/lsemb/frontend',
      interpreter: 'node',
      env: {
        NODE_ENV: 'development',
        PORT: 3002
      },
      node_args: '--max-old-space-size=2048',
      error_file: './logs/frontend-error.log',
      out_file: './logs/frontend-out.log',
      log_file: './logs/frontend-combined.log',
      time: true,
      autorestart: true,
      max_restarts: 5,
      min_uptime: '10s',
      windowsHide: true
    },
    {
      name: 'lsemb-python',
      script: 'main.py',
      cwd: 'c:/xampp/htdocs/lsemb/backend/python-services',
      interpreter: 'C:/Users/umut.demirci/AppData/Local/Programs/Python/Python313/python.exe',
      env: {
        PORT: 8004,
        PYTHON_SERVICE_PORT: '8004',
        PYTHONUNBUFFERED: '1',
        PYTHON_ENV: 'production'
      },
      error_file: './logs/python-error.log',
      out_file: './logs/python-out.log',
      log_file: './logs/python-combined.log',
      time: true,
      windowsHide: true
    }
  ]
};
