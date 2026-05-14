import Redis, { type RedisOptions } from 'ioredis';
import { config } from '../../config';
import { logger } from '../../lib/logger';

const redisUrl = config.REDIS_URL;

const redisOptions: RedisOptions = {
  maxRetriesPerRequest: null,
};

if (redisUrl.startsWith('rediss://')) {
  redisOptions.tls = {};
}

export const redisConnection = new Redis(redisUrl, redisOptions);

redisConnection.on('error', (err) => {
  logger.error('[redis] connection error', { error: String(err) });
});
