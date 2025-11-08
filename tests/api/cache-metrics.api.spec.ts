import { test, expect } from '../support/fixtures';

/**
 * Cache Metrics API Tests
 * 
 * Tests for Story 1.2: LiteLLM Redis Response Caching (Exact Matches)
 * 
 * Test Levels: API (Integration)
 * Priority: P1 (High - Important features, integration points)
 * 
 * Coverage:
 * - GET /api/cache/metrics - Cache metrics summary
 * - GET /api/cache/health - Cache health status
 * - GET /api/cache/metrics/hit-rate - Cache hit rate
 * - GET /api/cache/metrics/performance - Cache performance metrics
 * 
 * Reference: bmad/bmm/testarch/knowledge/test-levels-framework.md
 * Reference: bmad/bmm/testarch/knowledge/test-priorities-matrix.md
 */

const API_BASE_URL = process.env.API_URL || 'http://localhost:8000';

test.describe('Cache Metrics API', () => {
  
  test('[P1] GET /api/cache/metrics - should return cache metrics summary', async ({ authenticatedRequest }) => {
    // GIVEN: Authenticated API request
    const endpoint = `${API_BASE_URL}/api/cache/metrics`;

    // WHEN: Requesting cache metrics summary
    const response = await authenticatedRequest.get(endpoint);

    // THEN: Returns 200 with cache metrics data
    expect(response.status()).toBe(200);
    
    const body = await response.json();
    expect(body).toHaveProperty('success', true);
    expect(body).toHaveProperty('data');
    expect(body).toHaveProperty('timestamp');
    
    // Verify metrics structure
    const data = body.data;
    expect(data).toHaveProperty('total_requests');
    expect(data).toHaveProperty('cache_hits');
    expect(data).toHaveProperty('cache_misses');
    expect(data).toHaveProperty('hit_rate');
    expect(data).toHaveProperty('hit_rate_percentage');
    
    // Verify data types
    expect(typeof data.total_requests).toBe('number');
    expect(typeof data.cache_hits).toBe('number');
    expect(typeof data.cache_misses).toBe('number');
    expect(typeof data.hit_rate).toBe('number');
    expect(typeof data.hit_rate_percentage).toBe('number');
    
    // Verify hit rate is between 0 and 1 (or percentage 0-100)
    expect(data.hit_rate).toBeGreaterThanOrEqual(0);
    expect(data.hit_rate).toBeLessThanOrEqual(1);
    expect(data.hit_rate_percentage).toBeGreaterThanOrEqual(0);
    expect(data.hit_rate_percentage).toBeLessThanOrEqual(100);
  });

  test('[P1] GET /api/cache/health - should return cache health status', async ({ authenticatedRequest }) => {
    // GIVEN: Authenticated API request
    const endpoint = `${API_BASE_URL}/api/cache/health`;

    // WHEN: Requesting cache health status
    const response = await authenticatedRequest.get(endpoint);

    // THEN: Returns 200 with health status
    expect(response.status()).toBe(200);
    
    const body = await response.json();
    expect(body).toHaveProperty('success', true);
    expect(body).toHaveProperty('data');
    expect(body).toHaveProperty('timestamp');
    
    // Verify health structure
    const data = body.data;
    expect(data).toHaveProperty('healthy');
    expect(data).toHaveProperty('configured');
    expect(data).toHaveProperty('operational');
    
    // Verify data types
    expect(typeof data.healthy).toBe('boolean');
    expect(typeof data.configured).toBe('boolean');
    expect(typeof data.operational).toBe('boolean');
    
    // Verify details if available
    if (data.details) {
      expect(data.details).toHaveProperty('cache_type');
      expect(data.details).toHaveProperty('redis_connected');
      expect(data.details).toHaveProperty('metrics_available');
    }
  });

  test('[P1] GET /api/cache/metrics/hit-rate - should return overall cache hit rate', async ({ authenticatedRequest }) => {
    // GIVEN: Authenticated API request
    const endpoint = `${API_BASE_URL}/api/cache/metrics/hit-rate`;

    // WHEN: Requesting overall cache hit rate
    const response = await authenticatedRequest.get(endpoint);

    // THEN: Returns 200 with hit rate data
    expect(response.status()).toBe(200);
    
    const body = await response.json();
    expect(body).toHaveProperty('success', true);
    expect(body).toHaveProperty('data');
    
    // Verify hit rate structure
    const data = body.data;
    expect(data).toHaveProperty('hit_rate');
    expect(data).toHaveProperty('hit_rate_percentage');
    expect(data).toHaveProperty('model', 'all');
    expect(data).toHaveProperty('total_requests');
    expect(data).toHaveProperty('cache_hits');
    expect(data).toHaveProperty('cache_misses');
    
    // Verify hit rate values are valid
    expect(data.hit_rate).toBeGreaterThanOrEqual(0);
    expect(data.hit_rate).toBeLessThanOrEqual(1);
    expect(data.hit_rate_percentage).toBeGreaterThanOrEqual(0);
    expect(data.hit_rate_percentage).toBeLessThanOrEqual(100);
  });

  test('[P1] GET /api/cache/metrics/hit-rate?model={model} - should return model-specific hit rate', async ({ authenticatedRequest }) => {
    // GIVEN: Authenticated API request with model parameter
    const model = 'gpt-4o-mini';
    const endpoint = `${API_BASE_URL}/api/cache/metrics/hit-rate?model=${model}`;

    // WHEN: Requesting model-specific cache hit rate
    const response = await authenticatedRequest.get(endpoint);

    // THEN: Returns 200 with model-specific hit rate data
    expect(response.status()).toBe(200);
    
    const body = await response.json();
    expect(body).toHaveProperty('success', true);
    expect(body).toHaveProperty('data');
    
    // Verify hit rate structure
    const data = body.data;
    expect(data).toHaveProperty('hit_rate');
    expect(data).toHaveProperty('hit_rate_percentage');
    expect(data).toHaveProperty('model', model);
    expect(data).toHaveProperty('total_requests');
    expect(data).toHaveProperty('cache_hits');
    expect(data).toHaveProperty('cache_misses');
  });

  test('[P1] GET /api/cache/metrics/performance - should return cache performance metrics', async ({ authenticatedRequest }) => {
    // GIVEN: Authenticated API request
    const endpoint = `${API_BASE_URL}/api/cache/metrics/performance`;

    // WHEN: Requesting cache performance metrics
    const response = await authenticatedRequest.get(endpoint);

    // THEN: Returns 200 with performance data
    expect(response.status()).toBe(200);
    
    const body = await response.json();
    expect(body).toHaveProperty('success', true);
    expect(body).toHaveProperty('data');
    
    // Verify performance structure
    const data = body.data;
    expect(data).toHaveProperty('average_response_time_ms');
    expect(data).toHaveProperty('average_cached_response_time_ms');
    expect(data).toHaveProperty('average_uncached_response_time_ms');
    expect(data).toHaveProperty('performance_improvement_percentage');
    expect(data).toHaveProperty('total_requests');
    expect(data).toHaveProperty('cache_hits');
    expect(data).toHaveProperty('cache_misses');
    
    // Verify performance improvement is valid (0-100%)
    if (data.performance_improvement_percentage !== null) {
      expect(data.performance_improvement_percentage).toBeGreaterThanOrEqual(0);
      expect(data.performance_improvement_percentage).toBeLessThanOrEqual(100);
    }
  });

  test('[P1] GET /api/cache/metrics - should handle authentication errors', async ({ request }) => {
    // GIVEN: Unauthenticated API request
    const endpoint = `${API_BASE_URL}/api/cache/metrics`;

    // WHEN: Requesting cache metrics without authentication
    const response = await request.get(endpoint);

    // THEN: Returns 401 Unauthorized
    expect(response.status()).toBe(401);
    
    const body = await response.json();
    expect(body).toHaveProperty('detail');
    expect(body.detail).toContain('authentication');
  });

  test('[P2] GET /api/cache/metrics - should return model statistics when available', async ({ authenticatedRequest }) => {
    // GIVEN: Authenticated API request
    const endpoint = `${API_BASE_URL}/api/cache/metrics`;

    // WHEN: Requesting cache metrics summary
    const response = await authenticatedRequest.get(endpoint);

    // THEN: Returns model statistics if available
    expect(response.status()).toBe(200);
    
    const body = await response.json();
    const data = body.data;
    
    if (data.model_stats && Object.keys(data.model_stats).length > 0) {
      // Verify model stats structure
      const firstModel = Object.keys(data.model_stats)[0];
      const modelStats = data.model_stats[firstModel];
      
      expect(modelStats).toHaveProperty('total_requests');
      expect(modelStats).toHaveProperty('cache_hits');
      expect(modelStats).toHaveProperty('cache_misses');
      expect(modelStats).toHaveProperty('hit_rate');
      
      // Verify hit rate is valid
      expect(modelStats.hit_rate).toBeGreaterThanOrEqual(0);
      expect(modelStats.hit_rate).toBeLessThanOrEqual(1);
    }
  });
});

