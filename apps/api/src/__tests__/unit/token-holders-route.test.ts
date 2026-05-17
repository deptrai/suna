import { describe, test, expect, beforeEach, mock } from 'bun:test';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { AppContext } from '../../types';

// ─── Mocks ──────────────────────────────────────────────────────────────────

let mockHasCredits = true;

mock.module('../../router/services/billing', () => ({
  checkCredits: async () => ({ hasCredits: mockHasCredits, balance: 10 }),
  deductToolCredits: async () => ({ success: true }),
}));

mock.module('../../router/services/widget-cache', () => ({
  widgetCacheKey: (...args: string[]) => args.join(':'),
  cacheGet: () => null,
  cacheGetStale: () => null,
  cacheSet: () => {},
}));

mock.module('../../config', () => ({
  config: { MORALIS_API_KEY: 'test-key' },
  getToolCost: () => 0.15,
}));

// ─── Setup ────────────────────────────────────────────────────────────────────

import { tokenHolders } from '../../router/routes/token-holders';

const MOCK_MORALIS_RESPONSE = {
  result: [
    {
      owner_address: '0xabc1230000000000000000000000000000000001',
      balance: '1000000000000000000',
      percentage_relative_to_total_supply: 10.5,
    },
  ],
};

function makeApp() {
  const app = new Hono<{ Variables: AppContext }>();
  app.use('*', async (c, next) => { c.set('accountId', 'test-account'); await next(); });
  app.onError((err, c) => {
    if (err instanceof HTTPException) return err.getResponse();
    return c.json({ error: err.message }, 500);
  });
  app.route('/', tokenHolders);
  return app;
}

describe('POST /token-holders', () => {
  beforeEach(() => {
    mockHasCredits = true;
    globalThis.fetch = mock(() =>
      Promise.resolve(
        new Response(JSON.stringify(MOCK_MORALIS_RESPONSE), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    ) as any;
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

  test('400 on invalid EVM address format', async () => {
    const app = makeApp();
    const res = await app.request('/', {
      method: 'POST',
      body: JSON.stringify({ address: 'not-an-address', chain: 'ethereum' }),
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.status).toBe(400);
  });

  test('402 on insufficient credits', async () => {
    mockHasCredits = false;
    const app = makeApp();
    const res = await app.request('/', {
      method: 'POST',
      body: JSON.stringify({ address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', chain: 'ethereum' }),
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.status).toBe(402);
  });

  test('200 success with correct shape', async () => {
    const app = makeApp();
    const res = await app.request('/', {
      method: 'POST',
      body: JSON.stringify({ address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', chain: 'ethereum' }),
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.success).toBe(true);
    expect(body.holders).toBeDefined();
    expect(body.holders).toHaveLength(1);
    expect(body.source).toBe('moralis');
  });

  test('200 with success=false on service error and no cache', async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response('Service Unavailable', { status: 503 })),
    ) as any;
    const app = makeApp();
    const res = await app.request('/', {
      method: 'POST',
      body: JSON.stringify({ address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', chain: 'ethereum' }),
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.success).toBe(false);
    expect(body.stale).toBe(false);
    expect(body.error).toContain('Moralis API error');
  });
});
