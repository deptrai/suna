/**
 * Story 5.5.1 — proxy 410 + ownership map + deposit billing.
 *
 * Covers AC1b (cross-account leak), AC2 (run_swarm deprecation via 410),
 * AC5 (deposit billing on start_swarm). Idempotency of finalize lives in
 * swarm-finalize-billing.test.ts.
 */
import { describe, test, expect, mock, beforeEach } from 'bun:test';
import { Hono } from 'hono';
import type { AppContext } from '../../types';

// ─── Mutable state ────────────────────────────────────────────────────────────

let _accountId: string | undefined = 'acct-A';
let _hasCredits = true;
let _accountTier: 'tier1' | 'tier2' | 'tier3' = 'tier2';

const deductCalls: Array<{ accountId: string; toolName: string; description?: string }> = [];

// ─── Module mocks (hoisted) ───────────────────────────────────────────────────

mock.module('../../router/services/billing', () => ({
  checkCredits: async () => ({ hasCredits: _hasCredits }),
  deductToolCredits: async (
    accountId: string,
    toolName: string,
    _resultCount: number,
    description?: string,
  ) => {
    deductCalls.push({ accountId, toolName, description });
    return { success: true, cost: 0.05, newBalance: 9.95 };
  },
  resolveAccountTier: async () => _accountTier,
}));

// Intentionally NOT mocking '../../config' here — the real config exports the
// vt_mcp_start_swarm / vt_mcp_run_swarm_finalize TOOL_PRICING entries this story
// adds, and mock.module is process-global in Bun so a stub here would bleed
// into pricing.test.ts when both files run in one `bun test` invocation.

mock.module('../../lib/logger', () => ({
  logger: { info: () => undefined, warn: () => undefined, error: () => undefined, debug: () => undefined },
}));

// ─── Fetch helpers ────────────────────────────────────────────────────────────

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
  }) as unknown as typeof fetch;
}

/**
 * Wrap a JSON value as a FastMCP tools/call response envelope.
 * Mirrors what the real VT MCP server returns from a `@mcp.tool` function.
 */
function fastMcpEnvelope(inner: unknown): unknown {
  return {
    jsonrpc: '2.0',
    id: 1,
    result: {
      content: [{ type: 'text', text: typeof inner === 'string' ? inner : JSON.stringify(inner) }],
    },
  };
}

function toolCallRequest(toolName: string, args: Record<string, unknown> = {}): Request {
  return new Request('http://localhost/v1/router/vibe-trading-mcp/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: toolName, arguments: args },
    }),
  });
}

// ─── App factory ──────────────────────────────────────────────────────────────

async function makeApp() {
  const { vibeTradingMcp, __resetOwnershipForTests } = await import(
    '../../router/routes/vibe-trading-mcp'
  );
  __resetOwnershipForTests();
  const app = new Hono<{ Variables: AppContext }>();
  app.use('/*', async (c, next) => {
    if (_accountId) c.set('accountId', _accountId);
    await next();
  });
  app.route('/v1/router/vibe-trading-mcp', vibeTradingMcp);
  return app;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('vibe-trading-mcp — async swarm pattern (Story 5.5.1)', () => {
  let app: Hono<{ Variables: AppContext }>;

  beforeEach(async () => {
    _accountId = 'acct-A';
    _hasCredits = true;
    _accountTier = 'tier2';
    deductCalls.length = 0;
    app = await makeApp();
  });

  // ── AC2: 410 Gone for run_swarm ───────────────────────────────────────────

  test('[P0] tools/call run_swarm returns 410 Gone with migration hint', async () => {
    globalThis.fetch = makeFetch({ ok: true, body: fastMcpEnvelope({}) });
    const res = await app.request(toolCallRequest('run_swarm', { preset_name: 'investment_committee', variables: {} }));
    expect(res.status).toBe(410);
    const body = (await res.json()) as { error: string; migration?: string };
    expect(body.error).toContain('deprecated');
    expect(body.migration).toContain('5-5-1');
    expect(deductCalls).toHaveLength(0);
  });

  test('[P0] run_swarm 410 fires AFTER tier gate — tier 1 still 403 first', async () => {
    _accountTier = 'tier1';
    globalThis.fetch = makeFetch({ ok: true, body: fastMcpEnvelope({}) });
    const res = await app.request(toolCallRequest('run_swarm', {}));
    expect(res.status).toBe(403);
    expect(deductCalls).toHaveLength(0);
  });

  test('[P0] run_swarm 410 fires BEFORE credit check — no 402 for billable-but-deprecated', async () => {
    _hasCredits = false;
    globalThis.fetch = makeFetch({ ok: true, body: fastMcpEnvelope({}) });
    const res = await app.request(toolCallRequest('run_swarm', {}));
    expect(res.status).toBe(410);
  });

  // ── AC1 + AC5: start_swarm happy path billing ─────────────────────────────

  test('[P0] start_swarm success bills vt_mcp_start_swarm (deposit) exactly once', async () => {
    globalThis.fetch = makeFetch({
      ok: true,
      body: fastMcpEnvelope({ run_id: 'run-001', preset: 'investment_committee', status: 'started' }),
    });
    const res = await app.request(toolCallRequest('start_swarm', { preset_name: 'investment_committee', variables: {} }));
    expect(res.status).toBe(200);
    expect(deductCalls).toHaveLength(1);
    expect(deductCalls[0].toolName).toBe('vt_mcp_start_swarm');
  });

  test('[P0] start_swarm error response does NOT bill', async () => {
    globalThis.fetch = makeFetch({ ok: false, status: 422, body: { error: 'preset unknown' } });
    const res = await app.request(toolCallRequest('start_swarm', { preset_name: 'bogus', variables: {} }));
    expect(res.status).toBe(422);
    expect(deductCalls).toHaveLength(0);
  });

  // ── AC1b: ownership gating cross-account ──────────────────────────────────

  test('[P0] account A starts run, account B cannot read status (403)', async () => {
    // Start as A
    globalThis.fetch = makeFetch({
      ok: true,
      body: fastMcpEnvelope({ run_id: 'run-xyz', preset: 'investment_committee', status: 'started' }),
    });
    const start = await app.request(toolCallRequest('start_swarm', { preset_name: 'investment_committee', variables: {} }));
    expect(start.status).toBe(200);
    expect(deductCalls).toHaveLength(1);
    deductCalls.length = 0;

    // Switch to B and try to read status
    _accountId = 'acct-B';
    globalThis.fetch = makeFetch({
      ok: true,
      body: fastMcpEnvelope({ run_id: 'run-xyz', status: 'running', tasks: [] }),
    });
    const res = await app.request(toolCallRequest('get_swarm_status', { run_id: 'run-xyz' }));
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: string };
    expect(body.error.toLowerCase()).toContain('not owned');
    expect(deductCalls).toHaveLength(0); // no billing on rejected ownership
  });

  test('[P0] owner can read status of their own run (200)', async () => {
    globalThis.fetch = makeFetch({
      ok: true,
      body: fastMcpEnvelope({ run_id: 'run-001', preset: 'investment_committee', status: 'started' }),
    });
    await app.request(toolCallRequest('start_swarm', { preset_name: 'investment_committee', variables: {} }));
    deductCalls.length = 0;

    globalThis.fetch = makeFetch({
      ok: true,
      body: fastMcpEnvelope({ run_id: 'run-001', status: 'running', tasks: [] }),
    });
    const res = await app.request(toolCallRequest('get_swarm_status', { run_id: 'run-001' }));
    expect(res.status).toBe(200);
    // get_swarm_status is free poll, but still incurs a deduct call with $0
    expect(deductCalls).toHaveLength(1);
    expect(deductCalls[0].toolName).toBe('vt_mcp_get_swarm_status');
  });

  test('[P0] unknown run_id (proxy restart simulation) returns 403 fail-closed', async () => {
    globalThis.fetch = makeFetch({
      ok: true,
      body: fastMcpEnvelope({ run_id: 'ghost', status: 'running', tasks: [] }),
    });
    const res = await app.request(toolCallRequest('get_swarm_status', { run_id: 'ghost' }));
    expect(res.status).toBe(403);
    expect(deductCalls).toHaveLength(0);
  });

  test('[P0] cancel_swarm gated by ownership too', async () => {
    globalThis.fetch = makeFetch({
      ok: true,
      body: fastMcpEnvelope({ run_id: 'run-bb', preset: 'x', status: 'started' }),
    });
    await app.request(toolCallRequest('start_swarm', { preset_name: 'x', variables: {} }));
    deductCalls.length = 0;

    _accountId = 'attacker';
    const res = await app.request(toolCallRequest('cancel_swarm', { run_id: 'run-bb' }));
    expect(res.status).toBe(403);
    expect(deductCalls).toHaveLength(0);
  });

  test('[P0] missing run_id argument on ownership-gated tool returns 400', async () => {
    const res = await app.request(toolCallRequest('get_swarm_status', {}));
    expect(res.status).toBe(400);
    expect(deductCalls).toHaveLength(0);
  });

  // ── AC1b: ownership re-hydration via list_runs ────────────────────────────

  test('[P0] list_runs re-hydrates ownership map after proxy restart', async () => {
    // Simulate restart: no ownership for run-old. list_runs response includes it.
    globalThis.fetch = makeFetch({
      ok: true,
      body: fastMcpEnvelope([
        { run_id: 'run-old', preset: 'x', status: 'completed', created_at: '2026-05-19' },
      ]),
    });
    const lr = await app.request(toolCallRequest('list_runs', { limit: 20 }));
    expect(lr.status).toBe(200);
    deductCalls.length = 0;

    // Now the same account can read status of run-old
    globalThis.fetch = makeFetch({
      ok: true,
      body: fastMcpEnvelope({ run_id: 'run-old', status: 'completed', tasks: [] }),
    });
    const res = await app.request(toolCallRequest('get_swarm_status', { run_id: 'run-old' }));
    expect(res.status).toBe(200);
  });

  test('[P0] start_swarm deposit billed ONCE per successful retry attempt', async () => {
    // Two sequential start_swarm calls (caller retry pattern), each gets its
    // own run_id + status=started. Expect exactly 2 deposit deducts — neither
    // double-billed nor silently collapsed. Story 5.5.1 AC6 spec row.
    globalThis.fetch = makeFetch({
      ok: true,
      body: fastMcpEnvelope({ run_id: 'run-retry-1', preset: 'x', status: 'started' }),
    });
    const r1 = await app.request(toolCallRequest('start_swarm', { preset_name: 'x', variables: {} }));
    expect(r1.status).toBe(200);

    globalThis.fetch = makeFetch({
      ok: true,
      body: fastMcpEnvelope({ run_id: 'run-retry-2', preset: 'x', status: 'started' }),
    });
    const r2 = await app.request(toolCallRequest('start_swarm', { preset_name: 'x', variables: {} }));
    expect(r2.status).toBe(200);

    const deposits = deductCalls.filter((c) => c.toolName === 'vt_mcp_start_swarm');
    expect(deposits).toHaveLength(2);
  });

  test('[P0] list_runs does NOT overwrite existing ownership (cannot steal)', async () => {
    // A starts run-aa
    globalThis.fetch = makeFetch({
      ok: true,
      body: fastMcpEnvelope({ run_id: 'run-aa', preset: 'x', status: 'started' }),
    });
    await app.request(toolCallRequest('start_swarm', { preset_name: 'x', variables: {} }));
    deductCalls.length = 0;

    // B calls list_runs which happens to include run-aa
    _accountId = 'acct-B';
    globalThis.fetch = makeFetch({
      ok: true,
      body: fastMcpEnvelope([
        { run_id: 'run-aa', preset: 'x', status: 'running', created_at: '2026-05-19' },
      ]),
    });
    await app.request(toolCallRequest('list_runs', { limit: 20 }));
    deductCalls.length = 0;

    // B should still NOT be able to read run-aa
    globalThis.fetch = makeFetch({
      ok: true,
      body: fastMcpEnvelope({ run_id: 'run-aa', status: 'running', tasks: [] }),
    });
    const res = await app.request(toolCallRequest('get_swarm_status', { run_id: 'run-aa' }));
    expect(res.status).toBe(403);
  });
});
