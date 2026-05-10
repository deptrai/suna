import { config } from '../../config';

const TOKEN_INFO_TIMEOUT_MS = 1200;

export interface TokenInfoSnapshot {
  slug: string;
  symbol: string;
  name: string;
  price_usd: number;
  market_cap_usd: number | null;
  volume_24h_usd: number | null;
  change_24h_pct: number | null;
  last_updated: string;
  source: 'coingecko';
}

interface CoinGeckoSimplePrice {
  [id: string]: {
    usd?: number;
    usd_market_cap?: number;
    usd_24h_vol?: number;
    usd_24h_change?: number;
    last_updated_at?: number;
  };
}

interface CoinGeckoCoinsMarkets {
  id: string;
  symbol: string;
  name: string;
  current_price: number | null;
  market_cap: number | null;
  total_volume: number | null;
  price_change_percentage_24h: number | null;
  last_updated: string | null;
}

// CoinGecko platform IDs for `/coins/{platform}/contract/{address}` lookup
const COINGECKO_PLATFORM_MAP: Record<string, string> = {
  ethereum: 'ethereum',
  arbitrum: 'arbitrum-one',
  base: 'base',
  polygon: 'polygon-pos',
  bsc: 'binance-smart-chain',
  avalanche: 'avalanche',
  optimism: 'optimistic-ethereum',
};

export async function fetchTokenInfo(
  slug: string,
  options: { signal?: AbortSignal; chain?: string } = {},
): Promise<TokenInfoSnapshot> {
  const baseUrl = config.COINGECKO_API_URL.replace(/\/+$/, '');
  const headers: Record<string, string> = {
    Accept: 'application/json',
  };
  if (config.COINGECKO_API_KEY) {
    headers['x-cg-demo-api-key'] = config.COINGECKO_API_KEY;
  }

  const signal = options.signal ?? AbortSignal.timeout(TOKEN_INFO_TIMEOUT_MS);

  // If input looks like an EVM address, resolve it to a CoinGecko coin ID first.
  // CoinGecko /coins/markets only accepts coin IDs (e.g. "uniswap"), not addresses.
  let coinId = slug;
  const isEvmAddress = /^0x[a-fA-F0-9]{40}$/.test(slug);
  if (isEvmAddress) {
    const platform = COINGECKO_PLATFORM_MAP[options.chain ?? 'ethereum'] ?? 'ethereum';
    const contractUrl = `${baseUrl}/coins/${platform}/contract/${slug.toLowerCase()}`;
    try {
      const contractRes = await fetch(contractUrl, { headers, signal });
      if (contractRes.ok) {
        const contractData = (await contractRes.json()) as { id?: string };
        if (contractData.id) {
          coinId = contractData.id;
        } else {
          throw new Error(`CoinGecko: token '${slug}' not found`);
        }
      } else if (contractRes.status === 404) {
        throw new Error(`CoinGecko: token '${slug}' not found`);
      } else {
        throw new Error(`CoinGecko API error: ${contractRes.status}`);
      }
    } catch (e) {
      if (e instanceof Error && e.message.includes('CoinGecko')) throw e;
      throw new Error(`CoinGecko request failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  const url = `${baseUrl}/coins/markets?vs_currency=usd&ids=${encodeURIComponent(coinId)}&per_page=1&page=1`;

  let response: Response;
  try {
    response = await fetch(url, {
      headers,
      signal,
    });
  } catch (e) {
    throw new Error(`CoinGecko request failed: ${e instanceof Error ? e.message : String(e)}`);
  }

  if (response.status === 429) {
    throw new Error('CoinGecko rate-limited');
  }
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`CoinGecko API error: ${response.status} - ${body || response.statusText}`);
  }

  let data: CoinGeckoCoinsMarkets[];
  try {
    data = (await response.json()) as CoinGeckoCoinsMarkets[];
  } catch (e) {
    throw new Error(`CoinGecko returned non-JSON: ${e instanceof Error ? e.message : String(e)}`);
  }

  const item = data?.[0];
  if (!item) {
    throw new Error(`CoinGecko: token '${coinId}' not found`);
  }

  return {
    slug: coinId,
    symbol: (item.symbol ?? coinId).toUpperCase(),
    name: item.name ?? coinId,
    price_usd: item.current_price ?? 0,
    market_cap_usd: item.market_cap ?? null,
    volume_24h_usd: item.total_volume ?? null,
    change_24h_pct: item.price_change_percentage_24h ?? null,
    last_updated: item.last_updated ?? new Date().toISOString(),
    source: 'coingecko',
  };
}
