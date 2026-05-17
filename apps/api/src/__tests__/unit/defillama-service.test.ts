import { describe, test, expect, mock, beforeEach, afterEach } from 'bun:test';

mock.module('../../config', () => ({
  config: {
    DEFILLAMA_API_URL: 'https://api.llama.fi',
  },
}));

const { fetchProtocolSnapshot } = await import('../../router/services/defillama');

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function stubFetchOk(body: unknown) {
  globalThis.fetch = (async () =>
    new Response(JSON.stringify(body), { status: 200 })) as typeof fetch;
}

function stubFetchStatus(status: number, body: string = '') {
  globalThis.fetch = (async () => new Response(body, { status })) as typeof fetch;
}

const baseTvl = (t = 1700000000) => [
  { date: t - 86400, totalLiquidityUSD: 100 },
  { date: t, totalLiquidityUSD: 110 },
];

describe('fetchProtocolSnapshot — happy paths', () => {
  test('[P0] returns snapshot with name, tvl, change% from valid response', async () => {
    stubFetchOk({
      id: 'p-1',
      name: 'Aave',
      chains: ['Ethereum', 'Arbitrum'],
      tvl: baseTvl(),
    });
    const snapshot = await fetchProtocolSnapshot('aave');
    expect(snapshot.name).toBe('Aave');
    expect(snapshot.slug).toBe('aave');
    expect(snapshot.tvl_usd).toBe(110);
    expect(snapshot.tvl_change_24h_pct).toBeCloseTo(10, 5);
    expect(snapshot.chains).toEqual(['Ethereum', 'Arbitrum']);
    expect(snapshot.apy_avg).toBeNull();
  });

  test('[P0] uses chainTvls when chain option provided', async () => {
    stubFetchOk({
      id: 'p-1',
      name: 'Aave',
      chains: ['Ethereum', 'Polygon'],
      tvl: baseTvl(),
      chainTvls: {
        Polygon: { tvl: [{ date: 1, totalLiquidityUSD: 50 }, { date: 86402, totalLiquidityUSD: 60 }] },
      },
    });
    const snapshot = await fetchProtocolSnapshot('aave', { chain: 'polygon' });
    expect(snapshot.tvl_usd).toBe(60);
    expect(snapshot.chains).toEqual(['Polygon']);
  });

  test('[P0] tvl_change_24h_pct is null when only one TVL entry', async () => {
    stubFetchOk({
      id: 'p-1',
      name: 'Solo',
      chains: ['Ethereum'],
      tvl: [{ date: 1700000000, totalLiquidityUSD: 100 }],
    });
    const snapshot = await fetchProtocolSnapshot('solo');
    expect(snapshot.tvl_usd).toBe(100);
    expect(snapshot.tvl_change_24h_pct).toBeNull();
  });

  test('[P1] strips trailing slash from base URL', async () => {
    let capturedUrl = '';
    globalThis.fetch = (async (url: string | URL | Request) => {
      capturedUrl = String(url);
      return new Response(JSON.stringify({
        id: 'p-1', name: 'Aave', chains: [], tvl: baseTvl(),
      }), { status: 200 });
    }) as typeof fetch;
    await fetchProtocolSnapshot('aave');
    expect(capturedUrl).toBe('https://api.llama.fi/protocol/aave');
    expect(capturedUrl).not.toContain('//protocol');
  });

  test('[P1] URL-encodes the slug', async () => {
    let capturedUrl = '';
    globalThis.fetch = (async (url: string | URL | Request) => {
      capturedUrl = String(url);
      return new Response(JSON.stringify({
        id: 'p', name: 'X', chains: [], tvl: baseTvl(),
      }), { status: 200 });
    }) as typeof fetch;
    await fetchProtocolSnapshot('weird/slug');
    expect(capturedUrl).toContain('weird%2Fslug');
  });
});

describe('fetchProtocolSnapshot — error handling', () => {
  test('[P0] throws "rate-limited" on 429', async () => {
    stubFetchStatus(429);
    await expect(fetchProtocolSnapshot('aave')).rejects.toThrow('DeFiLlama rate-limited');
  });

  test('[P0] throws "API error: <status>" on non-429 5xx', async () => {
    stubFetchStatus(500, 'server down');
    await expect(fetchProtocolSnapshot('aave')).rejects.toThrow(/DeFiLlama API error: 500/);
  });

  test('[P0] wraps fetch network errors with "request failed"', async () => {
    globalThis.fetch = (async () => { throw new Error('socket hang up'); }) as typeof fetch;
    await expect(fetchProtocolSnapshot('aave')).rejects.toThrow(/DeFiLlama request failed/);
  });

  test('[P0] throws "non-JSON" when body fails to parse', async () => {
    globalThis.fetch = (async () =>
      new Response('not json', { status: 200, headers: { 'Content-Type': 'text/plain' } })) as typeof fetch;
    await expect(fetchProtocolSnapshot('aave')).rejects.toThrow(/DeFiLlama returned non-JSON/);
  });

  test('[P0] throws "no TVL data" when tvl array empty', async () => {
    stubFetchOk({ id: 'p', name: 'X', chains: [], tvl: [] });
    await expect(fetchProtocolSnapshot('x')).rejects.toThrow(/no TVL data/);
  });

  test('[P0] throws "invalid TVL" when last entry has non-finite value', async () => {
    stubFetchOk({
      id: 'p', name: 'X', chains: [],
      tvl: [{ date: 1, totalLiquidityUSD: NaN }],
    });
    await expect(fetchProtocolSnapshot('x')).rejects.toThrow(/invalid TVL/);
  });

  test('[P0] throws when requested chain is not in chainTvls', async () => {
    stubFetchOk({
      id: 'p', name: 'Aave', chains: ['Ethereum'], tvl: baseTvl(),
      chainTvls: { Ethereum: { tvl: baseTvl() } },
    });
    await expect(fetchProtocolSnapshot('aave', { chain: 'solana' })).rejects.toThrow(
      /chain 'solana' not available/,
    );
  });
});
