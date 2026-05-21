import { describe, test, expect, mock, beforeEach } from 'bun:test';
import { Hono } from 'hono';
import type { AppContext } from '../../types';

// ─── Mutable state ────────────────────────────────────────────────────────────

let _accountId: string | undefined = 'acct-123';
let _hasCredits = true;
let _accountTier: 'free' | 'pro' | 'enterprise' = 'pro';

const deductCalls: Array<{ toolName: string }> = [];

// ─── Module mocks (hoisted) ───────────────────────────────────────────────────

mock.module('../../router/services/billing', () => ({
  checkCredits: async () => ({ hasCredits: _hasCredits }),
  deductToolCredits: async (_accountId: string, toolName: string) => {
    deductCalls.push({ toolName });
    return { success: true, cost: 0.05, newBalance: 9.95 };
  },
  // no-op: required by llm.ts import when test files run in combined suite
  deductLLMCredits: async () => ({ success: true }),
  resolveAccountTier: async () => _accountTier,
}));

mock.module('../../config', () => ({
  config: { VIBE_TRADING_MCP_URL: 'http://vt-mcp-test:8900' },
  getToolCost: (name: string) => name === 'vt_mcp_get_market_data' ? 0.05 : 0.01,
}));

mock.module('../../lib/logger', () => ({
  logger: { info: () => undefined, warn: () => undefined, error: () => undefined, debug: () => undefined },
}));

// ─── Fetch mock helpers ───────────────────────────────────────────────────────

type MockResp = { ok: boolean; status?: number; body: unknown; contentType?: string };

function makeFetch(resp: MockResp): typeof fetch {
  return mock(async (): Promise<Response> => {
    const ct = resp.contentType ?? (resp.ok ? 'application/json' : 'application/json');
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

describe('vibe-trading-mcp proxy', () => {
  let app: Hono<{ Variables: AppContext }>;

  beforeEach(async () => {
    _accountId = 'acct-123';
    _hasCredits = true;
    _accountTier = 'pro';
    deductCalls.length = 0;
    app = await makeApp();
  });

  // ── Auth ──────────────────────────────────────────────────────────────────

  test('[P0] 401 when accountId missing (JWT-only path)', async () => {
    _accountId = undefined;
    const req = new Request('http://localhost/v1/router/vibe-trading-mcp/sse', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'get_market_data' } }),
    });
    const res = await app.request(req);
    expect(res.status).toBe(401);
  });

  // ── Tier gate ─────────────────────────────────────────────────────────────

  test('[P0] 403 when Tier 1 calls tools/call', async () => {
    _accountTier = 'free';
    globalThis.fetch = makeFetch({ ok: true, body: { result: {} } });
    const req = new Request('http://localhost/v1/router/vibe-trading-mcp/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'get_market_data' } }),
    });
    const res = await app.request(req);
    expect(res.status).toBe(403);
    const body = await res.json() as { error: string };
    expect(body.error).toContain('Pro tier');
    expect(deductCalls).toHaveLength(0);
  });

  test('[P0] Tier 3 allowed through tier gate', async () => {
    _accountTier = 'enterprise';
    globalThis.fetch = makeFetch({ ok: true, body: { result: {} } });
    const req = new Request('http://localhost/v1/router/vibe-trading-mcp/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'get_market_data' } }),
    });
    const res = await app.request(req);
    expect(res.status).toBe(200);
    expect(deductCalls).toHaveLength(1);
  });

  // ── Billing ───────────────────────────────────────────────────────────────

  test('[P0] 402 when insufficient credits', async () => {
    _hasCredits = false;
    const req = new Request('http://localhost/v1/router/vibe-trading-mcp/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'get_market_data' } }),
    });
    const res = await app.request(req);
    expect(res.status).toBe(402);
    expect(deductCalls).toHaveLength(0);
  });

  test('[P0] deductToolCredits called with vt_mcp_ prefix on success', async () => {
    globalThis.fetch = makeFetch({ ok: true, body: { result: { content: [] } } });
    const req = new Request('http://localhost/v1/router/vibe-trading-mcp/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'get_market_data' } }),
    });
    const res = await app.request(req);
    expect(res.status).toBe(200);
    expect(deductCalls).toHaveLength(1);
    expect(deductCalls[0].toolName).toBe('vt_mcp_get_market_data');
  });

  test('[P0] deductToolCredits NOT called when upstream returns error', async () => {
    globalThis.fetch = makeFetch({ ok: false, status: 500, body: { error: 'internal' } });
    const req = new Request('http://localhost/v1/router/vibe-trading-mcp/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'get_market_data' } }),
    });
    await app.request(req);
    expect(deductCalls).toHaveLength(0);
  });

  // ── Fail-open hardening ───────────────────────────────────────────────────

  test('[P0] 400 on tools/call with missing params.name (fail-open prevention)', async () => {
    const req = new Request('http://localhost/v1/router/vibe-trading-mcp/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: {} }),
    });
    const res = await app.request(req);
    expect(res.status).toBe(400);
    expect(deductCalls).toHaveLength(0);
  });

  test('[P0] 400 on tools/call with non-string params.name', async () => {
    const req = new Request('http://localhost/v1/router/vibe-trading-mcp/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 42 } }),
    });
    const res = await app.request(req);
    expect(res.status).toBe(400);
  });

  // ── Non-billable passthrough ──────────────────────────────────────────────

  test('[P0] tools/list passthrough — no billing, no tier check', async () => {
    _accountTier = 'free'; // even free tier can list tools
    globalThis.fetch = makeFetch({ ok: true, body: { result: { tools: [] } } });
    const req = new Request('http://localhost/v1/router/vibe-trading-mcp/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    });
    const res = await app.request(req);
    expect(res.status).toBe(200);
    expect(deductCalls).toHaveLength(0);
  });

  test('[P0] initialize passthrough — no billing', async () => {
    globalThis.fetch = makeFetch({ ok: true, body: { result: { protocolVersion: '2024-11-05' } } });
    const req = new Request('http://localhost/v1/router/vibe-trading-mcp/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }),
    });
    const res = await app.request(req);
    expect(res.status).toBe(200);
    expect(deductCalls).toHaveLength(0);
  });

  // ── SSE / GET passthrough ─────────────────────────────────────────────────

  test('[P0] GET /sse passthrough — no billing, streams body', async () => {
    globalThis.fetch = makeFetch({ ok: true, body: '', contentType: 'text/event-stream' });
    const req = new Request('http://localhost/v1/router/vibe-trading-mcp/sse', {
      method: 'GET',
      headers: { 'Accept': 'text/event-stream' },
    });
    const res = await app.request(req);
    expect(res.status).toBe(200);
    expect(deductCalls).toHaveLength(0);
  });

  // ── sanitizeUpstreamErr ───────────────────────────────────────────────────

  test('[P1] sanitizeUpstreamErr applied to JSON error response (not SSE)', async () => {
    globalThis.fetch = makeFetch({
      ok: false,
      status: 422,
      body: '{"error":"internal error at http://vibe-trading-mcp:8900/internal/path"}',
      contentType: 'application/json',
    });
    const req = new Request('http://localhost/v1/router/vibe-trading-mcp/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'get_market_data' } }),
    });
    const res = await app.request(req);
    expect(res.status).toBe(422);
    const body = await res.json() as { error: string };
    // Internal URL must be stripped
    expect(body.error).not.toContain('http://vibe-trading-mcp');
  });

  // ── Unknown tool name ─────────────────────────────────────────────────────

  test('[P1] unknown tool name uses default pricing ($0.01) — deduct still called', async () => {
    globalThis.fetch = makeFetch({ ok: true, body: { result: {} } });
    const req = new Request('http://localhost/v1/router/vibe-trading-mcp/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'future_tool_v2' } }),
    });
    const res = await app.request(req);
    expect(res.status).toBe(200);
    expect(deductCalls).toHaveLength(1);
    expect(deductCalls[0].toolName).toBe('vt_mcp_future_tool_v2');
  });
});
