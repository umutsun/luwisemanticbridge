module.exports = {
  apps: [
    {
      name: 'asb-backend',
      script: './backend/dist/server.js',
      instances: 1,
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'production',
        PORT: 8083,
        DATABASE_URL: 'postgresql://postgres:Semsiye!22@91.99.229.96:5432/asemb',
        ASEMB_DB_HOST: '91.99.229.96',
        ASEMB_DB_PORT: '5432',
        ASEMB_DB_NAME: 'asemb',
        ASEMB_DB_USER: 'postgres',
        ASEMB_DB_PASSWORD: 'Semsiye!22',
        REDIS_HOST: '127.0.0.1',
        REDIS_PORT: '6379',
        REDIS_DB: '2',
        CORS_ORIGIN: 'https://your-domain.com',
        OPENAI_API_KEY: 'your-openai-key',
        CLAUDE_API_KEY: 'your-claude-key',
        GEMINI_API_KEY: 'your-gemini-key'
      },
      error_file: './logs/backend-error.log',
      out_file: './logs/backend-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs: true,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G'
    },
    {
      name: 'asb-frontend',
      script: 'npm',
      args: 'start',
      cwd: './frontend',
      env: {
        NODE_ENV: 'production',
        PORT: 3001,
        NEXT_PUBLIC_API_URL: 'https://your-domain.com',
        NEXT_PUBLIC_WS_URL: 'wss://your-domain.com'
      },
      error_file: './logs/frontend-error.log',
      out_file: './logs/frontend-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs: true,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G'
    },
    {
      name: 'asb-api',
      script: './api/server.js',
      instances: 2,
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'production',
        PORT: 3002
      },
      error_file: './logs/api-error.log',
      out_file: './logs/api-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs: true,
      autorestart: true,
      watch: false,
      max_memory_restart: '512M'
    }
  ]
};