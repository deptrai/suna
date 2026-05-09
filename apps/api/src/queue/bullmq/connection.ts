import Redis from 'ioredis';
import { config } from '../../config';
import { logger } from '../../lib/logger';

export const redisConnection = new Redis(config.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
});

redisConnection.on('error', (err) => {
  logger.error('[redis] connection error', { error: String(err) });
});
