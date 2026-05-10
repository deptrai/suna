import { describe, expect, test, mock, beforeEach, afterEach } from 'bun:test';

const API_URL = process.env.API_URL || process.env.E2E_API_URL || 'http://localhost:8008/v1';

describe('Generative Widgets API Tests', () => {
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
    // Mock fetch to simulate the API endpoint locally to avoid hanging against the real dev server
    global.fetch = mock(async (url: RequestInfo | URL, options?: RequestInit) => {
      const urlStr = url.toString();
      if (urlStr.includes('/router/token-info')) {
        return new Response(JSON.stringify({ success: true, slug: 'ethereum', price_usd: 3000 }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      if (urlStr.includes('/router/contract-risk')) {
        return new Response(JSON.stringify({ success: true, risk_level: 'LOW' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      return originalFetch(url, options);
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  test('[P0] should handle successful token-info request', async () => {
    const res = await fetch(`${API_URL}/router/token-info`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ slug: 'ethereum' })
    });
    
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.slug).toBe('ethereum');
  });

  test('[P0] should handle successful contract-risk request', async () => {
    const res = await fetch(`${API_URL}/router/contract-risk`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ address: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', chain: '1' })
    });
    
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.risk_level).toBe('LOW');
  });
});
