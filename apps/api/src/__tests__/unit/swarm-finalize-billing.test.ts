/**
 * Story 5.5.1 AC5 — finalize billing idempotency.
 *
 * Verifies the `runOwnership[run_id].finalized` flag guards against
 * double-charging when the OpenCode wrapper polls `get_run_result` after
 * the run already reached `completed`.
 */
import { describe, test, expect, mock, beforeEach } from 'bun:test';
import { Hono } from 'hono';
import type { AppContext } from '../../types';

let _accountId: string | undefined = 'acct-fin';
let _hasCredits = true;
let _accountTier: 'tier1' | 'tier2' | 'tier3' = 'tier2';

const deductCalls: Array<{ accountId: string; toolName: string }> = [];

mock.module('../../router/services/billing', () => ({
  checkCredits: async () => ({ hasCredits: _hasCredits }),
  deductToolCredits: async (accountId: string, toolName: string) => {
    deductCalls.push({ accountId, toolName });
    return { success: true, cost: 0.0, newBalance: 9.95 };
  },
  resolveAccountTier: async () => _accountTier,
}));

// Real config used — its TOOL_PRICING has the vt_mcp_run_swarm_finalize entry
// added by this story (Task 2.6). Avoids cross-file mock.module pollution with
// pricing.test.ts.

mock.module('../../lib/logger', () => ({
  logger: { info: () => undefined, warn: () => undefined, error: () => undefined, debug: () => undefined },
}));

type MockResp = { ok: boolean; status?: number; body: unknown };

function makeFetch(resp: MockResp): typeof fetch {
  return mock(async (): Promise<Response> => {
    const bodyStr = typeof resp.body === 'string' ? resp.body : JSON.stringify(resp.body);
    return {
      ok: resp.ok,
      status: resp.status ?? (resp.ok ? 200 : 500),
      headers: new Headers({ 'content-type': 'application/json' }),
      body: new ReadableStream({
        start(c) { c.enqueue(new TextEncoder().encode(bodyStr)); c.close(); },
      }),
      text: async () => bodyStr,
      json: async () => resp.body,
    } as unknown as Response;
  }) as unknown as typeof fetch;
}

function envelope(inner: unknown): unknown {
  return {
    jsonrpc: '2.0',
    id: 1,
    result: { content: [{ type: 'text', text: JSON.stringify(inner) }] },
  };
}

function callTool(name: string, args: Record<string, unknown> = {}): Request {
  return new Request('http://localhost/v1/router/vibe-trading-mcp/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }),
  });
}

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

describe('vt_mcp_run_swarm_finalize — idempotency (Story 5.5.1 AC5)', () => {
  let app: Hono<{ Variables: AppContext }>;
  const RUN_ID = 'run-finalize-001';

  beforeEach(async () => {
    _accountId = 'acct-fin';
    _hasCredits = true;
    _accountTier = 'tier2';
    deductCalls.length = 0;
    app = await makeApp();

    // Seed ownership via start_swarm so this account can call get_run_result.
    globalThis.fetch = makeFetch({
      ok: true,
      body: envelope({ run_id: RUN_ID, preset: 'investment_committee', status: 'started' }),
    });
    await app.request(callTool('start_swarm', { preset_name: 'investment_committee', variables: {} }));
    // Reset deduct calls so each test only sees its own
    deductCalls.length = 0;
  });

  test('[P0] first get_run_result with status=completed deducts finalize once', async () => {
    globalThis.fetch = makeFetch({
      ok: true,
      body: envelope({ run_id: RUN_ID, status: 'completed', final_report: 'all good', tasks: [] }),
    });
    const res = await app.request(callTool('get_run_result', { run_id: RUN_ID }));
    expect(res.status).toBe(200);

    const tools = deductCalls.map((d) => d.toolName);
    expect(tools).toContain('vt_mcp_get_run_result');
    expect(tools.filter((t) => t === 'vt_mcp_run_swarm_finalize')).toHaveLength(1);
  });

  test('[P0] second get_run_result for same run is a no-op for finalize', async () => {
    // First call: completed → finalize fires
    globalThis.fetch = makeFetch({
      ok: true,
      body: envelope({ run_id: RUN_ID, status: 'completed', final_report: 'all good', tasks: [] }),
    });
    await app.request(callTool('get_run_result', { run_id: RUN_ID }));
    deductCalls.length = 0;

    // Second call: same response, should NOT re-charge finalize
    await app.request(callTool('get_run_result', { run_id: RUN_ID }));
    const finalizeCalls = deductCalls.filter((d) => d.toolName === 'vt_mcp_run_swarm_finalize');
    expect(finalizeCalls).toHaveLength(0);
    // get_run_result itself is still billed (0 cost, but counted)
    expect(deductCalls.some((d) => d.toolName === 'vt_mcp_get_run_result')).toBe(true);
  });

  test('[P0] get_run_result with status=failed does NOT bill finalize', async () => {
    globalThis.fetch = makeFetch({
      ok: true,
      body: envelope({ run_id: RUN_ID, status: 'failed', error: 'agent died', tasks: [] }),
    });
    await app.request(callTool('get_run_result', { run_id: RUN_ID }));
    const finalizeCalls = deductCalls.filter((d) => d.toolName === 'vt_mcp_run_swarm_finalize');
    expect(finalizeCalls).toHaveLength(0);
  });

  test('[P0] get_run_result with status=cancelled does NOT bill finalize', async () => {
    globalThis.fetch = makeFetch({
      ok: true,
      body: envelope({ run_id: RUN_ID, status: 'cancelled', tasks: [] }),
    });
    await app.request(callTool('get_run_result', { run_id: RUN_ID }));
    const finalizeCalls = deductCalls.filter((d) => d.toolName === 'vt_mcp_run_swarm_finalize');
    expect(finalizeCalls).toHaveLength(0);
  });

  test('[P0] two parallel get_run_result with status=completed → exactly one finalize', async () => {
    globalThis.fetch = makeFetch({
      ok: true,
      body: envelope({ run_id: RUN_ID, status: 'completed', final_report: 'parity', tasks: [] }),
    });
    // Fire two in parallel — JS event loop guarantees serial, but the test
    // ensures the `finalized` flag claim happens before any await.
    const [r1, r2] = await Promise.all([
      app.request(callTool('get_run_result', { run_id: RUN_ID })),
      app.request(callTool('get_run_result', { run_id: RUN_ID })),
    ]);
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    const finalizeCalls = deductCalls.filter((d) => d.toolName === 'vt_mcp_run_swarm_finalize');
    expect(finalizeCalls).toHaveLength(1);
  });
});
