module.exports = {
  apps: [
    {
      name: 'lsemb-backend',
      script: 'node_modules/nodemon/bin/nodemon.js',
      args: '--exec "node -r dotenv/config -r ts-node/register src/server.ts" dotenv_config_path=../.env.lsemb',
      cwd: 'c:/xampp/htdocs/lsemb/backend',
      interpreter: 'node',
      env: {
        NODE_ENV: 'development',
        PORT: 8083
      },
      error_file: './logs/backend-error.log',
      out_file: './logs/backend-out.log',
      log_file: './logs/backend-combined.log',
      time: true,
      watch: false
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
      time: true
    },
    {
      name: 'lsemb-python',
      script: 'main.py',
      cwd: 'c:/xampp/htdocs/lsemb/backend/python-services',
      interpreter: 'C:/Users/umut.demirci/AppData/Local/Programs/Python/Python313/python.exe',
      env: {
        PORT: 8002,
        PYTHON_SERVICE_PORT: '8002',
        PYTHONUNBUFFERED: '1',
        PYTHON_ENV: 'production'
      },
      error_file: './logs/python-error.log',
      out_file: './logs/python-out.log',
      log_file: './logs/python-combined.log',
      time: true
    }
  ]
};
