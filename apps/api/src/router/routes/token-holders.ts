import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import { ALLOWED_EVM_CHAINS, EVM_ADDRESS, SOL_ADDRESS } from '@epsilon/shared';
import { fetchTokenHolders, type TokenHoldersSnapshot } from '../services/token-holders';
import { widgetCacheKey, cacheGet, cacheGetStale, cacheSet } from '../services/widget-cache';
import { checkCredits, deductToolCredits } from '../services/billing';
import { getToolCost } from '../../config';
import type { AppContext } from '../../types';

const TOOL = 'token_holders';
const TTL_MS = 24 * 60 * 60 * 1000; // 24h
const SESSION_ID = z.string().max(128).regex(/^[A-Za-z0-9_-]+$/, 'session_id must be alphanumeric/dash/underscore').optional();

const TokenHoldersRequestSchema = z.object({
  address: z.string().min(1).max(255),
  chain: z.enum([...ALLOWED_EVM_CHAINS, 'solana']).default('ethereum'),
  limit: z.number().min(1).max(100).optional().default(20),
  session_id: SESSION_ID,
});

export const tokenHolders = new Hono<{ Variables: AppContext }>();

tokenHolders.post('/', async (c) => {
  const accountId = c.get('accountId');
  const body = await c.req.json().catch(() => null);
  if (body === null) throw new HTTPException(400, { message: 'Invalid JSON body' });
  const parseResult = TokenHoldersRequestSchema.safeParse(body);
  if (!parseResult.success) {
    throw new HTTPException(400, { message: `Validation error: ${parseResult.error.message}` });
  }

  const { address, chain, limit, session_id } = parseResult.data;
  const isSolana = chain === 'solana';
  if (!isSolana && !EVM_ADDRESS.test(address)) {
    throw new HTTPException(400, { message: 'Invalid EVM address format' });
  }
  if (isSolana && !SOL_ADDRESS.test(address)) {
    throw new HTTPException(400, { message: 'Invalid Solana address format' });
  }

  const cacheAddr = isSolana ? address : address.toLowerCase();
  const key = widgetCacheKey(TOOL, cacheAddr, chain, String(limit));
  const creditCheck = await checkCredits(accountId);
  if (!creditCheck.hasCredits) throw new HTTPException(402, { message: 'Insufficient credits' });

  let data: TokenHoldersSnapshot;
  let stale = false;
  let cache_status: 'live' | 'cache_fresh' | 'cache_stale' = 'live';
  try {
    const fresh = cacheGet<TokenHoldersSnapshot>(key);
    if (fresh) {
      data = fresh.data;
      cache_status = 'cache_fresh';
    } else {
      data = await fetchTokenHolders(address, chain, { limit });
      cacheSet(key, data, TTL_MS);
      cache_status = 'live';
    }
  } catch (err) {
    const staleEntry = cacheGetStale<TokenHoldersSnapshot>(key);
    if (staleEntry) {
      data = staleEntry.data;
      stale = true;
      cache_status = 'cache_stale';
    } else {
      return c.json({
        success: false,
        stale: false,
        error: err instanceof Error ? err.message : 'Token holders unavailable',
        cost: 0,
      });
    }
  }

  const cost = getToolCost(TOOL, 0);
  c.header('X-Cache-Status', cache_status === 'live' ? 'fresh' : cache_status === 'cache_fresh' ? 'hit' : 'stale-fallback');

  try {
    await deductToolCredits(accountId, TOOL, 0, `Token holders: ${address} on ${chain}`, session_id);
  } catch (e) {
    console.warn(`[EPSILON][billing-failure] tool=${TOOL} account=${accountId} err=${e instanceof Error ? e.message : String(e)}`);
  }

  return c.json({ success: true, stale, cache_status, cost, ...data });
});
