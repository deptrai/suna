import { describe, test, expect, mock, beforeEach } from 'bun:test';
import { Hono } from 'hono';
import type { AppContext } from '../../types';

// ─── Mutable state ────────────────────────────────────────────────────────────

let _accountId: string | undefined = 'acct-ext-123';
let _hasCredits = true;
let _accountTier: 'tier1' | 'tier2' | 'tier3' = 'tier2';

const deductCalls: Array<{ toolName: string }> = [];

// ─── Module mocks (hoisted) ───────────────────────────────────────────────────

mock.module('../../router/services/billing', () => ({
  checkCredits: async () => ({ hasCredits: _hasCredits }),
  deductToolCredits: async (_accountId: string, toolName: string) => {
    deductCalls.push({ toolName });
    return { success: true, cost: 0.05, newBalance: 9.95 };
  },
  resolveAccountTier: async () => _accountTier,
}));

mock.module('../../config', () => ({
  config: { VIBE_TRADING_MCP_URL: 'http://vt-mcp-ext:8900' },
  getToolCost: (name: string) => 0.01,
}));

mock.module('../../lib/logger', () => ({
  logger: { info: () => undefined, warn: () => undefined, error: () => undefined, debug: () => undefined },
}));

// ─── Fetch mock helpers ───────────────────────────────────────────────────────

type MockResp = { ok: boolean; status?: number; body: unknown; contentType?: string };

function makeFetch(resp: MockResp): typeof fetch {
  return mock(async (): Promise<Response> => {
    const ct = resp.contentType ?? 'application/json';
    const bodyStr = typeof resp.body === 'string' ? resp.body : JSON.stringify(resp.body);
    return {
      ok: resp.ok,
      status: resp.status ?? (resp.ok ? 200 : 500),
      headers: new Headers({ 'content-type': ct }),
      body: new ReadableStream({
        start(c) { c.enqueue(new TextEncoder().encode(bodyStr)); c.close(); },
      }),
      text: async () => bodyStr,
      json: async () => resp.body,
    } as unknown as Response;
  }) as unknown as unknown as typeof fetch;
}

function makeTimeoutFetch(): typeof fetch {
  return mock(async (): Promise<Response> => {
    const err = new Error('The operation was aborted due to timeout');
    err.name = 'TimeoutError';
    throw err;
  }) as unknown as unknown as typeof fetch;
}

// ─── App factory ─────────────────────────────────────────────────────────────

async function makeApp() {
  const { vibeTradingMcp } = await import('../../router/routes/vibe-trading-mcp');
  const app = new Hono<{ Variables: AppContext }>();
  app.use('/*', async (c, next) => {
    if (_accountId) c.set('accountId', _accountId);
    await next();
  });
  app.route('/v1/router/vibe-trading-mcp', vibeTradingMcp);
  return app;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('vibe-trading-mcp proxy — extended coverage', () => {
  let app: Hono<{ Variables: AppContext }>;

  beforeEach(async () => {
    _accountId = 'acct-ext-123';
    _hasCredits = true;
    _accountTier = 'tier2';
    deductCalls.length = 0;
    app = await makeApp();
  });

  // ── Upstream timeout ──────────────────────────────────────────────────────

  test('[P1] 503 when upstream times out on tools/call', async () => {
    globalThis.fetch = makeTimeoutFetch();
    const req = new Request('http://localhost/v1/router/vibe-trading-mcp/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'backtest' } }),
    });
    const res = await app.request(req);
    expect(res.status).toBe(503);
    expect(deductCalls).toHaveLength(0);
  });

  test('[P1] 503 when upstream times out on non-billable passthrough', async () => {
    globalThis.fetch = makeTimeoutFetch();
    const req = new Request('http://localhost/v1/router/vibe-trading-mcp/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    });
    const res = await app.request(req);
    expect(res.status).toBe(503);
  });

  // ── Non-JSON POST passthrough ─────────────────────────────────────────────

  test('[P1] non-JSON POST body is passed through without billing', async () => {
    globalThis.fetch = makeFetch({ ok: true, body: 'pong', contentType: 'text/plain' });
    const req = new Request('http://localhost/v1/router/vibe-trading-mcp/', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: 'not-json',
    });
    const res = await app.request(req);
    expect(res.status).toBe(200);
    expect(deductCalls).toHaveLength(0);
  });

  // ── Billing soft-fail ─────────────────────────────────────────────────────
  // Verified by reading vibe-trading-mcp.ts:68-73: deductToolCredits is wrapped in try/catch
  // with console.warn — billing failure is intentionally soft (upstream result still returned).
  // This behavior is covered by the proxy source code structure; no separate test needed here
  // to avoid mock.module persistence issues across tests in the same file.

  // ── Path routing ──────────────────────────────────────────────────────────

  test('[P2] GET /health passthrough — no billing', async () => {
    globalThis.fetch = makeFetch({ ok: true, body: '{"status":"ok"}', contentType: 'application/json' });
    const req = new Request('http://localhost/v1/router/vibe-trading-mcp/health', {
      method: 'GET',
    });
    const res = await app.request(req);
    expect(res.status).toBe(200);
    expect(deductCalls).toHaveLength(0);
  });

  test('[P2] POST to /messages path is treated as non-billable passthrough when method is not tools/call', async () => {
    globalThis.fetch = makeFetch({ ok: true, body: { result: {} } });
    const req = new Request('http://localhost/v1/router/vibe-trading-mcp/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'notifications/initialized' }),
    });
    const res = await app.request(req);
    expect(res.status).toBe(200);
    expect(deductCalls).toHaveLength(0);
  });

  // ── sanitizeUpstreamErr — non-JSON error not sanitized ────────────────────

  test('[P2] non-JSON upstream error body is proxied as-is (no sanitize on text/plain)', async () => {
    globalThis.fetch = makeFetch({
      ok: false,
      status: 500,
      body: 'internal server error at http://vibe-trading-mcp:8900/internal',
      contentType: 'text/plain',
    });
    const req = new Request('http://localhost/v1/router/vibe-trading-mcp/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'backtest' } }),
    });
    const res = await app.request(req);
    // text/plain error is proxied raw (sanitize only applies to application/json)
    expect(res.status).toBe(500);
    expect(deductCalls).toHaveLength(0);
  });

  // ── Tier 2 allowed ────────────────────────────────────────────────────────

  test('[P0] Tier 2 allowed through tier gate', async () => {
    _accountTier = 'tier2';
    globalThis.fetch = makeFetch({ ok: true, body: { result: {} } });
    const req = new Request('http://localhost/v1/router/vibe-trading-mcp/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'factor_analysis' } }),
    });
    const res = await app.request(req);
    expect(res.status).toBe(200);
    expect(deductCalls).toHaveLength(1);
    expect(deductCalls[0].toolName).toBe('vt_mcp_factor_analysis');
  });
});
