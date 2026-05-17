import { describe, test, expect, mock, beforeEach } from 'bun:test';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { AppContext } from '../../types';

// ─── Mutable mocked state ────────────────────────────────────────────────────

let _hasCredits = true;
let _simulateResult: any = {
  success: true,
  status: 'success',
  gasUsed: '0x5208',
  decoded: null,
};
let _simulateThrows: Error | null = null;
let _cacheFresh: { data: any } | null = null;
let _cacheStale: { data: any } | null = null;
const _deductCalls: Array<{
  accountId: string;
  tool: string;
  rows: number;
  description?: string;
  sessionId?: string;
}> = [];

// ─── Module mocks (hoisted) ──────────────────────────────────────────────────

mock.module('../../router/services/billing', () => ({
  checkCredits: async () => ({ hasCredits: _hasCredits, balance: _hasCredits ? 100 : 0 }),
  deductToolCredits: async (
    accountId: string,
    tool: string,
    rows: number,
    description?: string,
    sessionId?: string,
  ) => {
    _deductCalls.push({ accountId, tool, rows, description, sessionId });
    return { success: true, cost: 0.05, newBalance: 99.95 };
  },
}));

mock.module('../../router/services/tx-simulator', () => ({
  simulateTransaction: async () => {
    if (_simulateThrows) throw _simulateThrows;
    return _simulateResult;
  },
}));

mock.module('../../router/services/widget-cache', () => ({
  widgetCacheKey: (...parts: string[]) => parts.join('|'),
  cacheGet: () => _cacheFresh,
  cacheGetStale: () => _cacheStale,
  cacheSet: () => undefined,
}));

mock.module('../../config', () => ({
  config: {},
  getToolCost: () => 0.05,
}));

mock.module('@epsilon/shared', () => ({
  EVM_ADDRESS: /^0x[a-fA-F0-9]{40}$/,
}));

// ─── Import route after mocks ────────────────────────────────────────────────

const { txSimulator } = await import('../../router/routes/tx-simulator');

// ─── Test app factory ────────────────────────────────────────────────────────

function makeApp(opts: { accountId?: string | null } = { accountId: 'test-account' }) {
  const app = new Hono<{ Variables: AppContext }>();
  app.use('*', async (c, next) => {
    if (!opts.accountId) throw new HTTPException(401, { message: 'Unauthenticated' });
    c.set('accountId', opts.accountId);
    await next();
  });
  app.route('/v1/router/tx-simulator', txSimulator);
  app.onError((err, c) => {
    if (err instanceof HTTPException) return err.getResponse();
    return c.json({ success: false, error: String(err) }, 500);
  });
  return app;
}

const VALID_BODY = {
  from: '0x' + 'a'.repeat(40),
  to: '0x' + 'b'.repeat(40),
  data: '0xabcdef',
  chain: 'ethereum',
};

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('POST /v1/router/tx-simulator — auth & validation', () => {
  beforeEach(() => {
    _hasCredits = true;
    _simulateThrows = null;
    _simulateResult = { success: true, status: 'success', gasUsed: '0x5208', decoded: null };
    _cacheFresh = null;
    _cacheStale = null;
    _deductCalls.length = 0;
  });

  test('[P0] returns 401 when accountId missing (auth gate)', async () => {
    const app = makeApp({ accountId: null });
    const res = await app.request('/v1/router/tx-simulator', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(VALID_BODY),
    });
    expect(res.status).toBe(401);
  });

  test('[P0] returns 400 on malformed JSON body', async () => {
    const app = makeApp();
    const res = await app.request('/v1/router/tx-simulator', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{not-json',
    });
    expect(res.status).toBe(400);
  });

  test('[P0] returns 400 when from address is not a valid EVM address', async () => {
    const app = makeApp();
    const res = await app.request('/v1/router/tx-simulator', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...VALID_BODY, from: 'not-an-address' }),
    });
    expect(res.status).toBe(400);
  });

  test('[P0] returns 400 when data is not hex calldata', async () => {
    const app = makeApp();
    const res = await app.request('/v1/router/tx-simulator', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...VALID_BODY, data: 'not-hex' }),
    });
    expect(res.status).toBe(400);
  });

  test('[P0] returns 400 when value is neither hex nor decimal string', async () => {
    const app = makeApp();
    const res = await app.request('/v1/router/tx-simulator', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...VALID_BODY, value: 'abc' }),
    });
    expect(res.status).toBe(400);
  });

  test('[P0] returns 400 when session_id contains forbidden characters', async () => {
    const app = makeApp();
    const res = await app.request('/v1/router/tx-simulator', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...VALID_BODY, session_id: 'has spaces!' }),
    });
    expect(res.status).toBe(400);
  });
});

describe('POST /v1/router/tx-simulator — billing gate', () => {
  beforeEach(() => {
    _hasCredits = true;
    _simulateThrows = null;
    _simulateResult = { success: true, status: 'success' };
    _cacheFresh = null;
    _cacheStale = null;
    _deductCalls.length = 0;
  });

  test('[P0] returns 402 when checkCredits says no credits', async () => {
    _hasCredits = false;
    const app = makeApp();
    const res = await app.request('/v1/router/tx-simulator', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(VALID_BODY),
    });
    expect(res.status).toBe(402);
  });

  test('[P0] deducts credits exactly once on successful live simulation', async () => {
    const app = makeApp();
    await app.request('/v1/router/tx-simulator', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...VALID_BODY, session_id: 'sess-1' }),
    });
    expect(_deductCalls.length).toBe(1);
    expect(_deductCalls[0].tool).toBe('tx_simulator');
    expect(_deductCalls[0].sessionId).toBe('sess-1');
  });

  test('[P1] forwards session_id into deductToolCredits for audit trail', async () => {
    const app = makeApp();
    await app.request('/v1/router/tx-simulator', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...VALID_BODY, session_id: 'audit-trail-sess' }),
    });
    expect(_deductCalls[0].sessionId).toBe('audit-trail-sess');
  });
});

describe('POST /v1/router/tx-simulator — cache & fallback', () => {
  beforeEach(() => {
    _hasCredits = true;
    _simulateThrows = null;
    _simulateResult = { success: true, status: 'success', gasUsed: '0x5208' };
    _cacheFresh = null;
    _cacheStale = null;
    _deductCalls.length = 0;
  });

  test('[P0] returns 200 + live=fresh + cache_status:live on success', async () => {
    const app = makeApp();
    const res = await app.request('/v1/router/tx-simulator', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(VALID_BODY),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.stale).toBe(false);
    expect(body.cache_status).toBe('live');
    expect(res.headers.get('X-Cache-Status')).toBe('fresh');
  });

  test('[P0] returns cached result with cache_status:cache_fresh and X-Cache-Status:hit', async () => {
    _cacheFresh = { data: { success: true, status: 'cached', gasUsed: '0x9999' } };
    const app = makeApp();
    const res = await app.request('/v1/router/tx-simulator', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(VALID_BODY),
    });
    const body = await res.json();
    expect(body.cache_status).toBe('cache_fresh');
    expect(body.gasUsed).toBe('0x9999');
    expect(res.headers.get('X-Cache-Status')).toBe('hit');
  });

  test('[P0] falls back to stale cache on simulator error with X-Cache-Status:stale-fallback', async () => {
    _simulateThrows = new Error('Tenderly down');
    _cacheStale = { data: { success: true, status: 'old', gasUsed: '0x1111' } };
    const app = makeApp();
    const res = await app.request('/v1/router/tx-simulator', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(VALID_BODY),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.stale).toBe(true);
    expect(body.cache_status).toBe('cache_stale');
    expect(body.gasUsed).toBe('0x1111');
    expect(res.headers.get('X-Cache-Status')).toBe('stale-fallback');
  });

  test('[P0] returns success:false with error on simulator failure when no stale cache', async () => {
    _simulateThrows = new Error('upstream RPC died');
    _cacheStale = null;
    const app = makeApp();
    const res = await app.request('/v1/router/tx-simulator', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(VALID_BODY),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.stale).toBe(false);
    expect(body.error).toContain('upstream RPC died');
    expect(body.cost).toBe(0);
  });

  test('[P1] does NOT deduct credits when simulator fails and no stale fallback', async () => {
    _simulateThrows = new Error('failure');
    _cacheStale = null;
    const app = makeApp();
    await app.request('/v1/router/tx-simulator', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(VALID_BODY),
    });
    expect(_deductCalls.length).toBe(0);
  });
});
