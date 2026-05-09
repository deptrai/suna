import { expect, test, describe, beforeEach, afterEach, vi } from 'vitest';
import { fetchProtocolSnapshot } from '../../src/router/services/defillama';

const mockDefillamaData = {
  id: "111",
  name: "AAVE",
  chains: ["Ethereum", "Polygon"],
  tvl: [
    { date: 1672531200, totalLiquidityUSD: 100000 },
    { date: 1672617600, totalLiquidityUSD: 110000 }
  ],
  chainTvls: {
    Ethereum: {
      tvl: [
        { date: 1672531200, totalLiquidityUSD: 80000 },
        { date: 1672617600, totalLiquidityUSD: 90000 }
      ]
    }
  }
};

describe('defillama', () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('fetchProtocolSnapshot fetches and maps data correctly', async () => {
    (global.fetch as any).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockDefillamaData
    });
    const result = await fetchProtocolSnapshot('aave');
    expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('/protocol/aave'), expect.any(Object));
    expect(result.slug).toBe('aave');
    expect(result.tvl_usd).toBe(110000);
    expect(result.tvl_change_24h_pct).toBeCloseTo(10);
  });

  test('fetchProtocolSnapshot filters by chain if provided', async () => {
    (global.fetch as any).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockDefillamaData
    });
    const result = await fetchProtocolSnapshot('aave', { chain: 'ethereum' });
    expect(result.tvl_usd).toBe(90000);
    expect(result.tvl_change_24h_pct).toBeCloseTo(12.5);
  });

  test('fetchProtocolSnapshot handles 429 rate limit', async () => {
    (global.fetch as any).mockResolvedValue({
      ok: false,
      status: 429,
    });
    await expect(fetchProtocolSnapshot('aave')).rejects.toThrow('DeFiLlama API error');
  });
});
