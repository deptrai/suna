import { describe, test, expect, mock, beforeEach } from 'bun:test';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { AppContext } from '../../types';

// ─── DB mock ──────────────────────────────────────────────────────────────────

type DbScenario = 'wallet_hit' | 'token_hit' | 'miss';
let _scenario: DbScenario = 'miss';

const walletRow = {
  id: '1', chain: 'ethereum', address: '0xd8da6bf26964af9d7eed9e03e53415d37aa96045',
  entityId: 'binance', entityName: 'Binance', entityType: 'cex',
  tags: ['exchange'], riskCategory: 'cex', riskScore: 20, source: 'arkham',
  fetchedAt: new Date('2026-01-01T00:00:00.000Z'), updatedAt: new Date(),
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
          limit: async () => {
            if (_scenario === 'wallet_hit') return [walletRow];
            if (_scenario === 'token_hit') return [tokenRiskRow];
            return [];
          },
        }),
      }),
    }),
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

// ─── Widget cache mock (always miss) ─────────────────────────────────────────

mock.module('../../router/services/widget-cache', () => ({
  widgetCacheKey: (...parts: string[]) => parts.join(':'),
  cacheGet: () => null,
  cacheGetStale: () => null,
  cacheSet: () => undefined,
}));

// ─── Billing mock ─────────────────────────────────────────────────────────────

let _hasCredits = true;
const deductCalls: Array<{ accountId: string; tool: string }> = [];

mock.module('../../router/services/billing', () => ({
  checkCredits: async () => ({ hasCredits: _hasCredits, balance: 100 }),
  deductToolCredits: async (accountId: string, tool: string) => {
    deductCalls.push({ accountId, tool });
  },
}));

// ─── Config mock ──────────────────────────────────────────────────────────────

const mockConfig = {
  ARKHAM_WORKER_ENABLED: true,
  ARKHAM_API_KEY: 'test-key',
};

mock.module('../../config', () => ({
  config: mockConfig,
  getToolCost: () => 0.05,
}));

// ─── Queue mock ───────────────────────────────────────────────────────────────

const addCalls: Array<unknown[]> = [];

mock.module('../../queue', () => ({
  getEntityWalletQueue: () => ({
    add: async (...args: unknown[]) => {
      addCalls.push(args);
      return { id: 'int-job' };
    },
  }),
}));

mock.module('bullmq', () => ({
  Queue: class { add = async () => ({ id: 'x' }); close = async () => undefined; },
  Worker: class { on() { return this; } close = async () => undefined; },
}));
mock.module('../../queue/bullmq/connection', () => ({
  redisConnection: { on: () => undefined, quit: async () => undefined },
}));

mock.module('../../lib/logger', () => ({
  logger: { info: () => undefined, warn: () => undefined, error: () => undefined },
}));

// ─── Route under test ─────────────────────────────────────────────────────────

import { entityWalletRisk } from '../../router/routes/entity-wallet-risk';

function makeApp(accountId: string | null = 'acct-test') {
  const app = new Hono<{ Variables: AppContext }>();
  app.use('*', async (c, next) => {
    if (!accountId) throw new HTTPException(401, { message: 'Unauthenticated' });
    c.set('accountId', accountId);
    await next();
  });
  app.route('/v1/router/entity-wallet-risk', entityWalletRisk);
  app.onError((err, c) => {
    if (err instanceof HTTPException) return err.getResponse();
    return c.json({ success: false, error: String(err) }, 500);
  });
  return app;
}

const WALLET = '0xd8da6bf26964af9d7eed9e03e53415d37aa96045';
const TOKEN = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';

function post(app: ReturnType<typeof makeApp>, body: Record<string, unknown>) {
  return app.request('/v1/router/entity-wallet-risk', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  _scenario = 'miss';
  _hasCredits = true;
  mockConfig.ARKHAM_WORKER_ENABLED = true;
  mockConfig.ARKHAM_API_KEY = 'test-key';
  addCalls.length = 0;
  deductCalls.length = 0;
});

describe('POST /v1/router/entity-wallet-risk', () => {
  test('[P0] returns 401 for unauthenticated request before billing', async () => {
    const app = makeApp(null);
    const res = await post(app, { mode: 'wallet', chain: 'ethereum', address: WALLET });
    expect(res.status).toBe(401);
    expect(deductCalls).toHaveLength(0);
  });

  test('[P0] returns 402 when account has no credits', async () => {
    _hasCredits = false;
    const app = makeApp();
    const res = await post(app, { mode: 'wallet', chain: 'ethereum', address: WALLET });
    expect(res.status).toBe(402);
    expect(deductCalls).toHaveLength(0);
  });

  test('[P0] wallet DB hit — returns entity, deducts credits, no raw_response', async () => {
    _scenario = 'wallet_hit';
    const app = makeApp();
    const res = await post(app, { mode: 'wallet', chain: 'ethereum', address: WALLET });
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.success).toBe(true);
    expect(body.source).toBe('db');
    expect(body.cache_status).toBe('db_hit');
    expect(body.entities).toHaveLength(1);
    expect(body.entities[0].entity_name).toBe('Binance');
    // AC: raw_response must not be exposed
    expect(body.raw_response).toBeUndefined();
    expect(deductCalls).toHaveLength(1);
    expect(deductCalls[0].accountId).toBe('acct-test');
    expect(deductCalls[0].tool).toBe('entity_wallet_risk');
  });

  test('[P0] token_holders DB hit — returns risk shape, deducts credits, no raw_response', async () => {
    _scenario = 'token_hit';
    const app = makeApp();
    const res = await post(app, { mode: 'token_holders', chain: 'ethereum', token_address: TOKEN });
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.success).toBe(true);
    expect(body.source).toBe('db');
    expect(body.cache_status).toBe('db_hit');
    expect(body.risk_level).toBe('medium');
    expect(Array.isArray(body.risk_factors)).toBe(true);
    expect(body.risk_factors[0].code).toBe('CEX_CONCENTRATION');
    expect(body.holder_count).toBe(1000);
    expect(body.raw_response).toBeUndefined();
    expect(deductCalls).toHaveLength(1);
  });

  test('[P0] token_holders miss — enqueues job and returns pending', async () => {
    _scenario = 'miss';
    const app = makeApp();
    const res = await post(app, { mode: 'token_holders', chain: 'ethereum', token_address: TOKEN });
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.success).toBe(true);
    expect(body.cache_status).toBe('pending');
    expect(addCalls).toHaveLength(1);
    expect(addCalls[0][0]).toBe('analyze-token-holders');
    expect((addCalls[0][1] as any).tokenAddress).toBe(TOKEN.toLowerCase());
  });

  test('[P0] wallet miss — returns pending, does NOT enqueue job', async () => {
    _scenario = 'miss';
    const app = makeApp();
    const res = await post(app, { mode: 'wallet', chain: 'ethereum', address: WALLET });
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.cache_status).toBe('pending');
    expect(addCalls).toHaveLength(0);
  });

  test('[P0] worker disabled — returns unconfigured without enqueuing', async () => {
    mockConfig.ARKHAM_WORKER_ENABLED = false;
    mockConfig.ARKHAM_API_KEY = '';
    const app = makeApp();
    const res = await post(app, { mode: 'token_holders', chain: 'ethereum', token_address: TOKEN });
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.success).toBe(true);
    expect(body.cache_status).toBe('unconfigured');
    expect(body.unconfigured).toBe(true);
    expect(addCalls).toHaveLength(0);
  });

  test('[P0] 400 for invalid JSON body', async () => {
    const app = makeApp();
    const res = await app.request('/v1/router/entity-wallet-risk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not-json',
    });
    expect(res.status).toBe(400);
  });

  test('[P0] 400 for wallet mode without address', async () => {
    const app = makeApp();
    const res = await post(app, { mode: 'wallet', chain: 'ethereum' });
    expect(res.status).toBe(400);
  });

  test('[P0] 400 for invalid EVM address', async () => {
    const app = makeApp();
    const res = await post(app, { mode: 'wallet', chain: 'ethereum', address: 'not-an-address' });
    expect(res.status).toBe(400);
  });

  test('[P1] response does not contain raw_response on any path', async () => {
    const app = makeApp();
    for (const scenario of ['miss', 'wallet_hit', 'token_hit'] as DbScenario[]) {
      _scenario = scenario;
      const isTokenHit = scenario === 'token_hit';
      const res = await post(app, isTokenHit
        ? { mode: 'token_holders', chain: 'ethereum', token_address: TOKEN }
        : { mode: 'wallet', chain: 'ethereum', address: WALLET },
      );
      const body = await res.json() as any;
      expect(body.raw_response).toBeUndefined();
    }
  });
});
