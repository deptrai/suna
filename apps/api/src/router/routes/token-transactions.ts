import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import { ALLOWED_EVM_CHAINS, EVM_ADDRESS, SOL_ADDRESS } from '@epsilon/shared';
import { fetchTokenTransactions, type TokenTransactionsSnapshot } from '../services/token-transactions';
import { widgetCacheKey, cacheGet, cacheGetStale, cacheSet } from '../services/widget-cache';
import { checkCredits, deductToolCredits } from '../services/billing';
import { getToolCost } from '../../config';
import type { AppContext } from '../../types';

const TOOL = 'token_transactions';
const TTL_MS = 5 * 60 * 1000; // 5 min
const SESSION_ID = z.string().max(128).regex(/^[A-Za-z0-9_-]+$/, 'session_id must be alphanumeric/dash/underscore').optional();

const TokenTransactionsRequestSchema = z.object({
  address: z.string().min(1).max(255),
  chain: z.enum([...ALLOWED_EVM_CHAINS, 'solana']).default('ethereum'),
  session_id: SESSION_ID,
});

export const tokenTransactions = new Hono<{ Variables: AppContext }>();

tokenTransactions.post('/', async (c) => {
  const accountId = c.get('accountId');
  const body = await c.req.json().catch(() => null);
  if (body === null) throw new HTTPException(400, { message: 'Invalid JSON body' });
  const parseResult = TokenTransactionsRequestSchema.safeParse(body);
  if (!parseResult.success) {
    throw new HTTPException(400, { message: `Validation error: ${parseResult.error.message}` });
  }

  const { address, chain, session_id } = parseResult.data;
  const isSolana = chain === 'solana';
  if (isSolana) {
    return c.json({ success: false, stale: false, error: 'Solana token transactions require paid tier (planned post-MVP)', cost: 0 }, 400);
  }
  if (!EVM_ADDRESS.test(address)) {
    throw new HTTPException(400, { message: 'Invalid EVM address format' });
  }

  const cacheAddr = address.toLowerCase();
  const key = widgetCacheKey(TOOL, cacheAddr, chain);
  const creditCheck = await checkCredits(accountId);
  if (!creditCheck.hasCredits) throw new HTTPException(402, { message: 'Insufficient credits' });

  let data: TokenTransactionsSnapshot;
  let stale = false;
  let cache_status: 'live' | 'cache_fresh' | 'cache_stale' = 'live';
  try {
    const fresh = cacheGet<TokenTransactionsSnapshot>(key);
    if (fresh) {
      data = fresh.data;
      cache_status = 'cache_fresh';
    } else {
      data = await fetchTokenTransactions(address, chain);
      cacheSet(key, data, TTL_MS);
      cache_status = 'live';
    }
  } catch (err) {
    const staleEntry = cacheGetStale<TokenTransactionsSnapshot>(key);
    if (staleEntry) {
      data = staleEntry.data;
      stale = true;
      cache_status = 'cache_stale';
    } else {
      return c.json({
        success: false,
        stale: false,
        error: err instanceof Error ? err.message : 'Token transactions unavailable',
        cost: 0,
      });
    }
  }

  const billable = cache_status === 'live';
  const cost = billable ? getToolCost(TOOL, 0) : 0;
  c.header('X-Cache-Status', cache_status === 'live' ? 'fresh' : cache_status === 'cache_fresh' ? 'hit' : 'stale-fallback');

  if (billable) {
    try {
      await deductToolCredits(accountId, TOOL, 0, `Token txs: ${address} on ${chain}`, session_id);
    } catch (e) {
      console.warn(`[EPSILON][billing-failure] tool=${TOOL} account=${accountId} err=${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return c.json({ success: true, stale, cache_status, cost, ...data });
});
