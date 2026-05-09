import type { ProtocolSnapshot } from '../../types';

const CACHE_TTL_MS = 5 * 60 * 1000;
const CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const CACHE_MAX_ENTRIES = 1000;
const CACHE_EVICT_BATCH = 100;

interface JitCacheEntry {
  data: ProtocolSnapshot;
  fetched_at: string;
  fetched_at_ms: number;
}

const cache = new Map<string, JitCacheEntry>();
const inflight = new Map<string, Promise<ProtocolSnapshot>>();

export function cacheKey(slug: string, chain?: string): string {
  return `${slug.toLowerCase()}:${chain?.toLowerCase() ?? 'all'}`;
}

export function getCached(key: string): JitCacheEntry | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (!Number.isFinite(entry.fetched_at_ms)) return null;
  const age = Date.now() - entry.fetched_at_ms;
  if (age > CACHE_TTL_MS) return null;
  return entry;
}

export function getCachedAny(key: string): JitCacheEntry | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (!Number.isFinite(entry.fetched_at_ms)) return null;
  const age = Date.now() - entry.fetched_at_ms;
  if (age > CACHE_MAX_AGE_MS) return null;
  return entry;
}

export function setCache(key: string, data: ProtocolSnapshot): void {
  if (!cache.has(key) && cache.size >= CACHE_MAX_ENTRIES) {
    let evicted = 0;
    for (const k of cache.keys()) {
      if (evicted >= CACHE_EVICT_BATCH) break;
      cache.delete(k);
      evicted++;
    }
  }
  const now = Date.now();
  cache.set(key, {
    data,
    fetched_at: new Date(now).toISOString(),
    fetched_at_ms: now,
  });
}

export function _clearCacheForTests(): void {
  cache.clear();
  inflight.clear();
}

export function dedupedFetch(
  key: string,
  fetcher: () => Promise<ProtocolSnapshot>,
): Promise<ProtocolSnapshot> {
  const existing = inflight.get(key);
  if (existing) return existing;
  const promise = (async () => {
    try {
      const data = await fetcher();
      setCache(key, data);
      return data;
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, promise);
  return promise;
}

// ── Snapshot formatter ───────────────────────────────────────────────────────

function formatUsd(n: number): string {
  if (!Number.isFinite(n)) return '$?';
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(2)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}

function formatChange(pct: number | null): string {
  if (pct === null || !Number.isFinite(pct)) return 'n/a';
  const sign = pct > 0 ? '+' : '';
  return `${sign}${pct.toFixed(2)}%`;
}

export function formatSnapshot(
  data: ProtocolSnapshot,
  stale: boolean,
  fetchedAt: string,
): string {
  const prefix = stale ? '⚠️ STALE DATA (cached): ' : '';
  const chains = data.chains.length > 0 ? data.chains.join('/') : 'multi-chain';
  const apyPart =
    data.apy_avg != null && Number.isFinite(data.apy_avg)
      ? `, Avg APY ${data.apy_avg.toFixed(2)}%`
      : '';
  return `${prefix}**${data.name}** (${chains}) — TVL ${formatUsd(data.tvl_usd)} (${formatChange(data.tvl_change_24h_pct)} 24h)${apyPart}. Fetched: ${fetchedAt}`;
}
