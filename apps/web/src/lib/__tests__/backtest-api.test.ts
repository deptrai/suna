import { describe, test, expect, beforeEach, afterEach } from 'bun:test';

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
    // Always return status=unknown without data_summary → never done
    mockFetch(jsonResp({ success: true, run_id: 'r', status: 'unknown' }));

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
