import { describe, test, expect, mock, beforeEach, afterEach } from 'bun:test';
import { Hono } from 'hono';
import type { AppContext } from '../../types';

// ─── DB mock ──────────────────────────────────────────────────────────────────

type DbScenario = 'tgm_hit' | 'netflow_hit' | 'miss';
let _dbScenario: DbScenario = 'miss';
let _deductCalled = false;
let _hasCredits = true;
let _nansenEnabled = false;

const fakeTgmRow = {
  id: '1', chain: 'ethereum', tokenAddress: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
  tokenSymbol: 'USDC', source: 'nansen',
  summary: { risk_level: 'low', signal: 'bullish', smart_money_net_flow_usd: 50000, exchange_net_flow_usd: -10000, top_buyer_count: 5, top_seller_count: 2, risk_factors: [] },
  topBuyers: [{ wallet_address: '0x1', bought_volume_usd: 10000 }],
  topSellers: [],
  smartMoneyFlows: { rows: [] },
  exchangeFlows: { rows: [] },
  status: 'complete',
  fetchedAt: new Date(),
  cacheExpiresAt: new Date(Date.now() + 300_000),
  updatedAt: new Date(),
};

const fakeNetflowRow = {
  id: '2', chain: 'ethereum', tokenAddress: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
  tokenSymbol: 'USDC', metricType: 'netflow', timeWindow: '1h', source: 'nansen',
  netFlowUsd: '50000',
  flowBreakdown: {},
  riskFactors: [],
  fetchedAt: new Date(),
  cacheExpiresAt: new Date(Date.now() + 300_000),
  updatedAt: new Date(),
};

mock.module('../../shared/db', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => {
            if (_dbScenario === 'tgm_hit') return [fakeTgmRow];
            if (_dbScenario === 'netflow_hit') return [fakeNetflowRow];
            return [];
          },
        }),
      }),
    }),
    insert: () => ({ values: () => ({ onConflictDoUpdate: () => ({ catch: async () => undefined }) }) }),
  },
}));

mock.module('@epsilon/db', () => ({
  nansenSmartMoneyFlows: {
    chain: 'chain', tokenAddress: 'tokenAddress', metricType: 'metricType',
    timeWindow: 'timeWindow', source: 'source', cacheExpiresAt: 'cacheExpiresAt',
  },
  nansenTokenGodModeCache: {
    chain: 'chain', tokenAddress: 'tokenAddress', source: 'source', cacheExpiresAt: 'cacheExpiresAt',
  },
}));

mock.module('drizzle-orm', () => ({
  eq: (col: unknown, val: unknown) => ({ col, val, op: 'eq' }),
  and: (...args: unknown[]) => ({ args, op: 'and' }),
  gt: (col: unknown, val: unknown) => ({ col, val, op: 'gt' }),
  lte: (col: unknown, val: unknown) => ({ col, val, op: 'lte' }),
}));

mock.module('../../router/services/billing', () => ({
  checkCredits: async () => ({ hasCredits: _hasCredits }),
  deductToolCredits: async () => { _deductCalled = true; },
}));

mock.module('../../config', () => ({
  config: {
    get NANSEN_SMART_MONEY_WORKER_ENABLED() { return _nansenEnabled; },
    NANSEN_SMART_MONEY_MAX_LIVE_CALLS_PER_REQUEST: 4,
    NANSEN_SMART_MONEY_CACHE_TTL_MS: 300_000,
  },
  getToolCost: () => 0.20,
}));

mock.module('../../lib/logger', () => ({
  logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
}));

// Mock nansen service — default: throws NansenRateLimitError
let _nansenShouldFail: 'rate_limit' | 'payment' | null = 'rate_limit';
let _nansenCallCount = 0;

mock.module('../../router/services/nansen', () => ({
  canCallNansen: () => _nansenEnabled,
  isChainSupported: () => true,
  NansenRateLimitError: class NansenRateLimitError extends Error {
    constructor() { super('rate limited'); this.name = 'NansenRateLimitError'; }
  },
  NansenPaymentRequiredError: class NansenPaymentRequiredError extends Error {
    constructor() { super('payment required'); this.name = 'NansenPaymentRequiredError'; }
  },
  NansenForbiddenError: class NansenForbiddenError extends Error {
    constructor() { super('forbidden'); this.name = 'NansenForbiddenError'; }
  },
  NansenUnsupportedChainError: class NansenUnsupportedChainError extends Error {
    constructor(public chain: string) { super(`unsupported: ${chain}`); this.name = 'NansenUnsupportedChainError'; }
  },
  fetchSmartMoneyNetflow: async () => { _nansenCallCount++; return { data: [{ netflowUsd: '5000' }] }; },
  fetchTgmWhoBoughtSold: async () => { _nansenCallCount++; return { data: [] }; },
  fetchTgmFlows: async () => { _nansenCallCount++; return { data: [] }; },
}));

mock.module('../../queue/bullmq/workers/nansen-smart-money-worker', () => ({
  getNansenSmartMoneyQueue: () => ({ add: async () => ({ id: 'job-1' }) }),
  JOB_REFRESH_NETFLOW: 'refresh-netflow',
  JOB_REFRESH_TGM: 'refresh-tgm',
}));

afterEach(() => {
  mock.restore();
});

import { smartMoneyFlow } from '../../router/routes/smart-money-flow';

function makeApp(accountId = 'test-account') {
  const app = new Hono<{ Variables: AppContext }>();
  app.use('*', async (c, next) => { c.set('accountId', accountId); await next(); });
  app.route('/', smartMoneyFlow);
  return app;
}

const validBody = {
  chain: 'ethereum',
  token_address: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
  mode: 'token_god_mode',
};

// ─── Cache hit tests ──────────────────────────────────────────────────────────

describe('POST /smart-money-flow — cache hit', () => {
  beforeEach(() => {
    _dbScenario = 'tgm_hit';
    _deductCalled = false;
    _hasCredits = true;
    _nansenEnabled = false;
    _nansenShouldFail = null;
    _nansenCallCount = 0;
  });

  test('[P0] returns 200 with cache_status cache_fresh', async () => {
    const app = makeApp();
    const res = await app.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validBody),
    });
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.cache_status).toBe('cache_fresh');
  });

  test('[P0] cost is 0 on cache hit', async () => {
    const app = makeApp();
    const res = await app.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validBody),
    });
    const data = await res.json() as any;
    expect(data.cost).toBe(0);
    expect(_deductCalled).toBe(false);
  });

  test('[P0] no Nansen provider call on cache hit', async () => {
    const app = makeApp();
    await app.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validBody),
    });
    expect(_nansenCallCount).toBe(0);
  });

  test('[P1] returns attribution field', async () => {
    const app = makeApp();
    const res = await app.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validBody),
    });
    const data = await res.json() as any;
    expect(data.attribution).toBe('Powered by Nansen API');
  });

  test('[P1] netflow cache hit — cache_fresh cost=0', async () => {
    _dbScenario = 'netflow_hit';
    const app = makeApp();
    const res = await app.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...validBody, mode: 'smart_money_netflow' }),
    });
    const data = await res.json() as any;
    expect(data.cache_status).toBe('cache_fresh');
    expect(data.cost).toBe(0);
  });

  test('[P0] netflow mode allows missing token_address', async () => {
    _dbScenario = 'netflow_hit';
    const app = makeApp();
    const res = await app.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chain: 'ethereum', mode: 'smart_money_netflow' }),
    });
    expect(res.status).toBe(200);
  });
});

// ─── Cache miss / queued tests ────────────────────────────────────────────────

describe('POST /smart-money-flow — queued (worker disabled)', () => {
  beforeEach(() => {
    _dbScenario = 'miss';
    _deductCalled = false;
    _hasCredits = true;
    _nansenEnabled = false;
    _nansenCallCount = 0;
  });

  test('[P0] returns queued when worker disabled and no cache', async () => {
    const app = makeApp();
    const res = await app.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validBody),
    });
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.cache_status).toBe('queued');
    expect(data.cost).toBe(0);
  });

  test('[P0] no provider call when worker disabled', async () => {
    const app = makeApp();
    await app.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validBody),
    });
    expect(_nansenCallCount).toBe(0);
  });
});

// ─── Validation tests ─────────────────────────────────────────────────────────

describe('POST /smart-money-flow — validation', () => {
  test('[P0] returns 400 for missing token_address', async () => {
    const app = makeApp();
    const res = await app.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chain: 'ethereum', mode: 'token_god_mode' }),
    });
    expect(res.status).toBe(400);
  });

  test('[P0] returns 400 for invalid mode', async () => {
    const app = makeApp();
    const res = await app.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...validBody, mode: 'whale_mode' }),
    });
    expect(res.status).toBe(400);
  });

  test('[P0] returns 400 for invalid JSON', async () => {
    const app = makeApp();
    const res = await app.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not-json',
    });
    expect(res.status).toBe(400);
  });

  test('[P0] returns 400 if lookback_hours out of range', async () => {
    const app = makeApp();
    const res = await app.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...validBody, lookback_hours: 999 }),
    });
    expect(res.status).toBe(400);
  });
});

// ─── Insufficient credits ─────────────────────────────────────────────────────

describe('POST /smart-money-flow — credits', () => {
  beforeEach(() => {
    _dbScenario = 'miss';
    _hasCredits = false;
    _nansenEnabled = true;
    _deductCalled = false;
  });

  test('[P0] returns 402 when no credits for live call', async () => {
    const app = makeApp();
    const res = await app.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...validBody, force_refresh: true }),
    });
    expect(res.status).toBe(402);
  });
});

// ─── Response shape ───────────────────────────────────────────────────────────

describe('POST /smart-money-flow — response shape', () => {
  test('[P0] returns provider=nansen in all responses', async () => {
    _dbScenario = 'tgm_hit';
    const app = makeApp();
    const res = await app.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validBody),
    });
    const data = await res.json() as any;
    expect(data.provider).toBe('nansen');
  });

  test('[P0] response does not expose NANSEN_API_KEY', async () => {
    _dbScenario = 'tgm_hit';
    const app = makeApp();
    const res = await app.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validBody),
    });
    const text = await res.text();
    expect(text).not.toContain('test-nansen-key');
    expect(text).not.toContain('NANSEN_API_KEY');
  });
});
