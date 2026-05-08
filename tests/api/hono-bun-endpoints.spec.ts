import { describe, test, expect } from 'bun:test';

const API_URL = process.env.API_URL || 'http://localhost:3000';

describe('Hono/Bun General Endpoints', () => {
  test('[P0] should handle successful health check', async () => {
    const response = await fetch(`${API_URL}/health`);
    const status = response.status;
    
    // Fallback if the endpoint is not yet implemented (Red phase)
    if (status === 404) {
      expect(status).toBe(200); // Will fail here
      return;
    }
    
    const body: any = await response.json().catch(() => ({}));
    expect(status).toBe(200);
    expect(body.status).toBe('ok');
    expect(body.uptime).toBeDefined();
  });

  test('[P2] should handle metric reporting', async () => {
    const response = await fetch(`${API_URL}/api/v1/metrics`, {
      method: 'POST',
      body: JSON.stringify({ cpu: 45, memory: 1024 }),
      headers: { Authorization: 'Bearer token', 'Content-Type': 'application/json' }
    });
    const status = response.status;
    
    if (status === 404) {
      expect(status).toBe(200);
      return;
    }

    const body: any = await response.json().catch(() => ({}));
    expect(status).toBe(200);
    expect(body.recorded).toBe(true);
  });
});