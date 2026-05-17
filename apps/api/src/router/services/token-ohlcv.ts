import { config } from '../../config';
import { isEvmAddress, buildCoinGeckoHeaders, resolveCoinIdFromAddress } from './coingecko-helpers';

const TOKEN_OHLCV_TIMEOUT_MS = 2500;

export const VALID_DAYS = [1, 7, 14, 30, 90, 180] as const;
export type ValidDays = (typeof VALID_DAYS)[number];

export interface OhlcvBar {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export interface OhlcvSnapshot {
  items: OhlcvBar[];
  days: number;
  source: 'coingecko';
  last_updated: string;
}

export interface FetchTokenOhlcvOptions {
  signal?: AbortSignal;
}

export interface FetchTokenOhlcvArgs {
  slug?: string;
  address?: string;
  chain?: string;
  days?: ValidDays;
}

export async function fetchTokenOhlcv(
  args: FetchTokenOhlcvArgs,
  options: FetchTokenOhlcvOptions = {},
): Promise<OhlcvSnapshot> {
  const { slug, address, chain, days = 30 } = args;
  const baseUrl = (config.COINGECKO_API_URL || 'https://api.coingecko.com/api/v3').replace(/\/+$/, '');
  const headers = buildCoinGeckoHeaders();
  const signal = options.signal ?? AbortSignal.timeout(TOKEN_OHLCV_TIMEOUT_MS);

  // Determine coinId — slug used directly, address requires resolution
  let coinId: string;
  const input = slug ?? address ?? '';
  if (address && isEvmAddress(address)) {
    coinId = await resolveCoinIdFromAddress(address, chain, { signal });
  } else if (slug) {
    coinId = slug;
  } else {
    throw new Error('At least one of slug or address is required');
  }

  const ohlcUrl = `${baseUrl}/coins/${encodeURIComponent(coinId)}/ohlc?vs_currency=usd&days=${days}`;

  let response: Response;
  try {
    response = await fetch(ohlcUrl, { headers, signal });
  } catch (e) {
    throw new Error(`CoinGecko OHLC request failed: ${e instanceof Error ? e.message : String(e)}`);
  }

  if (response.status === 429) {
    throw new Error('CoinGecko rate-limited');
  }
  if (response.status === 404) {
    throw new Error('token not indexed on CoinGecko');
  }
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`CoinGecko OHLC API error: ${response.status} - ${body || response.statusText}`);
  }

  let raw: [number, number, number, number, number][];
  try {
    const text = await response.text();
    raw = JSON.parse(text);
  } catch (e) {
    throw new Error(`CoinGecko returned non-JSON: ${e instanceof Error ? e.message : String(e)}`);
  }

  if (!Array.isArray(raw) || raw.length === 0) {
    throw new Error('token not indexed on CoinGecko');
  }

  // Defensive: CoinGecko has been observed to return `null` values for OHLC fields on
  // illiquid pairs. Drop malformed entries instead of letting NaN propagate to chart.
  const items: OhlcvBar[] = [];
  for (const entry of raw) {
    if (!Array.isArray(entry) || entry.length < 5) continue;
    const [ts_ms, open, high, low, close] = entry;
    if (
      !Number.isFinite(ts_ms) ||
      !Number.isFinite(open) ||
      !Number.isFinite(high) ||
      !Number.isFinite(low) ||
      !Number.isFinite(close)
    ) {
      continue;
    }
    items.push({
      time: Math.floor(ts_ms / 1000),
      open,
      high,
      low,
      close,
    });
  }

  if (items.length === 0) {
    throw new Error('token not indexed on CoinGecko');
  }

  return {
    items,
    days,
    source: 'coingecko',
    last_updated: new Date().toISOString(),
  };
}
