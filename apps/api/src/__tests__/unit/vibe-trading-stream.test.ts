import { describe, test, expect, beforeEach, afterEach, afterAll, mock } from 'bun:test';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { AppContext } from '../../types';

// ─── Mocks ──────────────────────────────────────────────────────────────────
// Mock billing + config to avoid env requirements.
// Service mocked via globalThis.fetch (parity vibe-trading-route.test.ts approach).

mock.module('../../router/services/billing', () => ({
  checkCredits: async () => ({ hasCredits: true, balance: 10 }),
  deductToolCredits: async () => ({ success: true }),
}));

mock.module('../../config', () => ({
  config: {
    VIBE_TRADING_API_KEY: 'test-key',
    VIBE_TRADING_INTERNAL_URL: 'http://vibe-trading:8899',
  },
  getToolCost: () => 1.0,
}));

import {
  vibeTrading,
  classifyRunState,
  isTerminalEvent,
  type StreamEventName,
} from '../../router/routes/vibe-trading';

function makeApp() {
  const app = new Hono<{ Variables: AppContext }>();
  app.use('*', async (c, next) => {
    c.set('accountId', 'test-account');
    await next();
  });
  app.onError((err, c) => {
    if (err instanceof HTTPException) return err.getResponse();
    return c.json({ error: err.message }, 500);
  });
  app.route('/', vibeTrading);
  return app;
}

// ─── Pure helper tests ──────────────────────────────────────────────────────

describe('classifyRunState', () => {
  test('returns "phase_b" for status=success with metrics object', () => {
    expect(classifyRunState({ status: 'success', metrics: { sharpe: 1.2 } })).toBe('phase_b');
  });

  test('returns "data_loading" for status=success without metrics', () => {
    // Edge case: success status but no metrics object yet — treat as still loading
    expect(classifyRunState({ status: 'success' })).toBe('data_loading');
  });

  test('returns "phase_a" for status=unknown with data_summary present', () => {
    expect(classifyRunState({ status: 'unknown', data_summary: { rows: 100 } })).toBe('phase_a');
  });

  test('returns "data_loading" for status=unknown without data_summary', () => {
    expect(classifyRunState({ status: 'unknown' })).toBe('data_loading');
  });

  test('returns "failed" for status=failed', () => {
    expect(classifyRunState({ status: 'failed' })).toBe('failed');
  });

  test('returns "failed" for status=aborted', () => {
    expect(classifyRunState({ status: 'aborted' })).toBe('failed');
  });

  test('returns "data_loading" for status=pending', () => {
    expect(classifyRunState({ status: 'pending' })).toBe('data_loading');
  });

  test('returns "data_loading" for unrecognized status', () => {
    expect(classifyRunState({ status: 'weird' })).toBe('data_loading');
  });

  test('ignores non-object metrics (null) and treats success as data_loading', () => {
    expect(classifyRunState({ status: 'success', metrics: null })).toBe('data_loading');
  });

  test('ignores non-object data_summary (null) for unknown status', () => {
    expect(classifyRunState({ status: 'unknown', data_summary: null })).toBe('data_loading');
  });
});

describe('isTerminalEvent', () => {
  test('phase_b is terminal', () => expect(isTerminalEvent('phase_b')).toBe(true));
  test('failed is terminal', () => expect(isTerminalEvent('failed')).toBe(true));
  test('timeout is terminal', () => expect(isTerminalEvent('timeout')).toBe(true));
  test('data_loading is NOT terminal', () => expect(isTerminalEvent('data_loading')).toBe(false));
  test('phase_a is NOT terminal', () => expect(isTerminalEvent('phase_a')).toBe(false));
  test('heartbeat is NOT terminal', () => expect(isTerminalEvent('heartbeat' as StreamEventName)).toBe(false));
});

// ─── SSE endpoint integration tests ─────────────────────────────────────────

// Helper to read all SSE events from a Response body until close.
async function collectSSEEvents(res: Response, maxEvents = 10): Promise<Array<{ event: string; data: string }>> {
  const events: Array<{ event: string; data: string }> = [];
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let currentEvent = 'message';
  let currentData = '';

  while (events.length < maxEvents) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (line === '') {
        // Don't push heartbeat (empty data) events to keep tests focused
        if (currentData) {
          events.push({ event: currentEvent, data: currentData });
        } else if (currentEvent !== 'message') {
          events.push({ event: currentEvent, data: '' });
        }
        currentEvent = 'message';
        currentData = '';
      } else if (line.startsWith('event: ')) {
        currentEvent = line.slice(7).trim();
      } else if (line.startsWith('data: ')) {
        currentData += (currentData ? '\n' : '') + line.slice(6);
      } else if (line.startsWith('data:')) {
        currentData += (currentData ? '\n' : '') + line.slice(5);
      }
    }
  }
  reader.cancel().catch(() => {});
  return events;
}

describe('GET /vibe-trading/runs/:jobId/stream', () => {
  let capturedLogs: string[];
  let origLog: typeof console.log;

  beforeEach(() => {
    capturedLogs = [];
    origLog = console.log;
    console.log = (...args: unknown[]) => {
      capturedLogs.push(args.join(' '));
      origLog(...args);
    };
  });

  afterEach(() => {
    console.log = origLog;
    globalThis.fetch = fetch;
  });

  test('400 on invalid jobId format', async () => {
    const app = makeApp();
    const res = await app.request('/runs/bad%20id/stream');
    expect(res.status).toBe(400);
  });

  test('tier-bypass log emitted on stream open', async () => {
    // Mock VT returning success immediately so the stream closes quickly.
    globalThis.fetch = mock(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            run_id: 'abc-123',
            status: 'success',
            metrics: { sharpe: 1.2 },
            equity_curve: [],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    ) as unknown as typeof fetch;

    const app = makeApp();
    const res = await app.request('/runs/abc-123/stream');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    // Consume body so the stream loop actually runs to completion
    await collectSSEEvents(res, 3);

    expect(capturedLogs.some((l) => l.includes('[TIER-BYPASS-SUSPECT]') && l.includes('vibe_trading_stream'))).toBe(true);
  });

  test('emits "phase_b" event when VT returns metrics, then closes', async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            run_id: 'abc-123',
            status: 'success',
            metrics: { sharpe: 1.5, max_drawdown: 0.12, total_return: 0.34, win_rate: 0.6 },
            equity_curve: [{ timestamp: '2026-01-01', value: 10000, benchmark: 10000 }],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    ) as unknown as typeof fetch;

    const app = makeApp();
    const res = await app.request('/runs/abc-123/stream');
    const events = await collectSSEEvents(res, 5);

    // Should include at least one phase_b event
    const phaseB = events.find((e) => e.event === 'phase_b');
    expect(phaseB).toBeDefined();
    const parsed = JSON.parse(phaseB!.data);
    expect(parsed.success).toBe(true);
    expect(parsed.metrics).toBeDefined();
  });

  test('emits "failed" event when VT returns status: failed', async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            run_id: 'fail-123',
            status: 'failed',
            reason: 'Strategy raised exception',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    ) as unknown as typeof fetch;

    const app = makeApp();
    const res = await app.request('/runs/fail-123/stream');
    const events = await collectSSEEvents(res, 5);

    const failed = events.find((e) => e.event === 'failed');
    expect(failed).toBeDefined();
    const parsed = JSON.parse(failed!.data);
    expect(parsed.success).toBe(true);
    expect(parsed.status).toBe('failed');
  });

  test('emits "failed" with reason when downstream throws', async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response('Service down', { status: 503 })),
    ) as unknown as typeof fetch;

    const app = makeApp();
    const res = await app.request('/runs/down-123/stream');
    const events = await collectSSEEvents(res, 5);

    const failed = events.find((e) => e.event === 'failed');
    expect(failed).toBeDefined();
    const parsed = JSON.parse(failed!.data);
    expect(parsed.success).toBe(false);
    expect(typeof parsed.reason).toBe('string');
  });

  test('terminal event closes stream — phase_b emitted exactly once', async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            run_id: 'dup-123',
            status: 'success',
            metrics: { sharpe: 1.0 },
            equity_curve: [],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    ) as unknown as typeof fetch;

    const app = makeApp();
    const res = await app.request('/runs/dup-123/stream');
    const events = await collectSSEEvents(res, 10);

    const phaseBEvents = events.filter((e) => e.event === 'phase_b');
    expect(phaseBEvents.length).toBe(1);
  });

  test('dedupe: identical non-terminal states emit only on transition', async () => {
    // Sequence: data_loading × 3 → phase_a × 2 → phase_b (terminal).
    // Expect: exactly 1 data_loading + 1 phase_a + 1 phase_b event.
    let callCount = 0;
    globalThis.fetch = mock(() => {
      callCount++;
      let body: Record<string, unknown>;
      if (callCount <= 3) {
        body = { run_id: 'seq-1', status: 'unknown' };
      } else if (callCount <= 5) {
        body = { run_id: 'seq-1', status: 'unknown', data_summary: { 'BTC-USDT': { rows: 540 } } };
      } else {
        body = {
          run_id: 'seq-1',
          status: 'success',
          metrics: { sharpe: 1.2 },
          equity_curve: [],
        };
      }
      return Promise.resolve(
        new Response(JSON.stringify(body), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    }) as unknown as typeof fetch;

    const app = makeApp();
    const res = await app.request('/runs/seq-1/stream');
    const events = await collectSSEEvents(res, 20);

    const counts = {
      data_loading: events.filter((e) => e.event === 'data_loading').length,
      phase_a: events.filter((e) => e.event === 'phase_a').length,
      phase_b: events.filter((e) => e.event === 'phase_b').length,
    };
    expect(counts.data_loading).toBe(1);
    expect(counts.phase_a).toBe(1);
    expect(counts.phase_b).toBe(1);
    // Fetch called more than emit count → polling continued without re-emitting same state
    expect(callCount).toBeGreaterThanOrEqual(6);
  }, 15_000);

  test('UA log strips control chars (no log injection)', async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({ run_id: 'ua-1', status: 'success', metrics: { sharpe: 1 }, equity_curve: [] }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    ) as unknown as typeof fetch;

    // Note: Hono's fetch layer already rejects raw \r\n in headers (HTTP spec).
    // We defend in depth against tab chars + any other control chars that survive the layer.
    const app = makeApp();
    const res = await app.request('/runs/ua-1/stream', {
      headers: { 'user-agent': 'evil\t[FAKE]\tinjected=true' },
    });
    await collectSSEEvents(res, 3);

    const streamLog = capturedLogs.find((l) => l.includes('vibe_trading_stream'));
    expect(streamLog).toBeDefined();
    expect(streamLog).not.toContain('\t');
    expect(streamLog).toContain('evil');
    expect(streamLog).toContain('FAKE');
  });

  test('failed event does NOT trigger spurious timeout after it', async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response('boom', { status: 500 })),
    ) as unknown as typeof fetch;

    const app = makeApp();
    const res = await app.request('/runs/no-timeout/stream');
    const events = await collectSSEEvents(res, 5);

    expect(events.some((e) => e.event === 'failed')).toBe(true);
    expect(events.some((e) => e.event === 'timeout')).toBe(false);
  });
});

afterAll(() => {
  mock.restore();
});
