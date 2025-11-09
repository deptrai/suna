import { test, expect } from '../support/fixtures';
import { validateAuthenticationError, validateOptionalCacheMetrics, validateOptionalQualityMetrics, validateOptionalCostSavings, validateOptionalLiteLLMCacheMetrics } from '../support/helpers/api-validation-helpers';

/**
 * Optimization Dashboard API Tests
 * 
 * Tests for Epic 1 + Story 2.4: Unified Optimization Dashboard API
 * 
 * Test Levels: API (Integration)
 * Priority: P1 (High - Important features, integration points)
 * 
 * Coverage:
 * - GET /api/optimization/dashboard - Unified optimization dashboard
 * - GET /api/optimization/dashboard/cache - Cache metrics dashboard
 * 
 * Reference: bmad/bmm/testarch/knowledge/test-levels-framework.md
 * Reference: bmad/bmm/testarch/knowledge/test-priorities-matrix.md
 */

const API_BASE_URL = process.env.API_URL || 'http://localhost:8000';

test.describe('1.1-API: Optimization Dashboard API', () => {
  
  test('1.1-API-001 [P1] GET /api/optimization/dashboard - should return unified optimization dashboard', async ({ authenticatedRequest }) => {
    // GIVEN: Authenticated API request
    const endpoint = `${API_BASE_URL}/api/optimization/dashboard`;

    // WHEN: Requesting unified optimization dashboard
    const response = await authenticatedRequest.get(endpoint);

    // THEN: Returns 200 with comprehensive dashboard data
    expect(response.status()).toBe(200);
    
    const body = await response.json();
    expect(body).toHaveProperty('success', true);
    expect(body).toHaveProperty('data');
    
    // Verify dashboard structure
    const data = body.data;
    expect(data).toHaveProperty('timestamp');
    expect(data).toHaveProperty('optimization_mode');
    expect(data).toHaveProperty('cache_metrics');
    expect(data).toHaveProperty('quality_metrics');
    expect(data).toHaveProperty('optimization_mode_stats');
    expect(data).toHaveProperty('cost_savings');
    expect(data).toHaveProperty('performance_summary');
    
    // Verify cache metrics structure (optional)
    validateOptionalCacheMetrics(data.cache_metrics);
    
    // Verify quality metrics structure (optional)
    validateOptionalQualityMetrics(data.quality_metrics);
    
    // Verify performance summary
    expect(data.performance_summary).toHaveProperty('cache_hit_rate');
    expect(data.performance_summary).toHaveProperty('quality_status');
    expect(data.performance_summary).toHaveProperty('optimization_mode');
    expect(data.performance_summary).toHaveProperty('overall_health');
  });

  test('1.1-API-002 [P1] GET /api/optimization/dashboard/cache - should return cache metrics dashboard', async ({ authenticatedRequest }) => {
    // GIVEN: Authenticated API request
    const endpoint = `${API_BASE_URL}/api/optimization/dashboard/cache`;

    // WHEN: Requesting cache metrics dashboard
    const response = await authenticatedRequest.get(endpoint);

    // THEN: Returns 200 with cache metrics data
    expect(response.status()).toBe(200);
    
    const body = await response.json();
    expect(body).toHaveProperty('success', true);
    expect(body).toHaveProperty('data');
    
    // Verify cache dashboard structure
    const data = body.data;
    expect(data).toHaveProperty('timestamp');
    expect(data).toHaveProperty('litellm_redis');
    expect(data).toHaveProperty('anthropic');
    expect(data).toHaveProperty('openai_prompt');
    expect(data).toHaveProperty('summary');
    
    // Verify LiteLLM Redis cache metrics (optional)
    if (data.litellm_redis && data.litellm_redis.available) {
      expect(data.litellm_redis).toHaveProperty('metrics');
      expect(data.litellm_redis).toHaveProperty('health');
      
      validateOptionalLiteLLMCacheMetrics(data.litellm_redis.metrics);
    }
    
    // Verify summary
    expect(data.summary).toHaveProperty('total_cache_types');
    expect(data.summary).toHaveProperty('overall_hit_rate');
    expect(data.summary).toHaveProperty('cache_health');
  });

  test('1.1-API-003 [P1] GET /api/optimization/dashboard - should handle authentication errors', async ({ request }) => {
    // GIVEN: Unauthenticated API request
    const endpoint = `${API_BASE_URL}/api/optimization/dashboard`;

    // WHEN: Requesting dashboard without authentication
    const response = await request.get(endpoint);

    // THEN: Returns 401 Unauthorized with proper error structure
    await validateAuthenticationError(response, 401);
  });

  test('1.1-API-004 [P1] GET /api/optimization/dashboard/cache - should handle authentication errors', async ({ request }) => {
    // GIVEN: Unauthenticated API request
    const endpoint = `${API_BASE_URL}/api/optimization/dashboard/cache`;

    // WHEN: Requesting cache dashboard without authentication
    const response = await request.get(endpoint);

    // THEN: Returns 401 Unauthorized with proper error structure
    await validateAuthenticationError(response, 401);
  });

  test('1.1-API-005 [P2] GET /api/optimization/dashboard - should return cost savings estimates', async ({ authenticatedRequest }) => {
    // GIVEN: Authenticated API request
    const endpoint = `${API_BASE_URL}/api/optimization/dashboard`;

    // WHEN: Requesting unified optimization dashboard
    const response = await authenticatedRequest.get(endpoint);

    // THEN: Returns cost savings data
    expect(response.status()).toBe(200);
    
    const body = await response.json();
    const data = body.data;
    
    // Validate cost savings structure (optional)
    validateOptionalCostSavings(data.cost_savings);
  });

  test('1.1-API-006 [P2] GET /api/optimization/dashboard - should return performance summary', async ({ authenticatedRequest }) => {
    // GIVEN: Authenticated API request
    const endpoint = `${API_BASE_URL}/api/optimization/dashboard`;

    // WHEN: Requesting unified optimization dashboard
    const response = await authenticatedRequest.get(endpoint);

    // THEN: Returns performance summary
    expect(response.status()).toBe(200);
    
    const body = await response.json();
    const data = body.data;
    
    expect(data.performance_summary).toHaveProperty('cache_hit_rate');
    expect(data.performance_summary).toHaveProperty('quality_status');
    expect(data.performance_summary).toHaveProperty('optimization_mode');
    expect(data.performance_summary).toHaveProperty('overall_health');
    
    // Verify health status is valid
    const overallHealth = data.performance_summary.overall_health;
    expect(['healthy', 'degraded', 'unknown']).toContain(overallHealth);
  });
});

