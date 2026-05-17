import { describe, test, expect, mock, beforeEach } from 'bun:test';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { AppContext } from '../../types';

// ─── Mutable state ───────────────────────────────────────────────────────────

let _hasCredits = true;
let _searchResults: any[] = [
  { title: 'BTC', url: 'https://a.com', snippet: 'btc news', published_date: null },
];
let _searchThrows: Error | null = null;
const _deductCalls: Array<{ accountId: string; tool: string; rows: number; description?: string; sessionId?: string }> = [];

mock.module('../../router/services/billing', () => ({
  checkCredits: async () => ({ hasCredits: _hasCredits, balance: 100, message: _hasCredits ? 'ok' : 'No credits' }),
  deductToolCredits: async (accountId: string, tool: string, rows: number, description?: string, sessionId?: string) => {
    _deductCalls.push({ accountId, tool, rows, description, sessionId });
    return { success: true, cost: 0.05, newBalance: 99.95, skipped: false };
  },
}));

mock.module('../../router/services/tavily', () => ({
  webSearchTavily: async () => {
    if (_searchThrows) throw _searchThrows;
    return _searchResults;
  },
}));

const { webSearch } = await import('../../router/routes/search-web');

function makeApp(opts: { accountId?: string | null } = { accountId: 'acct-1' }) {
  const app = new Hono<{ Variables: AppContext }>();
  app.use('*', async (c, next) => {
    if (!opts.accountId) throw new HTTPException(401, { message: 'Unauthenticated' });
    c.set('accountId', opts.accountId);
    await next();
  });
  app.route('/v1/router/web-search', webSearch);
  app.onError((err, c) => {
    if (err instanceof HTTPException) return err.getResponse();
    return c.json({ success: false, error: String(err) }, 500);
  });
  return app;
}

describe('POST /v1/router/web-search', () => {
  beforeEach(() => {
    _hasCredits = true;
    _searchThrows = null;
    _searchResults = [
      { title: 'BTC', url: 'https://a.com', snippet: 'btc news', published_date: null },
    ];
    _deductCalls.length = 0;
  });

  test('[P0] returns 401 when accountId missing', async () => {
    const app = makeApp({ accountId: null });
    const res = await app.request('/v1/router/web-search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'btc' }),
    });
    expect(res.status).toBe(401);
  });

  test('[P0] returns 400 when query missing', async () => {
    const app = makeApp();
    const res = await app.request('/v1/router/web-search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  test('[P0] returns 400 when max_results > 10', async () => {
    const app = makeApp();
    const res = await app.request('/v1/router/web-search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'btc', max_results: 50 }),
    });
    expect(res.status).toBe(400);
  });

  test('[P0] returns 400 when search_depth is not basic|advanced', async () => {
    const app = makeApp();
    const res = await app.request('/v1/router/web-search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'btc', search_depth: 'extreme' }),
    });
    expect(res.status).toBe(400);
  });

  test('[P0] returns 402 when no credits', async () => {
    _hasCredits = false;
    const app = makeApp();
    const res = await app.request('/v1/router/web-search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'btc' }),
    });
    expect(res.status).toBe(402);
  });

  test('[P0] returns 200 with results, query, cost on success', async () => {
    const app = makeApp();
    const res = await app.request('/v1/router/web-search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'btc' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.query).toBe('btc');
    expect(Array.isArray(body.results)).toBe(true);
    expect(body.cost).toBe(0.05);
  });

  test('[P0] deducts with toolName "web_search_<depth>" reflecting search_depth', async () => {
    const app = makeApp();
    await app.request('/v1/router/web-search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'btc', search_depth: 'advanced' }),
    });
    expect(_deductCalls.length).toBe(1);
    expect(_deductCalls[0].tool).toBe('web_search_advanced');
  });

  test('[P0] returns 500 when service config error (e.g. TAVILY_API_KEY not configured)', async () => {
    _searchThrows = new Error('TAVILY_API_KEY not configured');
    const app = makeApp();
    const res = await app.request('/v1/router/web-search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'btc' }),
    });
    expect(res.status).toBe(500);
  });

  test('[P0] returns 500 with sanitized message on upstream API error', async () => {
    _searchThrows = new Error('Tavily API error: 429 - rate limit');
    const app = makeApp();
    const res = await app.request('/v1/router/web-search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'btc' }),
    });
    expect(res.status).toBe(500);
  });

  test('[P1] forwards session_id into deduct call', async () => {
    const app = makeApp();
    await app.request('/v1/router/web-search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'btc', session_id: 'sess-x' }),
    });
    expect(_deductCalls[0].sessionId).toBe('sess-x');
  });

  test('[P1] does NOT deduct when search throws', async () => {
    _searchThrows = new Error('upstream down');
    const app = makeApp();
    await app.request('/v1/router/web-search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'btc' }),
    });
    expect(_deductCalls.length).toBe(0);
  });
});
