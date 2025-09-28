export interface OrchestrationCacheOptions {
  ttl?: number;
  confidence?: number;
  serviceName?: string;
  analysisType?: string;
  tags?: string[];
  enableWarming?: boolean;
}

export interface CacheKeyComponents {
  prefix: string;
  projectId: string;
  analysisType: string;
  parameters: Record<string, any>;
  version?: string;
}

export interface ServiceCacheConfig {
  serviceName: string;
  baseTtl: number;
  maxTtl: number;
  minTtl: number;
  confidenceMultiplier: number;
  warmingEnabled: boolean;
  warmingTtl: number;
}

export interface CacheWarmingStrategy {
  enabled: boolean;
  popularTokens: string[];
  warmingInterval: number;
  maxWarmingRequests: number;
  warmingPriority: 'high' | 'medium' | 'low';
}

export interface CacheMetrics {
  hits: number;
  misses: number;
  hitRate: number;
  averageResponseTime: number;
  cacheSize: number;
  evictions: number;
  warmingRequests: number;
  lastUpdated: Date;
}

export interface CacheInvalidationPattern {
  pattern: string;
  reason: string;
  timestamp: Date;
  affectedKeys?: string[];
}

export interface OrchestrationCacheResult<T> {
  data: T;
  cached: boolean;
  cacheKey: string;
  ttl: number;
  confidence: number;
  source: 'cache' | 'service' | 'fallback';
  responseTime: number;
  serviceName?: string;
}
