import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Performance Optimizations
  experimental: {
    // Bundle optimization
    optimizePackageImports: [
      'lucide-react',
      'framer-motion', 
      '@radix-ui/react-icons',
      'react-icons',
      'date-fns'
    ],
    
    // Server Actions optimization
    serverActions: {
      maxActionDispatchTimeoutMs: 5000,
      bodySizeLimit: '2mb',
    },
    
    // Memory and CPU optimizations
    memoryBasedWorkersCount: true,
    
    // Reduce bundle size
    optimisticClientCache: true,
    
    // Faster builds
    swcTraceProfiling: false,
    typedRoutes: false, // Disable if not needed
  },

  // Bundle size optimizations  
  webpack: (config, { dev, isServer, webpack }) => {
    // Production optimizations
    if (!dev && !isServer) {
      config.optimization.splitChunks = {
        chunks: 'all',
        cacheGroups: {
          // Heavy editor components
          editor: {
            test: /[\\/]node_modules[\\/]@tiptap[\\/]/,
            name: 'editor',
            chunks: 'async',
            priority: 30,
          },
          // PDF and document processors  
          documents: {
            test: /[\\/]node_modules[\\/](react-pdf|pdfjs-dist|html2pdf|docx)[\\/]/,
            name: 'documents', 
            chunks: 'async',
            priority: 25,
          },
          // Charts and visualization
          charts: {
            test: /[\\/]node_modules[\\/](chart\.js|d3|mermaid|gsap)[\\/]/,
            name: 'charts',
            chunks: 'async', 
            priority: 20,
          },
          // UI libraries
          ui: {
            test: /[\\/]node_modules[\\/]@radix-ui[\\/]/,
            name: 'ui-radix',
            chunks: 'async',
            priority: 15,
          },
          // Common vendor packages
          vendor: {
            test: /[\\/]node_modules[\\/](react|react-dom|next)[\\/]/,
            name: 'vendor-react',
            chunks: 'all',
            priority: 10,
          },
          default: {
            minChunks: 2,
            priority: 5,
            reuseExistingChunk: true,
          },
        },
      };

      // Tree shaking improvements
      config.optimization.usedExports = true;
      config.optimization.sideEffects = false;
      
      // Reduce bundle size
      config.optimization.minimizer.push(
        new webpack.optimize.LimitChunkCountPlugin({
          maxChunks: 50
        })
      );
    }

    // Development optimizations
    if (dev) {
      // Faster rebuilds
      config.cache = {
        type: 'filesystem',
        buildDependencies: {
          config: [__filename],
        },
      };
      
      // Reduce memory usage in dev
      config.optimization.removeAvailableModules = false;
      config.optimization.removeEmptyChunks = false;
      config.optimization.splitChunks = false;
    }

    return config;
  },

  // Server-side optimizations
  poweredByHeader: false,
  compress: true,
  
  // Image optimization
  images: {
    domains: ['localhost', '127.0.0.1'],
    formats: ['image/webp', 'image/avif'],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920],
    imageSizes: [16, 32, 48, 64, 96, 128, 256],
  },

  // Development server optimization
  ...(process.env.NODE_ENV === 'development' && {
    onDemandEntries: {
      maxInactiveAge: 60 * 1000,
      pagesBufferLength: 5,
    },
  }),

  // Headers for performance
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-DNS-Prefetch-Control',
            value: 'on'
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=31536000; includeSubDomains; preload'
          },
          {
            key: 'X-Content-Type-Options', 
            value: 'nosniff'
          },
          {
            key: 'Referrer-Policy',
            value: 'origin-when-cross-origin'
          }
        ],
      },
      // Long-term caching for static assets
      {
        source: '/static/(.*)',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
    ];
  },
};

export default nextConfig;