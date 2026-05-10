import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import { searchTokens, type TokenSearchSnapshot } from '../services/token-search';
import { widgetCacheKey, cacheGet, cacheGetStale, cacheSet } from '../services/widget-cache';
import { checkCredits, deductToolCredits } from '../services/billing';
import { getToolCost } from '../../config';
import type { AppContext } from '../../types';

const TOOL = 'token_search';
const TTL_MS = 60 * 60 * 1000; // 1 hour
const SESSION_ID = z.string().max(128).regex(/^[A-Za-z0-9_-]+$/, 'session_id must be alphanumeric/dash/underscore').optional();

export const tokenSearch = new Hono<{ Variables: AppContext }>();

tokenSearch.get('/', async (c) => {
  const accountId = c.get('accountId');
  const query = c.req.query('q');
  
  if (!query || query.trim() === '') {
    throw new HTTPException(400, { message: 'Query parameter "q" is required' });
  }
  
  const session_id = c.req.query('session_id');
  if (session_id && !/^[A-Za-z0-9_-]+$/.test(session_id)) {
    throw new HTTPException(400, { message: 'Invalid session_id' });
  }

  const key = widgetCacheKey(TOOL, query.trim().toLowerCase());
  const creditCheck = await checkCredits(accountId);
  if (!creditCheck.hasCredits) throw new HTTPException(402, { message: 'Insufficient credits' });

  let data: TokenSearchSnapshot;
  let stale = false;
  let cache_status: 'live' | 'cache_fresh' | 'cache_stale' = 'live';
  try {
    const fresh = cacheGet<TokenSearchSnapshot>(key);
    if (fresh) {
      data = fresh.data;
      cache_status = 'cache_fresh';
    } else {
      data = await searchTokens(query);
      cacheSet(key, data, TTL_MS);
      cache_status = 'live';
    }
  } catch (err) {
    const staleEntry = cacheGetStale<TokenSearchSnapshot>(key);
    if (staleEntry) {
      data = staleEntry.data;
      stale = true;
      cache_status = 'cache_stale';
    } else {
      return c.json({
        success: false,
        stale: false,
        error: err instanceof Error ? err.message : 'Token search unavailable',
        cost: 0,
      });
    }
  }

  const cost = getToolCost(TOOL, 0);
  c.header('X-Cache-Status', cache_status === 'live' ? 'fresh' : cache_status === 'cache_fresh' ? 'hit' : 'stale-fallback');

  try {
    await deductToolCredits(accountId, TOOL, 0, `Token search: ${query}`, session_id);
  } catch (e) {
    console.warn(`[EPSILON][billing-failure] tool=${TOOL} account=${accountId} err=${e instanceof Error ? e.message : String(e)}`);
  }

  return c.json({ success: true, stale, cache_status, cost, ...data });
});
