import { describe, test, expect, afterEach } from 'bun:test';

import { fetchTokenMetrics } from '../../router/services/santiment';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function makePoints(values: number[], stepHours: number = 1) {
  const now = Date.now();
  return values.map((value, i) => ({
    datetime: new Date(now - (values.length - 1 - i) * stepHours * 3600 * 1000).toISOString(),
    value,
  }));
}

function stubGraphqlOk(data: unknown) {
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ data }), { status: 200 })) as typeof fetch;
}

describe('fetchTokenMetrics — happy paths', () => {
  test('[P0] returns full SantimentBatchResult shape from successful query', async () => {
    // 48 hours of data, latest = 100 social volume
    const sv = makePoints([10, 20, 30, 40, 50, 60, 70, 80, 90, 100]);
    const sd = makePoints([5, 6, 7]);
    const sb = makePoints([-1, 0, 1]);
    const price = makePoints([100, 105, 110, 115, 120]);

    stubGraphqlOk({
      socialVolume: { timeseriesData: sv },
      socialDominance: { timeseriesData: sd },
      sentimentBalance: { timeseriesData: sb },
      price: { timeseriesData: price },
    });

    const result = await fetchTokenMetrics('bitcoin', 'test-key');
    expect(result.slug).toBe('bitcoin');
    expect(result.socialVolume24h).toBe(100);
    expect(result.socialDominancePct).toBe(7);
    expect(result.sentimentScore).toBe(1);
    expect(result.priceUsd).toBe(120);
    expect(typeof result.socialVolumeChange24hPct).toBe('number');
    expect(typeof result.priceChange24hPct).toBe('number');
  });

  test('[P0] returns null fields when no points available', async () => {
    stubGraphqlOk({
      socialVolume: { timeseriesData: [] },
      socialDominance: { timeseriesData: [] },
      sentimentBalance: { timeseriesData: [] },
      price: { timeseriesData: [] },
    });
    const result = await fetchTokenMetrics('unknown', 'test-key');
    expect(result.socialVolume24h).toBeNull();
    expect(result.socialDominancePct).toBeNull();
    expect(result.sentimentScore).toBeNull();
    expect(result.priceUsd).toBeNull();
    expect(result.socialVolumeChange24hPct).toBeNull();
    expect(result.priceChange24hPct).toBeNull();
  });

  test('[P0] returns null change% when prev value is 0 (no division by zero)', async () => {
    const points = makePoints([0, 0, 0, 50]);
    stubGraphqlOk({
      socialVolume: { timeseriesData: points },
      socialDominance: { timeseriesData: [] },
      sentimentBalance: { timeseriesData: [] },
      price: { timeseriesData: [] },
    });
    const result = await fetchTokenMetrics('bitcoin', 'test-key');
    // prev24h was 0, so change should be null not Infinity
    expect(result.socialVolumeChange24hPct).toBeNull();
  });

  test('[P0] skips non-finite values (NaN/Infinity) in latest', async () => {
    const points = [
      { datetime: new Date(Date.now() - 3600000).toISOString(), value: 100 },
      { datetime: new Date().toISOString(), value: NaN },
    ];
    stubGraphqlOk({
      socialVolume: { timeseriesData: points },
      socialDominance: { timeseriesData: [] },
      sentimentBalance: { timeseriesData: [] },
      price: { timeseriesData: [] },
    });
    const result = await fetchTokenMetrics('x', 'test-key');
    expect(result.socialVolume24h).toBeNull();
  });

  test('[P1] sends Authorization with Apikey scheme (not Bearer)', async () => {
    let capturedAuth = '';
    globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
      const headers = init?.headers as Record<string, string>;
      capturedAuth = headers.Authorization;
      return new Response(JSON.stringify({
        data: {
          socialVolume: { timeseriesData: [] },
          socialDominance: { timeseriesData: [] },
          sentimentBalance: { timeseriesData: [] },
          price: { timeseriesData: [] },
        },
      }), { status: 200 });
    }) as typeof fetch;

    await fetchTokenMetrics('bitcoin', 'my-secret-key');
    expect(capturedAuth).toBe('Apikey my-secret-key');
  });

  test('[P1] does NOT leak api key into URL', async () => {
    let capturedUrl = '';
    globalThis.fetch = (async (url: string | URL | Request) => {
      capturedUrl = String(url);
      return new Response(JSON.stringify({
        data: {
          socialVolume: { timeseriesData: [] },
          socialDominance: { timeseriesData: [] },
          sentimentBalance: { timeseriesData: [] },
          price: { timeseriesData: [] },
        },
      }), { status: 200 });
    }) as typeof fetch;

    await fetchTokenMetrics('bitcoin', 'leaky-key');
    expect(capturedUrl).not.toContain('leaky-key');
  });
});

describe('fetchTokenMetrics — error handling', () => {
  test('[P0] throws on 4xx (non-429) without retry', async () => {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls++;
      return new Response('forbidden', { status: 403 });
    }) as typeof fetch;
    await expect(fetchTokenMetrics('x', 'k')).rejects.toThrow(/Santiment API error: 403/);
    expect(calls).toBe(1);
  });

  test('[P0] throws "GraphQL errors" when response contains errors field', async () => {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({
        errors: [{ message: 'invalid metric' }],
      }), { status: 200 })) as typeof fetch;

    await expect(fetchTokenMetrics('x', 'k')).rejects.toThrow(/GraphQL errors/);
  });

  test('[P0] throws "non-JSON" on unparseable body', async () => {
    globalThis.fetch = (async () =>
      new Response('<<not-json>>', { status: 200 })) as typeof fetch;
    await expect(fetchTokenMetrics('x', 'k')).rejects.toThrow(/non-JSON/);
  });

  test('[P0] wraps fetch network errors with "request failed"', async () => {
    globalThis.fetch = (async () => { throw new Error('ECONNRESET'); }) as typeof fetch;
    await expect(fetchTokenMetrics('x', 'k')).rejects.toThrow(/Santiment request failed/);
  });
});
