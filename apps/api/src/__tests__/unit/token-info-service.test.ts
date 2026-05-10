import { describe, test, expect, mock, beforeEach } from 'bun:test';

// Mock config before importing service
const mockConfig = {
  COINGECKO_API_URL: 'https://api.coingecko.com/api/v3',
  COINGECKO_API_KEY: '',
};

mock.module('../../config', () => ({ config: mockConfig }));

import { fetchTokenInfo } from '../../router/services/token-info';

const MOCK_COINGECKO_RESPONSE = [
  {
    id: 'ethereum',
    symbol: 'eth',
    name: 'Ethereum',
    current_price: 3200.0,
    market_cap: 385_000_000_000,
    total_volume: 12_000_000_000,
    price_change_percentage_24h: 2.5,
    last_updated: '2026-05-10T00:00:00Z',
  },
];

describe('fetchTokenInfo', () => {
  beforeEach(() => {
    // Reset fetch mock
    globalThis.fetch = mock(() =>
      Promise.resolve(
        new Response(JSON.stringify(MOCK_COINGECKO_RESPONSE), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    ) as any;
  });

  test('returns correct snapshot shape', async () => {
    const snap = await fetchTokenInfo('ethereum');
    expect(snap.slug).toBe('ethereum');
    expect(snap.symbol).toBe('ETH');
    expect(snap.name).toBe('Ethereum');
    expect(snap.price_usd).toBe(3200.0);
    expect(snap.market_cap_usd).toBe(385_000_000_000);
    expect(snap.volume_24h_usd).toBe(12_000_000_000);
    expect(snap.change_24h_pct).toBe(2.5);
    expect(snap.last_updated).toBe('2026-05-10T00:00:00Z');
  });

  test('throws on 429 rate limit', async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response('rate limited', { status: 429 })),
    ) as any;
    await expect(fetchTokenInfo('bitcoin')).rejects.toThrow('rate-limited');
  });

  test('throws when token not found (empty array)', async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(
        new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } }),
      ),
    ) as any;
    await expect(fetchTokenInfo('unknown-token-xyz')).rejects.toThrow("not found");
  });

  test('throws on network error', async () => {
    globalThis.fetch = mock(() => Promise.reject(new Error('ECONNREFUSED'))) as any;
    await expect(fetchTokenInfo('btc')).rejects.toThrow('CoinGecko request failed');
  });
});
