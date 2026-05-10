import { describe, test, expect, mock, afterEach, beforeAll } from 'bun:test';

const mockConfig = {
  VIBE_TRADING_API_KEY: 'test-api-key-abc123',
  VIBE_TRADING_INTERNAL_URL: 'http://vibe-trading:8899',
};

// Must be hoisted (before imports) so config mock is in place when module loads
mock.module('../../config', () => ({ config: mockConfig }));

// Dynamic imports — populated in beforeAll after mock.restore() clears route-test mocks
let submitBacktestJob: (payload: unknown, opts?: unknown) => Promise<{ status: string; job_id: string }>;
let getBacktestRun: (jobId: string, opts?: unknown) => Promise<Record<string, unknown>>;
let isPhaseBResponse: (r: unknown) => boolean;
let VibeTradingAuthError: new (...args: unknown[]) => Error;
let VibeTradingForbiddenError: new (...args: unknown[]) => Error;
let VibeTradingDownstreamError: new (...args: unknown[]) => Error;

beforeAll(async () => {
  // Clear any mocks registered by other test files (e.g. vibe-trading-route.test.ts
  // mocks the entire vibe-trading service module). Must run before dynamic import below.
  mock.restore();
  // Re-register config mock (mock.restore() cleared it too)
  mock.module('../../config', () => ({ config: mockConfig }));

  // Use .ts extension — mock.module() keys are exact strings, so this bypasses
  // the route test's mock registered as '../../router/services/vibe-trading' (no ext)
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore allowImportingTsExtensions not enabled but Bun resolves .ts at runtime
  const mod = await import('../../router/services/vibe-trading.ts');
  submitBacktestJob = mod.submitBacktestJob as typeof submitBacktestJob;
  getBacktestRun = mod.getBacktestRun as unknown as typeof getBacktestRun;
  isPhaseBResponse = mod.isPhaseBResponse as typeof isPhaseBResponse;
  VibeTradingAuthError = mod.VibeTradingAuthError as typeof VibeTradingAuthError;
  VibeTradingForbiddenError = mod.VibeTradingForbiddenError as typeof VibeTradingForbiddenError;
  VibeTradingDownstreamError = mod.VibeTradingDownstreamError as typeof VibeTradingDownstreamError;
});

const VALID_PAYLOAD = {
  simulation_environment: {
    exchange: 'binance',
    instrument_type: 'SPOT',
    initial_capital: '15000',
    historical_range: 30,
  },
  risk_management: { max_drawdown_percentage: '0.15', position_sizing: '0.2' },
  context_rules: { assets: ['BTC-USDT'], timeframe: '4h' },
};

function mockFetch(response: Response) {
  globalThis.fetch = mock(() => Promise.resolve(response)) as unknown as typeof fetch;
}

function mockFetchReject(err: Error) {
  globalThis.fetch = mock(() => Promise.reject(err)) as unknown as typeof fetch;
}

describe('submitBacktestJob', () => {
  afterEach(() => {
    globalThis.fetch = fetch;
  });

  test('happy path — returns accepted + job_id', async () => {
    mockFetch(
      new Response(JSON.stringify({ status: 'accepted', job_id: 'abc-123' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const result = await submitBacktestJob(VALID_PAYLOAD);
    expect(result.status).toBe('accepted');
    expect(result.job_id).toBe('abc-123');
  });

  test('503 (Redis unavailable) → throws VibeTradingDownstreamError', async () => {
    mockFetch(new Response('Service Unavailable', { status: 503 }));
    await expect(submitBacktestJob(VALID_PAYLOAD)).rejects.toBeInstanceOf(VibeTradingDownstreamError);
  });

  test('401 → throws VibeTradingAuthError with config-drift hint', async () => {
    mockFetch(new Response('Unauthorized', { status: 401 }));
    const err = await submitBacktestJob(VALID_PAYLOAD).catch((e) => e);
    expect(err).toBeInstanceOf(VibeTradingAuthError);
    expect(err.message).toContain('VIBE_TRADING_API_KEY');
  });

  test('403 → throws VibeTradingForbiddenError with IP-whitelist hint', async () => {
    mockFetch(new Response('Forbidden', { status: 403 }));
    const err = await submitBacktestJob(VALID_PAYLOAD).catch((e) => e);
    expect(err).toBeInstanceOf(VibeTradingForbiddenError);
    expect(err.message).toContain('ALLOWED_IPS');
  });

  test('network error → throws with sanitized message', async () => {
    mockFetchReject(new Error('ECONNREFUSED'));
    const err = await submitBacktestJob(VALID_PAYLOAD).catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toContain('network error');
  });
});

describe('getBacktestRun', () => {
  afterEach(() => {
    globalThis.fetch = fetch;
  });

  test('404 → returns pending status (worker not yet started)', async () => {
    mockFetch(new Response('Not Found', { status: 404 }));
    const result = await getBacktestRun('job-xyz');
    expect(result.status).toBe('pending');
    expect(result.run_id).toBe('job-xyz');
  });

  test('unknown + data_summary → service forwards data_summary', async () => {
    const dataSummary = { 'BTC-USDT': { rows_fetched: 30 } };
    mockFetch(
      new Response(
        JSON.stringify({ status: 'unknown', metrics: null, data_summary: dataSummary }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    const result = await getBacktestRun('job-phase-a');
    expect(result.status).toBe('unknown');
    expect(result.data_summary).toEqual(dataSummary);
  });

  test('success + metrics → Phase B response shape', async () => {
    const metrics = { sharpe: 1.5, max_drawdown: 0.12 };
    mockFetch(
      new Response(
        JSON.stringify({ status: 'success', metrics, equity_curve: [], trade_log: [] }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    const result = await getBacktestRun('job-phase-b');
    expect(result.status).toBe('success');
    expect(result.metrics).toEqual(metrics);
  });
});

describe('isPhaseBResponse', () => {
  test('returns true for success + metrics with sharpe', () => {
    expect(
      isPhaseBResponse({
        run_id: 'x',
        status: 'success',
        metrics: { sharpe: 1.5, max_drawdown: 0.12 },
      }),
    ).toBe(true);
  });

  test('returns false for success + null metrics (Phase A edge case)', () => {
    expect(isPhaseBResponse({ run_id: 'x', status: 'success', metrics: null })).toBe(false);
  });

  test('returns false for unknown status', () => {
    expect(isPhaseBResponse({ run_id: 'x', status: 'unknown' })).toBe(false);
  });
});
