import { describe, test, expect } from 'bun:test';

// Gate: slow integration tests require VIBE_TRADING_* services running
const SKIP = !process.env.RUN_INTEGRATION_TESTS || !process.env.VIBE_TRADING_API_KEY;
const VT_URL = process.env.VIBE_TRADING_INTERNAL_URL ?? 'http://localhost:8899';
const VT_KEY = process.env.VIBE_TRADING_API_KEY ?? '';

// X-Forwarded-For spoof test only meaningful when proxy trust is enabled on VT.
// Without IP_WHITELIST_TRUST_PROXY=1, vibe-trading ignores the header and the
// "spoof" has no effect — test would assert behavior that isn't enabled.
const PROXY_TRUST_ENABLED = process.env.VIBE_TRADING_PROXY_TRUST === '1';

describe.skipIf(SKIP)('Vibe-Trading service health (integration)', () => {
  test('GET /health returns 200', async () => {
    const res = await fetch(`${VT_URL}/health`, {
      signal: AbortSignal.timeout(5000),
    });
    expect(res.status).toBe(200);
  });

  test('POST /jobs with valid bearer token returns 2xx (accepted) or 422 (validation error — auth passed)', async () => {
    const res = await fetch(`${VT_URL}/jobs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${VT_KEY}`,
      },
      // Minimal valid VibeTradingJobPayload shape (per Vibe-Trading/agent/src/api_models.py:45-56)
      body: JSON.stringify({
        simulation_environment: { exchange: 'binance', instrument_type: 'SPOT', initial_capital: '15000', historical_range: 30 },
        risk_management: { max_drawdown_percentage: '0.15', position_sizing: '0.2' },
        context_rules: { assets: ['BTC-USDT'], timeframe: '4h' },
        execution_flags: {},
      }),
      signal: AbortSignal.timeout(10_000),
    });
    // 200 = accepted, 422 = Pydantic validation rejection (auth still passed). Anything else
    // (401/403/4xx/5xx) means auth or service failed.
    expect([200, 422]).toContain(res.status);
  });

  test('POST /jobs without bearer token returns 401 (auth missing)', async () => {
    const res = await fetch(`${VT_URL}/jobs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        simulation_environment: { exchange: 'binance', instrument_type: 'SPOT', initial_capital: '15000', historical_range: 30 },
        risk_management: { max_drawdown_percentage: '0.15', position_sizing: '0.2' },
        context_rules: { assets: ['BTC-USDT'], timeframe: '4h' },
        execution_flags: {},
      }),
      signal: AbortSignal.timeout(5000),
    });
    // VT returns 401 ("Invalid or missing API key") when API_AUTH_KEY is set + no bearer.
    // 403 ("Access denied from this IP") if IP whitelist gate fires first.
    expect([401, 403]).toContain(res.status);
  });

  test.skipIf(!PROXY_TRUST_ENABLED)(
    'POST /jobs with X-Forwarded-For spoof returns 403 when IP_WHITELIST_TRUST_PROXY=1',
    async () => {
      const res = await fetch(`${VT_URL}/jobs`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${VT_KEY}`,
          'X-Forwarded-For': '1.2.3.4',
        },
        body: JSON.stringify({
          simulation_environment: { exchange: 'binance', instrument_type: 'SPOT', initial_capital: '15000', historical_range: 30 },
          risk_management: { max_drawdown_percentage: '0.15', position_sizing: '0.2' },
          context_rules: { assets: ['BTC-USDT'], timeframe: '4h' },
          execution_flags: {},
        }),
        signal: AbortSignal.timeout(5000),
      });
      // With proxy trust enabled + spoofed IP outside ALLOWED_IPS → 403.
      expect(res.status).toBe(403);
    },
  );
});
