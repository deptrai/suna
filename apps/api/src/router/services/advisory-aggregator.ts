import { cacheGetStale, cacheSet, widgetCacheKey } from './widget-cache';
import { fetchContractRisk } from './contract-risk';
import { searchTokens } from './token-search';
import { buildCoinGeckoHeaders, resolveCoinIdFromAddress } from './coingecko-helpers';

export const SUPPORTED_CHAINS = new Set(['ethereum', 'bsc', 'polygon', 'arbitrum', 'optimism', 'base', 'avalanche', 'fantom', 'solana']);
export const EVM_ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;
export const SOL_ADDRESS_RE = /^[1-9A-HJ-NP-Za-km-z]{43,44}$/;
export const TICKER_RE = /^[A-Za-z0-9._-]{1,10}$/;

const ADVISORY_TTL_MS = 5 * 60_000;
const PRICE_TTL_MS = 60_000;
const PRICE_STALE_MS = 24 * 60 * 60_000;
const TOTAL_TIMEOUT_MS = 2500;

const inFlight = new Map<string, Promise<AdvisoryRiskResponse>>();

export class AdvisoryError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

type RiskLevel = 'low' | 'medium' | 'high' | 'critical' | 'unknown';

export type AdvisoryRiskResponse = {
  risk: {
    level: RiskLevel;
    liquidity: string | null;
    contractInfo: string | null;
    price: string | null;
    change24h: string | null;
  };
  meta: {
    resolved_address: string | null;
    chain: string;
    chain_assumed: boolean;
    source: 'live' | 'cache_fresh' | 'cache_stale';
    price_status: 'live' | 'stale' | 'rate_limited' | 'unavailable';
    checked_at: string;
    request_id: string;
  };
};

function normalizeChain(chain: string | undefined, fallback = 'ethereum'): string {
  if (!chain) return fallback;
  const c = chain.toLowerCase().trim();
  return SUPPORTED_CHAINS.has(c) ? c : fallback;
}

function formatUsd(n: number | null | undefined): string | null {
  if (typeof n !== 'number' || !Number.isFinite(n)) return null;
  if (n >= 1) return `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  return `$${n.toFixed(6)}`;
}

function formatPct(n: number | null | undefined): string | null {
  if (typeof n !== 'number' || !Number.isFinite(n)) return null;
  const sign = n > 0 ? '+' : '';
  return `${sign}${n.toFixed(2)}%`;
}

function mapRiskLevel(level: string): RiskLevel {
  const x = level.toLowerCase();
  if (x === 'low' || x === 'medium' || x === 'high' || x === 'critical') return x;
  return 'unknown';
}

function summarizeFactors(factors: Array<{ label: string }>): string | null {
  if (!factors.length) return null;
  return factors.slice(0, 2).map((f) => f.label).join('; ');
}

function platformToChain(platform: string): string | null {
  const m: Record<string, string> = {
    ethereum: 'ethereum',
    'binance-smart-chain': 'bsc',
    'polygon-pos': 'polygon',
    'arbitrum-one': 'arbitrum',
    'optimistic-ethereum': 'optimism',
    base: 'base',
    avalanche: 'avalanche',
    fantom: 'fantom',
    solana: 'solana',
  };
  return m[platform] ?? null;
}

async function fetchCoinDetails(coinId: string, signal?: AbortSignal): Promise<{ platforms: Record<string, string> }> {
  const base = (process.env.COINGECKO_API_URL || 'https://api.coingecko.com/api/v3').replace(/\/+$/, '');
  const res = await fetch(`${base}/coins/${encodeURIComponent(coinId)}?localization=false&tickers=false&market_data=false&community_data=false&developer_data=false&sparkline=false`, {
    headers: buildCoinGeckoHeaders(),
    signal,
  });
  if (!res.ok) throw new AdvisoryError(503, `CoinGecko API error: ${res.status}`);
  const body = await res.json() as { platforms?: Record<string, string> };
  return { platforms: body.platforms ?? {} };
}

async function fetchPrice(coinId: string, signal?: AbortSignal): Promise<{ price: number | null; change24h: number | null; status: 'live' | 'stale' | 'rate_limited' | 'unavailable' }> {
  const key = widgetCacheKey('advisory_price', coinId.toLowerCase());
  const base = (process.env.COINGECKO_API_URL || 'https://api.coingecko.com/api/v3').replace(/\/+$/, '');
  const url = `${base}/simple/price?ids=${encodeURIComponent(coinId)}&vs_currencies=usd&include_24hr_change=true`;

  try {
    const res = await fetch(url, { headers: buildCoinGeckoHeaders(), signal: signal ?? AbortSignal.timeout(1500) });
    if (res.status === 429) {
      const stale = cacheGetStale<{ price: number | null; change24h: number | null }>(key);
      if (stale && Date.now() - stale.fetched_at_ms <= PRICE_STALE_MS) return { ...stale.data, status: 'stale' };
      return { price: null, change24h: null, status: 'rate_limited' };
    }
    if (!res.ok) throw new AdvisoryError(503, `CoinGecko API error: ${res.status}`);
    const body = await res.json() as Record<string, { usd?: number; usd_24h_change?: number }>;
    const row = body[coinId] ?? body[coinId.toLowerCase()] ?? Object.values(body)[0];
    const data = { price: row?.usd ?? null, change24h: row?.usd_24h_change ?? null };
    cacheSet(key, data, PRICE_TTL_MS);
    return { ...data, status: 'live' };
  } catch {
    const stale = cacheGetStale<{ price: number | null; change24h: number | null }>(key);
    if (stale && Date.now() - stale.fetched_at_ms <= PRICE_STALE_MS) return { ...stale.data, status: 'stale' };
    return { price: null, change24h: null, status: 'unavailable' };
  }
}

async function resolveInput(query: string, chain?: string): Promise<{ address: string | null; chain: string; chainAssumed: boolean; coinId: string | null }> {
  const q = query.trim();
  const requestedChain = chain ? normalizeChain(chain) : undefined;

  if (SOL_ADDRESS_RE.test(q)) return { address: q, chain: 'solana', chainAssumed: false, coinId: null };

  if (EVM_ADDRESS_RE.test(q)) {
    const resolvedChain = requestedChain ?? 'ethereum';
    const coinId = await (async () => {
      try {
        return await resolveCoinIdFromAddress(q, resolvedChain, { signal: AbortSignal.timeout(1200) });
      } catch {
        return null;
      }
    })();
    return { address: q.toLowerCase(), chain: resolvedChain, chainAssumed: !requestedChain, coinId };
  }

  if (!TICKER_RE.test(q)) throw new AdvisoryError(400, 'Invalid token format');

  let search;
  try {
    search = await searchTokens(q, { signal: AbortSignal.timeout(1200) });
  } catch (error) {
    throw new AdvisoryError(503, error instanceof Error ? error.message : 'Token search unavailable');
  }
  if (!search.results.length) throw new AdvisoryError(404, 'Token not found');

  const sorted = [...search.results].sort((a, b) => (a.market_cap_rank ?? Number.MAX_SAFE_INTEGER) - (b.market_cap_rank ?? Number.MAX_SAFE_INTEGER));

  for (const candidate of sorted) {
    try {
      const details = await fetchCoinDetails(candidate.id, AbortSignal.timeout(1200));
      const entries = Object.entries(details.platforms).filter(([, addr]) => typeof addr === 'string' && addr.length > 0);
      if (!entries.length) return { address: null, chain: requestedChain ?? 'ethereum', chainAssumed: !requestedChain, coinId: candidate.id };

      if (requestedChain) {
        const hit = entries.find(([platform]) => platformToChain(platform) === requestedChain);
        if (hit) return { address: hit[1], chain: requestedChain, chainAssumed: false, coinId: candidate.id };
        continue;
      }

      const preferred = entries.find(([platform]) => platformToChain(platform) === 'ethereum') ?? entries[0];
      const mapped = platformToChain(preferred[0]);
      if (!mapped) continue;
      return { address: preferred[1], chain: mapped, chainAssumed: false, coinId: candidate.id };
    } catch {
      continue;
    }
  }

  return { address: null, chain: requestedChain ?? 'ethereum', chainAssumed: !requestedChain, coinId: sorted[0]?.id ?? null };
}

async function buildAdvisory(query: string, chain: string | undefined, requestId: string): Promise<AdvisoryRiskResponse> {
  const resolved = await resolveInput(query, chain);

  const [riskResult, priceResult] = await Promise.allSettled([
    (async () => {
      if (!resolved.address) return null;
      try {
        return await fetchContractRisk(resolved.address, resolved.chain, { signal: AbortSignal.timeout(2500) });
      } catch {
        return null;
      }
    })(),
    (async () => {
      if (!resolved.coinId) return { price: null, change24h: null, status: 'unavailable' as const };
      return fetchPrice(resolved.coinId, AbortSignal.timeout(1500));
    })(),
  ]);

  const risk = riskResult.status === 'fulfilled' ? riskResult.value : null;
  const price = priceResult.status === 'fulfilled' ? priceResult.value : { price: null, change24h: null, status: 'unavailable' as const };

  return {
    risk: {
      level: risk ? mapRiskLevel(risk.risk_level) : 'unknown',
      liquidity: null,
      contractInfo: risk ? summarizeFactors(risk.top_factors) : null,
      price: formatUsd(price.price),
      change24h: formatPct(price.change24h),
    },
    meta: {
      resolved_address: resolved.address,
      chain: resolved.chain,
      chain_assumed: resolved.chainAssumed,
      source: 'live',
      price_status: price.status,
      checked_at: new Date().toISOString(),
      request_id: requestId,
    },
  };
}

export function advisoryCacheKey(q: string, chain?: string): string {
  const cacheChain = normalizeChain(chain?.trim(), EVM_ADDRESS_RE.test(q) ? 'ethereum' : 'solana');
  return widgetCacheKey('advisory_risk', q.toLowerCase(), cacheChain);
}

export async function getAdvisoryRisk(query: string, chain: string | undefined, requestId: string): Promise<AdvisoryRiskResponse> {
  const key = advisoryCacheKey(query, chain);
  const existing = inFlight.get(key);
  if (existing) return existing;

  const promise = Promise.race([
    buildAdvisory(query, chain, requestId),
    new Promise<AdvisoryRiskResponse>((_, reject) => {
      setTimeout(() => reject(new AdvisoryError(504, 'Risk service timeout')), TOTAL_TIMEOUT_MS);
    }),
  ]).then((data) => {
    cacheSet(key, data, ADVISORY_TTL_MS);
    return data;
  }).finally(() => {
    inFlight.delete(key);
  });

  inFlight.set(key, promise);
  return promise;
}
