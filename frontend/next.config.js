/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // Enable standalone output for Docker deployment
  output: 'standalone',

  // Set workspace root to silence lockfile warning
  outputFileTracingRoot: require('path').join(__dirname, '../'),

  // Optimize images
  images: {
    domains: ['localhost'],
    formats: ['image/avif', 'image/webp'],
  },

  // Disable ESLint during build to avoid failures on warnings
  eslint: {
    ignoreDuringBuilds: true,
  },

  // Disable TypeScript checking during build
  typescript: {
    ignoreBuildErrors: true,
  },

  // Bundle analyzer
  webpack: (config, { isServer }) => {
    // Bundle analyzer in development
    if (process.env.ANALYZE === 'true') {
      const BundleAnalyzerPlugin = require('webpack-bundle-analyzer').BundleAnalyzerPlugin;
      config.plugins.push(
        new BundleAnalyzerPlugin({
          analyzerMode: 'static',
          reportFilename: isServer ? '../analyze/server.html' : './analyze/client.html',
        }),
      );
    }

    return config;
  },

  // Experimental features for better performance
  experimental: {
    optimizeCss: true,
  },

  // External packages for server components
  serverExternalPackages: ['puppeteer', 'cheerio'],

  // Rewrite API requests to backend
  async rewrites() {
    const backendPort = process.env.NEXT_PUBLIC_API_PORT || '8083';
    const backendUrl = `http://localhost:${backendPort}`;

    return [
      // Only rewrite specific legacy endpoints
      {
        source: '/api/health/system',
        destination: `${backendUrl}/api/v2/health/system`,
      },
      {
        source: '/api/health',
        destination: `${backendUrl}/api/v2/health`,
      },
    ];
  },

  // Redirects
  async redirects() {
    return [
      {
        source: '/home',
        destination: '/',
        permanent: true,
      },
    ];
  },

  // Headers for security
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block',
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
