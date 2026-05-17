import { describe, test, expect, mock, beforeEach } from 'bun:test';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { AppContext } from '../../types';

let _hasCredits = true;
let _searchResults: any[] = [
  {
    title: 'cat',
    url: 'https://img.com/cat.jpg',
    thumbnail_url: 'https://thumb/cat.jpg',
    source_url: 'https://example.com',
    width: 800,
    height: 600,
  },
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

mock.module('../../router/services/serper', () => ({
  imageSearchSerper: async () => {
    if (_searchThrows) throw _searchThrows;
    return _searchResults;
  },
}));

const { imageSearch } = await import('../../router/routes/search-image');

function makeApp(opts: { accountId?: string | null } = { accountId: 'acct-1' }) {
  const app = new Hono<{ Variables: AppContext }>();
  app.use('*', async (c, next) => {
    if (!opts.accountId) throw new HTTPException(401, { message: 'Unauthenticated' });
    c.set('accountId', opts.accountId);
    await next();
  });
  app.route('/v1/router/image-search', imageSearch);
  app.onError((err, c) => {
    if (err instanceof HTTPException) return err.getResponse();
    return c.json({ success: false, error: String(err) }, 500);
  });
  return app;
}

describe('POST /v1/router/image-search', () => {
  beforeEach(() => {
    _hasCredits = true;
    _searchThrows = null;
    _deductCalls.length = 0;
    _searchResults = [
      { title: 'cat', url: 'https://img.com/cat.jpg', thumbnail_url: 'https://thumb/cat.jpg', source_url: 'https://example.com', width: 800, height: 600 },
    ];
  });

  test('[P0] returns 401 when accountId missing', async () => {
    const app = makeApp({ accountId: null });
    const res = await app.request('/v1/router/image-search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'cat' }),
    });
    expect(res.status).toBe(401);
  });

  test('[P0] returns 400 when query missing', async () => {
    const app = makeApp();
    const res = await app.request('/v1/router/image-search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  test('[P0] returns 400 when max_results > 20', async () => {
    const app = makeApp();
    const res = await app.request('/v1/router/image-search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'cat', max_results: 50 }),
    });
    expect(res.status).toBe(400);
  });

  test('[P0] returns 402 when no credits', async () => {
    _hasCredits = false;
    const app = makeApp();
    const res = await app.request('/v1/router/image-search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'cat' }),
    });
    expect(res.status).toBe(402);
  });

  test('[P0] returns 200 with results, query, cost on success', async () => {
    const app = makeApp();
    const res = await app.request('/v1/router/image-search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'cat' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.query).toBe('cat');
    expect(body.results.length).toBe(1);
    expect(body.cost).toBe(0.05);
  });

  test('[P0] deducts with tool name "image_search"', async () => {
    const app = makeApp();
    await app.request('/v1/router/image-search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'cat' }),
    });
    expect(_deductCalls[0].tool).toBe('image_search');
  });

  test('[P0] returns 500 when service config error', async () => {
    _searchThrows = new Error('SERPER_API_KEY not configured');
    const app = makeApp();
    const res = await app.request('/v1/router/image-search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'cat' }),
    });
    expect(res.status).toBe(500);
  });

  test('[P1] forwards session_id into deduct call', async () => {
    const app = makeApp();
    await app.request('/v1/router/image-search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'cat', session_id: 'sess-y' }),
    });
    expect(_deductCalls[0].sessionId).toBe('sess-y');
  });
});
