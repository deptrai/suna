import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { AppContext } from '../../types';

let hasCredits = true;
let billed = 0;
let cacheStatus: 'cache_fresh' | 'live' = 'cache_fresh';

mock.module('../../router/services/billing', () => ({
  checkCredits: async () => ({ hasCredits }),
  deductToolCredits: async () => { billed += 1; },
}));

mock.module('../../config', () => ({
  getToolCost: () => 0.1,
}));

mock.module('../../router/services/onchain-fact-check', () => ({
  cacheFirstOnchainFactCheck: async () => ({
    cacheStatus,
    result: {
      status: 'passed',
      riskLevel: 'none',
      riskFactors: [],
      netOutflowPct: null,
      largestWalletOutflowPct: null,
      walletsChecked: 1,
      transferCount: 2,
      source: 'quicknode',
      checkedAt: new Date().toISOString(),
      evidence: {},
    },
  }),
}));

mock.module('../../lib/logger', () => ({
  logger: { warn: () => undefined, info: () => undefined, error: () => undefined },
}));

import { onchainFactCheck } from '../../router/routes/onchain-fact-check';

function makeApp() {
  const app = new Hono<{ Variables: AppContext }>();
  app.use('*', async (c, next) => {
    c.set('accountId', 'acct');
    await next();
  });
  app.route('/', onchainFactCheck);
  app.onError((err, c) => {
    if (err instanceof HTTPException) return err.getResponse();
    return c.json({ error: String(err) }, 500);
  });
  return app;
}

describe('onchain-fact-check route', () => {
  beforeEach(() => {
    hasCredits = true;
    billed = 0;
    cacheStatus = 'cache_fresh';
  });

  test('[P0] cache-first returns cost 0', async () => {
    const app = makeApp();
    const res = await app.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chain: 'ethereum', token_address: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.cache_status).toBe('cache_fresh');
    expect(body.cost).toBe(0);
    expect(billed).toBe(0);
  });

  test('[P0] force_refresh checks credits and bills', async () => {
    cacheStatus = 'live';
    const app = makeApp();
    const res = await app.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chain: 'ethereum',
        token_address: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
        force_refresh: true,
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.cache_status).toBe('live');
    expect(body.cost).toBeGreaterThan(0);
    expect(billed).toBe(1);
  });

  test('[P0] force_refresh without credits => 402', async () => {
    hasCredits = false;
    const app = makeApp();
    const res = await app.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chain: 'ethereum',
        token_address: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
        force_refresh: true,
      }),
    });
    expect(res.status).toBe(402);
  });

  test('[P0] missing token_address => 400', async () => {
    const app = makeApp();
    const res = await app.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chain: 'ethereum' }),
    });
    expect(res.status).toBe(400);
  });

  test('[P0] invalid token_address format (not 0x hex40) => 400', async () => {
    const app = makeApp();
    const res = await app.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chain: 'ethereum', token_address: 'not-an-address' }),
    });
    expect(res.status).toBe(400);
  });

  test('[P0] malformed JSON body => 400', async () => {
    const app = makeApp();
    const res = await app.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{invalid-json',
    });
    expect(res.status).toBe(400);
  });

  test('[P1] valid body with all optional fields => 200', async () => {
    const app = makeApp();
    const res = await app.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chain: 'base',
        token_address: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
        token_symbol: 'USDC',
        discover_feed_id: '00000000-0000-0000-0000-000000000001',
        article_title: 'Partnership announced',
        article_sentiment: 'positive',
        force_refresh: false,
        session_id: 'sess-abc123',
      }),
    });
    expect(res.status).toBe(200);
  });

  test('[P1] invalid article_sentiment enum value => 400', async () => {
    const app = makeApp();
    const res = await app.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chain: 'ethereum',
        token_address: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
        article_sentiment: 'bullish', // invalid enum
      }),
    });
    expect(res.status).toBe(400);
  });

  test('[P2] session_id with invalid characters => 400', async () => {
    const app = makeApp();
    const res = await app.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chain: 'ethereum',
        token_address: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
        session_id: 'invalid session id!',
      }),
    });
    expect(res.status).toBe(400);
  });
});
