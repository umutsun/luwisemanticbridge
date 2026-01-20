/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,

  // Set workspace root to silence lockfile warning
  outputFileTracingRoot: process.cwd(),

  // Enable source maps in production for debugging
  productionBrowserSourceMaps: true,

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

  // External packages for server components (Next.js 15+)
  serverExternalPackages: ['puppeteer', 'cheerio'],

  // Experimental features for better performance
  experimental: {
    optimizeCss: true,
  },

  // Environment variables
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8083',
  },

  // Rewrite API requests to backend
  // Uses BACKEND_URL env variable for production flexibility
  async rewrites() {
    const backendUrl = process.env.BACKEND_URL || 'http://localhost:8083';
    return [
      // Rewrite all /api/v2/ requests to backend
      {
        source: '/api/v2/:path*',
        destination: `${backendUrl}/api/v2/:path*`,
      },
      // Rewrite Swagger API docs
      {
        source: '/api-docs',
        destination: `${backendUrl}/api-docs`,
      },
      {
        source: '/api-docs.json',
        destination: `${backendUrl}/api-docs.json`,
      },
      // Rewrite specific legacy endpoints
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
  
  // Bundle analyzer
  webpack: (config, { isServer }) => {
    // Bundle analyzer in development
    if (process.env.ANALYZE === 'true') {
      const { BundleAnalyzerPlugin } = await import('webpack-bundle-analyzer');
      config.plugins.push(
        new BundleAnalyzerPlugin({
          analyzerMode: 'static',
          reportFilename: isServer ? '../analyze/server.html' : './analyze/client.html',
        })
      );
    }
    
    return config;
  },
};

export default nextConfig;
