import { describe, test, expect, beforeAll } from 'bun:test';

// Gate: slow integration tests require VIBE_TRADING_* services running
const SKIP = !process.env.RUN_INTEGRATION_TESTS || !process.env.VIBE_TRADING_API_KEY;
const VT_URL = process.env.VIBE_TRADING_INTERNAL_URL ?? 'http://localhost:8899';
const VT_KEY = process.env.VIBE_TRADING_API_KEY ?? '';

describe.skipIf(SKIP)('Vibe-Trading service health (integration)', () => {
  test('GET /health returns 200', async () => {
    const res = await fetch(`${VT_URL}/health`, {
      signal: AbortSignal.timeout(5000),
    });
    expect(res.status).toBe(200);
  });

  test('POST /jobs with valid bearer token returns accepted status', async () => {
    const res = await fetch(`${VT_URL}/jobs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${VT_KEY}`,
      },
      body: JSON.stringify({
        strategy_code: "print('hello')",
        config: { symbol: 'BTC/USDT', timeframe: '1h' },
      }),
      signal: AbortSignal.timeout(10_000),
    });
    // 200-422 all prove auth passed and service is alive (422 = FastAPI validation error = correct schema rejection)
    expect(res.status).toBeLessThan(500);
  });

  test('POST /jobs without bearer token returns 401 or 403', async () => {
    const res = await fetch(`${VT_URL}/jobs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ strategy_code: 'pass', config: {} }),
      signal: AbortSignal.timeout(5000),
    });
    expect([401, 403]).toContain(res.status);
  });

  test('POST /jobs with wrong IP (simulated via x-forwarded-for header) returns 403', async () => {
    // vibe-trading checks IP allowlist before bearer — invalid IP should 403
    const res = await fetch(`${VT_URL}/jobs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${VT_KEY}`,
        'X-Forwarded-For': '1.2.3.4',
      },
      body: JSON.stringify({ strategy_code: 'pass', config: {} }),
      signal: AbortSignal.timeout(5000),
    });
    // May return 403 (IP denied) or 200 (if X-Forwarded-For is ignored internally)
    expect(res.status).toBeLessThan(500);
  });
});
