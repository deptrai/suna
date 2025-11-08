import { test, expect } from '../support/fixtures';

/**
 * Quality Monitoring API Tests
 * 
 * Tests for Story 2.4: Quality Monitoring Framework
 * 
 * Test Levels: API (Integration)
 * Priority: P1 (High - Important features, integration points)
 * 
 * Coverage:
 * - GET /api/quality/metrics - Quality metrics summary
 * - GET /api/quality/metrics/{metric_name} - Specific metric history
 * - GET /api/quality/status - Quality status
 * - GET /api/quality/optimization-mode/stats - Optimization mode statistics
 * 
 * Reference: bmad/bmm/testarch/knowledge/test-levels-framework.md
 * Reference: bmad/bmm/testarch/knowledge/test-priorities-matrix.md
 */

const API_BASE_URL = process.env.API_URL || 'http://localhost:8000';

test.describe('Quality Monitoring API', () => {
  
  test('[P1] GET /api/quality/metrics - should return quality metrics summary', async ({ authenticatedRequest }) => {
    // GIVEN: Authenticated API request
    const endpoint = `${API_BASE_URL}/api/quality/metrics`;

    // WHEN: Requesting quality metrics summary
    const response = await authenticatedRequest.get(endpoint);

    // THEN: Returns 200 with quality metrics data
    expect(response.status()).toBe(200);
    
    const body = await response.json();
    expect(body).toHaveProperty('success', true);
    expect(body).toHaveProperty('data');
    expect(body).toHaveProperty('timestamp');
    
    // Verify metrics structure
    const data = body.data;
    expect(data).toHaveProperty('current_metrics');
    expect(data).toHaveProperty('averages');
    expect(data).toHaveProperty('thresholds');
    expect(data).toHaveProperty('thresholds_met');
    
    // Verify current metrics structure
    if (data.current_metrics) {
      // Quality metrics may include: response_similarity, tool_success_rate, error_rate, etc.
      expect(typeof data.current_metrics).toBe('object');
    }
    
    // Verify thresholds structure
    if (data.thresholds) {
      expect(typeof data.thresholds).toBe('object');
    }
  });

  test('[P1] GET /api/quality/status - should return quality status', async ({ authenticatedRequest }) => {
    // GIVEN: Authenticated API request
    const endpoint = `${API_BASE_URL}/api/quality/status`;

    // WHEN: Requesting quality status
    const response = await authenticatedRequest.get(endpoint);

    // THEN: Returns 200 with quality status
    expect(response.status()).toBe(200);
    
    const body = await response.json();
    expect(body).toHaveProperty('success', true);
    expect(body).toHaveProperty('data');
    
    // Verify status structure
    const data = body.data;
    expect(data).toHaveProperty('status');
    expect(data).toHaveProperty('thresholds_met');
    expect(data).toHaveProperty('current_metrics');
    expect(data).toHaveProperty('thresholds');
    
    // Verify status is valid
    expect(['healthy', 'degraded']).toContain(data.status);
    expect(typeof data.thresholds_met).toBe('boolean');
  });

  test('[P1] GET /api/quality/metrics/{metric_name} - should return metric history', async ({ authenticatedRequest }) => {
    // GIVEN: Authenticated API request with metric name
    const metricName = 'response_similarity';
    const endpoint = `${API_BASE_URL}/api/quality/metrics/${metricName}`;

    // WHEN: Requesting metric history
    const response = await authenticatedRequest.get(endpoint);

    // THEN: Returns 200 with metric history
    expect(response.status()).toBe(200);
    
    const body = await response.json();
    expect(body).toHaveProperty('success', true);
    expect(body).toHaveProperty('data');
    
    // Verify history structure
    const data = body.data;
    expect(data).toHaveProperty('metric_name', metricName);
    expect(data).toHaveProperty('history');
    expect(data).toHaveProperty('count');
    expect(Array.isArray(data.history)).toBe(true);
    expect(typeof data.count).toBe('number');
    
    // Verify history entries structure
    if (data.history.length > 0) {
      const entry = data.history[0];
      expect(entry).toHaveProperty('value');
      expect(entry).toHaveProperty('timestamp');
      expect(entry).toHaveProperty('metadata');
    }
  });

  test('[P1] GET /api/quality/metrics/{metric_name} - should return 404 for invalid metric', async ({ authenticatedRequest }) => {
    // GIVEN: Authenticated API request with invalid metric name
    const metricName = 'invalid_metric_name';
    const endpoint = `${API_BASE_URL}/api/quality/metrics/${metricName}`;

    // WHEN: Requesting invalid metric history
    const response = await authenticatedRequest.get(endpoint);

    // THEN: Returns 404 Not Found
    expect(response.status()).toBe(404);
    
    const body = await response.json();
    expect(body).toHaveProperty('detail');
    expect(body.detail).toContain(metricName);
  });

  test('[P1] GET /api/quality/optimization-mode/stats - should return optimization mode statistics', async ({ authenticatedRequest }) => {
    // GIVEN: Authenticated API request
    const endpoint = `${API_BASE_URL}/api/quality/optimization-mode/stats`;

    // WHEN: Requesting optimization mode statistics
    const response = await authenticatedRequest.get(endpoint);

    // THEN: Returns 200 with mode statistics
    expect(response.status()).toBe(200);
    
    const body = await response.json();
    expect(body).toHaveProperty('success', true);
    expect(body).toHaveProperty('data');
    
    // Verify stats structure
    const data = body.data;
    expect(data).toHaveProperty('current_mode');
    expect(data).toHaveProperty('switch_count');
    expect(data).toHaveProperty('last_switch_time');
    
    // Verify mode is valid
    expect(['original', 'optimized', 'auto']).toContain(data.current_mode);
    expect(typeof data.switch_count).toBe('number');
  });

  test('[P1] GET /api/quality/metrics - should handle authentication errors', async ({ request }) => {
    // GIVEN: Unauthenticated API request
    const endpoint = `${API_BASE_URL}/api/quality/metrics`;

    // WHEN: Requesting quality metrics without authentication
    const response = await request.get(endpoint);

    // THEN: Returns 401 Unauthorized
    expect(response.status()).toBe(401);
    
    const body = await response.json();
    expect(body).toHaveProperty('detail');
    expect(body.detail).toContain('authentication');
  });

  test('[P2] GET /api/quality/metrics/{metric_name}?limit={limit} - should respect limit parameter', async ({ authenticatedRequest }) => {
    // GIVEN: Authenticated API request with limit parameter
    const metricName = 'response_similarity';
    const limit = 10;
    const endpoint = `${API_BASE_URL}/api/quality/metrics/${metricName}?limit=${limit}`;

    // WHEN: Requesting metric history with limit
    const response = await authenticatedRequest.get(endpoint);

    // THEN: Returns history limited to specified count
    expect(response.status()).toBe(200);
    
    const body = await response.json();
    const data = body.data;
    
    expect(data.count).toBeLessThanOrEqual(limit);
    expect(data.history.length).toBeLessThanOrEqual(limit);
  });
});

