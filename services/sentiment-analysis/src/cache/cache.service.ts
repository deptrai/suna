import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';

@Injectable()
export class CacheService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CacheService.name);
  private redis: Redis;

  constructor(private configService: ConfigService) {}

  async onModuleInit() {
    try {
      this.redis = new Redis({
        host: this.configService.get<string>('redis.host'),
        port: this.configService.get<number>('redis.port'),
        password: this.configService.get<string>('redis.password'),
        db: this.configService.get<number>('redis.db'),
        enableReadyCheck: this.configService.get<boolean>('redis.enableReadyCheck'),
        maxRetriesPerRequest: this.configService.get<number>('redis.maxRetriesPerRequest'),
      });

      this.redis.on('connect', () => {
        this.logger.log('Connected to Redis');
      });

      this.redis.on('error', (error) => {
        this.logger.error('Redis connection error:', error);
      });

      this.redis.on('ready', () => {
        this.logger.log('Redis is ready');
      });

    } catch (error) {
      this.logger.error('Failed to initialize Redis connection:', error);
    }
  }

  async onModuleDestroy() {
    if (this.redis) {
      await this.redis.quit();
      this.logger.log('Redis connection closed');
    }
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      const value = await this.redis.get(key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      this.logger.error(`Error getting key ${key}:`, error);
      return null;
    }
  }

  async set(key: string, value: any, ttl?: number): Promise<boolean> {
    try {
      const serializedValue = JSON.stringify(value);
      const defaultTtl = this.configService.get<number>('redis.ttl');
      
      if (ttl || defaultTtl) {
        await this.redis.setex(key, ttl || defaultTtl, serializedValue);
      } else {
        await this.redis.set(key, serializedValue);
      }
      
      return true;
    } catch (error) {
      this.logger.error(`Error setting key ${key}:`, error);
      return false;
    }
  }

  async del(key: string): Promise<boolean> {
    try {
      await this.redis.del(key);
      return true;
    } catch (error) {
      this.logger.error(`Error deleting key ${key}:`, error);
      return false;
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      const result = await this.redis.exists(key);
      return result === 1;
    } catch (error) {
      this.logger.error(`Error checking existence of key ${key}:`, error);
      return false;
    }
  }

  async mget<T>(keys: string[]): Promise<(T | null)[]> {
    try {
      const values = await this.redis.mget(...keys);
      return values.map(value => value ? JSON.parse(value) : null);
    } catch (error) {
      this.logger.error(`Error getting multiple keys:`, error);
      return keys.map(() => null);
    }
  }

  async mset(keyValuePairs: Record<string, any>, ttl?: number): Promise<boolean> {
    try {
      const pipeline = this.redis.pipeline();
      const defaultTtl = this.configService.get<number>('redis.ttl');
      
      Object.entries(keyValuePairs).forEach(([key, value]) => {
        const serializedValue = JSON.stringify(value);
        if (ttl || defaultTtl) {
          pipeline.setex(key, ttl || defaultTtl, serializedValue);
        } else {
          pipeline.set(key, serializedValue);
        }
      });
      
      await pipeline.exec();
      return true;
    } catch (error) {
      this.logger.error(`Error setting multiple keys:`, error);
      return false;
    }
  }

  async increment(key: string, amount: number = 1): Promise<number> {
    try {
      return await this.redis.incrby(key, amount);
    } catch (error) {
      this.logger.error(`Error incrementing key ${key}:`, error);
      return 0;
    }
  }

  async expire(key: string, ttl: number): Promise<boolean> {
    try {
      await this.redis.expire(key, ttl);
      return true;
    } catch (error) {
      this.logger.error(`Error setting expiration for key ${key}:`, error);
      return false;
    }
  }

  async ttl(key: string): Promise<number> {
    try {
      return await this.redis.ttl(key);
    } catch (error) {
      this.logger.error(`Error getting TTL for key ${key}:`, error);
      return -1;
    }
  }

  async flushAll(): Promise<boolean> {
    try {
      await this.redis.flushall();
      this.logger.warn('Redis cache flushed');
      return true;
    } catch (error) {
      this.logger.error('Error flushing Redis cache:', error);
      return false;
    }
  }

  // Sentiment-specific cache methods
  async getSentimentCache(symbol: string, source: string): Promise<any> {
    const key = `sentiment:${symbol}:${source}`;
    return this.get(key);
  }

  async setSentimentCache(symbol: string, source: string, data: any, ttl: number = 3600): Promise<boolean> {
    const key = `sentiment:${symbol}:${source}`;
    return this.set(key, data, ttl);
  }

  async getSocialMediaCache(platform: string, query: string): Promise<any> {
    const key = `social:${platform}:${query}`;
    return this.get(key);
  }

  async setSocialMediaCache(platform: string, query: string, data: any, ttl: number = 1800): Promise<boolean> {
    const key = `social:${platform}:${query}`;
    return this.set(key, data, ttl);
  }

  async getNewsCache(source: string, query: string): Promise<any> {
    const key = `news:${source}:${query}`;
    return this.get(key);
  }

  async setNewsCache(source: string, query: string, data: any, ttl: number = 3600): Promise<boolean> {
    const key = `news:${source}:${query}`;
    return this.set(key, data, ttl);
  }
}
