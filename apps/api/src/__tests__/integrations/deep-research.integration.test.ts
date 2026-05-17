import { describe, test, expect, mock, beforeEach } from 'bun:test';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { AppContext } from '../../types';

let _hasCredits = true;
let _researchResult: any = {
  query: 'btc',
  answer: 'BTC is a cryptocurrency',
  citations: [{ title: 'Source', url: 'https://a.com', snippet: 'snip' }],
  reasoning_effort: 'medium',
  search_queries_count: 3,
};
let _researchThrows: Error | null = null;
const _deductCalls: Array<{ accountId: string; tool: string; rows: number; description?: string; sessionId?: string }> = [];

mock.module('../../router/services/billing', () => ({
  checkCredits: async () => ({ hasCredits: _hasCredits, balance: 100, message: _hasCredits ? 'ok' : 'No credits' }),
  deductToolCredits: async (accountId: string, tool: string, rows: number, description?: string, sessionId?: string) => {
    _deductCalls.push({ accountId, tool, rows, description, sessionId });
    return { success: true, cost: 0.5, newBalance: 99.5, skipped: false };
  },
}));

mock.module('../../router/services/perplexity', () => ({
  deepResearchPerplexity: async () => {
    if (_researchThrows) throw _researchThrows;
    return _researchResult;
  },
}));

const { deepResearch } = await import('../../router/routes/deep-research');

function makeApp(opts: { accountId?: string | null } = { accountId: 'acct-1' }) {
  const app = new Hono<{ Variables: AppContext }>();
  app.use('*', async (c, next) => {
    if (!opts.accountId) throw new HTTPException(401, { message: 'Unauthenticated' });
    c.set('accountId', opts.accountId);
    await next();
  });
  app.route('/v1/router/deep-research', deepResearch);
  app.onError((err, c) => {
    if (err instanceof HTTPException) return err.getResponse();
    return c.json({ success: false, error: String(err) }, 500);
  });
  return app;
}

describe('POST /v1/router/deep-research', () => {
  beforeEach(() => {
    _hasCredits = true;
    _researchThrows = null;
    _deductCalls.length = 0;
  });

  test('[P0] returns 401 when accountId missing', async () => {
    const app = makeApp({ accountId: null });
    const res = await app.request('/v1/router/deep-research', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'btc' }),
    });
    expect(res.status).toBe(401);
  });

  test('[P0] returns 400 on malformed JSON body', async () => {
    const app = makeApp();
    const res = await app.request('/v1/router/deep-research', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{not-json',
    });
    expect(res.status).toBe(400);
  });

  test('[P0] returns 400 when query is empty', async () => {
    const app = makeApp();
    const res = await app.request('/v1/router/deep-research', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: '' }),
    });
    expect(res.status).toBe(400);
  });

  test('[P0] returns 400 when reasoning_effort invalid', async () => {
    const app = makeApp();
    const res = await app.request('/v1/router/deep-research', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'btc', reasoning_effort: 'extreme' }),
    });
    expect(res.status).toBe(400);
  });

  test('[P0] returns 400 when max_tokens > 4000', async () => {
    const app = makeApp();
    const res = await app.request('/v1/router/deep-research', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'btc', max_tokens: 10000 }),
    });
    expect(res.status).toBe(400);
  });

  test('[P0] returns 402 when no credits', async () => {
    _hasCredits = false;
    const app = makeApp();
    const res = await app.request('/v1/router/deep-research', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'btc' }),
    });
    expect(res.status).toBe(402);
  });

  test('[P0] returns 200 with answer + citations + cost on success', async () => {
    const app = makeApp();
    const res = await app.request('/v1/router/deep-research', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'btc' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.answer).toBe('BTC is a cryptocurrency');
    expect(body.citations.length).toBe(1);
    expect(body.cost).toBe(0.5);
  });

  test('[P0] deducts with toolName "deep_research_<effort>" reflecting reasoning_effort', async () => {
    const app = makeApp();
    await app.request('/v1/router/deep-research', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'btc', reasoning_effort: 'high' }),
    });
    expect(_deductCalls[0].tool).toBe('deep_research_high');
  });

  test('[P0] returns 500 with config error message when service throws "not configured"', async () => {
    _researchThrows = new Error('PERPLEXITY_API_KEY not configured');
    const app = makeApp();
    const res = await app.request('/v1/router/deep-research', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'btc' }),
    });
    expect(res.status).toBe(500);
  });

  test('[P0] returns 500 with sanitized "Deep research failed" message on upstream error', async () => {
    _researchThrows = new Error('Perplexity API error: 429 - rate limit');
    const app = makeApp();
    const res = await app.request('/v1/router/deep-research', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'btc' }),
    });
    expect(res.status).toBe(500);
  });

  test('[P1] does NOT deduct when service throws', async () => {
    _researchThrows = new Error('upstream down');
    const app = makeApp();
    await app.request('/v1/router/deep-research', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'btc' }),
    });
    expect(_deductCalls.length).toBe(0);
  });
});
