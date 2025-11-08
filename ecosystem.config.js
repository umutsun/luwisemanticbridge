module.exports = {
  apps: [
    {
      name: 'lsemb-backend',
      script: 'node',
      args: 'dist/server.js',
      cwd: 'c:/xampp/htdocs/lsemb/backend',
      env: {
        PORT: 8083,
        NODE_ENV: 'production'
      },
      env_file: 'c:/xampp/htdocs/lsemb/.env.lsemb'
    },
    {
      name: 'lsemb-frontend',
      script: 'node',
      args: 'node_modules/next/dist/bin/next start -p 3002',
      cwd: 'c:/xampp/htdocs/lsemb/frontend',
      env: {
        PORT: 3002,
        NODE_ENV: 'production'
      },
      node_args: '--max-old-space-size=2048'
    },
    {
      name: 'lsemb-python',
      script: 'C:/Users/umut.demirci/AppData/Local/Programs/Python/Python313/python.exe',
      args: 'main.py',
      cwd: 'c:/xampp/htdocs/lsemb/backend/python-services',
      env: {
        PORT: 8002,
        PYTHON_SERVICE_PORT: '8002',
        PYTHONUNBUFFERED: '1',
        PYTHON_ENV: 'production'
      }
    }
  ]
};
