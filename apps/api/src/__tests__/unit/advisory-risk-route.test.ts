import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';
import { Hono } from 'hono';

let mockRisk: any = {
  risk_level: 'LOW',
  top_factors: [{ label: 'Verified contract', severity: 'low' }],
};
let riskCalls = 0;

let mockSearch: any = {
  results: [{ id: 'bitcoin', market_cap_rank: 1 }],
};
let searchDelayMs = 0;
let searchShouldThrow = false;

mock.module('../../router/services/contract-risk', () => ({
  fetchContractRisk: async () => {
    riskCalls += 1;
    return typeof mockRisk === 'function' ? await mockRisk() : mockRisk;
  },
}));

mock.module('../../router/services/token-search', () => ({
  searchTokens: async () => {
    if (searchDelayMs > 0) await new Promise((r) => setTimeout(r, searchDelayMs));
    if (searchShouldThrow) throw new Error('CoinGecko API error: 503');
    return mockSearch;
  },
}));

mock.module('../../router/services/coingecko-helpers', () => ({
  buildCoinGeckoHeaders: () => ({ Accept: 'application/json' }),
  resolveCoinIdFromAddress: async () => 'ethereum',
}));

const originalFetch = globalThis.fetch;

beforeEach(() => {
  riskCalls = 0;
  searchDelayMs = 0;
  searchShouldThrow = false;
  mockRisk = {
    risk_level: 'LOW',
    top_factors: [{ label: 'Verified contract', severity: 'low' }],
  };
  mockSearch = {
    results: [{ id: 'bitcoin', market_cap_rank: 1 }],
  };

  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;

    if (url.includes('/coins/bitcoin?')) {
      return new Response(JSON.stringify({ platforms: { ethereum: '0x1234567890123456789012345678901234567890' } }), { status: 200 });
    }

    if (url.includes('/simple/price?')) {
      return new Response(JSON.stringify({ bitcoin: { usd: 123.45, usd_24h_change: 1.23 } }), { status: 200 });
    }

    return new Response('{}', { status: 404 });
  }) as any;
});

const { advisoryApp } = await import('../../advisory');

function makeApp() {
  const app = new Hono();
  app.route('/v1/advisory', advisoryApp);
  return app;
}

describe('GET /v1/advisory/risk', () => {
  test('400 when q missing', async () => {
    const app = makeApp();
    const res = await app.request('/v1/advisory/risk', { headers: { 'x-forwarded-for': '10.0.0.1' } });
    expect(res.status).toBe(400);
  });

  test('400 when chain unsupported', async () => {
    const app = makeApp();
    const res = await app.request('/v1/advisory/risk?q=btc&chain=abc', { headers: { 'x-forwarded-for': '10.0.0.2' } });
    expect(res.status).toBe(400);
  });

  test('200 returns advisory shape for ticker', async () => {
    const app = makeApp();
    const res = await app.request('/v1/advisory/risk?q=btc', { headers: { 'x-forwarded-for': '10.0.0.3' } });
    expect(res.status).toBe(200);
    const body = await res.json() as any;

    expect(body.risk.level).toBeDefined();
    expect(body.meta.chain).toBeDefined();
    expect(body.meta.request_id).toBeDefined();
    expect(typeof body.risk.price === 'string' || body.risk.price === null).toBe(true);
  });

  test('422 for address-chain mismatch', async () => {
    const app = makeApp();
    const res = await app.request('/v1/advisory/risk?q=0x1234567890123456789012345678901234567890&chain=solana', {
      headers: { 'x-forwarded-for': '10.0.0.4' },
    });
    expect(res.status).toBe(422);
  });

  test('404 when ticker not found', async () => {
    mockSearch = { results: [] };
    const app = makeApp();
    const res = await app.request('/v1/advisory/risk?q=UNKNOWN', { headers: { 'x-forwarded-for': '10.0.0.5' } });
    expect(res.status).toBe(404);
  });

  test('429 when rate limit exceeded and no cache', async () => {
    const app = makeApp();
    const ip = '10.0.0.6';
    for (let i = 0; i < 5; i += 1) {
      await app.request(`/v1/advisory/risk?q=btc${i}`, { headers: { 'x-forwarded-for': ip } });
    }
    const res = await app.request('/v1/advisory/risk?q=btcx', { headers: { 'x-forwarded-for': ip } });
    expect(res.status).toBe(429);
    expect(res.headers.get('retry-after')).toBeTruthy();
  });

  test('allows chrome-extension origin on advisory route', async () => {
    const app = makeApp();
    const origin = 'chrome-extension://abcdefghijklmnop';
    const res = await app.request('/v1/advisory/risk?q=btc', {
      headers: { Origin: origin, 'x-forwarded-for': '10.0.0.7' },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('access-control-allow-origin')).toBe(origin);
  });

  test('503 when upstream token search is unavailable', async () => {
    searchShouldThrow = true;
    const app = makeApp();
    const res = await app.request('/v1/advisory/risk?q=zz503', { headers: { 'x-forwarded-for': '10.0.0.8' } });
    expect(res.status).toBe(503);
  });

  test('504 when advisory aggregation exceeds total timeout budget', async () => {
    searchDelayMs = 2700;
    const app = makeApp();
    const res = await app.request('/v1/advisory/risk?q=zz504', { headers: { 'x-forwarded-for': '10.0.0.9' } });
    expect(res.status).toBe(504);
  });

  test('single-flight deduplicates concurrent same-key requests', async () => {
    let release: (() => void) | null = null;
    const lock = new Promise<void>((resolve) => {
      release = resolve;
    });
    mockRisk = (async () => {
      await lock;
      return {
        risk_level: 'LOW',
        top_factors: [{ label: 'Delayed risk', severity: 'low' }],
      };
    }) as any;
    const app = makeApp();
    const p1 = app.request('/v1/advisory/risk?q=zzsf', { headers: { 'x-forwarded-for': '10.0.0.10' } });
    const p2 = app.request('/v1/advisory/risk?q=zzsf', { headers: { 'x-forwarded-for': '10.0.0.11' } });
    release?.();
    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    expect(riskCalls).toBe(1);
  });
});

afterAll(() => {
  globalThis.fetch = originalFetch;
});
