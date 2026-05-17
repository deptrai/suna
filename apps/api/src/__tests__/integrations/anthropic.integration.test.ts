import { describe, test, expect, mock, beforeEach } from 'bun:test';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { AppContext } from '../../types';

let _hasCredits = true;
let _capStatus: { capCents: number | null; currentCents: number; ownerPeriodStart: number | null } | null = null;
let _proxyResponse: any = {
  status: 200,
  body: {
    id: 'msg_1',
    content: [{ type: 'text', text: 'hello' }],
    usage: { input_tokens: 100, output_tokens: 50 },
  },
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

mock.module('../../router/services/anthropic', () => ({
  proxyToAnthropic: async () =>
    new Response(JSON.stringify(_proxyResponse.body), {
      status: _proxyResponse.status,
      headers: { 'Content-Type': 'application/json' },
    }),
  extractAnthropicUsage: (body: any) => {
    if (!body?.usage) return null;
    return {
      inputTokens: body.usage.input_tokens ?? 0,
      outputTokens: body.usage.output_tokens ?? 0,
      cacheReadInputTokens: 0,
      cacheCreationInputTokens: 0,
    };
  },
  calculateAnthropicCost: () => 0.01,
}));

mock.module('../../router/config/models', () => ({
  getModel: (id: string) => ({ id, inputPer1M: 3, outputPer1M: 15 }),
}));

mock.module('../../shared/actor-context', () => ({
  resolveActorFromRequest: () => null,
}));

const { anthropic } = await import('../../router/routes/anthropic');

function makeApp(opts: { accountId?: string | null } = { accountId: 'acct-1' }) {
  const app = new Hono<{ Variables: AppContext }>();
  app.use('*', async (c, next) => {
    if (!opts.accountId) throw new HTTPException(401, { message: 'Unauthenticated' });
    c.set('accountId', opts.accountId);
    await next();
  });
  app.route('/v1/router/anthropic', anthropic);
  app.onError((err, c) => {
    if (err instanceof HTTPException) return err.getResponse();
    return c.json({ success: false, error: String(err) }, 500);
  });
  return app;
}

const VALID_BODY = {
  model: 'claude-3-opus',
  messages: [{ role: 'user', content: 'hello' }],
  max_tokens: 100,
};

describe('POST /v1/router/anthropic/messages — auth & validation', () => {
  beforeEach(() => {
    _hasCredits = true;
    _capStatus = null;
    _proxyResponse = {
      status: 200,
      body: {
        id: 'msg_1',
        content: [{ type: 'text', text: 'hello' }],
        usage: { input_tokens: 100, output_tokens: 50 },
      },
    };
  });

  test('[P0] returns 401 when accountId missing', async () => {
    const app = makeApp({ accountId: null });
    const res = await app.request('/v1/router/anthropic/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(VALID_BODY),
    });
    expect(res.status).toBe(401);
  });

  test('[P0] returns 400 on malformed JSON', async () => {
    const app = makeApp();
    const res = await app.request('/v1/router/anthropic/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{not-json',
    });
    expect(res.status).toBe(400);
  });

  test('[P0] returns 400 when model missing', async () => {
    const app = makeApp();
    const res = await app.request('/v1/router/anthropic/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', content: 'hi' }] }),
    });
    expect(res.status).toBe(400);
  });

  test('[P0] returns 400 when messages missing', async () => {
    const app = makeApp();
    const res = await app.request('/v1/router/anthropic/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'claude-3-opus' }),
    });
    expect(res.status).toBe(400);
  });

  test('[P0] returns 400 when messages is empty array', async () => {
    const app = makeApp();
    const res = await app.request('/v1/router/anthropic/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'claude-3-opus', messages: [] }),
    });
    expect(res.status).toBe(400);
  });
});

describe('POST /v1/router/anthropic/messages — billing gate', () => {
  beforeEach(() => {
    _hasCredits = true;
    _capStatus = null;
    _proxyResponse = {
      status: 200,
      body: {
        id: 'msg_1',
        content: [{ type: 'text', text: 'hello' }],
        usage: { input_tokens: 100, output_tokens: 50 },
      },
    };
  });

  test('[P0] returns 402 when no credits', async () => {
    _hasCredits = false;
    const app = makeApp();
    const res = await app.request('/v1/router/anthropic/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(VALID_BODY),
    });
    expect(res.status).toBe(402);
  });

  test('[P0] returns 200 with response body on success', async () => {
    const app = makeApp();
    const res = await app.request('/v1/router/anthropic/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(VALID_BODY),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe('msg_1');
    expect(body.usage.input_tokens).toBe(100);
  });

  test('[P0] forwards upstream error status when proxy returns non-2xx', async () => {
    _proxyResponse = { status: 503, body: { error: 'upstream' } };
    const app = makeApp();
    const res = await app.request('/v1/router/anthropic/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(VALID_BODY),
    });
    expect(res.status).toBe(503);
  });

  test('[P0] proceeds without actor cap check when no actor context', async () => {
    const app = makeApp();
    const res = await app.request('/v1/router/anthropic/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(VALID_BODY),
    });
    expect(res.status).toBe(200);
  });
});
