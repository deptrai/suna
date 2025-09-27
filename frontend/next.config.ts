import type { NextConfig } from 'next';

const nextConfig = (): NextConfig => ({
  output: (process.env.NEXT_OUTPUT as 'standalone') || undefined,
  outputFileTracingRoot: require('path').join(__dirname, '../'),

  webpack: (config) => {
    // Force webpack to resolve modules only from local node_modules
    config.resolve.modules = ['node_modules'];

    // Disable symlinks to prevent global cache resolution
    config.resolve.symlinks = false;

    // Ensure proper module resolution order
    config.resolve.preferRelative = true;

    return config;
  },

  async rewrites() {
    return [
      {
        source: '/ingest/static/:path*',
        destination: 'https://eu-assets.i.posthog.com/static/:path*',
      },
      {
        source: '/ingest/:path*',
        destination: 'https://eu.i.posthog.com/:path*',
      },
      {
        source: '/ingest/flags',
        destination: 'https://eu.i.posthog.com/flags',
      },
    ];
  },
  skipTrailingSlashRedirect: true,
});

export default nextConfig;
