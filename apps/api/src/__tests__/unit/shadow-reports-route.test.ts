import { describe, test, expect, mock, beforeEach, afterAll } from 'bun:test';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { AppContext } from '../../types';

mock.module('../../router/services/billing', () => ({
  checkCredits: async () => ({ hasCredits: true }),
  deductToolCredits: async () => ({ success: true }),
  // 5.6 audit Q2 (2026-05-18): route gates /shadow-reports/:shadowId to tier-2+.
  // Mock returns tier2 so the existing assertions (which predate the gate) still pass.
  resolveAccountTier: async () => 'tier2',
}));

mock.module('../../router/services/shadow-ownership', () => ({
  claimOrAssertShadowOwnership: async () => undefined,
  ShadowOwnershipError: class ShadowOwnershipError extends Error {
    constructor(shadowId: string, owner: string) {
      super(`Shadow report ${shadowId} owned by ${owner}`);
      this.name = 'ShadowOwnershipError';
    }
  },
}));

const ORIGINAL_ENV = {
  VIBE_TRADING_API_KEY: process.env.VIBE_TRADING_API_KEY,
  VIBE_TRADING_INTERNAL_URL: process.env.VIBE_TRADING_INTERNAL_URL,
};
process.env.VIBE_TRADING_API_KEY = 'test-key';
process.env.VIBE_TRADING_INTERNAL_URL = 'http://vibe-trading:8899';

afterAll(() => {
  process.env.VIBE_TRADING_API_KEY = ORIGINAL_ENV.VIBE_TRADING_API_KEY;
  process.env.VIBE_TRADING_INTERNAL_URL = ORIGINAL_ENV.VIBE_TRADING_INTERNAL_URL;
});

import { vibeTrading } from '../../router/routes/vibe-trading';

const ORIGINAL_FETCH = globalThis.fetch;

function makeApp(opts: { withAccountId?: boolean } = { withAccountId: true }) {
  const app = new Hono<{ Variables: AppContext }>();
  app.use('*', async (c, next) => {
    if (opts.withAccountId !== false) c.set('accountId', 'acct-test');
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
    globalThis.fetch = ORIGINAL_FETCH;
  });

  test('401 when accountId missing', async () => {
    const app = makeApp({ withAccountId: false });
    const res = await app.request('/shadow-reports/shadow_deadbeef?format=html');
    expect(res.status).toBe(401);
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
    })) as unknown as unknown as typeof fetch;

    const app = makeApp();
    const res = await app.request('/shadow-reports/shadow_deadbeef?format=html');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-disposition')).toContain('shadow_deadbeef.html');
    expect(await res.text()).toContain('ok');
  });

  test('404 from downstream propagates', async () => {
    globalThis.fetch = mock(async () => new Response('missing', { status: 404 })) as unknown as unknown as typeof fetch;

    const app = makeApp();
    const res = await app.request('/shadow-reports/shadow_deadbeef?format=html');
    expect(res.status).toBe(404);
    const body = await res.text();
    expect(body.toLowerCase()).toContain('not found');
  });

  test('503 on upstream 5xx (downstream catch)', async () => {
    globalThis.fetch = mock(async () => new Response('boom', { status: 502 })) as unknown as unknown as typeof fetch;

    const app = makeApp();
    const res = await app.request('/shadow-reports/shadow_deadbeef?format=html');
    expect(res.status).toBe(503);
    const json = await res.json() as { success: boolean; error: string };
    expect(json.success).toBe(false);
    expect(json.error).toContain('502');
  });

  // 5.6 audit Q2 coverage: tier-1 accounts must be rejected with 403 before
  // any VT call fires. Re-mocks billing to return tier1 for this test only.
  test('403 when account is tier1 (audit Q2 gate)', async () => {
    const { mock: bunMock } = await import('bun:test');
    bunMock.module('../../router/services/billing', () => ({
      checkCredits: async () => ({ hasCredits: true }),
      deductToolCredits: async () => ({ success: true }),
      resolveAccountTier: async () => 'tier1',
    }));

    let fetchCalled = false;
    globalThis.fetch = mock(async () => {
      fetchCalled = true;
      return new Response('should-not-be-called', { status: 200 });
    }) as unknown as typeof fetch;

    const app = makeApp();
    const res = await app.request('/shadow-reports/shadow_deadbeef?format=html');
    expect(res.status).toBe(403);
    expect(fetchCalled).toBe(false);

    // Reset to tier2 mock for any subsequent tests in this file.
    bunMock.module('../../router/services/billing', () => ({
      checkCredits: async () => ({ hasCredits: true }),
      deductToolCredits: async () => ({ success: true }),
      resolveAccountTier: async () => 'tier2',
    }));
  });
});
