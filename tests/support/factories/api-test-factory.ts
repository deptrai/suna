/**
 * API Test Data Factories
 * 
 * Factory functions for generating test data for API tests.
 * Uses faker for dynamic, unique test data generation.
 * 
 * Reference: bmad/bmm/testarch/knowledge/data-factories.md
 */

// Dynamic import of faker to handle module resolution
// Try to resolve from frontend/node_modules if not available in current context
let faker: any = null;
try {
  // Try direct import first
  faker = require('@faker-js/faker').faker;
} catch (e1) {
  try {
    // Try from frontend/node_modules (relative to tests directory)
    const path = require('path');
    const fakerPath = path.resolve(__dirname, '../../frontend/node_modules/@faker-js/faker');
    faker = require(fakerPath).faker;
  } catch (e2) {
    // Faker not available - use fallback implementations
    faker = null;
  }
}

/**
 * Model name factory
 * Generates model names for API tests
 */
export function createModelName(overrides?: Partial<{ provider: string; model: string }>): string {
  const providers = ['openai', 'anthropic', 'google', 'openai-compatible'];
  const models = {
    openai: ['gpt-4o-mini', 'gpt-4o', 'gpt-4-turbo', 'gpt-3.5-turbo'],
    anthropic: ['claude-3-haiku-20240307', 'claude-3-sonnet-20240229', 'claude-3-opus-20240229'],
    google: ['gemini-pro', 'gemini-pro-vision'],
    'openai-compatible': ['gpt-4o-mini', 'gpt-4o'],
  };

  // If overrides provided, use them directly
  if (overrides?.provider && overrides?.model) {
    return overrides.provider.includes('/') ? overrides.model : `${overrides.provider}/${overrides.model}`;
  }

  // Otherwise, use faker or fallback to defaults
  const provider = overrides?.provider || (faker 
    ? faker.helpers.arrayElement(providers)
    : 'openai-compatible');
  const modelList = models[provider as keyof typeof models] || models.openai;
  const model = overrides?.model || (faker
    ? faker.helpers.arrayElement(modelList)
    : modelList[0]);

  return provider.includes('/') ? model : `${provider}/${model}`;
}

/**
 * Cache metrics response factory
 */
export interface CacheMetricsResponse {
  total_requests: number;
  cache_hits: number;
  cache_misses: number;
  hit_rate: number;
  hit_rate_percentage: number;
  model_stats?: Record<string, {
    total_requests: number;
    cache_hits: number;
    cache_misses: number;
    hit_rate: number;
  }>;
}

export function createCacheMetricsResponse(
  overrides?: Partial<CacheMetricsResponse>
): CacheMetricsResponse {
  const totalRequests = overrides?.total_requests ?? faker.number.int({ min: 0, max: 1000 });
  const cacheHits = overrides?.cache_hits ?? faker.number.int({ min: 0, max: totalRequests });
  const cacheMisses = totalRequests - cacheHits;
  const hitRate = totalRequests > 0 ? cacheHits / totalRequests : 0;

  return {
    total_requests: totalRequests,
    cache_hits: cacheHits,
    cache_misses: cacheMisses,
    hit_rate: hitRate,
    hit_rate_percentage: hitRate * 100,
    model_stats: overrides?.model_stats,
  };
}

/**
 * Cache health response factory
 */
export interface CacheHealthResponse {
  healthy: boolean;
  configured: boolean;
  operational: boolean;
  details?: {
    cache_type: string;
    redis_connected: boolean;
    metrics_available: boolean;
  };
}

export function createCacheHealthResponse(
  overrides?: Partial<CacheHealthResponse>
): CacheHealthResponse {
  return {
    healthy: overrides?.healthy ?? faker.datatype.boolean(),
    configured: overrides?.configured ?? faker.datatype.boolean(),
    operational: overrides?.operational ?? faker.datatype.boolean(),
    details: overrides?.details ?? {
      cache_type: 'redis',
      redis_connected: faker.datatype.boolean(),
      metrics_available: faker.datatype.boolean(),
    },
  };
}

/**
 * Quality metrics response factory
 */
export interface QualityMetricsResponse {
  current_metrics: Record<string, number>;
  averages: Record<string, number>;
  thresholds: Record<string, number>;
  thresholds_met: boolean;
}

export function createQualityMetricsResponse(
  overrides?: Partial<QualityMetricsResponse>
): QualityMetricsResponse {
  return {
    current_metrics: overrides?.current_metrics ?? {
      response_similarity: faker.number.float({ min: 0.8, max: 1.0, precision: 0.01 }),
      tool_success_rate: faker.number.float({ min: 0.9, max: 1.0, precision: 0.01 }),
      error_rate: faker.number.float({ min: 0.0, max: 0.1, precision: 0.01 }),
    },
    averages: overrides?.averages ?? {
      response_similarity: faker.number.float({ min: 0.85, max: 0.95, precision: 0.01 }),
      tool_success_rate: faker.number.float({ min: 0.92, max: 0.98, precision: 0.01 }),
      error_rate: faker.number.float({ min: 0.0, max: 0.05, precision: 0.01 }),
    },
    thresholds: overrides?.thresholds ?? {
      response_similarity: 0.8,
      tool_success_rate: 0.9,
      error_rate: 0.1,
    },
    thresholds_met: overrides?.thresholds_met ?? faker.datatype.boolean(),
  };
}

/**
 * Metric history entry factory
 */
export interface MetricHistoryEntry {
  value: number;
  timestamp: string;
  metadata: Record<string, unknown>;
}

export function createMetricHistoryEntry(
  overrides?: Partial<MetricHistoryEntry>
): MetricHistoryEntry {
  return {
    value: overrides?.value ?? faker.number.float({ min: 0.0, max: 1.0, precision: 0.01 }),
    timestamp: overrides?.timestamp ?? new Date().toISOString(),
    metadata: overrides?.metadata ?? {},
  };
}

/**
 * Metric history response factory
 */
export interface MetricHistoryResponse {
  metric_name: string;
  history: MetricHistoryEntry[];
  count: number;
}

export function createMetricHistoryResponse(
  metricName: string,
  overrides?: Partial<{ history: MetricHistoryEntry[]; count: number }>
): MetricHistoryResponse {
  const count = overrides?.count ?? faker.number.int({ min: 0, max: 100 });
  const history = overrides?.history ?? Array.from({ length: count }, () => createMetricHistoryEntry());

  return {
    metric_name: metricName,
    history,
    count: history.length,
  };
}

/**
 * Optimization mode stats factory
 */
export interface OptimizationModeStats {
  current_mode: 'original' | 'optimized' | 'auto';
  switch_count: number;
  last_switch_time: string | null;
}

export function createOptimizationModeStats(
  overrides?: Partial<OptimizationModeStats>
): OptimizationModeStats {
  return {
    current_mode: overrides?.current_mode ?? faker.helpers.arrayElement(['original', 'optimized', 'auto']),
    switch_count: overrides?.switch_count ?? faker.number.int({ min: 0, max: 100 }),
    last_switch_time: overrides?.last_switch_time ?? (faker.datatype.boolean() ? new Date().toISOString() : null),
  };
}

/**
 * Cost savings estimates factory
 */
export interface CostSavingsEstimates {
  available: boolean;
  estimates: {
    litellm_redis?: {
      monthly_savings_usd: number;
      hit_rate: number;
    };
    anthropic?: {
      monthly_savings_usd: number;
      cache_hit_rate: number;
    };
    openai_prompt?: {
      monthly_savings_usd: number;
      cache_hit_rate: number;
    };
  };
  total_estimated_monthly_savings_usd: number;
}

export function createCostSavingsEstimates(
  overrides?: Partial<CostSavingsEstimates>
): CostSavingsEstimates {
  const available = overrides?.available ?? faker.datatype.boolean();
  const estimates = overrides?.estimates ?? {};

  if (available && Object.keys(estimates).length === 0) {
    estimates.litellm_redis = {
      monthly_savings_usd: faker.number.float({ min: 0, max: 1000, precision: 0.01 }),
      hit_rate: faker.number.float({ min: 0, max: 1, precision: 0.01 }),
    };
    estimates.anthropic = {
      monthly_savings_usd: faker.number.float({ min: 0, max: 500, precision: 0.01 }),
      cache_hit_rate: faker.number.float({ min: 0, max: 1, precision: 0.01 }),
    };
    estimates.openai_prompt = {
      monthly_savings_usd: faker.number.float({ min: 0, max: 800, precision: 0.01 }),
      cache_hit_rate: faker.number.float({ min: 0, max: 1, precision: 0.01 }),
    };
  }

  const totalSavings = Object.values(estimates).reduce((sum, estimate) => {
    return sum + (estimate?.monthly_savings_usd || 0);
  }, 0);

  return {
    available,
    estimates,
    total_estimated_monthly_savings_usd: overrides?.total_estimated_monthly_savings_usd ?? totalSavings,
  };
}

