import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import { fetchTokenInfo, type TokenInfoSnapshot } from '../services/token-info';
import { widgetCacheKey, cacheGet, cacheGetStale, cacheSet } from '../services/widget-cache';
import { checkCredits, deductToolCredits } from '../services/billing';
import { getToolCost } from '../../config';
import type { AppContext } from '../../types';

const TOOL = 'token_info';
const TTL_MS = 60_000;

const SESSION_ID = z.string().max(128).regex(/^[A-Za-z0-9_-]+$/, 'session_id must be alphanumeric/dash/underscore').optional();

const TokenInfoRequestSchema = z.object({
  slug: z.string().min(1).max(128).optional(),
  address: z.string().min(1).max(128).optional(),
  session_id: SESSION_ID,
}).refine((d) => d.slug || d.address, { message: 'At least one of slug or address is required' });

export const tokenInfo = new Hono<{ Variables: AppContext }>();

tokenInfo.post('/', async (c) => {
  const accountId = c.get('accountId');

  const body = await c.req.json().catch(() => null);
  if (body === null) throw new HTTPException(400, { message: 'Invalid JSON body' });

  const parseResult = TokenInfoRequestSchema.safeParse(body);
  if (!parseResult.success) {
    throw new HTTPException(400, { message: `Validation error: ${parseResult.error.message}` });
  }

  const { slug, address, session_id } = parseResult.data;
  const primaryArg = (slug ?? address ?? '').trim().toLowerCase();
  const key = widgetCacheKey(TOOL, primaryArg);

  const creditCheck = await checkCredits(accountId);
  if (!creditCheck.hasCredits) throw new HTTPException(402, { message: 'Insufficient credits' });

  let data: TokenInfoSnapshot;
  let stale = false;
  // cache_status is the cache provenance (where the response came from) — distinct from
  // `data.source` which is the upstream data provider per AC1 (e.g. 'coingecko'). Exposed
  // primarily via the X-Cache-Status header.
  let cache_status: 'live' | 'cache_fresh' | 'cache_stale' = 'live';

  try {
    const fresh = cacheGet<TokenInfoSnapshot>(key);
    if (fresh) {
      data = fresh.data;
      cache_status = 'cache_fresh';
    } else {
      data = await fetchTokenInfo(primaryArg);
      cacheSet(key, data, TTL_MS);
      cache_status = 'live';
    }
  } catch (err) {
    const staleEntry = cacheGetStale<TokenInfoSnapshot>(key);
    if (staleEntry) {
      data = staleEntry.data;
      stale = true;
      cache_status = 'cache_stale';
    } else {
      return c.json({
        success: false,
        stale: false,
        error: err instanceof Error ? err.message : 'Token info unavailable',
        cost: 0,
      });
    }
  }

  // Pricing applies to all calls including cache hits — see deferred-work.md billing policy
  const cost = getToolCost(TOOL, 0);
  c.header('X-Cache-Status', cache_status === 'live' ? 'fresh' : cache_status === 'cache_fresh' ? 'hit' : 'stale-fallback');

  // Atomic billing parity with search-web.ts — await before responding (NFR8)
  try {
    await deductToolCredits(accountId, TOOL, 0, `Token info: ${primaryArg}`, session_id);
  } catch (e) {
    console.warn(`[EPSILON][billing-failure] tool=${TOOL} account=${accountId} err=${e instanceof Error ? e.message : String(e)}`);
  }

  return c.json({ success: true, stale, cache_status, cost, ...data });
});
