module.exports = {
  apps: [
    {
      name: 'asemb-api',
      script: './api/server.js',
      cwd: './',
      instances: 1,
      exec_mode: 'fork',
      watch: true,
      ignore_watch: ['node_modules', '.git', 'logs'],
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'development',
        PORT: 8083,
        DATABASE_URL: 'postgresql://asemb_user:asemb_password_2025@localhost:5432/asemb',
        REDIS_HOST: 'localhost'
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 8083,
        DATABASE_URL: 'postgresql://asemb_user:asemb_password_2025@localhost:5432/asemb',
        REDIS_HOST: 'localhost'
      }
    },
    {
      name: 'asemb-frontend',
      script: './frontend/start-next.js',
      cwd: './',
      instances: 1,
      exec_mode: 'fork',
      watch: true,
      ignore_watch: ['node_modules', '.git', '.next', 'logs'],
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'development',
        PORT: 3002,
        NEXT_PUBLIC_API_URL: 'http://localhost:8083'
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 3002,
        NEXT_PUBLIC_API_URL: 'http://localhost:8083'
      }
    }
  ]
};