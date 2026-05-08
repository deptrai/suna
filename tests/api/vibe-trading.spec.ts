import { describe, test, expect } from 'bun:test';

const API_URL = process.env.API_URL || 'http://localhost:3000';

describe('Vibe Trading API Tests', () => {
  test('[P0] should handle successful trade execution', async () => {
    const response = await fetch(`${API_URL}/api/v1/trading/execute`, {
      method: 'POST',
      body: JSON.stringify({ assetId: 'vibe-123', amount: 100, action: 'buy' }),
      headers: { Authorization: 'Bearer token', 'Content-Type': 'application/json' }
    });
    const status = response.status;
    
    if (status === 404) {
      expect(status).toBe(200);
      return;
    }

    const body: any = await response.json().catch(() => ({}));
    expect(status).toBe(200);
    expect(body.transactionId).toBeDefined();
    expect(body.status).toBe('completed');
  });

  test('[P1] should handle insufficient funds error', async () => {
    const response = await fetch(`${API_URL}/api/v1/trading/execute`, {
      method: 'POST',
      body: JSON.stringify({ assetId: 'vibe-123', amount: 9999999, action: 'buy' }),
      headers: { Authorization: 'Bearer token', 'Content-Type': 'application/json' }
    });
    const status = response.status;
    
    if (status === 404) {
      // Just assert the endpoint is missing
    }

    const body: any = await response.json().catch(() => ({}));
    expect(status).toBe(400);
    expect(body.code).toBe('INSUFFICIENT_FUNDS');
  });
});