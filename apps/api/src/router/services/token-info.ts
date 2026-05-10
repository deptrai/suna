import { config } from '../../config';
import { isEvmAddress, buildCoinGeckoHeaders, resolveCoinIdFromAddress } from './coingecko-helpers';

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

export async function fetchTokenInfo(
  slug: string,
  options: { signal?: AbortSignal; chain?: string } = {},
): Promise<TokenInfoSnapshot> {
  const baseUrl = config.COINGECKO_API_URL.replace(/\/+$/, '');
  const headers = buildCoinGeckoHeaders();
  const signal = options.signal ?? AbortSignal.timeout(TOKEN_INFO_TIMEOUT_MS);

  // If input looks like an EVM address, resolve it to a CoinGecko coin ID first.
  let coinId = slug;
  if (isEvmAddress(slug)) {
    coinId = await resolveCoinIdFromAddress(slug, options.chain, { signal });
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
