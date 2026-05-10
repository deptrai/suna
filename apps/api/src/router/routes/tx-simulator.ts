import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import { EVM_ADDRESS } from '@epsilon/shared';
import { simulateTransaction, type TxSimulationSnapshot } from '../services/tx-simulator';
import { widgetCacheKey, cacheGet, cacheGetStale, cacheSet } from '../services/widget-cache';
import { checkCredits, deductToolCredits } from '../services/billing';
import { getToolCost } from '../../config';
import type { AppContext } from '../../types';

const TOOL = 'tx_simulator';
const TTL_MS = 30_000;

const HEX_DATA = /^0x[a-fA-F0-9]*$/;
const HEX_OR_DECIMAL_VALUE = /^(0x[a-fA-F0-9]+|[0-9]+)$/;
const SESSION_ID = z.string().max(128).regex(/^[A-Za-z0-9_-]+$/, 'session_id must be alphanumeric/dash/underscore').optional();

const TxSimulatorRequestSchema = z.object({
  from: z.string().regex(EVM_ADDRESS, 'Invalid from address'),
  to: z.string().regex(EVM_ADDRESS, 'Invalid to address'),
  data: z.string().regex(HEX_DATA, 'data must be hex calldata (0x...)').default('0x'),
  value: z.string().regex(HEX_OR_DECIMAL_VALUE, 'value must be hex (0x...) or decimal string').optional(),
  chain: z.string().max(32).optional().default('ethereum'),
  action: z.string().max(120).optional(),
  session_id: SESSION_ID,
});

export const txSimulator = new Hono<{ Variables: AppContext }>();

txSimulator.post('/', async (c) => {
  const accountId = c.get('accountId');

  const body = await c.req.json().catch(() => null);
  if (body === null) throw new HTTPException(400, { message: 'Invalid JSON body' });

  const parseResult = TxSimulatorRequestSchema.safeParse(body);
  if (!parseResult.success) {
    throw new HTTPException(400, { message: `Validation error: ${parseResult.error.message}` });
  }

  const { from, to, data, value, chain, action, session_id } = parseResult.data;
  // Backend has no tier signal yet (Story 4.x will add tier-on-token); log calls so we can
  // detect Tier-1 users bypassing the frontend gate via direct API access.
  console.log(
    `[TIER-BYPASS-SUSPECT] tx_simulator hit account=${accountId} chain=${chain} ua="${(c.req.header('user-agent') ?? '').slice(0, 80)}"`,
  );

  // EVM addresses are case-insensitive — lowercase for cache key parity.
  // Cache key MUST include value — different swap amounts produce different gas/outcome.
  const key = widgetCacheKey(
    TOOL,
    `${from.toLowerCase()}:${to.toLowerCase()}`,
    data.toLowerCase(),
    chain.toLowerCase(),
    value ?? '0',
  );
  const creditCheck = await checkCredits(accountId);
  if (!creditCheck.hasCredits) throw new HTTPException(402, { message: 'Insufficient credits' });

  let simData: TxSimulationSnapshot;
  let stale = false;
  let cache_status: 'live' | 'cache_fresh' | 'cache_stale' = 'live';

  try {
    const fresh = cacheGet<TxSimulationSnapshot>(key);
    if (fresh) {
      simData = fresh.data;
      cache_status = 'cache_fresh';
    } else {
      simData = await simulateTransaction({ from, to, data, value, chain, action });
      cacheSet(key, simData, TTL_MS);
      cache_status = 'live';
    }
  } catch (err) {
    const staleEntry = cacheGetStale<TxSimulationSnapshot>(key);
    if (staleEntry) {
      simData = staleEntry.data;
      stale = true;
      cache_status = 'cache_stale';
    } else {
      return c.json({
        success: false,
        stale: false,
        error: err instanceof Error ? err.message : 'Transaction simulation unavailable',
        cost: 0,
      });
    }
  }

  const cost = getToolCost(TOOL, 0);
  c.header('X-Cache-Status', cache_status === 'live' ? 'fresh' : cache_status === 'cache_fresh' ? 'hit' : 'stale-fallback');

  try {
    await deductToolCredits(accountId, TOOL, 0, `Tx simulation: ${from}→${to} on ${chain}`, session_id);
  } catch (e) {
    console.warn(`[EPSILON][billing-failure] tool=${TOOL} account=${accountId} err=${e instanceof Error ? e.message : String(e)}`);
  }

  return c.json({ success: true, stale, cache_status, cost, ...simData });
});
