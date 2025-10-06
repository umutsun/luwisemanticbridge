/**
 * PM2 Ecosystem Configuration
 * Alice Semantic Bridge - Production Ready Setup
 */

module.exports = {
  apps: [
    // ==========================================
    // BACKEND API SERVER
    // ==========================================
    {
      name: 'asb-backend',
      script: 'node_modules/.bin/ts-node',
      args: 'src/server.ts',
      cwd: './backend',
      instances: 1,
      exec_mode: 'fork',
      watch: false, // Production'da false
      max_memory_restart: '1G',
      
      // Environment
      env: {
        NODE_ENV: 'development',
        PORT: 8083,
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 8083,
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
      name: 'asb-frontend',
      script: 'node_modules/.bin/next',
      args: 'start -p 3001',
      cwd: './frontend',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '1G',

      // Environment
      env: {
        NODE_ENV: 'development',
        PORT: 3001,
        NEXT_PUBLIC_API_URL: 'http://localhost:8083',
        NEXT_PUBLIC_WEBSOCKET_URL: 'ws://localhost:8083',
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 3001,
        NEXT_PUBLIC_API_URL: 'http://localhost:8083',
        NEXT_PUBLIC_WEBSOCKET_URL: 'ws://localhost:8083',
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
  ],

  // ==========================================
  // DEPLOYMENT CONFIGURATION
  // ==========================================
  deploy: {
    production: {
      user: 'ubuntu',
      host: ['your-server.com'],
      ref: 'origin/main',
      repo: 'git@github.com:your-org/alice-semantic-bridge.git',
      path: '/var/www/alice-semantic-bridge',
      'post-deploy': 'npm install && pm2 reload ecosystem.config.js --env production',
      env: {
        NODE_ENV: 'production',
      },
    },
    staging: {
      user: 'ubuntu',
      host: ['staging-server.com'],
      ref: 'origin/develop',
      repo: 'git@github.com:your-org/alice-semantic-bridge.git',
      path: '/var/www/alice-semantic-bridge-staging',
      'post-deploy': 'npm install && pm2 reload ecosystem.config.js --env staging',
      env: {
        NODE_ENV: 'staging',
      },
    },
  },
};
