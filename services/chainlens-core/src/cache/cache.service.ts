import { Injectable, Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { ConfigService } from '@nestjs/config';
import { LoggerService } from '../common/services/logger.service';

export interface CacheOptions {
  ttl?: number;
  confidence?: number;
  tags?: string[];
}

export interface CachedData<T> {
  value: T;
  confidence: number;
  timestamp: number;
  ttl: number;
  tags?: string[];
}

@Injectable()
export class CacheService {
  private readonly defaultTtl: number;
  private readonly maxTtl: number;
  private readonly keyPrefix: string;

  constructor(
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
    private configService: ConfigService,
    private logger: LoggerService,
  ) {
    this.defaultTtl = this.configService.get<number>('services.cache.defaultTtl', 300);
    this.maxTtl = this.configService.get<number>('services.cache.maxTtl', 3600);
    this.keyPrefix = this.configService.get<string>('services.cache.keyPrefix', 'chainlens:');
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      const fullKey = this.buildKey(key);
      const cached = await this.cacheManager.get<CachedData<T>>(fullKey);
      
      if (!cached) {
        this.logger.logCacheOperation('miss', key);
        return null;
      }

      // Check if data has expired based on confidence
      if (this.isExpiredByConfidence(cached)) {
        await this.cacheManager.del(fullKey);
        this.logger.logCacheOperation('miss', key);
        return null;
      }

      this.logger.logCacheOperation('hit', key, cached.ttl);
      return cached.value;
    } catch (error) {
      this.logger.error('Cache get error', error.stack, 'CacheService');
      return null;
    }
  }

  async set<T>(key: string, value: T, options: CacheOptions = {}): Promise<void> {
    try {
      const ttl = this.calculateTTL(options);
      const fullKey = this.buildKey(key);
      
      const cacheData: CachedData<T> = {
        value,
        confidence: options.confidence || 1,
        timestamp: Date.now(),
        ttl,
        tags: options.tags,
      };

      await this.cacheManager.set(fullKey, cacheData, ttl * 1000); // Convert to milliseconds
      this.logger.logCacheOperation('set', key, ttl);
    } catch (error) {
      this.logger.error('Cache set error', error.stack, 'CacheService');
    }
  }

  async del(key: string): Promise<void> {
    try {
      const fullKey = this.buildKey(key);
      await this.cacheManager.del(fullKey);
      this.logger.logCacheOperation('delete', key);
    } catch (error) {
      this.logger.error('Cache delete error', error.stack, 'CacheService');
    }
  }

  async invalidatePattern(pattern: string): Promise<void> {
    try {
      // Note: This requires Redis store with pattern support
      const fullPattern = this.buildKey(pattern);
      
      // Get all keys matching pattern
      const keys = await this.getKeysByPattern(fullPattern);
      
      // Delete all matching keys
      if (keys.length > 0) {
        await Promise.all(keys.map(key => this.cacheManager.del(key)));
        this.logger.log(`Invalidated ${keys.length} cache entries matching pattern: ${pattern}`, 'CacheService');
      }
    } catch (error) {
      this.logger.error('Cache pattern invalidation error', error.stack, 'CacheService');
    }
  }

  async invalidateByTags(tags: string[]): Promise<void> {
    try {
      // This would require a more sophisticated implementation
      // For now, we'll implement a simple approach
      const allKeys = await this.getAllKeys();
      
      for (const key of allKeys) {
        const cached = await this.cacheManager.get<CachedData<any>>(key);
        if (cached && cached.tags) {
          const hasMatchingTag = tags.some(tag => cached.tags.includes(tag));
          if (hasMatchingTag) {
            await this.cacheManager.del(key);
          }
        }
      }
    } catch (error) {
      this.logger.error('Cache tag invalidation error', error.stack, 'CacheService');
    }
  }

  async getOrSet<T>(
    key: string,
    factory: () => Promise<T>,
    options: CacheOptions = {}
  ): Promise<T> {
    // Try to get from cache first
    const cached = await this.get<T>(key);
    if (cached !== null) {
      return cached;
    }

    // If not in cache, execute factory function
    try {
      const value = await factory();
      await this.set(key, value, options);
      return value;
    } catch (error) {
      this.logger.error('Cache factory function error', error.stack, 'CacheService');
      throw error;
    }
  }

  async mget<T>(keys: string[]): Promise<(T | null)[]> {
    try {
      const fullKeys = keys.map(key => this.buildKey(key));
      const results = await Promise.all(
        fullKeys.map(key => this.cacheManager.get<CachedData<T>>(key))
      );

      return results.map((cached, index) => {
        if (!cached) {
          this.logger.logCacheOperation('miss', keys[index]);
          return null;
        }

        if (this.isExpiredByConfidence(cached)) {
          this.cacheManager.del(fullKeys[index]); // Fire and forget
          this.logger.logCacheOperation('miss', keys[index]);
          return null;
        }

        this.logger.logCacheOperation('hit', keys[index], cached.ttl);
        return cached.value;
      });
    } catch (error) {
      this.logger.error('Cache mget error', error.stack, 'CacheService');
      return keys.map(() => null);
    }
  }

  async mset<T>(entries: Array<{ key: string; value: T; options?: CacheOptions }>): Promise<void> {
    try {
      await Promise.all(
        entries.map(entry => this.set(entry.key, entry.value, entry.options))
      );
    } catch (error) {
      this.logger.error('Cache mset error', error.stack, 'CacheService');
    }
  }

  private buildKey(key: string): string {
    return `${this.keyPrefix}${key}`;
  }

  private calculateTTL(options: CacheOptions): number {
    const { confidence = 1, ttl } = options;
    
    // If TTL is explicitly provided, use it (but cap at maxTtl)
    if (ttl) {
      return Math.min(ttl, this.maxTtl);
    }

    // Calculate TTL based on confidence
    // Higher confidence = longer cache time
    if (confidence > 0.9) return Math.min(this.defaultTtl * 6, this.maxTtl); // 30 minutes
    if (confidence > 0.8) return Math.min(this.defaultTtl * 3, this.maxTtl); // 15 minutes
    if (confidence > 0.6) return Math.min(this.defaultTtl * 2, this.maxTtl); // 10 minutes
    return this.defaultTtl; // 5 minutes
  }

  private isExpiredByConfidence(cached: CachedData<any>): boolean {
    const age = Date.now() - cached.timestamp;
    const ageInSeconds = age / 1000;
    
    // If confidence is low, expire faster
    if (cached.confidence < 0.5 && ageInSeconds > cached.ttl * 0.5) {
      return true;
    }
    
    return false;
  }

  private async getKeysByPattern(pattern: string): Promise<string[]> {
    // This would need to be implemented based on the cache store
    // For Redis, you could use SCAN command
    // For now, return empty array
    return [];
  }

  private async getAllKeys(): Promise<string[]> {
    // This would need to be implemented based on the cache store
    // For Redis, you could use SCAN command
    // For now, return empty array
    return [];
  }

  // Utility methods for common cache key patterns
  static buildAnalysisKey(projectId: string, analysisType: string): string {
    return `analysis:${projectId}:${analysisType}`;
  }

  static buildUserKey(userId: string, resource: string): string {
    return `user:${userId}:${resource}`;
  }

  static buildExternalApiKey(service: string, endpoint: string, params: any): string {
    const crypto = require('crypto');
    const paramHash = crypto
      .createHash('md5')
      .update(JSON.stringify(params))
      .digest('hex');
    return `external:${service}:${endpoint}:${paramHash}`;
  }

  static buildAggregationKey(type: string, timeframe: string): string {
    const timestamp = Math.floor(Date.now() / (5 * 60 * 1000)); // 5-minute buckets
    return `agg:${type}:${timeframe}:${timestamp}`;
  }
}
