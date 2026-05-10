import { config } from '../../config';

const TOKEN_SEARCH_TIMEOUT_MS = 800;

export interface SearchResult {
  id: string;
  name: string;
  symbol: string;
  image_url: string;
  market_cap_rank: number | null;
}

export interface TokenSearchSnapshot {
  results: SearchResult[];
  query: string;
  source: 'coingecko';
}

export async function searchTokens(
  query: string,
  options: { signal?: AbortSignal } = {},
): Promise<TokenSearchSnapshot> {
  const url = `https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(query)}`;
  const headers: Record<string, string> = { Accept: 'application/json' };
  
  if (config.COINGECKO_API_KEY) {
    headers['x-cg-demo-api-key'] = config.COINGECKO_API_KEY;
  }

  const resp = await fetch(url, {
    headers,
    signal: options.signal ?? AbortSignal.timeout(TOKEN_SEARCH_TIMEOUT_MS),
  });
  
  if (resp.status === 429) {
    throw new Error('CoinGecko rate-limited');
  }
  if (!resp.ok) {
    throw new Error(`CoinGecko API error: ${resp.status}`);
  }

  let body: { coins?: any[] };
  try {
    body = await resp.json() as { coins?: any[] };
  } catch {
    throw new Error('CoinGecko returned non-JSON response');
  }
  const coins = Array.isArray(body.coins) ? body.coins : [];

  const results: SearchResult[] = coins
    .filter((coin) => coin && typeof coin.id === 'string' && coin.id.length > 0)
    .slice(0, 5)
    .map((coin) => ({
      id: coin.id,
      name: String(coin.name ?? coin.id),
      symbol: String(coin.symbol ?? ''),
      image_url: String(coin.thumb || coin.large || coin.small || ''),
      market_cap_rank: coin.market_cap_rank ?? null,
    }));

  return {
    results,
    query,
    source: 'coingecko',
  };
}
