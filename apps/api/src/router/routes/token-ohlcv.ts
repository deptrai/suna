import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import { fetchTokenOhlcv, VALID_DAYS, type OhlcvSnapshot } from '../services/token-ohlcv';
import { widgetCacheKey, cacheGet, cacheGetStale, cacheSet } from '../services/widget-cache';
import { checkCredits, deductToolCredits } from '../services/billing';
import { getToolCost } from '../../config';
import type { AppContext } from '../../types';

const TOOL = 'token_ohlcv';
const TTL_MS = 5 * 60_000;

const SESSION_ID = z.string().max(128).regex(/^[A-Za-z0-9_-]+$/, 'session_id must be alphanumeric/dash/underscore').optional();

const DaysEnum = z.union([
  z.literal(1),
  z.literal(7),
  z.literal(14),
  z.literal(30),
  z.literal(90),
  z.literal(180),
]);

const EVM_ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;
const SLUG_RE = /^[a-z0-9_-]{1,128}$/;

const TokenOhlcvRequestSchema = z.object({
  slug: z.string().min(1).max(128).regex(SLUG_RE, 'slug must match /^[a-z0-9_-]{1,128}$/').optional(),
  address: z.string().min(1).max(128).regex(EVM_ADDRESS_RE, 'address must be a valid EVM address (0x[40 hex chars])').optional(),
  chain: z.string().min(1).max(32).optional(),
  days: DaysEnum.optional().default(30),
  session_id: SESSION_ID,
})
  .refine((d) => d.slug || d.address, { message: 'At least one of slug or address is required' })
  .refine(
    (d) => !(d.chain && !d.address),
    { message: 'chain is only valid with EVM address input (slugs do not require chain)' },
  );

export const tokenOhlcv = new Hono<{ Variables: AppContext }>();

tokenOhlcv.post('/', async (c) => {
  const accountId = c.get('accountId');

  const body = await c.req.json().catch(() => null);
  if (body === null) throw new HTTPException(400, { message: 'Invalid JSON body' });

  const parseResult = TokenOhlcvRequestSchema.safeParse(body);
  if (!parseResult.success) {
    throw new HTTPException(400, { message: `Validation error: ${parseResult.error.message}` });
  }

  const { slug, address, chain, days, session_id } = parseResult.data;
  const primaryArg = (slug ?? address ?? '').trim().toLowerCase();
  const key = widgetCacheKey(TOOL, primaryArg, String(days), chain ?? 'none');

  const creditCheck = await checkCredits(accountId);
  if (!creditCheck.hasCredits) throw new HTTPException(402, { message: 'Insufficient credits' });

  let data: OhlcvSnapshot;
  let stale = false;
  let cache_status: 'live' | 'cache_fresh' | 'cache_stale' = 'live';

  try {
    const fresh = cacheGet<OhlcvSnapshot>(key);
    if (fresh) {
      data = fresh.data;
      cache_status = 'cache_fresh';
    } else {
      data = await fetchTokenOhlcv({ slug, address, chain, days }, {});
      cacheSet(key, data, TTL_MS);
      cache_status = 'live';
    }
  } catch (err) {
    const staleEntry = cacheGetStale<OhlcvSnapshot>(key);
    if (staleEntry) {
      data = staleEntry.data;
      stale = true;
      cache_status = 'cache_stale';
    } else {
      return c.json({
        success: false,
        stale: false,
        error: err instanceof Error ? err.message : 'OHLCV unavailable',
        cost: 0,
      });
    }
  }

  const cost = getToolCost(TOOL, 0);
  c.header('X-Cache-Status', cache_status === 'live' ? 'fresh' : cache_status === 'cache_fresh' ? 'hit' : 'stale-fallback');

  try {
    await deductToolCredits(accountId, TOOL, 0, `Token OHLCV: ${primaryArg}`, session_id);
  } catch (e) {
    console.warn(`[EPSILON][billing-failure] tool=${TOOL} account=${accountId} err=${e instanceof Error ? e.message : String(e)}`);
  }

  return c.json({ success: true, stale, cache_status, cost, ...data });
});
