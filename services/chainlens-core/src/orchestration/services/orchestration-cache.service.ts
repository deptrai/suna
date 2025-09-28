import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import { CacheService } from '../../cache/cache.service';
import { LoggerService } from '../../common/services/logger.service';
import { MetricsService } from '../../metrics/metrics.service';
import {
  OrchestrationCacheOptions,
  CacheKeyComponents,
  ServiceCacheConfig,
  CacheWarmingStrategy,
  CacheMetrics,
  OrchestrationCacheResult,
  CacheInvalidationPattern,
} from '../interfaces/cache.interfaces';

@Injectable()
export class OrchestrationCacheService {
  private readonly cacheVersion = 'v1.3.4';
  private readonly serviceConfigs: Map<string, ServiceCacheConfig> = new Map();
  private warmingStrategy: CacheWarmingStrategy;
  private metrics: CacheMetrics;

  constructor(
    private cacheService: CacheService,
    private configService: ConfigService,
    private logger: LoggerService,
    private metricsService: MetricsService,
  ) {
    this.initializeServiceConfigs();
    this.initializeWarmingStrategy();
    this.initializeMetrics();
  }

  /**
   * T1.3.4a: Deterministic cache key generation with parameter hashing
   */
  generateCacheKey(components: CacheKeyComponents): string {
    const { prefix, projectId, analysisType, parameters, version } = components;
    
    // Normalize projectId to lowercase for consistency
    const normalizedProjectId = projectId.toLowerCase().trim();
    
    // Create deterministic parameter hash
    const parameterHash = this.hashParameters(parameters);
    
    // Build cache key with version for invalidation support
    const cacheVersion = version || this.cacheVersion;
    const keyComponents = [
      prefix || 'orchestration',
      normalizedProjectId,
      analysisType,
      parameterHash,
      cacheVersion,
    ];
    
    const cacheKey = keyComponents.join(':');
    
    this.logger.debug('Generated cache key', {
      cacheKey,
      components: keyComponents,
      originalParameters: parameters,
    });
    
    return cacheKey;
  }

  /**
   * Generate cache key for analysis request
   */
  generateAnalysisKey(
    projectId: string,
    analysisType: string,
    parameters: Record<string, any>,
  ): string {
    return this.generateCacheKey({
      prefix: 'analysis',
      projectId,
      analysisType,
      parameters,
    });
  }

  /**
   * Generate cache key for service-specific data
   */
  generateServiceKey(
    serviceName: string,
    projectId: string,
    parameters: Record<string, any>,
  ): string {
    return this.generateCacheKey({
      prefix: `service:${serviceName}`,
      projectId,
      analysisType: 'data',
      parameters,
    });
  }

  /**
   * Generate cache invalidation pattern
   */
  generateInvalidationPattern(
    projectId?: string,
    analysisType?: string,
    serviceName?: string,
  ): string {
    const components = ['*'];
    
    if (serviceName) {
      components.push(`service:${serviceName}`);
    } else if (analysisType) {
      components.push('analysis');
    } else {
      components.push('*');
    }
    
    if (projectId) {
      components.push(projectId.toLowerCase());
    } else {
      components.push('*');
    }
    
    components.push('*'); // analysisType or data
    components.push('*'); // parameter hash
    components.push('*'); // version
    
    return components.join(':');
  }

  /**
   * Hash parameters deterministically
   */
  private hashParameters(parameters: Record<string, any>): string {
    // Sort keys to ensure deterministic hashing
    const sortedKeys = Object.keys(parameters).sort();
    const normalizedParams: Record<string, any> = {};
    
    // Normalize parameter values
    for (const key of sortedKeys) {
      const value = parameters[key];
      
      // Handle different parameter types consistently
      if (typeof value === 'string') {
        normalizedParams[key] = value.toLowerCase().trim();
      } else if (typeof value === 'number') {
        normalizedParams[key] = value;
      } else if (typeof value === 'boolean') {
        normalizedParams[key] = value;
      } else if (Array.isArray(value)) {
        normalizedParams[key] = value.sort();
      } else if (typeof value === 'object' && value !== null) {
        normalizedParams[key] = this.hashParameters(value);
      } else {
        normalizedParams[key] = String(value);
      }
    }
    
    // Create hash from normalized parameters
    const paramString = JSON.stringify(normalizedParams);
    return createHash('md5').update(paramString).digest('hex').substring(0, 12);
  }

  /**
   * Initialize service-specific cache configurations
   */
  private initializeServiceConfigs(): void {
    const configs: ServiceCacheConfig[] = [
      {
        serviceName: 'onchain',
        baseTtl: 300, // 5 minutes
        maxTtl: 1800, // 30 minutes
        minTtl: 60, // 1 minute
        confidenceMultiplier: 2,
        warmingEnabled: true,
        warmingTtl: 600, // 10 minutes
      },
      {
        serviceName: 'sentiment',
        baseTtl: 600, // 10 minutes
        maxTtl: 1800, // 30 minutes
        minTtl: 300, // 5 minutes
        confidenceMultiplier: 1.5,
        warmingEnabled: true,
        warmingTtl: 900, // 15 minutes
      },
      {
        serviceName: 'tokenomics',
        baseTtl: 1800, // 30 minutes
        maxTtl: 3600, // 1 hour
        minTtl: 600, // 10 minutes
        confidenceMultiplier: 3,
        warmingEnabled: false,
        warmingTtl: 1800, // 30 minutes
      },
      {
        serviceName: 'team',
        baseTtl: 3600, // 1 hour
        maxTtl: 7200, // 2 hours
        minTtl: 1800, // 30 minutes
        confidenceMultiplier: 4,
        warmingEnabled: false,
        warmingTtl: 3600, // 1 hour
      },
    ];

    configs.forEach(config => {
      this.serviceConfigs.set(config.serviceName, config);
    });

    this.logger.log('Initialized service cache configurations', {
      services: configs.map(c => c.serviceName),
    });
  }

  /**
   * Initialize cache warming strategy
   */
  private initializeWarmingStrategy(): void {
    this.warmingStrategy = {
      enabled: this.configService.get<boolean>('cache.warming.enabled', true),
      popularTokens: this.configService.get<string[]>('cache.warming.popularTokens', [
        'bitcoin', 'ethereum', 'binancecoin', 'cardano', 'solana',
        'polkadot', 'dogecoin', 'avalanche-2', 'chainlink', 'polygon',
      ]),
      warmingInterval: this.configService.get<number>('cache.warming.interval', 300000), // 5 minutes
      maxWarmingRequests: this.configService.get<number>('cache.warming.maxRequests', 10),
      warmingPriority: this.configService.get<'high' | 'medium' | 'low'>('cache.warming.priority', 'medium'),
    };
  }

  /**
   * Initialize cache metrics
   */
  private initializeMetrics(): void {
    this.metrics = {
      hits: 0,
      misses: 0,
      hitRate: 0,
      averageResponseTime: 0,
      cacheSize: 0,
      evictions: 0,
      warmingRequests: 0,
      lastUpdated: new Date(),
    };
  }

  /**
   * Get service cache configuration
   */
  getServiceConfig(serviceName: string): ServiceCacheConfig | undefined {
    return this.serviceConfigs.get(serviceName);
  }

  /**
   * Get cache warming strategy
   */
  getWarmingStrategy(): CacheWarmingStrategy {
    return { ...this.warmingStrategy };
  }

  /**
   * Get current cache metrics
   */
  getMetrics(): CacheMetrics {
    return { ...this.metrics };
  }

  /**
   * T1.3.4b: Calculate TTL based on confidence and service type
   */
  calculateTTL(options: OrchestrationCacheOptions): number {
    const {
      confidence = 1,
      serviceName,
      ttl,
    } = options;

    // If TTL is explicitly provided, use it
    if (ttl) {
      return ttl;
    }

    // Get service-specific configuration
    const serviceConfig = serviceName ? this.serviceConfigs.get(serviceName) : null;
    const baseTtl = serviceConfig?.baseTtl || 300; // Default 5 minutes
    const maxTtl = serviceConfig?.maxTtl || 3600; // Default 1 hour
    const minTtl = serviceConfig?.minTtl || 60; // Default 1 minute
    const multiplier = serviceConfig?.confidenceMultiplier || 2;

    // Calculate confidence-based TTL
    let calculatedTtl = baseTtl;

    if (confidence > 0.9) {
      calculatedTtl = baseTtl * multiplier * 2; // Very high confidence
    } else if (confidence > 0.8) {
      calculatedTtl = baseTtl * multiplier; // High confidence
    } else if (confidence > 0.6) {
      calculatedTtl = baseTtl * (multiplier * 0.7); // Medium confidence
    } else if (confidence > 0.4) {
      calculatedTtl = baseTtl * 0.5; // Low confidence
    } else {
      calculatedTtl = minTtl; // Very low confidence
    }

    // Ensure TTL is within bounds
    const finalTtl = Math.max(minTtl, Math.min(maxTtl, calculatedTtl));

    this.logger.debug('Calculated TTL', {
      serviceName,
      confidence,
      baseTtl,
      calculatedTtl,
      finalTtl,
    });

    return Math.floor(finalTtl);
  }

  /**
   * Cache analysis result with orchestration-specific logic
   */
  async cacheAnalysisResult<T>(
    cacheKey: string,
    data: T,
    options: OrchestrationCacheOptions,
  ): Promise<void> {
    const ttl = this.calculateTTL(options);

    await this.cacheService.set(cacheKey, data, {
      ttl,
      confidence: options.confidence,
      tags: options.tags,
    });

    // Update metrics
    this.updateMetrics('set', ttl);

    this.logger.debug('Cached analysis result', {
      cacheKey,
      ttl,
      confidence: options.confidence,
      serviceName: options.serviceName,
    });
  }

  /**
   * Get cached analysis result
   */
  async getCachedAnalysisResult<T>(
    cacheKey: string,
    serviceName?: string,
  ): Promise<OrchestrationCacheResult<T> | null> {
    const startTime = Date.now();

    try {
      const cached = await this.cacheService.get<T>(cacheKey);
      const responseTime = Date.now() - startTime;

      if (cached !== null) {
        // Update metrics
        this.updateMetrics('hit', responseTime);

        return {
          data: cached,
          cached: true,
          cacheKey,
          ttl: 0, // TTL not available from cache
          confidence: 1, // Confidence not available from cache
          source: 'cache',
          responseTime,
          serviceName,
        };
      } else {
        // Update metrics
        this.updateMetrics('miss', responseTime);
        return null;
      }
    } catch (error) {
      this.logger.error('Cache get error', error.stack, 'OrchestrationCacheService');
      this.updateMetrics('miss', Date.now() - startTime);
      return null;
    }
  }

  /**
   * Cache warming for popular tokens/projects
   */
  async warmCache(
    projectIds: string[],
    analysisTypes: string[] = ['full'],
  ): Promise<void> {
    if (!this.warmingStrategy.enabled) {
      return;
    }

    const warmingPromises: Promise<void>[] = [];
    let requestCount = 0;

    for (const projectId of projectIds) {
      for (const analysisType of analysisTypes) {
        if (requestCount >= this.warmingStrategy.maxWarmingRequests) {
          break;
        }

        const warmingPromise = this.warmCacheEntry(projectId, analysisType);
        warmingPromises.push(warmingPromise);
        requestCount++;
      }
    }

    try {
      await Promise.allSettled(warmingPromises);
      this.metrics.warmingRequests += requestCount;

      this.logger.log('Cache warming completed', {
        projectCount: projectIds.length,
        analysisTypes,
        requestCount,
      });
    } catch (error) {
      this.logger.error('Cache warming error', error.stack, 'OrchestrationCacheService');
    }
  }

  /**
   * Warm cache for a specific entry
   */
  private async warmCacheEntry(
    projectId: string,
    analysisType: string,
  ): Promise<void> {
    // This would typically trigger the actual analysis
    // For now, we'll just log the warming attempt
    this.logger.debug('Warming cache entry', {
      projectId,
      analysisType,
    });

    // In a real implementation, this would:
    // 1. Check if cache entry exists and is fresh
    // 2. If not, trigger background analysis
    // 3. Cache the result with warming TTL
  }

  /**
   * Update cache metrics
   */
  private updateMetrics(
    operation: 'hit' | 'miss' | 'set',
    responseTime?: number,
  ): void {
    switch (operation) {
      case 'hit':
        this.metrics.hits++;
        break;
      case 'miss':
        this.metrics.misses++;
        break;
      case 'set':
        // Cache size would be tracked by Redis
        break;
    }

    // Update hit rate
    const total = this.metrics.hits + this.metrics.misses;
    this.metrics.hitRate = total > 0 ? this.metrics.hits / total : 0;

    // Update average response time
    if (responseTime !== undefined) {
      const currentAvg = this.metrics.averageResponseTime;
      const count = this.metrics.hits + this.metrics.misses;
      this.metrics.averageResponseTime =
        (currentAvg * (count - 1) + responseTime) / count;
    }

    this.metrics.lastUpdated = new Date();

    // Report metrics to MetricsService
    this.metricsService.recordCacheOperation(operation, 'orchestration');
  }

  /**
   * T1.3.4c: Cache invalidation with pattern support
   */
  async invalidateCache(pattern: CacheInvalidationPattern): Promise<void> {
    try {
      await this.cacheService.invalidatePattern(pattern.pattern);

      this.logger.log('Cache invalidated', {
        pattern: pattern.pattern,
        reason: pattern.reason,
        timestamp: pattern.timestamp,
      });

      // Update metrics
      this.metrics.evictions++;
      this.metrics.lastUpdated = new Date();
    } catch (error) {
      this.logger.error('Cache invalidation error', error.stack, 'OrchestrationCacheService');
    }
  }

  /**
   * Invalidate cache for specific project
   */
  async invalidateProjectCache(projectId: string, reason: string = 'manual'): Promise<void> {
    const pattern: CacheInvalidationPattern = {
      pattern: this.generateInvalidationPattern(projectId),
      reason,
      timestamp: new Date(),
    };

    await this.invalidateCache(pattern);
  }

  /**
   * Invalidate cache for specific service
   */
  async invalidateServiceCache(serviceName: string, reason: string = 'service_update'): Promise<void> {
    const pattern: CacheInvalidationPattern = {
      pattern: this.generateInvalidationPattern(undefined, undefined, serviceName),
      reason,
      timestamp: new Date(),
    };

    await this.invalidateCache(pattern);
  }

  /**
   * Get cache statistics for monitoring
   */
  async getCacheStatistics(): Promise<{
    metrics: CacheMetrics;
    serviceConfigs: ServiceCacheConfig[];
    warmingStrategy: CacheWarmingStrategy;
  }> {
    return {
      metrics: this.getMetrics(),
      serviceConfigs: Array.from(this.serviceConfigs.values()),
      warmingStrategy: this.getWarmingStrategy(),
    };
  }

  /**
   * Health check for cache service
   */
  async healthCheck(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    details: Record<string, any>;
  }> {
    try {
      // Test cache connectivity
      const testKey = 'health:check:' + Date.now();
      const testValue = { timestamp: Date.now() };

      await this.cacheService.set(testKey, testValue, { ttl: 10 });
      const retrieved = await this.cacheService.get(testKey);
      await this.cacheService.del(testKey);

      const isHealthy = retrieved !== null;
      const hitRate = this.metrics.hitRate;
      const avgResponseTime = this.metrics.averageResponseTime;

      let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';

      if (!isHealthy) {
        status = 'unhealthy';
      } else if (hitRate < 0.5 || avgResponseTime > 1000) {
        status = 'degraded';
      }

      return {
        status,
        details: {
          connectivity: isHealthy,
          hitRate,
          avgResponseTime,
          totalOperations: this.metrics.hits + this.metrics.misses,
          warmingEnabled: this.warmingStrategy.enabled,
          lastUpdated: this.metrics.lastUpdated,
        },
      };
    } catch (error) {
      this.logger.error('Cache health check failed', error.stack, 'OrchestrationCacheService');

      return {
        status: 'unhealthy',
        details: {
          error: error.message,
          connectivity: false,
        },
      };
    }
  }

  /**
   * Performance monitoring - get cache performance report
   */
  getPerformanceReport(): {
    summary: {
      hitRate: number;
      avgResponseTime: number;
      totalOperations: number;
      cacheEfficiency: string;
    };
    recommendations: string[];
  } {
    const hitRate = this.metrics.hitRate;
    const avgResponseTime = this.metrics.averageResponseTime;
    const totalOps = this.metrics.hits + this.metrics.misses;

    let efficiency = 'excellent';
    const recommendations: string[] = [];

    if (hitRate < 0.3) {
      efficiency = 'poor';
      recommendations.push('Consider increasing TTL values or improving cache warming');
    } else if (hitRate < 0.6) {
      efficiency = 'fair';
      recommendations.push('Review cache key generation and TTL strategies');
    } else if (hitRate < 0.8) {
      efficiency = 'good';
    }

    if (avgResponseTime > 500) {
      recommendations.push('Cache response time is high - check Redis performance');
    }

    if (this.metrics.warmingRequests === 0 && this.warmingStrategy.enabled) {
      recommendations.push('Cache warming is enabled but not being used');
    }

    return {
      summary: {
        hitRate: Math.round(hitRate * 100) / 100,
        avgResponseTime: Math.round(avgResponseTime),
        totalOperations: totalOps,
        cacheEfficiency: efficiency,
      },
      recommendations,
    };
  }
}
