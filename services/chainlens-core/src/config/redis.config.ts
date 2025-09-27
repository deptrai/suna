import { registerAs } from '@nestjs/config';

export default registerAs('redis', () => ({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT, 10) || 6379,
  password: process.env.REDIS_PASSWORD,
  db: parseInt(process.env.REDIS_DB, 10) || 0,
  url: process.env.REDIS_URL,
  keyPrefix: process.env.REDIS_KEY_PREFIX || 'chainlens:',
  retryAttempts: parseInt(process.env.REDIS_RETRY_ATTEMPTS, 10) || 3,
  retryDelay: parseInt(process.env.REDIS_RETRY_DELAY, 10) || 1000,
  maxRetriesPerRequest: parseInt(process.env.REDIS_MAX_RETRIES_PER_REQUEST, 10) || 3,
  lazyConnect: true,
  keepAlive: parseInt(process.env.REDIS_KEEP_ALIVE, 10) || 30000,
  family: 4, // 4 (IPv4) or 6 (IPv6)
  connectTimeout: parseInt(process.env.REDIS_CONNECT_TIMEOUT, 10) || 10000,
  commandTimeout: parseInt(process.env.REDIS_COMMAND_TIMEOUT, 10) || 5000,
}));
