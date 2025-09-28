import { registerAs } from '@nestjs/config';

export const externalApiConfig = registerAs('externalApi', () => ({
  twitter: {
    bearerToken: process.env.TWITTER_BEARER_TOKEN,
    apiKey: process.env.TWITTER_API_KEY,
    apiSecret: process.env.TWITTER_API_SECRET,
    accessToken: process.env.TWITTER_ACCESS_TOKEN,
    accessTokenSecret: process.env.TWITTER_ACCESS_TOKEN_SECRET,
    baseUrl: 'https://api.twitter.com/2',
    rateLimit: {
      requests: 300, // requests per 15 minutes
      window: 15 * 60 * 1000, // 15 minutes in ms
    },
  },
  reddit: {
    clientId: process.env.REDDIT_CLIENT_ID,
    clientSecret: process.env.REDDIT_CLIENT_SECRET,
    username: process.env.REDDIT_USERNAME,
    password: process.env.REDDIT_PASSWORD,
    userAgent: process.env.REDDIT_USER_AGENT || 'ChainLens:v1.0.0 (by /u/chainlens)',
    baseUrl: 'https://oauth.reddit.com',
    rateLimit: {
      requests: 60, // requests per minute
      window: 60 * 1000, // 1 minute in ms
    },
  },
  newsApi: {
    apiKey: process.env.NEWS_API_KEY,
    baseUrl: 'https://newsapi.org/v2',
    rateLimit: {
      requests: 1000, // requests per day for free tier
      window: 24 * 60 * 60 * 1000, // 24 hours in ms
    },
  },
  coinDesk: {
    baseUrl: 'https://api.coindesk.com/v1',
    rateLimit: {
      requests: 100, // requests per minute
      window: 60 * 1000, // 1 minute in ms
    },
  },
  coinTelegraph: {
    baseUrl: 'https://cointelegraph.com/api',
    rateLimit: {
      requests: 60, // requests per minute
      window: 60 * 1000, // 1 minute in ms
    },
  },
  cryptoPanic: {
    apiKey: process.env.CRYPTO_PANIC_API_KEY,
    baseUrl: 'https://cryptopanic.com/api/v1',
    rateLimit: {
      requests: 500, // requests per day for free tier
      window: 24 * 60 * 60 * 1000, // 24 hours in ms
    },
  },
}));
