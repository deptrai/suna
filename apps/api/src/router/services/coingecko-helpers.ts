import { config } from '../../config';

// CoinGecko platform IDs for `/coins/{platform}/contract/{address}` lookup
export const COINGECKO_PLATFORM_MAP: Record<string, string> = {
  ethereum: 'ethereum',
  arbitrum: 'arbitrum-one',
  base: 'base',
  polygon: 'polygon-pos',
  bsc: 'binance-smart-chain',
  avalanche: 'avalanche',
  optimism: 'optimistic-ethereum',
};

export function isEvmAddress(input: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(input);
}

export function buildCoinGeckoHeaders(): Record<string, string> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (config.COINGECKO_API_KEY) {
    headers['x-cg-demo-api-key'] = config.COINGECKO_API_KEY;
  }
  return headers;
}

/**
 * Resolves an EVM contract address to a CoinGecko coin ID.
 * Throws if not found (404) or network error.
 */
export async function resolveCoinIdFromAddress(
  address: string,
  chain: string | undefined,
  options: { signal?: AbortSignal } = {},
): Promise<string> {
  const baseUrl = (config.COINGECKO_API_URL || 'https://api.coingecko.com/api/v3').replace(/\/+$/, '');
  const headers = buildCoinGeckoHeaders();
  const normalizedChain = (chain ?? 'ethereum').toLowerCase();
  const platform = COINGECKO_PLATFORM_MAP[normalizedChain];
  if (!platform) {
    throw new Error(`CoinGecko: unsupported chain '${chain}' (supported: ${Object.keys(COINGECKO_PLATFORM_MAP).join(', ')})`);
  }
  const contractUrl = `${baseUrl}/coins/${platform}/contract/${encodeURIComponent(address.toLowerCase())}`;

  try {
    const contractRes = await fetch(contractUrl, { headers, signal: options.signal });
    if (contractRes.ok) {
      const text = await contractRes.text();
      const contractData = JSON.parse(text) as { id?: string };
      if (contractData.id) return contractData.id;
      throw new Error('token not indexed on CoinGecko');
    } else if (contractRes.status === 404) {
      throw new Error('token not indexed on CoinGecko');
    } else if (contractRes.status === 429) {
      throw new Error('CoinGecko rate-limited');
    } else {
      throw new Error(`CoinGecko API error: ${contractRes.status}`);
    }
  } catch (e) {
    if (
      e instanceof Error &&
      (e.message.includes('CoinGecko') ||
        e.message.includes('rate-limited') ||
        e.message.includes('not indexed'))
    ) {
      throw e;
    }
    throw new Error(`CoinGecko request failed: ${e instanceof Error ? e.message : String(e)}`);
  }
}
