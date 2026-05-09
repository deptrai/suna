import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { JitSyncRequestSchema } from '../../types';
import type {
  JitSyncProxyResponse,
  JitSyncErrorResponse,
  JitSyncSource,
  ProtocolSnapshot,
  AppContext,
} from '../../types';
import { fetchProtocolSnapshot } from '../services/defillama';
import {
  cacheKey,
  getCached,
  getCachedAny,
  dedupedFetch,
  formatSnapshot,
} from '../services/jit-cache';
import { checkCredits, deductToolCredits } from '../services/billing';
import { getToolCost } from '../../config';

const jitSync = new Hono<{ Variables: AppContext }>();

const JIT_TOOL_NAME = 'jit_sync';

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

  const slug = parseResult.data.protocol_slug.trim().toLowerCase();
  const chain = parseResult.data.chain?.trim().toLowerCase();
  const { session_id } = parseResult.data;

  const creditCheck = await checkCredits(accountId);
  if (!creditCheck.hasCredits) {
    throw new HTTPException(402, { message: 'Insufficient credits' });
  }

  const key = cacheKey(slug, chain);
  let data: ProtocolSnapshot;
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
      data = await dedupedFetch(key, () => fetchProtocolSnapshot(slug, { chain }));
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
      console.warn(
        `[EPSILON] JIT sync stale-fallback for '${slug}' (chain=${chain ?? 'all'}): ${
          defillamaErr instanceof Error ? defillamaErr.message : String(defillamaErr)
        }`,
      );
    } else {
      console.warn(
        `[EPSILON] JIT sync no-data for '${slug}' (chain=${chain ?? 'all'}): ${
          defillamaErr instanceof Error ? defillamaErr.message : String(defillamaErr)
        }`,
      );
      const errorResponse: JitSyncErrorResponse = {
        slug,
        success: false,
        snapshot: '',
        error: 'DeFiLlama unavailable and no cached data',
        stale: true,
        source: 'no_data',
        fetched_at: new Date().toISOString(),
        cost: 0,
      };
      c.header('X-Cache-Status', 'no-data');
      return c.json(errorResponse);
    }
  }

  const cost = getToolCost(JIT_TOOL_NAME, 0);

  const response: JitSyncProxyResponse = {
    ...data,
    success: true,
    snapshot: formatSnapshot(data, stale, fetched_at),
    stale,
    source,
    fetched_at,
    cost,
  };

  c.header(
    'X-Cache-Status',
    source === 'live' ? 'fresh' : source === 'cache_fresh' ? 'hit' : 'stale-fallback',
  );

  const result = c.json(response);

  if (shouldDeduct) {
    queueMicrotask(async () => {
      try {
        await deductToolCredits(accountId, JIT_TOOL_NAME, 0, `JIT sync: ${slug}`, session_id);
      } catch (err) {
        console.warn(
          `[EPSILON][billing-failure] tool=${JIT_TOOL_NAME} account=${accountId} slug=${slug} source=${source} cost=${cost} err=${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    });
  }

  return result;
});

export { jitSync };
