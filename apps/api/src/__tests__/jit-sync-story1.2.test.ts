import { describe, test, expect, beforeEach, mock } from 'bun:test';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';

let mockFetchResult: any = null;
let mockFetchError: Error | null = null;
let mockCheckCreditsResult = { hasCredits: true };
let deductCalled = false;

mock.module('../middleware/auth', () => ({
  apiKeyAuth: async (c: any, next: any) => {
    c.set('accountId', 'test_account');
    await next();
  }
}));

mock.module('../router/services/billing', () => ({
  checkCredits: async () => mockCheckCreditsResult,
  deductToolCredits: async () => { deductCalled = true; return { success: true }; }
}));

mock.module('../router/services/defillama', () => ({
  fetchProtocolSnapshot: async () => {
    if (mockFetchError) throw mockFetchError;
    return mockFetchResult;
  }
}));

const { jitSync } = await import('../router/routes/jit-sync');
const { _clearCacheForTests } = await import('../router/services/jit-cache');

const app = new Hono();
app.onError((err, c) => {
  if (err instanceof HTTPException) return c.json({ message: err.message }, err.status);
  return c.json({ message: String(err) }, 500);
});
app.use('/*', async (c, next) => { c.set('accountId', 'test_account'); await next(); });
app.route('/jit-sync', jitSync);

describe('JIT Crypto Data Snapshot Tests', () => {
  beforeEach(() => {
    mockFetchResult = { slug: 'test', tvl_usd: 100 };
    mockFetchError = null;
    mockCheckCreditsResult = { hasCredits: true };
    deductCalled = false;
    _clearCacheForTests();
  });

  test('400 Bad Request (missing protocol_slug)', async () => {
    const res = await app.request('/jit-sync', { method: 'POST', body: JSON.stringify({}), headers: {'Content-Type': 'application/json'} });
    expect(res.status).toBe(400);
  });

  test('400 Bad Request (malformed JSON)', async () => {
    const res = await app.request('/jit-sync', { method: 'POST', body: 'invalid-json', headers: {'Content-Type': 'application/json'} });
    expect(res.status).toBe(400);
  });

  test('402 Payment Required (insufficient credits)', async () => {
    mockCheckCreditsResult = { hasCredits: false };
    const res = await app.request('/jit-sync', { method: 'POST', body: JSON.stringify({ protocol_slug: 'test' }), headers: {'Content-Type': 'application/json'} });
    expect(res.status).toBe(402);
  });

  test('200 OK (fresh data fallback logic if DeFiLlama fails but cache hit)', async () => {
    await app.request('/jit-sync', { method: 'POST', body: JSON.stringify({ protocol_slug: 'test' }), headers: {'Content-Type': 'application/json'} });
    mockFetchError = new Error('DeFiLlama down');
    const res = await app.request('/jit-sync', { method: 'POST', body: JSON.stringify({ protocol_slug: 'test' }), headers: {'Content-Type': 'application/json'} });
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.source).toBe('cache_fresh');
  });

  test('200 OK (total failure, stale: true)', async () => {
    mockFetchError = new Error('DeFiLlama down');
    const res = await app.request('/jit-sync', { method: 'POST', body: JSON.stringify({ protocol_slug: 'unknown' }), headers: {'Content-Type': 'application/json'} });
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.stale).toBe(true);
    expect(data.success).toBe(false);
  });

  test('Atomic credit deduction check (mock deductToolCredits)', async () => {
    await app.request('/jit-sync', { method: 'POST', body: JSON.stringify({ protocol_slug: 'test' }), headers: {'Content-Type': 'application/json'} });
    await new Promise(r => setTimeout(r, 50)); // Wait for queueMicrotask
    expect(deductCalled).toBe(true);
  });
});