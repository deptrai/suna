import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import { RedisConfigService } from '../config/redis.config';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private redis: Redis;

  constructor(
    private configService: ConfigService,
    private redisConfigService: RedisConfigService,
  ) {}

  async onModuleInit() {
    try {
      this.redis = this.redisConfigService.createRedisConnection();
      await this.redis.connect();
    } catch (error) {
      console.error('Failed to connect to Redis:', error);
      // In development, continue without Redis
      if (this.configService.get('NODE_ENV') === 'development') {
        console.warn('⚠️ Continuing without Redis in development mode');
      } else {
        throw error;
      }
    }
  }

  async onModuleDestroy() {
    if (this.redis) {
      await this.redis.disconnect();
    }
  }

  getClient(): Redis | null {
    return this.redis || null;
  }

  async get(key: string): Promise<string | null> {
    if (!this.redis) return null;
    try {
      return await this.redis.get(key);
    } catch (error) {
      console.error('Redis GET error:', error);
      return null;
    }
  }

  async set(key: string, value: string, ttl?: number): Promise<boolean> {
    if (!this.redis) return false;
    try {
      if (ttl) {
        await this.redis.setex(key, ttl, value);
      } else {
        await this.redis.set(key, value);
      }
      return true;
    } catch (error) {
      console.error('Redis SET error:', error);
      return false;
    }
  }

  async incr(key: string): Promise<number> {
    if (!this.redis) return 0;
    try {
      return await this.redis.incr(key);
    } catch (error) {
      console.error('Redis INCR error:', error);
      return 0;
    }
  }

  async expire(key: string, seconds: number): Promise<boolean> {
    if (!this.redis) return false;
    try {
      const result = await this.redis.expire(key, seconds);
      return result === 1;
    } catch (error) {
      console.error('Redis EXPIRE error:', error);
      return false;
    }
  }

  async del(key: string): Promise<boolean> {
    if (!this.redis) return false;
    try {
      const result = await this.redis.del(key);
      return result > 0;
    } catch (error) {
      console.error('Redis DEL error:', error);
      return false;
    }
  }

  async exists(key: string): Promise<boolean> {
    if (!this.redis) return false;
    try {
      const result = await this.redis.exists(key);
      return result === 1;
    } catch (error) {
      console.error('Redis EXISTS error:', error);
      return false;
    }
  }

  async ttl(key: string): Promise<number> {
    if (!this.redis) return -1;
    try {
      return await this.redis.ttl(key);
    } catch (error) {
      console.error('Redis TTL error:', error);
      return -1;
    }
  }

  async keys(pattern: string): Promise<string[]> {
    if (!this.redis) return [];
    try {
      return await this.redis.keys(pattern);
    } catch (error) {
      console.error('Redis KEYS error:', error);
      return [];
    }
  }

  async flushdb(): Promise<boolean> {
    if (!this.redis) return false;
    try {
      await this.redis.flushdb();
      return true;
    } catch (error) {
      console.error('Redis FLUSHDB error:', error);
      return false;
    }
  }

  isConnected(): boolean {
    return this.redis?.status === 'ready';
  }

  async ping(): Promise<boolean> {
    if (!this.redis) return false;
    try {
      const result = await this.redis.ping();
      return result === 'PONG';
    } catch (error) {
      console.error('Redis PING error:', error);
      return false;
    }
  }
}
