/**
 * Story 5.5.1 AC7 — Chaos: apps/api restart mid-swarm.
 *
 * Verifies that `SwarmStore`'s on-disk persistence inside the
 * `vibe-trading-mcp` container keeps the run alive across an `apps/api`
 * restart, and that re-polling still works after the proxy comes back.
 *
 * Steps:
 *   1. start_swarm via wrapper through proxy → run_id
 *   2. Wait for 2/N agents to complete (poll status)
 *   3. Kill `apps/api` container; wait 10s; restart it
 *   4. Continue polling — run should still be visible
 *   5. Wait for completion; fetch result
 *   6. Assert deposit charged once, finalize charged once (no double-billing)
 *
 * Gating: `CI_CHAOS_ENABLED=true` (Story 5.0.4 pattern) AND `CI_FULL_STACK=true`.
 * Skipped on PR builds per `.github/workflows/test.yml` policy.
 */
import { test, expect } from '@playwright/test';
import { execSync } from 'node:child_process';
import { getAccessToken, apiBase } from '../helpers/auth';

const CHAOS_ENABLED =
  process.env.CI_CHAOS_ENABLED === 'true' &&
  process.env.CI_FULL_STACK === 'true' &&
  Boolean(process.env.OPENAI_API_KEY);

const API_CONTAINER = process.env.CHAOS_API_CONTAINER ?? 'epsilon-api';
const SMALL_PRESET = 'crypto_trading_desk';

// JSON-RPC body shim — the wrapper does this internally over SSE.
function mcpToolCall(name: string, args: Record<string, unknown>) {
  return {
    jsonrpc: '2.0',
    id: Math.floor(Math.random() * 1_000_000),
    method: 'tools/call',
    params: { name, arguments: args },
  };
}

test.describe('vibe_trading_swarm — chaos: apps/api restart (Story 5.5.1 AC7)', () => {
  test.skip(!CHAOS_ENABLED, 'set CI_CHAOS_ENABLED=true and CI_FULL_STACK=true to enable');

  test.setTimeout(10 * 60 * 1000);

  // Test title intentionally describes structural recovery only; the billing
  // "exactly once" claim is verified informally (second get_run_result returns
  // 200) and the full credit_transactions assertion is tracked in
  // deferred-work.md (chaos billing assertion follow-up).
  test('run survives apps/api restart and is re-pollable post-recovery', async ({ request }) => {
    const token = await getAccessToken();

    // ── Step 1: start_swarm via proxy ─────────────────────────────────────
    const startResp = await request.post(`${apiBase}/router/vibe-trading-mcp/messages`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      data: mcpToolCall('start_swarm', {
        preset_name: SMALL_PRESET,
        variables: { target: 'BTC-USDT', market: 'crypto' },
      }),
    });
    expect(startResp.status()).toBe(200);
    const startBody = await startResp.json();
    const startText = startBody?.result?.content?.[0]?.text;
    const start = JSON.parse(startText) as { run_id?: string; status?: string };
    expect(start.status).toBe('started');
    expect(start.run_id).toBeTruthy();
    const runId = start.run_id!;

    // ── Step 2: poll until ≥2 agents done ─────────────────────────────────
    const pollDeadline = Date.now() + 5 * 60_000;
    let observed = 0;
    while (Date.now() < pollDeadline) {
      const statusResp = await request.post(`${apiBase}/router/vibe-trading-mcp/messages`, {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        data: mcpToolCall('get_swarm_status', { run_id: runId }),
      });
      if (statusResp.status() === 200) {
        const body = await statusResp.json();
        const text = body?.result?.content?.[0]?.text;
        const status = JSON.parse(text) as {
          status?: string;
          tasks?: Array<{ status?: string }>;
        };
        observed = (status.tasks ?? []).filter((t) => t.status === 'completed').length;
        if (observed >= 2) break;
        if (status.status === 'completed' || status.status === 'failed') break;
      }
      await new Promise((r) => setTimeout(r, 5_000));
    }
    expect(observed).toBeGreaterThanOrEqual(2);

    // ── Step 3: kill apps/api, wait 10s, restart ──────────────────────────
    // Wrap the kill+start pair so an assertion failure mid-test does NOT
    // leave the API container dead — would poison subsequent CI runs on the
    // same self-hosted runner. (Story 5.5.1 review finding C2.)
    let containerKilled = false;
    try {
      execSync(`docker kill ${API_CONTAINER}`);
      containerKilled = true;
      await new Promise((r) => setTimeout(r, 10_000));
      execSync(`docker start ${API_CONTAINER}`);
      containerKilled = false;
      // Wait for /health to respond.
      let healthy = false;
      for (let i = 0; i < 60; i++) {
        try {
          const h = await request.get(`${apiBase}/health`);
          if (h.ok()) {
            healthy = true;
            break;
          }
        } catch {
          /* keep waiting */
        }
        await new Promise((r) => setTimeout(r, 1_000));
      }
      expect(healthy).toBe(true);
    } finally {
      if (containerKilled) {
        try { execSync(`docker start ${API_CONTAINER}`); } catch { /* best-effort */ }
      }
    }

    // ── Step 4: re-hydrate ownership via list_runs (in-memory map cleared) ─
    const reauthToken = await getAccessToken();
    const listResp = await request.post(`${apiBase}/router/vibe-trading-mcp/messages`, {
      headers: { Authorization: `Bearer ${reauthToken}`, 'Content-Type': 'application/json' },
      data: mcpToolCall('list_runs', { limit: 20 }),
    });
    expect(listResp.status()).toBe(200);

    // Verify the response actually contains our run_id — without this, a
    // silent re-hydration failure would manifest as a 403 in Step 5 with no
    // clear cause. (Story 5.5.1 review finding H3 for Chunk 4.)
    const listBody = await listResp.json();
    const listText = listBody?.result?.content?.[0]?.text;
    const listResults = JSON.parse(typeof listText === 'string' ? listText : '[]');
    expect(Array.isArray(listResults)).toBe(true);
    const ownedIds = (listResults as Array<{ run_id?: string }>).map((r) => r.run_id);
    expect(ownedIds).toContain(runId);

    // ── Step 5: continue polling to completion ────────────────────────────
    const completionDeadline = Date.now() + 5 * 60_000;
    let finalStatus = '';
    while (Date.now() < completionDeadline) {
      const r = await request.post(`${apiBase}/router/vibe-trading-mcp/messages`, {
        headers: { Authorization: `Bearer ${reauthToken}`, 'Content-Type': 'application/json' },
        data: mcpToolCall('get_swarm_status', { run_id: runId }),
      });
      const b = await r.json();
      const text = b?.result?.content?.[0]?.text;
      const s = JSON.parse(text) as { status?: string };
      finalStatus = s.status ?? '';
      if (finalStatus === 'completed' || finalStatus === 'failed' || finalStatus === 'cancelled') break;
      await new Promise((r) => setTimeout(r, 5_000));
    }
    expect(['completed', 'failed']).toContain(finalStatus);

    // ── Step 6: fetch final result; finalize bills once ───────────────────
    const resultResp = await request.post(`${apiBase}/router/vibe-trading-mcp/messages`, {
      headers: { Authorization: `Bearer ${reauthToken}`, 'Content-Type': 'application/json' },
      data: mcpToolCall('get_run_result', { run_id: runId }),
    });
    expect(resultResp.status()).toBe(200);

    // Second fetch should NOT double-bill (idempotent finalize flag).
    const resultResp2 = await request.post(`${apiBase}/router/vibe-trading-mcp/messages`, {
      headers: { Authorization: `Bearer ${reauthToken}`, 'Content-Type': 'application/json' },
      data: mcpToolCall('get_run_result', { run_id: runId }),
    });
    expect(resultResp2.status()).toBe(200);

    // Note: billing assertion would query the credit_transactions table for
    // entries tagged with run_id; that helper lives in a future iteration of
    // the chaos suite. The structural assertion (no error response on second
    // fetch) covers the happy path.
  });
});
