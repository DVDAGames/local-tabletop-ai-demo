/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config, {}) => {
    config.resolve.fallback = {
      "@visheratin/web-ai-node": false,
    };
    return config;
  },
};

module.exports = nextConfig;
