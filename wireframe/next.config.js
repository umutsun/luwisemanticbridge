/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['framer-motion'],
  images: {
    domains: ['cdn.iskultur.com.tr', 'cdn.pixabay.com']
  }
}

module.exports = nextConfig