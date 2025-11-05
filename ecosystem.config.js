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
      script: 'npm',
      args: 'start',
      cwd: 'c:/xampp/htdocs/lsemb/frontend',
      env: {
        PORT: 3002,
        NODE_ENV: 'production'
      }
    },
    {
      name: 'lsemb-python',
      script: 'python',
      args: 'main.py',
      cwd: 'c:/xampp/htdocs/lsemb/backend/python-services',
      env: {
        PORT: 8002,
        PYTHONUNBUFFERED: '1',
        PYTHON_ENV: 'production'
      }
    }
  ]
};
