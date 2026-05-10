const CACHE_MAX_ENTRIES = 2000;
const CACHE_EVICT_BATCH = 200;
const STALE_MAX_MS = 24 * 60 * 60 * 1000;

const DEFAULT_TTL: Record<string, number> = {
  token_info: 60_000,
  contract_risk: 300_000,
  tx_simulator: 30_000,
  token_ohlcv: 5 * 60_000,
};

interface WidgetCacheEntry<T = unknown> {
  data: T;
  fetched_at: string;
  fetched_at_ms: number;
  ttl_ms: number;
}

const cache = new Map<string, WidgetCacheEntry>();

function evictIfNeeded(): void {
  if (cache.size < CACHE_MAX_ENTRIES) return;
  let evicted = 0;
  for (const k of cache.keys()) {
    if (evicted >= CACHE_EVICT_BATCH) break;
    cache.delete(k);
    evicted++;
  }
}

/**
 * Build a deterministic cache key. Callers MUST normalize case themselves —
 * EVM addresses should be lowercased, Solana base58 addresses must NOT be
 * lowercased (case-sensitive alphabet), CoinGecko slugs are already lowercase.
 */
export function widgetCacheKey(tool: string, primaryArg: string, ...secondaryArgs: string[]): string {
  const sorted = [...secondaryArgs].sort();
  return `${tool}:${primaryArg}${sorted.length ? ':' + sorted.join(',') : ''}`;
}

export function cacheGet<T>(key: string): WidgetCacheEntry<T> | null {
  const entry = cache.get(key) as WidgetCacheEntry<T> | undefined;
  if (!entry) return null;
  const age = Date.now() - entry.fetched_at_ms;
  if (age > entry.ttl_ms) return null;
  return entry;
}

export function cacheGetStale<T>(key: string): WidgetCacheEntry<T> | null {
  const entry = cache.get(key) as WidgetCacheEntry<T> | undefined;
  if (!entry) return null;
  const age = Date.now() - entry.fetched_at_ms;
  if (age > STALE_MAX_MS) return null;
  return entry;
}

export function cacheSet<T>(key: string, data: T, ttl_ms?: number, tool?: string): void {
  evictIfNeeded();
  const resolvedTtl = ttl_ms ?? (tool ? (DEFAULT_TTL[tool] ?? 60_000) : 60_000);
  const now = Date.now();
  cache.set(key, {
    data,
    fetched_at: new Date(now).toISOString(),
    fetched_at_ms: now,
    ttl_ms: resolvedTtl,
  });
}

export function _clearWidgetCacheForTests(): void {
  cache.clear();
}
