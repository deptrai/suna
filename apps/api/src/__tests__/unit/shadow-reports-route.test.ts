import { describe, test, expect, mock, beforeEach } from 'bun:test';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { AppContext } from '../../types';

mock.module('../../router/services/billing', () => ({
  checkCredits: async () => ({ hasCredits: true }),
  deductToolCredits: async () => ({ success: true }),
}));

process.env.VIBE_TRADING_API_KEY = 'test-key';
process.env.VIBE_TRADING_INTERNAL_URL = 'http://vibe-trading:8899';

import { vibeTrading } from '../../router/routes/vibe-trading';

function makeApp() {
  const app = new Hono<{ Variables: AppContext }>();
  app.use('*', async (c, next) => {
    c.set('accountId', 'acct-test');
    await next();
  });
  app.onError((err, c) => {
    if (err instanceof HTTPException) return err.getResponse();
    return c.json({ error: err.message }, 500);
  });
  app.route('/', vibeTrading);
  return app;
}

describe('GET /shadow-reports/:shadowId', () => {
  beforeEach(() => {
    mock.restore();
  });

  test('400 invalid shadowId', async () => {
    const app = makeApp();
    const res = await app.request('/shadow-reports/not-valid?format=html');
    expect(res.status).toBe(400);
  });

  test('400 invalid format', async () => {
    const app = makeApp();
    const res = await app.request('/shadow-reports/shadow_deadbeef?format=txt');
    expect(res.status).toBe(400);
  });

  test('200 proxies valid report', async () => {
    globalThis.fetch = mock(async () => new Response('<html>ok</html>', {
      status: 200,
      headers: { 'content-type': 'text/html; charset=utf-8' },
    })) as unknown as typeof fetch;

    const app = makeApp();
    const res = await app.request('/shadow-reports/shadow_deadbeef?format=html');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-disposition')).toContain('shadow_deadbeef.html');
    expect(await res.text()).toContain('ok');
  });

  test('404 from downstream propagates', async () => {
    globalThis.fetch = mock(async () => new Response('missing', { status: 404 })) as unknown as typeof fetch;

    const app = makeApp();
    const res = await app.request('/shadow-reports/shadow_deadbeef?format=html');
    expect(res.status).toBe(404);
    const body = await res.text();
    expect(body.toLowerCase()).toContain('not found');
  });
});
