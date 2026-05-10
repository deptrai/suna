import { describe, test, expect, mock, beforeEach } from 'bun:test';

// Mock env before importing tool
mock.module('../lib/get-env', () => ({
  getEnv: (key: string) => {
    if (key === 'EPSILON_TOKEN') return 'test-epsilon-token';
    if (key === 'EPSILON_API_URL') return 'http://epsilon-api:8008';
    return undefined;
  },
}));

mock.module('../lib/sanitize', () => ({
  sanitizeUpstreamErr: (s: string) => s,
}));

import vibeTradingBacktest from '../vibe_trading_backtest';

// Helper to build a sequence of fetch responses (resets per test)
function mockFetchSequence(responses: Response[]) {
  let idx = 0;
  globalThis.fetch = mock(() => {
    const r = responses[idx] ?? responses[responses.length - 1];
    idx++;
    return Promise.resolve(r);
  }) as unknown as typeof fetch;
}

function jsonResp(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// Simulate timeout by making Date.now() return a value past the 30s budget
function mockDateNowTimeout() {
  const realNow = Date.now;
  let callCount = 0;
  Date.now = () => {
    callCount++;
    // After 2 calls (start + first check), return a time past 30s budget
    return callCount > 2 ? realNow() + 31_000 : realNow();
  };
  return () => { Date.now = realNow; };
}

const VALID_ARGS = {
  simulation_environment: {
    exchange: 'binance',
    instrument_type: 'SPOT',
    initial_capital: '15000',
    historical_range: 30,
  },
  risk_management: { max_drawdown_percentage: '0.15', position_sizing: '0.2' },
  context_rules: { assets: ['BTC-USDT'], timeframe: '4h' },
};

describe('vibe_trading_backtest tool — Phase A (current VT state)', () => {
  beforeEach(() => {
    globalThis.fetch = fetch;
  });

  test('Phase A happy path: 404 twice → unknown+data_summary twice → returns phase:A', async () => {
    const dataSummary = { 'BTC-USDT': { rows_fetched: 30 } };
    mockFetchSequence([
      // POST /jobs
      jsonResp({ status: 'accepted', job_id: 'job-phase-a' }),
      // GET /runs — 404 (worker not started)
      new Response('Not Found', { status: 404 }),
      // GET /runs — 404 again
      new Response('Not Found', { status: 404 }),
      // GET /runs — unknown + data_summary (first poll)
      jsonResp({ status: 'unknown', metrics: null, data_summary: dataSummary }),
      // GET /runs — unknown + data_summary (second poll — confirms Phase A)
      jsonResp({ status: 'unknown', metrics: null, data_summary: dataSummary }),
    ]);

    const result = JSON.parse(await vibeTradingBacktest.execute(VALID_ARGS, {} as never));
    expect(result.success).toBe(true);
    expect(result.phase).toBe('A');
    expect(result.run_id).toBe('job-phase-a');
    expect(result.status).toBe('data_loaded');
    expect(result.data_summary).toEqual(dataSummary);
    expect(result.message).toContain('Epic 2.3');
  }, 15_000);

  test('Phase A: unknown without data_summary → timeout error (mocked Date.now)', async () => {
    const restoreDate = mockDateNowTimeout();
    try {
      mockFetchSequence([
        jsonResp({ status: 'accepted', job_id: 'job-no-summary' }),
        jsonResp({ status: 'unknown', metrics: null }), // no data_summary
      ]);

      const result = JSON.parse(await vibeTradingBacktest.execute(VALID_ARGS, {} as never));
      expect(result.success).toBe(false);
      expect(result.error).toContain('timeout');
      expect(result.run_id).toBe('job-no-summary');
    } finally {
      restoreDate();
    }
  }, 10_000);

  test('Phase A: 1 poll shows data_summary, next shows different shape → waits for 2-poll confirmation', async () => {
    const summary1 = { 'BTC-USDT': { rows_fetched: 10 } };
    const summary2 = { 'BTC-USDT': { rows_fetched: 30 } }; // different shape
    mockFetchSequence([
      jsonResp({ status: 'accepted', job_id: 'job-race' }),
      jsonResp({ status: 'unknown', data_summary: summary1 }),
      jsonResp({ status: 'unknown', data_summary: summary2 }), // different — resets confirmation
      jsonResp({ status: 'unknown', data_summary: summary2 }), // same as previous — confirms
    ]);

    const result = JSON.parse(await vibeTradingBacktest.execute(VALID_ARGS, {} as never));
    expect(result.success).toBe(true);
    expect(result.phase).toBe('A');
    expect(result.data_summary).toEqual(summary2);
  }, 15_000);
});

describe('vibe_trading_backtest tool — Phase B (after VT 2.3 done)', () => {
  beforeEach(() => {
    globalThis.fetch = fetch;
  });

  test('Phase B: success + metrics → returns phase:B with full snapshot', async () => {
    const metrics = { sharpe: 1.5, max_drawdown: 0.12, total_return: 0.35, win_rate: 0.62 };
    const equityCurve = [{ date: '2024-01-01', value: 15000 }, { date: '2024-03-31', value: 20250 }];
    const tradeLog = [{ symbol: 'BTC-USDT', side: 'buy', pnl: 5250 }];

    mockFetchSequence([
      jsonResp({ status: 'accepted', job_id: 'job-phase-b' }),
      new Response('Not Found', { status: 404 }),
      jsonResp({ status: 'unknown', metrics: null }),
      jsonResp({ status: 'success', metrics, equity_curve: equityCurve, trade_log: tradeLog }),
    ]);

    const result = JSON.parse(await vibeTradingBacktest.execute(VALID_ARGS, {} as never));
    expect(result.success).toBe(true);
    expect(result.phase).toBe('B');
    expect(result.run_id).toBe('job-phase-b');
    expect(result.metrics).toEqual(metrics);
    expect(result.equity_curve).toEqual(equityCurve);
    expect(result.trade_log).toEqual(tradeLog);
    expect(result.duration_ms).toBeGreaterThan(0);
  }, 15_000);

  test('Phase B: success + null metrics → MUST NOT mistake for Phase B (mocked timeout)', async () => {
    const restoreDate = mockDateNowTimeout();
    try {
      mockFetchSequence([
        jsonResp({ status: 'accepted', job_id: 'job-success-no-metrics' }),
        jsonResp({ status: 'success', metrics: null }),
      ]);

      const result = JSON.parse(await vibeTradingBacktest.execute(VALID_ARGS, {} as never));
      // Should NOT return phase:B — falls through to timeout
      expect(result.phase).toBeUndefined();
      expect(result.success).toBe(false);
    } finally {
      restoreDate();
    }
  }, 10_000);
});

describe('vibe_trading_backtest tool — failure paths', () => {
  beforeEach(() => {
    globalThis.fetch = fetch;
  });

  test('"failed" status propagates with reason field', async () => {
    mockFetchSequence([
      jsonResp({ status: 'accepted', job_id: 'job-failed' }),
      jsonResp({ status: 'failed', reason: 'Insufficient historical data for BTC-USDT' }),
    ]);

    const result = JSON.parse(await vibeTradingBacktest.execute(VALID_ARGS, {} as never));
    expect(result.success).toBe(false);
    expect(result.run_id).toBe('job-failed');
    expect(result.error).toContain('Insufficient historical data');
  }, 10_000);

  test('"aborted" status returns failure', async () => {
    mockFetchSequence([
      jsonResp({ status: 'accepted', job_id: 'job-aborted' }),
      jsonResp({ status: 'aborted' }),
    ]);

    const result = JSON.parse(await vibeTradingBacktest.execute(VALID_ARGS, {} as never));
    expect(result.success).toBe(false);
    expect(result.error).toContain('aborted');
  }, 10_000);

  test('30s timeout → returns timeout error with retry hint + run_id (mocked Date.now)', async () => {
    const restoreDate = mockDateNowTimeout();
    try {
      mockFetchSequence([
        jsonResp({ status: 'accepted', job_id: 'job-timeout' }),
        jsonResp({ status: 'unknown' }),
      ]);

      const result = JSON.parse(await vibeTradingBacktest.execute(VALID_ARGS, {} as never));
      expect(result.success).toBe(false);
      expect(result.run_id).toBe('job-timeout');
      expect(result.error).toContain('timeout');
      expect(result.error).toContain('job_id');
    } finally {
      restoreDate();
    }
  }, 10_000);

  test('401 from upstream → distinct error about API key', async () => {
    mockFetchSequence([
      new Response(JSON.stringify({ detail: 'Invalid or missing API key' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      }),
    ]);

    const result = JSON.parse(await vibeTradingBacktest.execute(VALID_ARGS, {} as never));
    expect(result.success).toBe(false);
    expect(result.error).toContain('401');
  }, 10_000);

  test('403 from upstream → distinct error about IP whitelist', async () => {
    mockFetchSequence([
      new Response(JSON.stringify({ detail: 'Access denied from this IP' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      }),
    ]);

    const result = JSON.parse(await vibeTradingBacktest.execute(VALID_ARGS, {} as never));
    expect(result.success).toBe(false);
    expect(result.error).toContain('403');
  }, 10_000);

  test('402 insufficient credits → returns credits error', async () => {
    mockFetchSequence([new Response('Payment Required', { status: 402 })]);

    const result = JSON.parse(await vibeTradingBacktest.execute(VALID_ARGS, {} as never));
    expect(result.success).toBe(false);
    expect(result.error).toContain('credits');
  }, 10_000);
});
