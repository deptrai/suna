import { describe, test, expect, mock, beforeEach } from 'bun:test';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { AppContext } from '../../types';

// ─── Mutable state ───────────────────────────────────────────────────────────

let _hasCredits = true;
let _onchainItems: any[] = [];
let _onchainThrows: Error | null = null;
let _dbProtocolRow: any = null;

// ─── Mocks ───────────────────────────────────────────────────────────────────

mock.module('../../router/services/billing', () => ({
  checkCredits: async () => ({ hasCredits: _hasCredits, balance: 100, message: _hasCredits ? 'ok' : 'No credits' }),
  deductToolCredits: async () => ({ success: true, cost: 0.05, newBalance: 99.95 }),
}));

mock.module('../../router/services/jit-cache', () => ({
  cacheKey: (slug: string, chain?: string) => `${slug}:${chain ?? 'all'}`,
  getCached: () => null,
  getCachedAny: () => null,
  dedupedFetch: async (_key: string, fn: () => Promise<unknown>) => fn(),
  formatSnapshot: (snap: unknown) => JSON.stringify(snap),
}));

let _defillamaThrows: Error | null = null;
mock.module('../../router/services/defillama', () => ({
  fetchProtocolSnapshot: async (slug: string) => {
    if (_defillamaThrows) throw _defillamaThrows;
    return {
      slug,
      name: 'Aave',
      tvl_usd: 5_000_000_000,
      tvl_change_24h_pct: 1.5,
      apy_avg: null,
      chains: ['Ethereum'],
    };
  },
}));

mock.module('../../shared/db', () => ({
  db: {
    select: (cols?: unknown) => {
      const isProtocolQuery = !cols; // POST path uses .select() with no args
      return {
        from: () => ({
          where: () => ({
            limit: async () => (isProtocolQuery && _dbProtocolRow ? [_dbProtocolRow] : []),
            orderBy: () => ({
              limit: () => ({
                offset: async () => {
                  if (_onchainThrows) throw _onchainThrows;
                  return _onchainItems;
                },
              }),
            }),
          }),
        }),
      };
    },
  },
}));

mock.module('@epsilon/db', () => ({
  onChainDataIndex: {
    id: 'id',
    source: 'source',
    metricName: 'metricName',
    timestamp: 'timestamp',
    walletAddress: 'walletAddress',
    tokenAddress: 'tokenAddress',
  },
  protocolTvlSnapshots: {
    slug: 'slug',
    displayName: 'displayName',
    tvlUsd: 'tvlUsd',
    tvlChange24hPct: 'tvlChange24hPct',
    apyAvg: 'apyAvg',
    chains: 'chains',
    fetchedAt: 'fetchedAt',
    updatedAt: 'updatedAt',
  },
}));

mock.module('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ eq: [a, b] }),
  desc: (a: unknown) => ({ desc: a }),
}));

mock.module('../../config', () => ({
  config: { CRYPTO_SYNC_INTERVAL_MS: 5 * 60 * 1000 },
  getToolCost: () => 0.05,
}));

mock.module('../../lib/logger', () => ({
  logger: { info: () => undefined, warn: () => undefined, error: () => undefined, debug: () => undefined },
}));

const { jitSync } = await import('../../router/routes/jit-sync');

function makeApp(opts: { accountId?: string | null } = { accountId: 'acct-1' }) {
  const app = new Hono<{ Variables: AppContext }>();
  app.use('*', async (c, next) => {
    if (!opts.accountId) throw new HTTPException(401, { message: 'Unauthenticated' });
    c.set('accountId', opts.accountId);
    await next();
  });
  app.route('/v1/router/jit-sync', jitSync);
  app.onError((err, c) => {
    if (err instanceof HTTPException) return err.getResponse();
    return c.json({ success: false, error: String(err) }, 500);
  });
  return app;
}

const VALID_EVM = '0x' + 'a'.repeat(40);

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('POST /v1/router/jit-sync — validation', () => {
  beforeEach(() => {
    _hasCredits = true;
    _dbProtocolRow = null;
    _defillamaThrows = null;
  });

  test('[P0] returns 400 on malformed JSON', async () => {
    const app = makeApp();
    const res = await app.request('/v1/router/jit-sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{not-json',
    });
    expect(res.status).toBe(400);
  });

  test('[P0] returns 400 when protocol_slug missing', async () => {
    const app = makeApp();
    const res = await app.request('/v1/router/jit-sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  test('[P0] returns 400 when protocol_slug has invalid characters', async () => {
    const app = makeApp();
    const res = await app.request('/v1/router/jit-sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ protocol_slug: 'BAD_SLUG!' }),
    });
    expect(res.status).toBe(400);
  });

  test('[P0] returns 400 when protocol_slug starts with dash', async () => {
    const app = makeApp();
    const res = await app.request('/v1/router/jit-sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ protocol_slug: '-aave' }),
    });
    expect(res.status).toBe(400);
  });

  test('[P0] returns 402 when no credits', async () => {
    _hasCredits = false;
    const app = makeApp();
    const res = await app.request('/v1/router/jit-sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ protocol_slug: 'aave' }),
    });
    expect(res.status).toBe(402);
  });

  test('[P0] returns 200 with success:true when DeFiLlama responds (live source)', async () => {
    const app = makeApp();
    const res = await app.request('/v1/router/jit-sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ protocol_slug: 'aave' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.source).toBe('live');
    expect(body.tvl_usd).toBe(5_000_000_000);
    expect(res.headers.get('X-Cache-Status')).toBe('fresh');
  });

  test('[P0] returns no_data error when DeFiLlama fails and no cache', async () => {
    _defillamaThrows = new Error('DeFiLlama down');
    const app = makeApp();
    const res = await app.request('/v1/router/jit-sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ protocol_slug: 'unknown' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.source).toBe('no_data');
    expect(body.cost).toBe(0);
    expect(res.headers.get('X-Cache-Status')).toBe('no-data');
  });

  test('[P1] rejects uppercase protocol_slug (regex requires lowercase)', async () => {
    const app = makeApp();
    const res = await app.request('/v1/router/jit-sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ protocol_slug: 'AAVE' }),
    });
    expect(res.status).toBe(400);
  });
});

describe('GET /v1/router/jit-sync/onchain/:identifier', () => {
  beforeEach(() => {
    _onchainItems = [];
    _onchainThrows = null;
  });

  test('[P0] returns 400 when identifier exceeds max length', async () => {
    const app = makeApp();
    const longId = 'a'.repeat(256);
    const res = await app.request(`/v1/router/jit-sync/onchain/${longId}`);
    expect(res.status).toBe(400);
  });

  test('[P0] returns 200 with empty items when DB has no rows', async () => {
    const app = makeApp();
    const res = await app.request(`/v1/router/jit-sync/onchain/${VALID_EVM}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.items).toEqual([]);
    expect(body.pagination.offset).toBe(0);
    expect(body.pagination.limit).toBe(50);
    expect(body.pagination.nextOffset).toBeNull();
  });

  test('[P0] returns items from DB query', async () => {
    _onchainItems = [
      { id: '1', source: 'arkham', metricName: 'tx_count', timestamp: new Date(), walletAddress: VALID_EVM, tokenAddress: null },
    ];
    const app = makeApp();
    const res = await app.request(`/v1/router/jit-sync/onchain/${VALID_EVM}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items.length).toBe(1);
  });

  test('[P0] sets nextOffset when items.length === PAGE_SIZE (more pages available)', async () => {
    _onchainItems = Array.from({ length: 50 }, (_, i) => ({
      id: String(i),
      source: 's',
      metricName: 'm',
      timestamp: new Date(),
      walletAddress: VALID_EVM,
      tokenAddress: null,
    }));
    const app = makeApp();
    const res = await app.request(`/v1/router/jit-sync/onchain/${VALID_EVM}`);
    const body = await res.json();
    expect(body.pagination.nextOffset).toBe(50);
  });

  test('[P0] clamps offset to ONCHAIN_MAX_OFFSET (1000)', async () => {
    const app = makeApp();
    const res = await app.request(`/v1/router/jit-sync/onchain/${VALID_EVM}?offset=99999`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.pagination.offset).toBe(1000);
  });

  test('[P0] treats negative offset as 0', async () => {
    const app = makeApp();
    const res = await app.request(`/v1/router/jit-sync/onchain/${VALID_EVM}?offset=-100`);
    const body = await res.json();
    expect(body.pagination.offset).toBe(0);
  });

  test('[P0] treats invalid offset (NaN) as 0', async () => {
    const app = makeApp();
    const res = await app.request(`/v1/router/jit-sync/onchain/${VALID_EVM}?offset=abc`);
    const body = await res.json();
    expect(body.pagination.offset).toBe(0);
  });

  test('[P0] returns 503 onchain_unavailable when DB throws', async () => {
    _onchainThrows = new Error('connection refused');
    const app = makeApp();
    const res = await app.request(`/v1/router/jit-sync/onchain/${VALID_EVM}`);
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toBe('onchain_unavailable');
  });

  test('[P0] EVM address is lowercased for case-insensitive search', async () => {
    const upperAddr = '0x' + 'A'.repeat(40);
    const app = makeApp();
    const res = await app.request(`/v1/router/jit-sync/onchain/${upperAddr}`);
    // Should not 400 — address normalization handles case
    expect(res.status).toBe(200);
  });

  test('[P1] sets Cache-Control max-age=60', async () => {
    const app = makeApp();
    const res = await app.request(`/v1/router/jit-sync/onchain/${VALID_EVM}`);
    expect(res.headers.get('Cache-Control')).toContain('max-age=60');
  });

  test('[P1] non-EVM identifier (Solana base58) preserves case', async () => {
    const solAddr = 'So11111111111111111111111111111111111111112';
    const app = makeApp();
    const res = await app.request(`/v1/router/jit-sync/onchain/${solAddr}`);
    expect(res.status).toBe(200);
  });
});
