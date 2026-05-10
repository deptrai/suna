import { describe, test, expect, mock, beforeEach } from 'bun:test';
import { Hono } from 'hono';

const MOCK_OHLCV: [number, number, number, number, number][] = [
  [1700000000000, 35000.5, 35200.1, 34800.0, 35100.7],
  [1700014400000, 35100.7, 35500.0, 35000.0, 35400.2],
];

// Mock config early
mock.module('../../config', () => ({
  config: {
    COINGECKO_API_URL: 'https://api.coingecko.com/api/v3',
    COINGECKO_API_KEY: '',
    EPSILON_BILLING_INTERNAL_ENABLED: false,
  },
  getToolCost: () => 0,
}));

// Mock billing
mock.module('../../router/services/billing', () => ({
  checkCredits: mock(async () => ({ hasCredits: true, balance: 100 })),
  deductToolCredits: mock(async () => {}),
}));

// Mock widget-cache
const cacheStore = new Map<string, any>();
mock.module('../../router/services/widget-cache', () => ({
  widgetCacheKey: (...args: string[]) => args.join(':'),
  cacheGet: mock((key: string) => {
    const val = cacheStore.get(key);
    return val ? { data: val } : null;
  }),
  cacheGetStale: mock(() => null),
  cacheSet: mock((key: string, data: any) => { cacheStore.set(key, data); }),
}));

// Mock the OHLCV service
const mockFetchTokenOhlcv = mock(async () => ({
  items: MOCK_OHLCV.map(([ts_ms, open, high, low, close]) => ({
    time: Math.floor(ts_ms / 1000),
    open, high, low, close,
  })),
  days: 30,
  source: 'coingecko',
  last_updated: new Date().toISOString(),
}));

mock.module('../../router/services/token-ohlcv', () => ({
  fetchTokenOhlcv: mockFetchTokenOhlcv,
  VALID_DAYS: [1, 7, 14, 30, 90, 180],
}));

import { tokenOhlcv } from '../../router/routes/token-ohlcv';
import { _clearWidgetCacheForTests } from '../../router/services/widget-cache';

function buildApp() {
  const app = new Hono<any>();
  app.use('*', async (c, next) => {
    c.set('accountId', 'test-account');
    await next();
  });
  app.route('/token-ohlcv', tokenOhlcv);
  return app;
}

describe('POST /token-ohlcv', () => {
  let app: Hono<any>;

  beforeEach(() => {
    app = buildApp();
    cacheStore.clear();
    mockFetchTokenOhlcv.mockClear();
  });

  test('200 happy path — returns items array with correct shape and live cache_status', async () => {
    const res = await app.request('/token-ohlcv', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address: '0x1f9840a85d5af5bf1d1762f925bdaddc4201f984', chain: 'ethereum', days: 30 }),
    });

    expect(res.status).toBe(200);
    expect(res.headers.get('X-Cache-Status')).toBe('fresh');
    const body = await res.json() as any;
    expect(body.success).toBe(true);
    expect(body.cache_status).toBe('live');
    expect(body.stale).toBe(false);
    expect(Array.isArray(body.items)).toBe(true);
    expect(body.items.length).toBe(2);
    expect(typeof body.items[0].time).toBe('number');
    expect(typeof body.items[0].open).toBe('number');
    expect(body.source).toBe('coingecko');
    expect(body.days).toBe(30);
  });

  test('400 — invalid days value (5 not in enum)', async () => {
    const res = await app.request('/token-ohlcv', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug: 'uniswap', days: 5 }),
    });

    expect(res.status).toBe(400);
  });

  test('400 — invalid days value (-1 negative)', async () => {
    const res = await app.request('/token-ohlcv', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug: 'uniswap', days: -1 }),
    });
    expect(res.status).toBe(400);
  });

  test('400 — invalid days value (100 out of enum)', async () => {
    const res = await app.request('/token-ohlcv', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug: 'uniswap', days: 100 }),
    });
    expect(res.status).toBe(400);
  });

  test('400 — address fails EVM regex', async () => {
    const res = await app.request('/token-ohlcv', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address: '../../etc/passwd', chain: 'ethereum', days: 30 }),
    });
    expect(res.status).toBe(400);
  });

  test('400 — chain provided with slug input (slug does not require chain)', async () => {
    const res = await app.request('/token-ohlcv', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug: 'uniswap', chain: 'ethereum', days: 30 }),
    });
    expect(res.status).toBe(400);
  });

  test('400 — missing both slug and address', async () => {
    const res = await app.request('/token-ohlcv', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chain: 'ethereum', days: 30 }),
    });

    expect(res.status).toBe(400);
  });

  test('402 — insufficient credits', async () => {
    const { checkCredits } = await import('../../router/services/billing');
    (checkCredits as any).mockImplementationOnce(async () => ({ hasCredits: false, balance: 0 }));

    const res = await app.request('/token-ohlcv', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug: 'uniswap', days: 30 }),
    });

    expect(res.status).toBe(402);
  });

  test('Cache HIT — skips upstream fetch on second call, body cache_status=cache_fresh, X-Cache-Status=hit', async () => {
    const req = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug: 'uniswap', days: 30 }),
    };

    // First call — populates cache
    const res1 = await app.request('/token-ohlcv', req);
    expect(res1.status).toBe(200);
    const callsAfterFirst = mockFetchTokenOhlcv.mock.calls.length;

    // Second call — should hit cache
    const res2 = await app.request('/token-ohlcv', req);
    expect(res2.status).toBe(200);
    expect(res2.headers.get('X-Cache-Status')).toBe('hit');
    const body2 = await res2.json() as any;
    expect(body2.cache_status).toBe('cache_fresh');
    expect(body2.stale).toBe(false);
    // fetchTokenOhlcv should NOT have been called again
    expect(mockFetchTokenOhlcv.mock.calls.length).toBe(callsAfterFirst);
  });

  test('Stale fallback — upstream throws but stale cache available, body stale=true, X-Cache-Status=stale-fallback', async () => {
    const { cacheGetStale } = await import('../../router/services/widget-cache');
    const staleSnapshot = {
      items: MOCK_OHLCV.map(([ts_ms, open, high, low, close]) => ({
        time: Math.floor(ts_ms / 1000),
        open, high, low, close,
      })),
      days: 30,
      source: 'coingecko',
      last_updated: new Date(Date.now() - 60_000).toISOString(),
    };
    (cacheGetStale as any).mockImplementationOnce(() => ({ data: staleSnapshot }));
    mockFetchTokenOhlcv.mockImplementationOnce(async () => {
      throw new Error('CoinGecko rate-limited');
    });

    const res = await app.request('/token-ohlcv', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug: 'uniswap', days: 30 }),
    });

    expect(res.status).toBe(200);
    expect(res.headers.get('X-Cache-Status')).toBe('stale-fallback');
    const body = await res.json() as any;
    expect(body.success).toBe(true);
    expect(body.stale).toBe(true);
    expect(body.cache_status).toBe('cache_stale');
    expect(body.items).toHaveLength(2);
  });

  test('Upstream failure with no stale cache → success:false response', async () => {
    mockFetchTokenOhlcv.mockImplementationOnce(async () => {
      throw new Error('token not indexed on CoinGecko');
    });

    const res = await app.request('/token-ohlcv', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug: 'unknowntoken', days: 30 }),
    });

    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.success).toBe(false);
    expect(body.error).toContain('not indexed');
  });
});
