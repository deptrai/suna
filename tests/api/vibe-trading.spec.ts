import { test, expect } from '@seontechnologies/playwright-utils/api-request/fixtures';

test.describe('Vibe Trading API Tests', () => {
  test('[P0] should handle successful trade execution', async ({ apiRequest }) => {
    const { status, body } = await apiRequest({
      method: 'POST',
      path: '/api/v1/trading/execute',
      body: {
        assetId: 'vibe-123',
        amount: 100,
        action: 'buy'
      },
      headers: { Authorization: 'Bearer token' }
    });

    expect(status).toBe(200);
    expect(body.transactionId).toBeDefined();
    expect(body.status).toBe('completed');
  });

  test('[P1] should handle insufficient funds error', async ({ apiRequest }) => {
    const { status, body } = await apiRequest({
      method: 'POST',
      path: '/api/v1/trading/execute',
      body: {
        assetId: 'vibe-123',
        amount: 9999999,
        action: 'buy'
      },
      headers: { Authorization: 'Bearer token' },
      retryConfig: { maxRetries: 0 }
    });

    expect(status).toBe(400);
    expect(body.code).toBe('INSUFFICIENT_FUNDS');
  });
});