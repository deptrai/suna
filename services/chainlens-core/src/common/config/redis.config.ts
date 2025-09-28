import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';

@Injectable()
export class RedisConfigService {
  constructor(private configService: ConfigService) {}

  createRedisConnection(): Redis {
    const redisConfig = {
      host: this.configService.get<string>('REDIS_HOST', 'localhost'),
      port: this.configService.get<number>('REDIS_PORT', 6379),
      password: this.configService.get<string>('REDIS_PASSWORD'),
      db: this.configService.get<number>('REDIS_DB', 0),
      retryDelayOnFailover: 100,
      maxRetriesPerRequest: 3,
      lazyConnect: true,
      keepAlive: 30000,
      family: 4,
      keyPrefix: this.configService.get<string>('REDIS_KEY_PREFIX', 'chainlens:'),
    };

    const redis = new Redis(redisConfig);

    redis.on('connect', () => {
      console.log('✅ Redis connected successfully');
    });

    redis.on('error', (error) => {
      console.error('❌ Redis connection error:', error);
    });

    redis.on('ready', () => {
      console.log('🚀 Redis ready for operations');
    });

    return redis;
  }

  getRedisConfig() {
    return {
      host: this.configService.get<string>('REDIS_HOST', 'localhost'),
      port: this.configService.get<number>('REDIS_PORT', 6379),
      password: this.configService.get<string>('REDIS_PASSWORD'),
      db: this.configService.get<number>('REDIS_DB', 0),
      keyPrefix: this.configService.get<string>('REDIS_KEY_PREFIX', 'chainlens:'),
    };
  }
}
