import { test, expect } from '@seontechnologies/playwright-utils/api-request/fixtures';

test.describe('Hono/Bun General Endpoints', () => {
  test('[P0] should handle successful health check', async ({ apiRequest }) => {
    const { status, body } = await apiRequest({
      method: 'GET',
      path: '/health'
    });

    expect(status).toBe(200);
    expect(body.status).toBe('ok');
    expect(body.uptime).toBeDefined();
  });

  test('[P2] should handle metric reporting', async ({ apiRequest }) => {
    const { status, body } = await apiRequest({
      method: 'POST',
      path: '/api/v1/metrics',
      body: {
        cpu: 45,
        memory: 1024
      },
      headers: { Authorization: 'Bearer token' }
    });

    expect(status).toBe(200);
    expect(body.recorded).toBe(true);
  });
});