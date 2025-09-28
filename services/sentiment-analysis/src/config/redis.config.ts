import { registerAs } from '@nestjs/config';

export const redisConfig = registerAs('redis', () => ({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT, 10) || 6379,
  password: process.env.REDIS_PASSWORD || undefined,
  db: parseInt(process.env.REDIS_DB, 10) || 2, // Different DB from other services
  ttl: parseInt(process.env.REDIS_TTL, 10) || 3600, // 1 hour default
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
}));
