import { describe, test, expect, beforeEach, mock } from 'bun:test';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { AppContext } from '../../types';

// ─── Mocks ──────────────────────────────────────────────────────────────────

let mockHasCredits = true;
let mockFetchResult: any = null;
let mockFetchError: Error | null = null;

mock.module('../../router/services/billing', () => ({
  checkCredits: async () => ({ hasCredits: mockHasCredits, balance: 10 }),
  deductToolCredits: async () => ({ success: true }),
}));

mock.module('../../router/services/token-info', () => ({
  fetchTokenInfo: async (slug: string) => {
    if (mockFetchError) throw mockFetchError;
    return mockFetchResult ?? {
      slug,
      symbol: slug.toUpperCase(),
      name: 'Test Token',
      price_usd: 100,
      market_cap_usd: 1_000_000,
      volume_24h_usd: 50_000,
      change_24h_pct: 1.5,
      last_updated: '2026-05-10T00:00:00Z',
    };
  },
}));

mock.module('../../router/services/widget-cache', () => ({
  widgetCacheKey: (tool: string, arg: string) => `${tool}:${arg}`,
  cacheGet: () => null,
  cacheGetStale: () => null,
  cacheSet: () => {},
}));

mock.module('../../config', () => ({
  config: {},
  getToolCost: () => 0.05,
}));

// ─── Setup ────────────────────────────────────────────────────────────────────

import { tokenInfo } from '../../router/routes/token-info';

function makeApp() {
  const app = new Hono<{ Variables: AppContext }>();
  app.use('*', async (c, next) => { c.set('accountId', 'test-account'); await next(); });
  app.onError((err, c) => {
    if (err instanceof HTTPException) return err.getResponse();
    return c.json({ error: err.message }, 500);
  });
  app.route('/', tokenInfo);
  return app;
}

describe('POST /token-info', () => {
  beforeEach(() => {
    mockHasCredits = true;
    mockFetchResult = null;
    mockFetchError = null;
  });

  test('400 on malformed JSON', async () => {
    const app = makeApp();
    const res = await app.request('/', {
      method: 'POST',
      body: 'not json',
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.status).toBe(400);
  });

  test('400 when slug and address both missing', async () => {
    const app = makeApp();
    const res = await app.request('/', {
      method: 'POST',
      body: JSON.stringify({}),
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.status).toBe(400);
  });

  test('402 on insufficient credits', async () => {
    mockHasCredits = false;
    const app = makeApp();
    const res = await app.request('/', {
      method: 'POST',
      body: JSON.stringify({ slug: 'ethereum' }),
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.status).toBe(402);
  });

  test('200 success with correct shape', async () => {
    const app = makeApp();
    const res = await app.request('/', {
      method: 'POST',
      body: JSON.stringify({ slug: 'ethereum' }),
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.success).toBe(true);
    expect(body.slug).toBe('ethereum');
    expect(body.price_usd).toBeDefined();
  });

  test('200 with success=false on service error + no cache (stale=false: no data exists)', async () => {
    mockFetchError = new Error('CoinGecko unavailable');
    const app = makeApp();
    const res = await app.request('/', {
      method: 'POST',
      body: JSON.stringify({ slug: 'ethereum' }),
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.success).toBe(false);
    // stale: false because no cached data exists — `stale: true` would mislead clients
    // into thinking they got cached data when they got nothing.
    expect(body.stale).toBe(false);
    expect(body.error).toContain('CoinGecko unavailable');
  });
});
