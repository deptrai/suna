import { describe, test, expect, mock, beforeEach } from 'bun:test';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { AppContext } from '../../types';

// ─── DB mock ─────────────────────────────────────────────────────────────────

type DbScenario = 'wallet_hit' | 'token_hit' | 'miss';
let _dbScenario: DbScenario = 'miss';

const walletRow = {
  id: '1', chain: 'ethereum', address: '0xd8da6bf26964af9d7eed9e03e53415d37aa96045',
  entityId: 'binance', entityName: 'Binance', entityType: 'cex',
  tags: ['exchange'], riskCategory: 'cex', riskScore: 20, source: 'arkham',
  fetchedAt: new Date(), updatedAt: new Date(),
};
const tokenRiskRow = {
  id: '2', chain: 'ethereum', tokenAddress: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
  holderCount: 1000, labeledHolderCount: 50, riskyHolderCount: 2,
  topEntities: [{ address: '0xabc', entityName: 'Binance', riskCategory: 'cex' }],
  riskFactors: [{ code: 'CEX_CONCENTRATION', label: 'High CEX concentration', severity: 'medium', evidence: '3 CEX wallets' }],
  riskScore: 20, riskLevel: 'medium', source: 'arkham', analysisStatus: 'complete',
  fetchedAt: new Date(), updatedAt: new Date(),
};

mock.module('../../shared/db', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async (n: number) => {
            if (_dbScenario === 'wallet_hit') return [walletRow];
            if (_dbScenario === 'token_hit') return [tokenRiskRow];
            return [];
          },
        }),
      }),
    }),
    insert: () => ({ values: () => ({ onConflictDoUpdate: async () => undefined }) }),
  },
}));

mock.module('@epsilon/db', () => ({
  entityWalletLabels: { chain: 'chain', address: 'address', source: 'source' },
  tokenHolderEntityRisks: { chain: 'chain', tokenAddress: 'tokenAddress', source: 'source' },
}));

mock.module('drizzle-orm', () => ({
  eq: (col: unknown, val: unknown) => ({ col, val, op: 'eq' }),
  and: (...args: unknown[]) => ({ args, op: 'and' }),
}));

mock.module('../../router/services/widget-cache', () => ({
  widgetCacheKey: (...parts: string[]) => parts.join(':'),
  cacheGet: () => null,
  cacheGetStale: () => null,
  cacheSet: () => undefined,
}));

let _hasCredits = true;
mock.module('../../router/services/billing', () => ({
  checkCredits: async () => ({ hasCredits: _hasCredits }),
  deductToolCredits: async () => undefined,
}));

const mockConfig = {
  ARKHAM_WORKER_ENABLED: true,
  ARKHAM_API_KEY: 'test-key',
  DUNE_API_KEY: '',
  DUNE_TOKEN_HOLDERS_QUERY_ID: '',
};

mock.module('../../config', () => ({
  config: mockConfig,
  getToolCost: () => 0.05,
}));

const mockAddCalls: Array<unknown[]> = [];
mock.module('bullmq', () => ({
  Queue: class RouteFakeQueue {
    add = async (...args: unknown[]) => { mockAddCalls.push(args); return { id: 'route-job' }; };
    upsertJobScheduler = async () => undefined;
    close = async () => undefined;
  },
  Worker: class RouteFakeWorker {
    on() { return this; }
    close = async () => undefined;
  },
}));
mock.module('../../queue', () => ({
  getEntityWalletQueue: () => ({
    add: async (...args: unknown[]) => { mockAddCalls.push(args); return { id: 'route-job' }; },
  }),
}));

mock.module('../../lib/logger', () => ({
  logger: { info: () => undefined, warn: () => undefined, error: () => undefined },
}));

import { entityWalletRisk } from '../../router/routes/entity-wallet-risk';

function makeApp(accountId: string | null = 'test-account') {
  const app = new Hono<{ Variables: AppContext }>();
  app.use('*', async (c, next) => {
    if (accountId) c.set('accountId', accountId);
    else throw new HTTPException(401, { message: 'Unauthenticated' });
    await next();
  });
  app.route('/', entityWalletRisk);
  app.onError((err, c) => {
    if (err instanceof HTTPException) return err.getResponse();
    return c.json({ success: false, error: String(err) }, 500);
  });
  return app;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('POST /entity-wallet-risk', () => {
  beforeEach(() => {
    _dbScenario = 'miss';
    _hasCredits = true;
    mockAddCalls.length = 0;
    mockConfig.ARKHAM_WORKER_ENABLED = true;
    mockConfig.ARKHAM_API_KEY = 'test-key';
    mockConfig.DUNE_API_KEY = '';
    mockConfig.DUNE_TOKEN_HOLDERS_QUERY_ID = '';
  });

  test('[P0] returns 400 for invalid JSON', async () => {
    const app = makeApp();
    const res = await app.request('/', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: 'not-json' });
    expect(res.status).toBe(400);
  });

  test('[P0] returns 400 for wallet mode without address', async () => {
    const app = makeApp();
    const res = await app.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'wallet', chain: 'ethereum' }),
    });
    expect(res.status).toBe(400);
  });

  test('[P0] returns 400 for invalid EVM address', async () => {
    const app = makeApp();
    const res = await app.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'wallet', chain: 'ethereum', address: 'not-an-address' }),
    });
    expect(res.status).toBe(400);
  });

  test('[P0] returns 402 when account has no credits', async () => {
    _hasCredits = false;
    const app = makeApp();
    const res = await app.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'wallet', chain: 'ethereum', address: '0xd8da6bf26964af9d7eed9e03e53415d37aa96045' }),
    });
    expect(res.status).toBe(402);
  });

  test('[P0] returns DB hit for known wallet', async () => {
    _dbScenario = 'wallet_hit';
    const app = makeApp();
    const res = await app.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'wallet', chain: 'ethereum', address: '0xd8da6bf26964af9d7eed9e03e53415d37aa96045' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.success).toBe(true);
    expect(body.source).toBe('db');
    expect(body.cache_status).toBe('db_hit');
    expect(body.entities).toHaveLength(1);
    expect(body.entities[0].entity_name).toBe('Binance');
    // P8: risk_level must be RiskLevel enum, not riskCategory string
    expect(body.risk_level).toBe('low'); // walletRow.riskScore=20 → riskScoreToLevel(20) → 'low'
  });

  test('[P0] returns DB hit for known token holders', async () => {
    _dbScenario = 'token_hit';
    const app = makeApp();
    const res = await app.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'token_holders', chain: 'ethereum', token_address: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.success).toBe(true);
    expect(body.source).toBe('db');
    expect(body.risk_level).toBe('medium');
    expect(Array.isArray(body.risk_factors)).toBe(true);
  });

  test('[P0] enqueues job and returns pending when DB miss for token_holders', async () => {
    _dbScenario = 'miss';
    const app = makeApp();
    const res = await app.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'token_holders', chain: 'ethereum', token_address: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.success).toBe(true);
    expect(body.cache_status).toBe('pending');
    expect(mockAddCalls).toHaveLength(1);
    expect(mockAddCalls[0][0]).toBe('analyze-token-holders');
  });

  test('[P14] returns unconfigured when worker disabled and no provider keys', async () => {
    mockConfig.ARKHAM_WORKER_ENABLED = false;
    mockConfig.ARKHAM_API_KEY = '';
    _dbScenario = 'miss';
    const app = makeApp();
    const res = await app.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'token_holders', chain: 'ethereum', token_address: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.success).toBe(true);
    expect(body.cache_status).toBe('unconfigured');
    expect(body.unconfigured).toBe(true);
    expect(mockAddCalls).toHaveLength(0);
  });

  test('[P0] returns 401 for unauthenticated request', async () => {
    const app = makeApp(null);
    const res = await app.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'wallet', chain: 'ethereum', address: '0xd8da6bf26964af9d7eed9e03e53415d37aa96045' }),
    });
    expect(res.status).toBe(401);
  });
});
