import { describe, test, expect, beforeEach, afterEach, mock, afterAll } from 'bun:test';

// ── Mock createSSEStream BEFORE importing backtest-api ───────────────────────
// Records calls and exposes hooks so tests can emit fake events.
type FakeSSEStream = {
  connect: () => void;
  close: () => void;
  addEventListener: (event: string, handler: (data: string) => void) => void;
  removeEventListener: (event: string, handler: (data: string) => void) => void;
};
let lastSSEOptions: Record<string, unknown> | null = null;
let lastSSEListeners: Map<string, Array<(data: string) => void>> = new Map();
let lastSSEClosed = false;
let connectCalled = false;
function emitToLastStream(event: string, data: string) {
  const handlers = lastSSEListeners.get(event);
  if (handlers) for (const h of handlers) h(data);
}
mock.module('@/lib/utils/sse-stream', () => ({
  createSSEStream: (opts: Record<string, unknown>): FakeSSEStream => {
    lastSSEOptions = opts;
    lastSSEListeners = new Map();
    lastSSEClosed = false;
    connectCalled = false;
    return {
      connect: () => {
        connectCalled = true;
      },
      close: () => {
        lastSSEClosed = true;
      },
      addEventListener: (event, handler) => {
        if (!lastSSEListeners.has(event)) lastSSEListeners.set(event, []);
        lastSSEListeners.get(event)!.push(handler);
      },
      removeEventListener: () => {},
    };
  },
}));

// ── Bootstrap auth so authenticatedFetch doesn't call Supabase ───────────────
import { setBootstrapAuthToken } from '@/lib/auth-token';
setBootstrapAuthToken('test-token');

// ── Set BACKEND_URL env so getEnv() resolves ──────────────────────────────────
const BACKEND_URL = 'http://localhost:8008/v1';
process.env.NEXT_PUBLIC_BACKEND_URL = BACKEND_URL;

// ── Helpers ────────────────────────────────────────────────────────────────────
let originalFetch: typeof globalThis.fetch;

function jsonResp(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function mockFetch(response: Response) {
  globalThis.fetch = async () => response;
}

beforeEach(() => {
  originalFetch = globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

// ── submitBacktest ─────────────────────────────────────────────────────────────

describe('submitBacktest', () => {
  test('success 200 → returns SubmitResponse', async () => {
    const mockResp = {
      success: true,
      cost: 1.0,
      status: 'accepted',
      job_id: 'abc-123',
    };
    mockFetch(jsonResp(mockResp));

    const { submitBacktest } = await import('@/lib/backtest-api');
    const result = await submitBacktest({ simulation_environment: {} });

    expect(result.success).toBe(true);
    expect(result.job_id).toBe('abc-123');
  });

  test('400 → throws BacktestError with message from body', async () => {
    mockFetch(jsonResp({ error: 'instrument_type is invalid' }, 400));

    const { submitBacktest } = await import('@/lib/backtest-api');
    let caught: any = null;
    try {
      await submitBacktest({});
    } catch (e) {
      caught = e;
    }

    expect(caught).not.toBeNull();
    expect(caught.status).toBe(400);
    expect(caught.message).toContain('instrument_type');
  });

  test('401 → throws BacktestError status 401', async () => {
    mockFetch(jsonResp({ error: 'Unauthorized' }, 401));

    const { submitBacktest } = await import('@/lib/backtest-api');
    let caught: any = null;
    try {
      await submitBacktest({});
    } catch (e) {
      caught = e;
    }

    expect(caught?.status).toBe(401);
  });

  test('402 → throws BacktestError status 402', async () => {
    mockFetch(jsonResp({ error: 'Insufficient credits' }, 402));

    const { submitBacktest } = await import('@/lib/backtest-api');
    let caught: any = null;
    try {
      await submitBacktest({});
    } catch (e) {
      caught = e;
    }

    expect(caught?.status).toBe(402);
    expect(caught?.message).toBe('Insufficient credits');
  });

  test('403 → throws BacktestError status 403', async () => {
    mockFetch(jsonResp({ error: 'Forbidden' }, 403));

    const { submitBacktest } = await import('@/lib/backtest-api');
    let caught: any = null;
    try {
      await submitBacktest({});
    } catch (e) {
      caught = e;
    }

    expect(caught?.status).toBe(403);
  });

  test('503 → throws BacktestError with upstream error message', async () => {
    mockFetch(jsonResp({ success: false, error: 'VT downstream failure' }, 503));

    const { submitBacktest } = await import('@/lib/backtest-api');
    let caught: any = null;
    try {
      await submitBacktest({});
    } catch (e) {
      caught = e;
    }

    expect(caught?.status).toBe(503);
    expect(caught?.message).toContain('VT downstream');
  });
});

// ── pollRun ───────────────────────────────────────────────────────────────────

describe('pollRun', () => {
  test('Phase A: status=unknown + data_summary → returns immediately', async () => {
    const mockRun = {
      success: true,
      run_id: 'run-001',
      status: 'unknown',
      data_summary: { total_return: '12%' },
    };
    mockFetch(jsonResp(mockRun));

    const { pollRun } = await import('@/lib/backtest-api');
    const result = await pollRun('job-001', { intervalMs: 10, maxWaitMs: 2000 });

    expect(result.run_id).toBe('run-001');
    expect(result.data_summary).toBeDefined();
  });

  test('Phase B: status=success → returns result', async () => {
    const mockRun = {
      success: true,
      run_id: 'run-002',
      status: 'success',
      metrics: { sharpe: 1.5 },
    };
    mockFetch(jsonResp(mockRun));

    const { pollRun } = await import('@/lib/backtest-api');
    const result = await pollRun('job-002', { intervalMs: 10, maxWaitMs: 2000 });

    expect(result.status).toBe('success');
    expect((result.metrics as any)?.sharpe).toBe(1.5);
  });

  test('503 from poll → throws BacktestError', async () => {
    mockFetch(jsonResp({ success: false, error: 'poll service down' }, 503));

    const { pollRun } = await import('@/lib/backtest-api');
    let caught: any = null;
    try {
      await pollRun('job-503', { intervalMs: 10, maxWaitMs: 2000 });
    } catch (e) {
      caught = e;
    }

    expect(caught?.status).toBe(503);
  });

  test('exceeds maxWaitMs → throws "timeout"', async () => {
    // Return non-terminal state so poll loop keeps retrying until deadline.
    mockFetch(jsonResp({ success: true, run_id: 'r', status: 'pending' }));

    const { pollRun } = await import('@/lib/backtest-api');
    let caught: Error | null = null;
    try {
      await pollRun('job-timeout', { intervalMs: 10, maxWaitMs: 50 });
    } catch (e) {
      caught = e as Error;
    }

    expect(caught?.message).toBe('timeout');
  });

  test('abort signal → throws "Cancelled"', async () => {
    mockFetch(jsonResp({ success: true, run_id: 'r', status: 'unknown' }));

    const { pollRun } = await import('@/lib/backtest-api');
    const ctrl = new AbortController();
    ctrl.abort();

    let caught: Error | null = null;
    try {
      await pollRun('job-cancel', { intervalMs: 10, maxWaitMs: 5000, signal: ctrl.signal });
    } catch (e) {
      caught = e as Error;
    }

    expect(caught?.message).toBe('Cancelled');
  });
});

// ── streamRun (Story 5.3) ────────────────────────────────────────────────────

describe('streamRun', () => {
  beforeEach(() => {
    lastSSEOptions = null;
    lastSSEListeners = new Map();
    lastSSEClosed = false;
    connectCalled = false;
  });

  test('passes Bearer token + correct URL to createSSEStream and calls connect()', async () => {
    const { streamRun } = await import('@/lib/backtest-api');
    await streamRun('job-1', {});
    expect(lastSSEOptions).not.toBeNull();
    expect(lastSSEOptions!.url).toBe(`${BACKEND_URL}/router/vibe-trading/runs/job-1/stream`);
    expect(lastSSEOptions!.token).toBe('test-token');
    expect(connectCalled).toBe(true);
  });

  test('dispatches data_loading event to onDataLoading callback with parsed RunResponse', async () => {
    const { streamRun } = await import('@/lib/backtest-api');
    let received: unknown = null;
    await streamRun('job-2', {
      onDataLoading: (data) => {
        received = data;
      },
    });
    emitToLastStream(
      'data_loading',
      JSON.stringify({ success: true, run_id: 'job-2', status: 'unknown' }),
    );
    expect(received).toEqual({ success: true, run_id: 'job-2', status: 'unknown' });
  });

  test('dispatches phase_a event and keeps stream open (non-terminal)', async () => {
    const { streamRun } = await import('@/lib/backtest-api');
    let received: unknown = null;
    await streamRun('job-3', {
      onPhaseA: (data) => {
        received = data;
      },
    });
    emitToLastStream(
      'phase_a',
      JSON.stringify({
        success: true,
        run_id: 'job-3',
        status: 'unknown',
        data_summary: { 'BTC-USDT': { rows_fetched: 540 } },
      }),
    );
    expect((received as { data_summary?: unknown })?.data_summary).toBeDefined();
    expect(lastSSEClosed).toBe(false);
  });

  test('dispatches phase_b event and proactively closes stream (terminal)', async () => {
    const { streamRun } = await import('@/lib/backtest-api');
    let received: unknown = null;
    await streamRun('job-4', {
      onPhaseB: (data) => {
        received = data;
      },
    });
    emitToLastStream(
      'phase_b',
      JSON.stringify({
        success: true,
        run_id: 'job-4',
        status: 'success',
        metrics: { sharpe: 1.2 },
        equity_curve: [],
      }),
    );
    expect((received as { metrics?: unknown })?.metrics).toBeDefined();
    expect(lastSSEClosed).toBe(true);
  });

  test('dispatches failed event and closes stream', async () => {
    const { streamRun } = await import('@/lib/backtest-api');
    let received: unknown = null;
    await streamRun('job-5', {
      onFailed: (data) => {
        received = data;
      },
    });
    emitToLastStream(
      'failed',
      JSON.stringify({
        success: true,
        run_id: 'job-5',
        status: 'failed',
        reason: 'Strategy exception',
      }),
    );
    expect((received as { status?: string })?.status).toBe('failed');
    expect(lastSSEClosed).toBe(true);
  });

  test('dispatches timeout event with job_id and closes stream', async () => {
    const { streamRun } = await import('@/lib/backtest-api');
    let received: { run_id?: string; reason?: string } | null = null;
    await streamRun('job-6', {
      onTimeout: (data) => {
        received = data;
      },
    });
    emitToLastStream(
      'timeout',
      JSON.stringify({ success: false, run_id: 'job-6', status: 'timeout', reason: 'budget' }),
    );
    expect(received).not.toBeNull();
    expect(received!.run_id).toBe('job-6');
    expect(lastSSEClosed).toBe(true);
  });

  test('malformed event payload surfaces onError but does not throw', async () => {
    const { streamRun } = await import('@/lib/backtest-api');
    let received: unknown = null;
    let errorMsg: string | null = null;
    await streamRun('job-7', {
      onPhaseB: (data) => {
        received = data;
      },
      onError: (err) => {
        errorMsg = err.message;
      },
    });
    emitToLastStream('phase_b', '{not valid json');
    expect(received).toBeNull();
    expect(errorMsg).toContain('Malformed');
  });

  // Note: "no auth token → onError(401)" path is exercised manually; not in tests
  // because mocking out getSupabaseAccessTokenWithRetry across an already-imported
  // module is brittle under Bun's shared mock registry. The path is straightforward
  // (early-return no-op stream) and visually inspected in [backtest-api.ts streamRun].

  test('signal forwarded to createSSEStream', async () => {
    const { streamRun } = await import('@/lib/backtest-api');
    const ctrl = new AbortController();
    await streamRun('job-9', {}, ctrl.signal);
    expect(lastSSEOptions?.signal).toBe(ctrl.signal);
  });

  test('only callbacks registered for emitted events get parsed (no cross-invocation)', async () => {
    const { streamRun } = await import('@/lib/backtest-api');
    let phaseB: unknown = null;
    let phaseA: unknown = null;
    await streamRun('job-10', {
      onPhaseA: (d) => {
        phaseA = d;
      },
      onPhaseB: (d) => {
        phaseB = d;
      },
    });
    emitToLastStream(
      'phase_a',
      JSON.stringify({ success: true, run_id: 'job-10', status: 'unknown', data_summary: {} }),
    );
    expect(phaseA).not.toBeNull();
    expect(phaseB).toBeNull();
  });
});

afterAll(() => {
  mock.restore();
});
