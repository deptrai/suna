import { beforeEach, describe, expect, mock, test } from 'bun:test';

mock.module('../lib/get-env', () => ({
  getEnv: (key: string) => {
    if (key === 'EPSILON_TOKEN') return 'test-token';
    if (key === 'EPSILON_API_URL') return 'http://epsilon-api:8008';
    return undefined;
  },
}));

mock.module('../lib/sanitize', () => ({
  sanitizeUpstreamErr: (s: string) => s,
}));

import proposeBacktestMulti from '../propose_backtest_multi';

function jsonResp(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('propose_backtest_multi tool', () => {
  beforeEach(() => {
    globalThis.fetch = fetch;
  });

  test('returns valid JSON on success', async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(
        jsonResp({
          success: true,
          proposals: [{ tab_id: 'strat-1', summary: 'ok', strategy_family: 'trend_sma', payload: {} }],
        }),
      ),
    ) as unknown as typeof fetch;

    const out = await proposeBacktestMulti.execute(
      { asset: 'BTC-USDT', session_id: 'sess-1' },
      {} as never,
    );
    const parsed = JSON.parse(out);
    expect(parsed.success).toBe(true);
    expect(parsed.proposals?.length).toBe(1);
  });

  test('surfaces upstream errors', async () => {
    globalThis.fetch = mock(() => Promise.resolve(new Response('upstream failed', { status: 503 }))) as unknown as typeof fetch;
    const out = await proposeBacktestMulti.execute(
      { asset: 'BTC-USDT', session_id: 'sess-1' },
      {} as never,
    );
    const parsed = JSON.parse(out);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain('upstream failed');
  });

  test('uses abort timeout signal', async () => {
    let capturedSignal: AbortSignal | undefined;
    globalThis.fetch = mock((_: string, init?: RequestInit) => {
      capturedSignal = init?.signal as AbortSignal | undefined;
      return Promise.resolve(jsonResp({ success: true, proposals: [] }));
    }) as unknown as typeof fetch;

    await proposeBacktestMulti.execute(
      { asset: 'ETH-USDT', session_id: 'sess-2' },
      {} as never,
    );
    expect(capturedSignal).toBeDefined();
  });
});
