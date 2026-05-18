import { describe, test, expect, beforeEach, afterEach, afterAll, mock } from 'bun:test';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { AppContext } from '../../types';

// ─── Mocks ──────────────────────────────────────────────────────────────────
// Only mock billing and config — NOT the vibe-trading service module.
// Mocking the service module leaks into vibe-trading-api-client.test.ts because
// Bun v1.3.x shares the mock registry across all test files in the same process.
// Instead, we mock globalThis.fetch to control service behavior per-test.

let mockHasCredits = true;
let capturedLogs: string[] = [];

mock.module('../../router/services/billing', () => ({
  checkCredits: async () => ({ hasCredits: mockHasCredits, balance: 10 }),
  deductToolCredits: async () => ({ success: true }),
}));

mock.module('../../config', () => ({
  config: {
    VIBE_TRADING_API_KEY: 'test-key',
    VIBE_TRADING_INTERNAL_URL: 'http://vibe-trading:8899',
  },
  getToolCost: () => 1.0,
}));

// ─── Setup ────────────────────────────────────────────────────────────────────

import { VibeTradingDownstreamError } from '../../router/services/vibe-trading';
import { vibeTrading } from '../../router/routes/vibe-trading';

const VALID_JOB_PAYLOAD = {
  simulation_environment: {
    exchange: 'binance',
    instrument_type: 'SPOT',
    initial_capital: '15000',
    historical_range: 30,
  },
  risk_management: { max_drawdown_percentage: '0.15', position_sizing: '0.2' },
  context_rules: { assets: ['BTC-USDT'], timeframe: '4h' },
};

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

function mockFetch(response: Response) {
  globalThis.fetch = mock(() => Promise.resolve(response)) as unknown as unknown as typeof fetch;
}

function jsonResp(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('POST /vibe-trading/jobs', () => {
  beforeEach(() => {
    mockHasCredits = true;
    capturedLogs = [];
    const origLog = console.log;
    console.log = (...args: unknown[]) => {
      capturedLogs.push(args.join(' '));
      origLog(...args);
    };
  });

  afterEach(() => {
    globalThis.fetch = fetch;
  });

  test('200 success on valid payload', async () => {
    mockFetch(jsonResp({ status: 'accepted', job_id: 'test-job-id' }));
    const app = makeApp();
    const res = await app.request('/jobs', {
      method: 'POST',
      body: JSON.stringify(VALID_JOB_PAYLOAD),
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body.success).toBe(true);
    expect(body.job_id).toBe('test-job-id');
    expect(body.cost).toBe(1.0);
  });

  test('400 on missing simulation_environment', async () => {
    const app = makeApp();
    const res = await app.request('/jobs', {
      method: 'POST',
      body: JSON.stringify({ risk_management: {}, context_rules: {} }),
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.status).toBe(400);
  });

  test('400 on instrument_type "FUTURES" (must be SPOT or PERPETUAL)', async () => {
    const app = makeApp();
    const payload = {
      ...VALID_JOB_PAYLOAD,
      simulation_environment: { ...VALID_JOB_PAYLOAD.simulation_environment, instrument_type: 'FUTURES' },
    };
    const res = await app.request('/jobs', {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.status).toBe(400);
  });

  test('400 on timeframe "1century" (regex mismatch)', async () => {
    const app = makeApp();
    const payload = {
      ...VALID_JOB_PAYLOAD,
      context_rules: { ...VALID_JOB_PAYLOAD.context_rules, timeframe: '1century' },
    };
    const res = await app.request('/jobs', {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.status).toBe(400);
  });

  test('400 on SPOT + leverage > 1.0 (cross-field validator)', async () => {
    const app = makeApp();
    const payload = {
      ...VALID_JOB_PAYLOAD,
      risk_management: { ...VALID_JOB_PAYLOAD.risk_management, leverage: '2.0' },
    };
    const res = await app.request('/jobs', {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.status).toBe(400);
  });

  test('402 on insufficient credits', async () => {
    mockHasCredits = false;
    const app = makeApp();
    const res = await app.request('/jobs', {
      method: 'POST',
      body: JSON.stringify(VALID_JOB_PAYLOAD),
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.status).toBe(402);
  });

  test('503 on Vibe-Trading downstream failure', async () => {
    mockFetch(new Response('Redis unavailable', { status: 503 }));
    const app = makeApp();
    const res = await app.request('/jobs', {
      method: 'POST',
      body: JSON.stringify(VALID_JOB_PAYLOAD),
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.status).toBe(503);
    const body = await res.json() as Record<string, unknown>;
    expect(body.success).toBe(false);
  });

  test('tier-bypass log emitted on POST /jobs', async () => {
    mockFetch(jsonResp({ status: 'accepted', job_id: 'test-job-id' }));
    const app = makeApp();
    await app.request('/jobs', {
      method: 'POST',
      body: JSON.stringify(VALID_JOB_PAYLOAD),
      headers: { 'Content-Type': 'application/json' },
    });
    expect(capturedLogs.some((l) => l.includes('[TIER-BYPASS-SUSPECT]'))).toBe(true);
  });
});

describe('GET /vibe-trading/runs/:jobId', () => {
  afterEach(() => {
    globalThis.fetch = fetch;
  });

  test('200 success on valid jobId', async () => {
    mockFetch(jsonResp({ run_id: 'abc-123', status: 'pending' }));
    const app = makeApp();
    const res = await app.request('/runs/abc-123');
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body.success).toBe(true);
    expect(body.run_id).toBe('abc-123');
  });

  test('400 on invalid jobId format (special chars)', async () => {
    const app = makeApp();
    // URL-decoded jobId "job with spaces" fails regex /^[A-Za-z0-9_-]{1,128}$/
    const res = await app.request('/runs/job%20with%20spaces');
    expect(res.status).toBe(400);
  });
});

afterAll(() => {
  mock.restore();
});
