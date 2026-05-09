import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { JitSyncRequestSchema } from '../../types';
import type { JitSyncProxyResponse, JitSyncSource, AppContext } from '../../types';
import { fetchProtocolSnapshot } from '../services/defillama';
import {
  cacheKey,
  getCached,
  getCachedAny,
  setCache,
  dedupedFetch,
  formatSnapshot,
} from '../services/jit-cache';
import { checkCredits, deductToolCredits } from '../services/billing';

const jitSync = new Hono<{ Variables: AppContext }>();

jitSync.post('/', async (c) => {
  const accountId = c.get('accountId');

  const body = await c.req.json().catch(() => null);
  if (body === null) {
    throw new HTTPException(400, { message: 'Invalid JSON body' });
  }

  const parseResult = JitSyncRequestSchema.safeParse(body);
  if (!parseResult.success) {
    throw new HTTPException(400, {
      message: `Validation error: ${parseResult.error.message}`,
    });
  }

  const { protocol_slug: slug, chain, metrics, session_id } = parseResult.data;

  const creditCheck = await checkCredits(accountId);
  if (!creditCheck.hasCredits) {
    throw new HTTPException(402, { message: creditCheck.message });
  }

  const key = cacheKey(slug, chain);
  let data: import('../../types').ProtocolSnapshot;
  let source: JitSyncSource;
  let fetched_at: string;
  let stale = false;
  let shouldDeduct = false;

  try {
    const fresh = getCached(key);
    if (fresh) {
      data = fresh.data;
      source = 'cache_fresh';
      fetched_at = fresh.fetched_at;
      shouldDeduct = true;
    } else {
      data = await dedupedFetch(key, () => fetchProtocolSnapshot(slug, { chain, metrics }));
      setCache(key, data);
      source = 'live';
      fetched_at = new Date().toISOString();
      shouldDeduct = true;
    }
  } catch (defillamaErr) {
    const cached = getCachedAny(key);
    if (cached) {
      data = cached.data;
      source = 'cache_stale';
      fetched_at = cached.fetched_at;
      stale = true;
      shouldDeduct = true;
    } else {
      return c.json({
        slug,
        success: false,
        snapshot: '',
        error: 'DeFiLlama unavailable and no cached data',
        stale: true,
        source: 'cache_stale' as JitSyncSource,
        fetched_at: new Date().toISOString(),
        cost: 0,
      } as Partial<JitSyncProxyResponse>);
    }
  }

  const response: JitSyncProxyResponse = {
    ...data,
    success: true,
    snapshot: formatSnapshot(data, stale, fetched_at),
    stale,
    source,
    fetched_at,
    cost: 0,
  };

  const result = c.json(response);

  if (shouldDeduct) {
    queueMicrotask(async () => {
      try {
        await deductToolCredits(accountId, 'jit_sync', 0, `JIT sync: ${slug}`, session_id);
      } catch (err) {
        console.warn(`[EPSILON] JIT sync billing failed for ${accountId}: ${err}`);
      }
    });
  }

  return result;
});

export { jitSync };
