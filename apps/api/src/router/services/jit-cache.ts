import type { ProtocolSnapshot } from '../../types';

const CACHE_TTL_MS = 5 * 60 * 1000;

interface JitCacheEntry {
  data: ProtocolSnapshot;
  fetched_at: string;
}

const cache = new Map<string, JitCacheEntry>();
const inflight = new Map<string, Promise<ProtocolSnapshot>>();

export function cacheKey(slug: string, chain?: string): string {
  return `${slug.toLowerCase()}:${chain?.toLowerCase() ?? 'all'}`;
}

export function getCached(key: string): JitCacheEntry | null {
  const entry = cache.get(key);
  if (!entry) return null;
  const age = Date.now() - new Date(entry.fetched_at).getTime();
  if (age > CACHE_TTL_MS) return null;
  return entry;
}

export function getCachedAny(key: string): JitCacheEntry | null {
  return cache.get(key) ?? null;
}

export function setCache(key: string, data: ProtocolSnapshot): void {
  // prevent unbounded memory growth
  if (cache.size > 1000) {
    const oldest = cache.keys().next().value;
    if (oldest) {
      for (let i = 0; i < 100; i++) {
        const k = cache.keys().next().value;
        if (k) cache.delete(k);
        else break;
      }
    }
  }
  cache.set(key, { data, fetched_at: new Date().toISOString() });
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
  const promise = fetcher().finally(() => inflight.delete(key));
  inflight.set(key, promise);
  return promise;
}

// ── Snapshot formatter ───────────────────────────────────────────────────────

function formatUsd(n: number): string {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(2)}K`;
  return `$${n.toFixed(0)}`;
}

export function formatSnapshot(
  data: ProtocolSnapshot,
  stale: boolean,
  fetchedAt: string,
): string {
  const prefix = stale ? '⚠️ STALE DATA (cached): ' : '';
  const sign = data.tvl_change_24h_pct >= 0 ? '+' : '';
  const apyPart = data.apy_avg != null ? `, Avg APY ${data.apy_avg.toFixed(2)}%` : '';
  return `${prefix}**${data.name}** (${data.chains.join('/')}) — TVL ${formatUsd(data.tvl_usd)} (${sign}${data.tvl_change_24h_pct.toFixed(2)}% 24h)${apyPart}. Fetched: ${fetchedAt}`;
}
