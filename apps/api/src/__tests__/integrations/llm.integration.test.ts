import { describe, test, expect, mock, beforeEach } from 'bun:test';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { AppContext } from '../../types';

let _hasCredits = true;
let _capStatus: { capCents: number | null; currentCents: number; ownerPeriodStart: number | null } | null = null;
let _proxyResponse: any = {
  status: 200,
  body: { id: 'cmpl-1', usage: { prompt_tokens: 10, completion_tokens: 5 } },
  headers: { 'Content-Type': 'application/json' },
};

mock.module('../../router/services/billing', () => ({
  checkCredits: async () => ({ hasCredits: _hasCredits, balance: 100, message: _hasCredits ? 'ok' : 'No credits' }),
  deductLLMCredits: async () => ({ success: true, cost: 0.01, newBalance: 99.99 }),
}));

mock.module('../../router/services/member-spend', () => ({
  applyActorSpend: async () => undefined,
  dollarsToCents: (d: number) => Math.ceil(d * 100),
  getSandboxMemberCapStatus: async () => _capStatus,
}));

mock.module('../../router/services/llm', () => ({
  proxyToOpenRouter: async () => {
    return new Response(JSON.stringify(_proxyResponse.body), {
      status: _proxyResponse.status,
      headers: _proxyResponse.headers,
    });
  },
  extractUsage: (body: any) => {
    if (!body?.usage) return null;
    return {
      promptTokens: body.usage.prompt_tokens ?? 0,
      completionTokens: body.usage.completion_tokens ?? 0,
      cachedTokens: 0,
      cacheWriteTokens: 0,
    };
  },
  calculateCost: () => 0.01,
  getModel: (id: string) => ({ id, name: id, pricing: { input: 0.01, output: 0.02 } }),
  getAllModels: () => [
    { id: 'gpt-4', owned_by: 'openai', context_window: 128000, pricing: {}, tier: 'tier2' },
    { id: 'claude-3-opus', owned_by: 'anthropic', context_window: 200000, pricing: {}, tier: 'tier3' },
  ],
}));

mock.module('../../shared/actor-context', () => ({
  resolveActorFromRequest: () => null,
}));

const { llm } = await import('../../router/routes/llm');

function makeApp(opts: { accountId?: string | null } = { accountId: 'acct-1' }) {
  const app = new Hono<{ Variables: AppContext }>();
  app.use('*', async (c, next) => {
    if (!opts.accountId) throw new HTTPException(401, { message: 'Unauthenticated' });
    c.set('accountId', opts.accountId);
    await next();
  });
  app.route('/v1/router/llm', llm);
  app.onError((err, c) => {
    if (err instanceof HTTPException) return err.getResponse();
    return c.json({ success: false, error: String(err) }, 500);
  });
  return app;
}

const VALID_BODY = {
  model: 'gpt-4',
  messages: [{ role: 'user', content: 'hello' }],
};

describe('POST /v1/router/llm/chat/completions — validation & auth', () => {
  beforeEach(() => {
    _hasCredits = true;
    _capStatus = null;
    _proxyResponse = {
      status: 200,
      body: { id: 'cmpl-1', usage: { prompt_tokens: 10, completion_tokens: 5 } },
      headers: { 'Content-Type': 'application/json' },
    };
  });

  test('[P0] returns 401 when accountId missing', async () => {
    const app = makeApp({ accountId: null });
    const res = await app.request('/v1/router/llm/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(VALID_BODY),
    });
    expect(res.status).toBe(401);
  });

  test('[P0] returns 400 on malformed JSON body', async () => {
    const app = makeApp();
    const res = await app.request('/v1/router/llm/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{not-json',
    });
    expect(res.status).toBe(400);
  });

  test('[P0] returns 400 when model missing', async () => {
    const app = makeApp();
    const res = await app.request('/v1/router/llm/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', content: 'hi' }] }),
    });
    expect(res.status).toBe(400);
  });

  test('[P0] returns 400 when messages missing', async () => {
    const app = makeApp();
    const res = await app.request('/v1/router/llm/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'gpt-4' }),
    });
    expect(res.status).toBe(400);
  });

  test('[P0] returns 400 when messages is empty array', async () => {
    const app = makeApp();
    const res = await app.request('/v1/router/llm/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'gpt-4', messages: [] }),
    });
    expect(res.status).toBe(400);
  });
});

describe('POST /v1/router/llm/chat/completions — billing gates', () => {
  beforeEach(() => {
    _hasCredits = true;
    _capStatus = null;
    _proxyResponse = {
      status: 200,
      body: { id: 'cmpl-1', usage: { prompt_tokens: 10, completion_tokens: 5 } },
      headers: { 'Content-Type': 'application/json' },
    };
  });

  test('[P0] returns 402 when checkCredits says no credits', async () => {
    _hasCredits = false;
    const app = makeApp();
    const res = await app.request('/v1/router/llm/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(VALID_BODY),
    });
    expect(res.status).toBe(402);
  });

  test('[P0] returns 200 when no actor context (skips spending cap check)', async () => {
    const app = makeApp();
    const res = await app.request('/v1/router/llm/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(VALID_BODY),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe('cmpl-1');
  });

  test('[P0] returns 200 with response body on successful non-streaming call', async () => {
    const app = makeApp();
    const res = await app.request('/v1/router/llm/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(VALID_BODY),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.usage.prompt_tokens).toBe(10);
  });

  test('[P0] forwards upstream error status when proxy returns non-2xx', async () => {
    _proxyResponse = { status: 502, body: { error: 'upstream' }, headers: { 'Content-Type': 'application/json' } };
    const app = makeApp();
    const res = await app.request('/v1/router/llm/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(VALID_BODY),
    });
    expect(res.status).toBe(502);
  });
});

describe('GET /v1/router/llm/models', () => {
  test('[P0] returns OpenAI-compatible model list', async () => {
    const app = makeApp();
    const res = await app.request('/v1/router/llm/models');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.object).toBe('list');
    expect(body.data.length).toBe(2);
    expect(body.data[0].id).toBe('gpt-4');
    expect(body.data[0].object).toBe('model');
    expect(body.data[0].tier).toBe('tier2');
  });

  test('[P0] returns 404 for unknown model', async () => {
    const app = makeApp();
    const res = await app.request('/v1/router/llm/models/non-existent-model');
    expect(res.status).toBe(404);
  });

  test('[P0] returns single model details when id matches', async () => {
    const app = makeApp();
    const res = await app.request('/v1/router/llm/models/claude-3-opus');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe('claude-3-opus');
    expect(body.tier).toBe('tier3');
  });
});
