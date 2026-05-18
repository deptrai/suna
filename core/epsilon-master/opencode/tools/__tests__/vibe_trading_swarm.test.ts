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

import vibeTradingSwarm from '../vibe_trading_swarm';

/** Make `sleep` resolve instantly so the 5s poll cadence doesn't slow tests. */
function speedUpSleep() {
  const originalTimeout = globalThis.setTimeout;
  globalThis.setTimeout = ((cb: () => void, _ms?: number) =>
    originalTimeout(cb, 0)) as unknown as typeof setTimeout;
  return () => { globalThis.setTimeout = originalTimeout; };
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
    // Re-mock get-env to return undefined for the token
    mock.module('../lib/get-env', () => ({
      getEnv: (key: string) => (key === 'EPSILON_API_URL' ? 'http://test' : undefined),
    }));
    // Re-import to pick up the new mock
    const { default: tool2 } = await import('../vibe_trading_swarm');
    const out = await tool2.execute(VALID_ARGS, {} as never);
    const text = typeof out === 'string' ? out : out.output;
    expect(text).toContain('EPSILON_TOKEN not set');
    // Restore mock for subsequent tests in the same file
    mock.module('../lib/get-env', () => ({
      getEnv: (key: string) => {
        if (key === 'EPSILON_TOKEN') return 'test-token';
        if (key === 'EPSILON_API_URL') return 'http://epsilon-api:8008';
        return undefined;
      },
    }));
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
});
