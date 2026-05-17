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
});
