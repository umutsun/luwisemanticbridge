/**
 * PM2 Ecosystem Configuration
 * Luwi Semantic Bridge - Production Ready Setup
 */

module.exports = {
  apps: [
    // ==========================================
    // BACKEND API SERVER
    // ==========================================
    {
      name: 'lsemb-backend',
      script: './node_modules/.bin/ts-node',
      args: '-r dotenv/config src/server.ts dotenv_config_path=../.env.lsemb',
      cwd: './backend',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '1G',
      interpreter: 'node',

      // Environment - .env.lsemb dosyasından okunacak
      env: {
        NODE_ENV: 'development'
      },
      env_production: {
        NODE_ENV: 'production'
      },

      // Logging
      error_file: './logs/backend-error.log',
      out_file: './logs/backend-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,

      // Auto restart strategies
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      restart_delay: 4000,

      // Health check
      listen_timeout: 10000,
      kill_timeout: 5000,

      // Performance
      node_args: '--max-old-space-size=2048',
    },

    // ==========================================
    // FRONTEND NEXT.JS SERVER
    // ==========================================
    {
      name: 'lsemb-frontend',
      script: 'node',
      args: '.next/standalone/server.js',
      cwd: './frontend',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '1G',

      // Environment - .env.lsemb dosyasından okunacak
      env: {
        NODE_ENV: 'development',
        PORT: 3002,
        HOSTNAME: '0.0.0.0',
        NEXT_PUBLIC_API_URL: 'http://localhost:8083',
        NEXT_PUBLIC_APP_URL: 'http://localhost:3002'
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 3002,
        HOSTNAME: '0.0.0.0',
        NEXT_PUBLIC_API_URL: 'https://lsemb.luwi.dev'
      },

      // Logging
      error_file: './logs/frontend-error.log',
      out_file: './logs/frontend-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,

      // Auto restart strategies
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      restart_delay: 4000,

      // Health check
      listen_timeout: 30000, // Next.js needs more time to start
      kill_timeout: 5000,

      // Performance
      node_args: '--max-old-space-size=2048',
    },

    // ==========================================
    // WEBSOCKET SERVER (if separate)
    // ==========================================
    // Uncomment if you need a separate WebSocket server
    /*
    {
      name: 'asb-websocket',
      script: 'node_modules/.bin/ts-node',
      args: 'src/websocket-server.ts',
      cwd: './backend',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '512M',

      env: {
        NODE_ENV: 'development',
        WS_PORT: 8084,
      },
      env_production: {
        NODE_ENV: 'production',
        WS_PORT: 8084,
      },

      error_file: './logs/websocket-error.log',
      out_file: './logs/websocket-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,

      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      restart_delay: 4000,
    },
    */

    // ==========================================
    // LUWI-DEV WEBSITE (Port 3000) - DISABLED
    // ==========================================
    /*
    {
      name: 'luwi-dev',
      script: 'server.js',
      cwd: '/var/www/luwi-dev',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '512M',

      // Environment
      env: {
        NODE_ENV: 'development',
        PORT: 3000
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 3000
      },

      // Logging
      error_file: '/var/www/luwi-dev/logs/error.log',
      out_file: '/var/www/luwi-dev/logs/out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,

      // Auto restart strategies
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      restart_delay: 4000,

      // Performance
      node_args: '--max-old-space-size=512',
    },
    */
  ],

  // ==========================================
  // DEPLOYMENT CONFIGURATION
  // ==========================================
  deploy: {
    production: {
      user: 'root',
      host: ['91.99.229.96'],
      ref: 'origin/main',
      repo: 'https://github.com/umutsun/asemb.git',
      path: '/var/www/lsemb',
      'post-deploy': 'npm install && cd frontend && npm install && npm run build && cd .. && pm2 reload ecosystem.config.js --env production',
      env: {
        NODE_ENV: 'production'
      }
    }
  }
};
