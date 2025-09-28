/**
 * T2.1.1c: Redis Configuration
 * Redis configuration for caching and rate limiting
 */

import { registerAs } from '@nestjs/config';

export default registerAs('redis', () => ({
  // Connection settings
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT, 10) || 6380,
  password: process.env.REDIS_PASSWORD,
  db: parseInt(process.env.REDIS_DB, 10) || 0,
  
  // Connection options
  connectTimeout: parseInt(process.env.REDIS_CONNECT_TIMEOUT, 10) || 10000,
  commandTimeout: parseInt(process.env.REDIS_COMMAND_TIMEOUT, 10) || 5000,
  retryDelayOnFailover: parseInt(process.env.REDIS_RETRY_DELAY, 10) || 100,
  maxRetriesPerRequest: parseInt(process.env.REDIS_MAX_RETRIES, 10) || 3,
  
  // Key prefixes
  keyPrefix: process.env.REDIS_KEY_PREFIX || 'onchain:',
  
  // Cache settings
  cache: {
    defaultTtl: parseInt(process.env.REDIS_CACHE_TTL, 10) || 300, // 5 minutes
    maxTtl: parseInt(process.env.REDIS_MAX_TTL, 10) || 3600, // 1 hour
    
    // Specific TTLs for different data types
    ttl: {
      tokenPrice: parseInt(process.env.CACHE_TOKEN_PRICE_TTL, 10) || 60, // 1 minute
      tokenMetadata: parseInt(process.env.CACHE_TOKEN_METADATA_TTL, 10) || 3600, // 1 hour
      holderData: parseInt(process.env.CACHE_HOLDER_DATA_TTL, 10) || 300, // 5 minutes
      transactionData: parseInt(process.env.CACHE_TRANSACTION_TTL, 10) || 180, // 3 minutes
      liquidityData: parseInt(process.env.CACHE_LIQUIDITY_TTL, 10) || 120, // 2 minutes
      riskScore: parseInt(process.env.CACHE_RISK_SCORE_TTL, 10) || 600, // 10 minutes
      protocolData: parseInt(process.env.CACHE_PROTOCOL_TTL, 10) || 1800, // 30 minutes
      yieldData: parseInt(process.env.CACHE_YIELD_TTL, 10) || 900, // 15 minutes
    },
  },
  
  // Rate limiting settings
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW, 10) || 60000, // 1 minute
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX, 10) || 100,
    keyGenerator: process.env.RATE_LIMIT_KEY_GENERATOR || 'ip',
    
    // Per-endpoint rate limits
    endpoints: {
      analyze: {
        windowMs: parseInt(process.env.RATE_LIMIT_ANALYZE_WINDOW, 10) || 60000,
        maxRequests: parseInt(process.env.RATE_LIMIT_ANALYZE_MAX, 10) || 20,
      },
      bulk: {
        windowMs: parseInt(process.env.RATE_LIMIT_BULK_WINDOW, 10) || 300000, // 5 minutes
        maxRequests: parseInt(process.env.RATE_LIMIT_BULK_MAX, 10) || 5,
      },
    },
  },
  
  // Session settings (if needed)
  session: {
    secret: process.env.SESSION_SECRET || 'onchain-analysis-secret',
    ttl: parseInt(process.env.SESSION_TTL, 10) || 86400, // 24 hours
    prefix: 'sess:',
  },
  
  // Pub/Sub settings
  pubsub: {
    enabled: process.env.REDIS_PUBSUB_ENABLED === 'true',
    channels: {
      analysis: 'analysis:updates',
      alerts: 'analysis:alerts',
      metrics: 'analysis:metrics',
    },
  },
  
  // Cluster settings (for production)
  cluster: {
    enabled: process.env.REDIS_CLUSTER_ENABLED === 'true',
    nodes: process.env.REDIS_CLUSTER_NODES ? 
      process.env.REDIS_CLUSTER_NODES.split(',').map(node => {
        const [host, port] = node.split(':');
        return { host, port: parseInt(port, 10) };
      }) : [],
    options: {
      enableReadyCheck: true,
      redisOptions: {
        password: process.env.REDIS_PASSWORD,
      },
    },
  },
  
  // Health check settings
  healthCheck: {
    enabled: process.env.REDIS_HEALTH_CHECK_ENABLED !== 'false',
    interval: parseInt(process.env.REDIS_HEALTH_CHECK_INTERVAL, 10) || 30000, // 30 seconds
    timeout: parseInt(process.env.REDIS_HEALTH_CHECK_TIMEOUT, 10) || 5000, // 5 seconds
  },
}));
