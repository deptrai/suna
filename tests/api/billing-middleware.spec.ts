import { test, expect } from '@seontechnologies/playwright-utils/api-request/fixtures';

test.describe('Billing Middleware Tests', () => {
  test('[P0] should hold funds successfully', async ({ apiRequest }) => {
    const { status, body } = await apiRequest({
      method: 'POST',
      path: '/api/v1/billing/hold',
      body: {
        userId: 'user-123',
        amount: 50,
        currency: 'USD'
      },
      headers: { Authorization: 'Bearer token' }
    });

    expect(status).toBe(200);
    expect(body.holdId).toBeDefined();
    expect(body.status).toBe('held');
  });

  test('[P0] should settle funds successfully', async ({ apiRequest }) => {
    const { status, body } = await apiRequest({
      method: 'POST',
      path: '/api/v1/billing/settle',
      body: {
        holdId: 'hold-123',
        finalAmount: 50
      },
      headers: { Authorization: 'Bearer token' }
    });

    expect(status).toBe(200);
    expect(body.status).toBe('settled');
  });

  test('[P1] should handle settling an invalid hold', async ({ apiRequest }) => {
    const { status, body } = await apiRequest({
      method: 'POST',
      path: '/api/v1/billing/settle',
      body: {
        holdId: 'invalid-hold-id',
        finalAmount: 50
      },
      headers: { Authorization: 'Bearer token' },
      retryConfig: { maxRetries: 0 }
    });

    expect(status).toBe(404);
    expect(body.code).toBe('HOLD_NOT_FOUND');
  });
});