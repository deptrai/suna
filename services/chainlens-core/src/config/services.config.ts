import { registerAs } from '@nestjs/config';

export default registerAs('services', () => ({
  onchain: {
    url: process.env.ONCHAIN_SERVICE_URL || 'http://localhost:3001',
    timeout: parseInt(process.env.ONCHAIN_SERVICE_TIMEOUT, 10) || 30000,
    retries: parseInt(process.env.ONCHAIN_SERVICE_RETRIES, 10) || 3,
  },
  sentiment: {
    url: process.env.SENTIMENT_SERVICE_URL || 'http://localhost:3002',
    timeout: parseInt(process.env.SENTIMENT_SERVICE_TIMEOUT, 10) || 30000,
    retries: parseInt(process.env.SENTIMENT_SERVICE_RETRIES, 10) || 3,
  },
  tokenomics: {
    url: process.env.TOKENOMICS_SERVICE_URL || 'http://localhost:3003',
    timeout: parseInt(process.env.TOKENOMICS_SERVICE_TIMEOUT, 10) || 30000,
    retries: parseInt(process.env.TOKENOMICS_SERVICE_RETRIES, 10) || 3,
  },
  team: {
    url: process.env.TEAM_SERVICE_URL || 'http://localhost:3004',
    timeout: parseInt(process.env.TEAM_SERVICE_TIMEOUT, 10) || 30000,
    retries: parseInt(process.env.TEAM_SERVICE_RETRIES, 10) || 3,
  },
  circuitBreaker: {
    timeout: parseInt(process.env.CIRCUIT_BREAKER_TIMEOUT, 10) || 10000,
    errorThresholdPercentage: parseInt(process.env.CIRCUIT_BREAKER_ERROR_THRESHOLD, 10) || 50,
    resetTimeout: parseInt(process.env.CIRCUIT_BREAKER_RESET_TIMEOUT, 10) || 30000,
    minimumNumberOfCalls: parseInt(process.env.CIRCUIT_BREAKER_MIN_CALLS, 10) || 10,
    slidingWindowSize: parseInt(process.env.CIRCUIT_BREAKER_WINDOW_SIZE, 10) || 100,
  },
  cache: {
    defaultTtl: parseInt(process.env.CACHE_DEFAULT_TTL, 10) || 300, // 5 minutes
    maxTtl: parseInt(process.env.CACHE_MAX_TTL, 10) || 3600, // 1 hour
    keyPrefix: process.env.CACHE_KEY_PREFIX || 'chainlens:analysis:',
  },
  externalApis: {
    moralis: {
      apiKey: process.env.MORALIS_API_KEY,
      baseUrl: 'https://deep-index.moralis.io/api/v2',
      timeout: parseInt(process.env.MORALIS_TIMEOUT, 10) || 10000,
      rateLimit: parseInt(process.env.MORALIS_RATE_LIMIT, 10) || 25, // requests per second
    },
    dexScreener: {
      baseUrl: 'https://api.dexscreener.com/latest',
      timeout: parseInt(process.env.DEXSCREENER_TIMEOUT, 10) || 10000,
      rateLimit: parseInt(process.env.DEXSCREENER_RATE_LIMIT, 10) || 300, // requests per minute
    },
    defiLlama: {
      baseUrl: 'https://api.llama.fi',
      timeout: parseInt(process.env.DEFILLAMA_TIMEOUT, 10) || 10000,
      rateLimit: parseInt(process.env.DEFILLAMA_RATE_LIMIT, 10) || 60, // requests per minute
    },
    coinGecko: {
      apiKey: process.env.COINGECKO_API_KEY,
      baseUrl: 'https://api.coingecko.com/api/v3',
      timeout: parseInt(process.env.COINGECKO_TIMEOUT, 10) || 10000,
      rateLimit: parseInt(process.env.COINGECKO_RATE_LIMIT, 10) || 50, // requests per minute
    },
    twitter: {
      bearerToken: process.env.TWITTER_BEARER_TOKEN,
      baseUrl: 'https://api.twitter.com/2',
      timeout: parseInt(process.env.TWITTER_TIMEOUT, 10) || 10000,
      rateLimit: parseInt(process.env.TWITTER_RATE_LIMIT, 10) || 300, // requests per 15 minutes
    },
    reddit: {
      clientId: process.env.REDDIT_CLIENT_ID,
      clientSecret: process.env.REDDIT_CLIENT_SECRET,
      userAgent: process.env.REDDIT_USER_AGENT || 'ChainLens/1.0',
      baseUrl: 'https://www.reddit.com/api/v1',
      timeout: parseInt(process.env.REDDIT_TIMEOUT, 10) || 10000,
      rateLimit: parseInt(process.env.REDDIT_RATE_LIMIT, 10) || 60, // requests per minute
    },
    github: {
      token: process.env.GITHUB_TOKEN,
      baseUrl: 'https://api.github.com',
      timeout: parseInt(process.env.GITHUB_TIMEOUT, 10) || 10000,
      rateLimit: parseInt(process.env.GITHUB_RATE_LIMIT, 10) || 5000, // requests per hour
    },
  },
}));
