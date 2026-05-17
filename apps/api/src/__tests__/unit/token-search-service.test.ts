import { describe, test, expect, mock, beforeEach } from 'bun:test';

const mockConfig = {
  COINGECKO_API_KEY: '',
};

mock.module('../../config', () => ({ config: mockConfig }));

import { searchTokens } from '../../router/services/token-search';

const MOCK_COINGECKO_SEARCH_RESPONSE = {
  coins: [
    {
      id: 'ethereum',
      name: 'Ethereum',
      symbol: 'ETH',
      thumb: 'https://coin-images.coingecko.com/coins/images/279/thumb/ethereum.png',
      market_cap_rank: 2,
    },
    {
      id: 'ethereum-classic',
      name: 'Ethereum Classic',
      symbol: 'ETC',
      thumb: 'https://coin-images.coingecko.com/coins/images/453/thumb/ethereum-classic.png',
      market_cap_rank: 25,
    },
  ],
};

describe('searchTokens', () => {
  beforeEach(() => {
    globalThis.fetch = mock(() =>
      Promise.resolve(
        new Response(JSON.stringify(MOCK_COINGECKO_SEARCH_RESPONSE), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    ) as any;
  });

  test('returns correct snapshot shape on happy path', async () => {
    const snap = await searchTokens('ethereum');
    expect(snap.query).toBe('ethereum');
    expect(snap.source).toBe('coingecko');
    expect(snap.results).toHaveLength(2);
    expect(snap.results[0].id).toBe('ethereum');
    expect(snap.results[0].name).toBe('Ethereum');
    expect(snap.results[0].symbol).toBe('ETH');
    expect(snap.results[0].market_cap_rank).toBe(2);
    expect(snap.results[0].image_url).toContain('coingecko.com');
  });

  test('returns empty results when coins array is empty', async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(
        new Response(JSON.stringify({ coins: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    ) as any;
    const snap = await searchTokens('unknownxyz');
    expect(snap.results).toHaveLength(0);
  });

  test('throws on 429 rate limit', async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response('Too Many Requests', { status: 429 })),
    ) as any;
    await expect(searchTokens('eth')).rejects.toThrow('CoinGecko rate-limited');
  });

  test('throws on non-200 API error', async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response('Internal Server Error', { status: 500 })),
    ) as any;
    await expect(searchTokens('eth')).rejects.toThrow('CoinGecko API error: 500');
  });

  test('filters out coins with empty id', async () => {
    const responseWithBadCoin = {
      coins: [
        { id: '', name: 'Bad Coin', symbol: 'BAD', thumb: '', market_cap_rank: null },
        { id: 'ethereum', name: 'Ethereum', symbol: 'ETH', thumb: '', market_cap_rank: 2 },
      ],
    };
    globalThis.fetch = mock(() =>
      Promise.resolve(
        new Response(JSON.stringify(responseWithBadCoin), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    ) as any;
    const snap = await searchTokens('eth');
    expect(snap.results).toHaveLength(1);
    expect(snap.results[0].id).toBe('ethereum');
  });

  test('limits results to 5 max', async () => {
    const manyCoins = Array.from({ length: 10 }, (_, i) => ({
      id: `coin-${i}`,
      name: `Coin ${i}`,
      symbol: `C${i}`,
      thumb: '',
      market_cap_rank: i + 1,
    }));
    globalThis.fetch = mock(() =>
      Promise.resolve(
        new Response(JSON.stringify({ coins: manyCoins }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    ) as any;
    const snap = await searchTokens('coin');
    expect(snap.results).toHaveLength(5);
  });
});
