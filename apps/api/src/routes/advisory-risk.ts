import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../types';
import { cacheGet, cacheGetStale } from '../router/services/widget-cache';
import { addBreadcrumb, captureException } from '../lib/sentry';
import { AdvisoryError, EVM_ADDRESS_RE, SOL_ADDRESS_RE, SUPPORTED_CHAINS, TICKER_RE, advisoryCacheKey, getAdvisoryRisk, type AdvisoryRiskResponse } from '../router/services/advisory-aggregator';

const advisoryRiskRoute = new Hono<AppEnv>();

const querySchema = z.object({
  q: z.string().min(1).max(64),
  chain: z.enum(['ethereum', 'bsc', 'polygon', 'arbitrum', 'optimism', 'base', 'avalanche', 'fantom', 'solana']).optional(),
});

function hash16(value: string): string {
  return new Bun.CryptoHasher('sha256').update(value).digest('hex').slice(0, 16);
}

advisoryRiskRoute.get('/', async (c) => {
  const q = (c.req.query('q') ?? c.req.query('query') ?? '').trim();
  const chainRaw = c.req.query('chain')?.trim().toLowerCase();
  const requestId = crypto.randomUUID();

  c.set('advisory.request_id', requestId);
  c.header('X-Request-ID', requestId);

  const parsed = querySchema.safeParse({ q, chain: chainRaw });
  if (!parsed.success) return c.json({ error: q ? 'Invalid token format' : 'Missing query parameter: q', request_id: requestId }, 400);

  if (!EVM_ADDRESS_RE.test(q) && !SOL_ADDRESS_RE.test(q) && !TICKER_RE.test(q)) return c.json({ error: 'Invalid token format', request_id: requestId }, 400);
  if (chainRaw && !SUPPORTED_CHAINS.has(chainRaw)) return c.json({ error: 'Unsupported chain', request_id: requestId }, 400);
  if (EVM_ADDRESS_RE.test(q) && chainRaw === 'solana') return c.json({ error: 'Address-chain mismatch', request_id: requestId }, 422);
  if (SOL_ADDRESS_RE.test(q) && chainRaw && chainRaw !== 'solana') return c.json({ error: 'Address-chain mismatch', request_id: requestId }, 422);

  const cacheKey = advisoryCacheKey(q, chainRaw);
  c.set('advisory.cache_key', cacheKey);

  const rateLimitedStale = c.get('advisory.rate_limited_stale') as boolean | undefined;
  if (rateLimitedStale) {
    const staleData = c.get('advisory.stale_payload') as AdvisoryRiskResponse;
    return c.json({ ...staleData, meta: { ...staleData.meta, source: 'cache_stale', request_id: requestId } }, 200);
  }

  const cached = cacheGet<AdvisoryRiskResponse>(cacheKey);
  if (cached) return c.json({ ...cached.data, meta: { ...cached.data.meta, source: 'cache_fresh', request_id: requestId } }, 200);

  try {
    const data = await getAdvisoryRisk(q, chainRaw, requestId);
    addBreadcrumb('advisory.risk.success', {
      request_id: requestId,
      q_hash: hash16(q.toLowerCase()),
      ip_hash: hash16((c.get('advisory.rate_limit') as any)?.ip ?? 'unknown'),
      chain: data.meta.chain,
      source: data.meta.source,
      price_status: data.meta.price_status,
      status: 200,
    }, 'advisory');
    return c.json({ ...data, meta: { ...data.meta, request_id: requestId } }, 200);
  } catch (error) {
    const rate = c.get('advisory.rate_limit') as { ip?: string } | undefined;
    const logCtx = {
      request_id: requestId,
      q_hash: hash16(q.toLowerCase()),
      ip_hash: hash16(rate?.ip ?? 'unknown'),
      chain: chainRaw ?? null,
      area: 'advisory-risk',
    };

    if (error instanceof AdvisoryError) {
      if (error.status >= 500) captureException(error, { ...logCtx, status: error.status });
      if (error.status === 404) return c.json({ error: 'Token not found', request_id: requestId }, 404);
      if (error.status === 504) return c.json({ error: 'Risk service timeout', request_id: requestId }, 504);
      if (error.status === 503) return c.json({ error: 'Risk service temporarily unavailable', request_id: requestId }, 503);
      if (error.status === 400) return c.json({ error: 'Invalid token format', request_id: requestId }, 400);
      return c.json({ error: 'Internal error', request_id: requestId }, 500);
    }

    captureException(error, { ...logCtx, status: 500 });
    return c.json({ error: 'Internal error', request_id: requestId }, 500);
  }
});

export { advisoryRiskRoute };
