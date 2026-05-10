import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import { fetchContractRisk, type ContractRiskSnapshot } from '../services/contract-risk';
import { widgetCacheKey, cacheGet, cacheGetStale, cacheSet } from '../services/widget-cache';
import { checkCredits, deductToolCredits } from '../services/billing';
import { getToolCost } from '../../config';
import type { AppContext } from '../../types';

const TOOL = 'contract_risk';
const TTL_MS = 300_000;

const EVM_ADDRESS = /^0x[a-fA-F0-9]{40}$/;
const SOL_ADDRESS = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const MAX_ADDR_LEN = 255;

const SESSION_ID = z.string().max(128).regex(/^[A-Za-z0-9_-]+$/, 'session_id must be alphanumeric/dash/underscore').optional();

const ContractRiskRequestSchema = z.object({
  address: z.string().min(1).max(MAX_ADDR_LEN),
  chain: z.string().max(32).optional().default('ethereum'),
  session_id: SESSION_ID,
});

export const contractRisk = new Hono<{ Variables: AppContext }>();

contractRisk.post('/', async (c) => {
  const accountId = c.get('accountId');

  const body = await c.req.json().catch(() => null);
  if (body === null) throw new HTTPException(400, { message: 'Invalid JSON body' });

  const parseResult = ContractRiskRequestSchema.safeParse(body);
  if (!parseResult.success) {
    throw new HTTPException(400, { message: `Validation error: ${parseResult.error.message}` });
  }

  const { address, chain, session_id } = parseResult.data;
  const isSolana = chain === 'solana' || chain === 'sol';
  if (!isSolana && !EVM_ADDRESS.test(address)) {
    throw new HTTPException(400, { message: 'Invalid EVM address format (must be 0x + 40 hex chars)' });
  }
  if (isSolana && !SOL_ADDRESS.test(address)) {
    throw new HTTPException(400, { message: 'Invalid Solana address format' });
  }

  // EVM addresses are case-insensitive (lowercase for cache key parity).
  // Solana base58 addresses ARE case-sensitive — preserve original casing.
  const cacheAddr = isSolana ? address : address.toLowerCase();
  const key = widgetCacheKey(TOOL, cacheAddr, chain.toLowerCase());
  const creditCheck = await checkCredits(accountId);
  if (!creditCheck.hasCredits) throw new HTTPException(402, { message: 'Insufficient credits' });

  let data: ContractRiskSnapshot;
  let stale = false;
  let cache_status: 'live' | 'cache_fresh' | 'cache_stale' = 'live';

  try {
    const fresh = cacheGet<ContractRiskSnapshot>(key);
    if (fresh) {
      data = fresh.data;
      cache_status = 'cache_fresh';
    } else {
      data = await fetchContractRisk(address, chain);
      cacheSet(key, data, TTL_MS);
      cache_status = 'live';
    }
  } catch (err) {
    const staleEntry = cacheGetStale<ContractRiskSnapshot>(key);
    if (staleEntry) {
      data = staleEntry.data;
      stale = true;
      cache_status = 'cache_stale';
    } else {
      return c.json({
        success: false,
        stale: false,
        error: err instanceof Error ? err.message : 'Contract risk check unavailable',
        cost: 0,
      });
    }
  }

  const cost = getToolCost(TOOL, 0);
  c.header('X-Cache-Status', cache_status === 'live' ? 'fresh' : cache_status === 'cache_fresh' ? 'hit' : 'stale-fallback');

  try {
    await deductToolCredits(accountId, TOOL, 0, `Contract risk: ${address} on ${chain}`, session_id);
  } catch (e) {
    console.warn(`[EPSILON][billing-failure] tool=${TOOL} account=${accountId} err=${e instanceof Error ? e.message : String(e)}`);
  }

  return c.json({ success: true, stale, cache_status, cost, ...data });
});
