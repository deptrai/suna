import type { Context, Next } from 'hono';
import { cacheGetStale } from '../router/services/widget-cache';
import { advisoryCacheKey } from '../router/services/advisory-aggregator';

export type RateLimitBucket = {
  sec: { ts: number; count: number };
  min: { ts: number; count: number };
};

// TODO: Multi-instance migration requires Redis-backed rate limiting.
// Current in-memory bucket is single-instance only by design.
const buckets = new Map<string, RateLimitBucket>();

function hashIp(ip: string): string {
  return new Bun.CryptoHasher('sha256').update(ip).digest('hex').slice(0, 16);
}

function getClientIp(c: Context): string {
  return c.req.header('x-forwarded-for')?.split(',')[0]?.trim()
    || c.req.header('x-real-ip')
    || 'unknown';
}

export function createIpRateLimit({ rps, rpm, now = Date.now }: { rps: number; rpm: number; now?: () => number }) {
  const safeRps = Math.max(1, rps || 5);
  const safeRpm = Math.max(1, rpm || 100);

  return async (c: Context, next: Next) => {
    const ip = getClientIp(c);
    const key = hashIp(ip);
    const ts = now();
    const b = buckets.get(key) ?? { sec: { ts, count: 0 }, min: { ts, count: 0 } };

    if (ts - b.sec.ts >= 1000) {
      b.sec.ts = ts;
      b.sec.count = 0;
    }
    if (ts - b.min.ts >= 60_000) {
      b.min.ts = ts;
      b.min.count = 0;
    }

    b.sec.count += 1;
    b.min.count += 1;
    buckets.set(key, b);

    const secExceeded = b.sec.count > safeRps;
    const minExceeded = b.min.count > safeRpm;
    const exceeded = secExceeded || minExceeded;

    const limit = secExceeded ? safeRps : safeRpm;
    const remaining = Math.max(0, limit - (secExceeded ? b.sec.count : b.min.count));

    c.set('advisory.rate_limit', {
      ok: !exceeded,
      retryAfter: secExceeded
        ? Math.max(1, Math.ceil((1000 - (ts - b.sec.ts)) / 1000))
        : Math.max(1, Math.ceil((60_000 - (ts - b.min.ts)) / 1000)),
      limit,
      remaining,
      ip,
      ipHash: key,
    });

    c.header('X-RateLimit-Limit', String(limit));
    c.header('X-RateLimit-Remaining', String(remaining));

    const q = (c.req.query('q') ?? '').trim();
    const chain = c.req.query('chain');
    const cacheKey = q ? advisoryCacheKey(q, chain) : undefined;
    if (cacheKey) c.set('advisory.cache_key', cacheKey);
    if (exceeded && q && cacheKey) {
      const stale = cacheGetStale(cacheKey);
      if (stale) {
        c.header('X-RateLimit-Exceeded', 'true');
        c.set('advisory.rate_limited_stale', true);
        c.set('advisory.stale_payload', stale.data);
        await next();
        return;
      }

      c.header('Retry-After', String(secExceeded ? 1 : Math.max(1, Math.ceil((60_000 - (ts - b.min.ts)) / 1000))));
      return c.json({ error: 'Rate limit exceeded', request_id: c.get('advisory.request_id') }, 429);
    }

    await next();
  };
}

export function _clearAdvisoryRateLimitForTests(): void {
  buckets.clear();
}
