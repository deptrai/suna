/**
 * vibe_trading_swarm wrapper — unit tests (Story 5.5.1 AC6).
 *
 * Strategy: mock `../lib/mcp-sse-client` so we don't exercise the real
 * SSE machinery; substitute a stub class whose `callTool` returns a
 * scripted sequence of responses per tool name.
 */
import { describe, test, expect, mock, beforeEach } from 'bun:test';

mock.module('../lib/get-env', () => ({
  getEnv: (key: string) => {
    if (key === 'EPSILON_TOKEN') return 'test-token';
    if (key === 'EPSILON_API_URL') return 'http://epsilon-api:8008';
    return undefined;
  },
}));

// Mutable script for the mocked MCP client — each test sets per-tool queues.
type ToolName = 'start_swarm' | 'get_swarm_status' | 'get_run_result' | 'cancel_swarm';
type Script = Partial<Record<ToolName, string[]>>;
let script: Script = {};
const calls: Array<{ tool: ToolName; args: unknown }> = [];

mock.module('../lib/mcp-sse-client', () => ({
  McpSseClient: class {
    constructor(_opts: unknown) {}
    async connect() { /* no-op */ }
    async callTool(name: string, args: Record<string, unknown>): Promise<string> {
      calls.push({ tool: name as ToolName, args });
      const queue = script[name as ToolName];
      if (!queue || queue.length === 0) {
        throw new Error(`no scripted response for ${name}`);
      }
      const next = queue.shift()!;
      if (next.startsWith('THROW:')) {
        throw new Error(next.slice('THROW:'.length));
      }
      return next;
    }
    close() { /* no-op */ }
  },
}));

import vibeTradingSwarm, { __testHooks } from '../vibe_trading_swarm';

/**
 * Make `sleep` resolve instantly via the wrapper's injectable hook so the 5s
 * poll cadence doesn't slow tests. Returns a restore function. Replaces the
 * earlier globalThis.setTimeout patch — that approach was unsafe under
 * parallel test execution (Story 5.5.1 review finding M6).
 */
function speedUpSleep() {
  const original = __testHooks.sleep;
  __testHooks.sleep = () => Promise.resolve();
  return () => { __testHooks.sleep = original; };
}

const VALID_ARGS = {
  preset: 'investment_committee',
  variables: { target: 'AAPL.US', market: 'US' },
};

describe('vibe_trading_swarm wrapper (Story 5.5.1)', () => {
  beforeEach(() => {
    script = {};
    calls.length = 0;
  });

  test('[P0] poll loop terminates when status=completed and returns final report', async () => {
    const restoreSleep = speedUpSleep();
    try {
      script = {
        start_swarm: [JSON.stringify({ run_id: 'run-aa', preset: 'investment_committee', status: 'started' })],
        get_swarm_status: [
          JSON.stringify({ status: 'running', tasks: [{ status: 'completed' }, { status: 'running' }] }),
          JSON.stringify({ status: 'completed', tasks: [{ status: 'completed' }, { status: 'completed' }] }),
        ],
        get_run_result: [JSON.stringify({ status: 'completed', final_report: '# Final report\n\nResults...' })],
      };
      const out = await vibeTradingSwarm.execute(VALID_ARGS, {} as never);
      const text = typeof out === 'string' ? out : out.output;
      expect(text).toContain('▶️ Swarm started: investment_committee');
      expect(text).toContain('Final report');
      // start_swarm was called exactly once
      expect(calls.filter((c) => c.tool === 'start_swarm')).toHaveLength(1);
      // Should NOT have called cancel_swarm on the happy path
      expect(calls.some((c) => c.tool === 'cancel_swarm')).toBe(false);
    } finally {
      restoreSleep();
    }
  });

  test('[P0] surfaces progress lines as tasks complete', async () => {
    const restoreSleep = speedUpSleep();
    try {
      script = {
        start_swarm: [JSON.stringify({ run_id: 'run-bb', preset: 'p', status: 'started' })],
        get_swarm_status: [
          JSON.stringify({ status: 'running', tasks: [{ status: 'completed' }, { status: 'running' }, { status: 'pending' }] }),
          JSON.stringify({ status: 'running', tasks: [{ status: 'completed' }, { status: 'completed' }, { status: 'running' }] }),
          JSON.stringify({ status: 'completed', tasks: [{ status: 'completed' }, { status: 'completed' }, { status: 'completed' }] }),
        ],
        get_run_result: [JSON.stringify({ status: 'completed', final_report: 'Done.' })],
      };
      const out = await vibeTradingSwarm.execute(VALID_ARGS, {} as never);
      const text = typeof out === 'string' ? out : out.output;
      expect(text).toContain('⏳ 1/3 agents complete');
      expect(text).toContain('⏳ 2/3 agents complete');
      expect(text).toContain('⏳ 3/3 agents complete');
    } finally {
      restoreSleep();
    }
  });

  test('[P0] start_swarm error returns failure JSON without spawning poll loop', async () => {
    script = {
      start_swarm: [JSON.stringify({ status: 'error', error: 'unknown preset' })],
    };
    const out = await vibeTradingSwarm.execute({ preset: 'bogus', variables: {} }, {} as never);
    const text = typeof out === 'string' ? out : out.output;
    const parsed = JSON.parse(text);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain('unknown preset');
    expect(calls.filter((c) => c.tool === 'get_swarm_status')).toHaveLength(0);
  });

  test('[P0] abort signal fires cancel_swarm before returning', async () => {
    const restoreSleep = speedUpSleep();
    try {
      script = {
        start_swarm: [JSON.stringify({ run_id: 'run-cancelme', preset: 'p', status: 'started' })],
        // No status responses needed because abort triggers before first poll completes
        cancel_swarm: [JSON.stringify({ status: 'cancelling', run_id: 'run-cancelme' })],
      };
      const aborter = new AbortController();
      aborter.abort();
      const out = await vibeTradingSwarm.execute(VALID_ARGS, { abort: aborter.signal } as never);
      const text = typeof out === 'string' ? out : out.output;
      expect(text).toContain('🛑 Cancelled by user');
      expect(text).toContain('run-cancelme');
      expect(calls.some((c) => c.tool === 'cancel_swarm')).toBe(true);
    } finally {
      restoreSleep();
    }
  });

  test('[P0] missing EPSILON_TOKEN returns failure early without MCP call', async () => {
    // Inject a getEnv that returns undefined for EPSILON_TOKEN. The injectable
    // hook is reliable across re-runs (Bun's `mock.module` cache is not).
    // (Story 5.5.1 review finding M5.)
    const origGetEnv = __testHooks.getEnv;
    __testHooks.getEnv = (key: string) =>
      key === 'EPSILON_API_URL' ? 'http://test' : undefined;
    try {
      const out = await vibeTradingSwarm.execute(VALID_ARGS, {} as never);
      const text = typeof out === 'string' ? out : out.output;
      expect(text).toContain('EPSILON_TOKEN not set');
    } finally {
      __testHooks.getEnv = origGetEnv;
    }
  });

  test('[P0] get_swarm_status transient error keeps polling and eventually succeeds', async () => {
    const restoreSleep = speedUpSleep();
    try {
      script = {
        start_swarm: [JSON.stringify({ run_id: 'run-dd', preset: 'p', status: 'started' })],
        get_swarm_status: [
          'THROW:proxy 503', // transient — skipped
          JSON.stringify({ status: 'completed', tasks: [{ status: 'completed' }] }),
        ],
        get_run_result: [JSON.stringify({ status: 'completed', final_report: 'OK' })],
      };
      const out = await vibeTradingSwarm.execute(VALID_ARGS, {} as never);
      const text = typeof out === 'string' ? out : out.output;
      expect(text).toContain('OK');
    } finally {
      restoreSleep();
    }
  });

  // ── Story 5.5.1 review patches — additional terminal-path coverage ──────

  test('[P0] status=failed returns inline failure without calling get_run_result', async () => {
    const restoreSleep = speedUpSleep();
    try {
      script = {
        start_swarm: [JSON.stringify({ run_id: 'run-fail', preset: 'p', status: 'started' })],
        get_swarm_status: [
          JSON.stringify({ status: 'running', tasks: [{ status: 'running' }] }),
          JSON.stringify({ status: 'failed', tasks: [{ status: 'failed' }] }),
        ],
      };
      const out = await vibeTradingSwarm.execute(VALID_ARGS, {} as never);
      const text = typeof out === 'string' ? out : out.output;
      expect(text).toContain('failed');
      expect(text).toContain('run-fail');
      // Wrapper must NOT call get_run_result on failed runs (P26 / H3).
      expect(calls.some((c) => c.tool === 'get_run_result')).toBe(false);
    } finally {
      restoreSleep();
    }
  });

  test('[P0] MCP-level status=error (run not found) breaks the poll loop immediately', async () => {
    const restoreSleep = speedUpSleep();
    try {
      script = {
        start_swarm: [JSON.stringify({ run_id: 'run-x', preset: 'p', status: 'started' })],
        get_swarm_status: [
          JSON.stringify({ status: 'error', error: 'Run run-x not found' }),
        ],
      };
      const out = await vibeTradingSwarm.execute(VALID_ARGS, {} as never);
      const text = typeof out === 'string' ? out : out.output;
      expect(text).toContain('not accessible');
      expect(text).toContain('Run run-x not found');
      // Only one status poll before the wrapper exits (no infinite loop).
      expect(calls.filter((c) => c.tool === 'get_swarm_status')).toHaveLength(1);
    } finally {
      restoreSleep();
    }
  });

  test('[P0] 30-min client timeout fires cancel_swarm and returns timeout error', async () => {
    // Shrink the wrapper's max-poll budget so the timeout path fires after a
    // few iterations, without waiting 30 minutes. Combined with a real (short)
    // sleep so wall-clock advances past the budget — speedUpSleep would
    // exhaust the script too fast and hit the consecutive-error path instead.
    const origMax = __testHooks.maxPollDurationMs;
    const origSleep = __testHooks.sleep;
    __testHooks.maxPollDurationMs = 30; // ms
    __testHooks.sleep = (_ms) => new Promise<void>((r) => setTimeout(r, 15)); // 15ms per iteration
    try {
      script = {
        start_swarm: [JSON.stringify({ run_id: 'run-slow', preset: 'p', status: 'started' })],
        // Status never reaches terminal — every poll says still running.
        get_swarm_status: Array.from({ length: 50 }, () =>
          JSON.stringify({ status: 'running', tasks: [{ status: 'running' }] }),
        ),
        cancel_swarm: [JSON.stringify({ status: 'cancelling', run_id: 'run-slow' })],
      };
      const out = await vibeTradingSwarm.execute(VALID_ARGS, {} as never);
      const text = typeof out === 'string' ? out : out.output;
      expect(text).toContain('timed out');
      expect(text).toContain('run-slow');
      // Cancel must have fired so server-side compute stops.
      expect(calls.some((c) => c.tool === 'cancel_swarm')).toBe(true);
    } finally {
      __testHooks.maxPollDurationMs = origMax;
      __testHooks.sleep = origSleep;
    }
  });

  test('[P0] consecutive get_swarm_status errors hit retry limit and surface error', async () => {
    const restoreSleep = speedUpSleep();
    try {
      script = {
        start_swarm: [JSON.stringify({ run_id: 'run-flaky', preset: 'p', status: 'started' })],
        // 6 throws in a row exceeds MAX_CONSECUTIVE_STATUS_ERRORS=5.
        get_swarm_status: [
          'THROW:proxy 500',
          'THROW:proxy 500',
          'THROW:proxy 500',
          'THROW:proxy 500',
          'THROW:proxy 500',
          'THROW:proxy 500',
        ],
      };
      const out = await vibeTradingSwarm.execute(VALID_ARGS, {} as never);
      const text = typeof out === 'string' ? out : out.output;
      expect(text).toMatch(/polling failed/i);
      expect(text).toContain('run-flaky');
    } finally {
      restoreSleep();
    }
  });

  test('[P0] 4xx error (403 ownership-violation) breaks poll immediately', async () => {
    const restoreSleep = speedUpSleep();
    try {
      script = {
        start_swarm: [JSON.stringify({ run_id: 'run-403', preset: 'p', status: 'started' })],
        get_swarm_status: ['THROW:proxy returned status 403'],
      };
      const out = await vibeTradingSwarm.execute(VALID_ARGS, {} as never);
      const text = typeof out === 'string' ? out : out.output;
      expect(text).toContain('access denied');
      expect(text).toContain('run-403');
      // Single status call, no retry — 4xx is permanent (P24 / H1).
      expect(calls.filter((c) => c.tool === 'get_swarm_status')).toHaveLength(1);
    } finally {
      restoreSleep();
    }
  });
});
