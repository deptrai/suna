/**
 * API Validation Helpers
 * 
 * Helper functions for validating API responses, error responses, and optional fields.
 * 
 * Reference: bmad/bmm/testarch/knowledge/test-quality.md
 */

import { expect } from '@playwright/test';

/**
 * Validate authentication error response structure
 * 
 * @param response - API response object
 * @param expectedStatus - Expected HTTP status code (default: 401)
 */
export async function validateAuthenticationError(
  response: { status: () => number; json: () => Promise<unknown> },
  expectedStatus: number = 401
): Promise<void> {
  // Validate status code
  expect(response.status()).toBe(expectedStatus);

  // Validate error response structure
  const body = await response.json() as Record<string, unknown>;
  expect(body).toHaveProperty('detail');
  expect(typeof body.detail).toBe('string');
  expect((body.detail as string).length).toBeGreaterThan(0);

  // Validate error message contains authentication-related keywords
  const errorMessage = (body.detail as string).toLowerCase();
  const hasAuthKeyword =
    errorMessage.includes('authentication') ||
    errorMessage.includes('unauthorized') ||
    errorMessage.includes('token') ||
    errorMessage.includes('auth') ||
    errorMessage.includes('credential');

  expect(hasAuthKeyword).toBe(true);

  // Optional: Validate error code if API provides it
  if (body.error_code) {
    expect(typeof body.error_code).toBe('string');
  }
}

/**
 * Validate optional field structure
 * 
 * @param field - Optional field to validate
 * @param validator - Validation function to apply if field exists
 */
export function validateOptionalField<T>(
  field: T | null | undefined,
  validator: (field: T) => void
): void {
  if (field !== null && field !== undefined) {
    validator(field);
  }
}

/**
 * Validate cache metrics structure (optional)
 */
export function validateOptionalCacheMetrics(cacheMetrics: unknown): void {
  validateOptionalField(cacheMetrics, (metrics) => {
    expect(metrics).toHaveProperty('litellm_redis');
    expect(metrics).toHaveProperty('anthropic');
    expect(metrics).toHaveProperty('openai_prompt');
  });
}

/**
 * Validate quality metrics structure (optional)
 */
export function validateOptionalQualityMetrics(qualityMetrics: unknown): void {
  validateOptionalField(qualityMetrics, (metrics) => {
    expect(metrics).toHaveProperty('status');
    expect(metrics).toHaveProperty('current_metrics');
    expect(metrics).toHaveProperty('thresholds');
  });
}

/**
 * Validate cache health details structure (optional)
 */
export function validateOptionalCacheHealthDetails(details: unknown): void {
  validateOptionalField(details, (healthDetails) => {
    expect(healthDetails).toHaveProperty('cache_type');
    expect(healthDetails).toHaveProperty('redis_connected');
    expect(healthDetails).toHaveProperty('metrics_available');
  });
}

/**
 * Validate cost savings estimates structure (optional)
 */
export function validateOptionalCostSavings(costSavings: unknown): void {
  validateOptionalField(costSavings, (savings) => {
    if ((savings as Record<string, unknown>).available) {
      expect(savings).toHaveProperty('estimates');
      expect(savings).toHaveProperty('total_estimated_monthly_savings_usd');

      const estimates = (savings as Record<string, unknown>).estimates as Record<string, unknown> | undefined;
      if (estimates) {
        if (estimates.litellm_redis) {
          expect(estimates.litellm_redis).toHaveProperty('monthly_savings_usd');
          expect(estimates.litellm_redis).toHaveProperty('hit_rate');
        }
        if (estimates.anthropic) {
          expect(estimates.anthropic).toHaveProperty('monthly_savings_usd');
          expect(estimates.anthropic).toHaveProperty('cache_hit_rate');
        }
        if (estimates.openai_prompt) {
          expect(estimates.openai_prompt).toHaveProperty('monthly_savings_usd');
          expect(estimates.openai_prompt).toHaveProperty('cache_hit_rate');
        }
      }
    }
  });
}

/**
 * Validate LiteLLM Redis cache metrics structure (optional)
 */
export function validateOptionalLiteLLMCacheMetrics(metrics: unknown): void {
  validateOptionalField(metrics, (cacheMetrics) => {
    expect(cacheMetrics).toHaveProperty('total_requests');
    expect(cacheMetrics).toHaveProperty('cache_hits');
    expect(cacheMetrics).toHaveProperty('cache_misses');
    expect(cacheMetrics).toHaveProperty('hit_rate');
  });
}

/**
 * Validate model statistics structure (optional)
 */
export function validateOptionalModelStats(modelStats: unknown): void {
  validateOptionalField(modelStats, (stats) => {
    if (typeof stats === 'object' && stats !== null && Object.keys(stats).length > 0) {
      const firstModel = Object.keys(stats)[0];
      const modelData = (stats as Record<string, unknown>)[firstModel];
      
      expect(modelData).toHaveProperty('total_requests');
      expect(modelData).toHaveProperty('cache_hits');
      expect(modelData).toHaveProperty('cache_misses');
      expect(modelData).toHaveProperty('hit_rate');
      
      // Validate hit rate is valid
      const hitRate = (modelData as Record<string, unknown>).hit_rate as number;
      expect(hitRate).toBeGreaterThanOrEqual(0);
      expect(hitRate).toBeLessThanOrEqual(1);
    }
  });
}

/**
 * Validate metric history entries structure (optional)
 */
export function validateOptionalMetricHistory(history: unknown[]): void {
  if (history.length > 0) {
    const entry = history[0];
    expect(entry).toHaveProperty('value');
    expect(entry).toHaveProperty('timestamp');
    expect(entry).toHaveProperty('metadata');
  }
}

/**
 * Validate 404 error response structure
 * 
 * @param response - API response object
 * @param expectedDetail - Expected detail message (e.g., metric name)
 */
export async function validateNotFoundError(
  response: { status: () => number; json: () => Promise<unknown> },
  expectedDetail?: string
): Promise<void> {
  // Validate status code
  expect(response.status()).toBe(404);

  // Validate error response structure
  const body = await response.json() as Record<string, unknown>;
  expect(body).toHaveProperty('detail');
  expect(typeof body.detail).toBe('string');
  expect((body.detail as string).length).toBeGreaterThan(0);

  // Validate detail contains expected content if provided
  if (expectedDetail) {
    expect((body.detail as string)).toContain(expectedDetail);
  }
}


