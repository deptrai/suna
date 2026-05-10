import { describe, test, expect, mock, beforeEach, afterEach } from 'bun:test';

// Must mock config before any service import
mock.module('../../config', () => ({
  config: {
    COINGECKO_API_URL: 'https://api.coingecko.com/api/v3',
    COINGECKO_API_KEY: '',
  },
  getToolCost: () => 0,
}));

import { fetchTokenOhlcv, VALID_DAYS } from '../router/services/token-ohlcv';
import { resolveCoinIdFromAddress } from '../router/services/coingecko-helpers';

const MOCK_OHLC_RESPONSE = [
  [1700000000000, 35000.5, 35200.1, 34800.0, 35100.7],
  [1700014400000, 35100.7, 35500.0, 35000.0, 35400.2],
];

function makeOhlcFetch(coinId = 'uniswap') {
  return mock(async (url: string) => {
    if (url.includes('/contract/')) {
      return new Response(JSON.stringify({ id: coinId }), { status: 200 });
    }
    if (url.includes('/ohlc')) {
      return new Response(JSON.stringify(MOCK_OHLC_RESPONSE), { status: 200 });
    }
    return new Response('{}', { status: 404 });
  });
}

describe('resolveCoinIdFromAddress', () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  test('EVM address + valid chain → returns coinId', async () => {
    global.fetch = mock(async () =>
      new Response(JSON.stringify({ id: 'uniswap' }), { status: 200 }),
    ) as any;

    const coinId = await resolveCoinIdFromAddress(
      '0x1f9840a85d5af5bf1d1762f925bdaddc4201f984',
      'ethereum',
    );
    expect(coinId).toBe('uniswap');
  });

  test('404 from contract endpoint → throws "token not indexed on CoinGecko"', async () => {
    global.fetch = mock(async () =>
      new Response('Not found', { status: 404 }),
    ) as any;

    await expect(
      resolveCoinIdFromAddress('0x1f9840a85d5af5bf1d1762f925bdaddc4201f984', 'ethereum'),
    ).rejects.toThrow('token not indexed on CoinGecko');
  });

  test('429 from CoinGecko → throws "rate-limited"', async () => {
    global.fetch = mock(async () =>
      new Response('Rate limited', { status: 429 }),
    ) as any;

    await expect(
      resolveCoinIdFromAddress('0x1f9840a85d5af5bf1d1762f925bdaddc4201f984', 'ethereum'),
    ).rejects.toThrow('rate-limited');
  });
});

describe('fetchTokenOhlcv', () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  test('slug input (no address resolution) → direct OHLC fetch, returns mapped bars', async () => {
    let callCount = 0;
    global.fetch = mock(async (url: string) => {
      callCount++;
      expect((url as string).includes('/ohlc')).toBe(true);
      return new Response(JSON.stringify(MOCK_OHLC_RESPONSE), { status: 200 });
    }) as any;

    const result = await fetchTokenOhlcv({ slug: 'uniswap', days: 30 });
    expect(callCount).toBe(1);
    expect(result.items).toHaveLength(2);
    expect(result.items[0].time).toBe(Math.floor(1700000000000 / 1000));
    expect(result.items[0].open).toBe(35000.5);
    expect(result.items[0].volume).toBeUndefined();
    expect(result.source).toBe('coingecko');
  });

  test('address input → 2-step (resolution + OHLC), returns bars', async () => {
    global.fetch = makeOhlcFetch('uniswap') as any;

    const result = await fetchTokenOhlcv({
      address: '0x1f9840a85d5af5bf1d1762f925bdaddc4201f984',
      chain: 'ethereum',
      days: 30,
    });
    expect(result.items).toHaveLength(2);
    expect(result.items[1].close).toBe(35400.2);
  });

  test('empty OHLC array → throws "token not indexed"', async () => {
    global.fetch = mock(async (url: string) => {
      if ((url as string).includes('/ohlc')) {
        return new Response(JSON.stringify([]), { status: 200 });
      }
      return new Response(JSON.stringify({ id: 'uniswap' }), { status: 200 });
    }) as any;

    await expect(
      fetchTokenOhlcv({ slug: 'uniswap', days: 30 }),
    ).rejects.toThrow('token not indexed');
  });

  test('days validation: VALID_DAYS contains 1, 7, 14, 30, 90, 180 only', () => {
    expect(VALID_DAYS).toContain(1);
    expect(VALID_DAYS).toContain(7);
    expect(VALID_DAYS).toContain(14);
    expect(VALID_DAYS).toContain(30);
    expect(VALID_DAYS).toContain(90);
    expect(VALID_DAYS).toContain(180);
    expect(VALID_DAYS).not.toContain(5 as any);
    expect(VALID_DAYS).not.toContain(100 as any);
    expect(VALID_DAYS).not.toContain(-1 as any);
  });

  test('no slug or address → throws BEFORE any fetch call (early validation)', async () => {
    const fetchMock = mock(async () => new Response('{}', { status: 200 }));
    global.fetch = fetchMock as any;
    await expect(fetchTokenOhlcv({})).rejects.toThrow(/at least one of slug or address/i);
    expect(fetchMock.mock.calls.length).toBe(0);
  });

  test('unknown chain → throws "unsupported chain" (no silent ethereum fallback)', async () => {
    const fetchMock = mock(async () => new Response(JSON.stringify({ id: 'uniswap' }), { status: 200 }));
    global.fetch = fetchMock as any;

    await expect(
      resolveCoinIdFromAddress('0x1f9840a85d5af5bf1d1762f925bdaddc4201f984', 'linea'),
    ).rejects.toThrow(/unsupported chain/i);
    // Crucially: must throw BEFORE making any HTTP call so we don't waste rate-limit quota
    expect(fetchMock.mock.calls.length).toBe(0);
  });

  test('uppercase chain (BASE) normalized to lowercase → resolves correctly', async () => {
    global.fetch = mock(async () =>
      new Response(JSON.stringify({ id: 'usd-coin' }), { status: 200 }),
    ) as any;

    const coinId = await resolveCoinIdFromAddress(
      '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
      'BASE',
    );
    expect(coinId).toBe('usd-coin');
  });

  test('CoinGecko returns body without `id` field → throws "not indexed"', async () => {
    global.fetch = mock(async () => new Response('{}', { status: 200 })) as any;
    await expect(
      resolveCoinIdFromAddress('0x1f9840a85d5af5bf1d1762f925bdaddc4201f984', 'ethereum'),
    ).rejects.toThrow(/not indexed/i);
  });

  test('OHLC response with null fields filtered out, valid bars returned', async () => {
    global.fetch = mock(async (url: string) => {
      if ((url as string).includes('/contract/')) {
        return new Response(JSON.stringify({ id: 'uniswap' }), { status: 200 });
      }
      return new Response(
        JSON.stringify([
          [1700000000000, 35000.5, 35200.1, 34800.0, 35100.7],
          [1700014400000, null, null, null, null],
          [1700028800000, 35400.2, 35600.0, 35200.0, 35500.0],
        ]),
        { status: 200 },
      );
    }) as any;

    const result = await fetchTokenOhlcv({ slug: 'uniswap', days: 30 });
    expect(result.items).toHaveLength(2);
    expect(result.items[0].close).toBe(35100.7);
    expect(result.items[1].close).toBe(35500.0);
  });
});
