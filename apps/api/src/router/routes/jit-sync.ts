import { Hono } from 'hono';
import { db } from '../../shared/db';
import { onChainDataIndex, protocolTvlSnapshots } from '@epsilon/db';
import { desc, eq } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';
import { logger } from '../../lib/logger';
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
import { getToolCost, config } from '../../config';

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

  // DB cache lookup — populated by BullMQ crypto worker (Story 2.1).
  // Serves as "warm" path before in-memory cache and live DeFiLlama fetch.
  const CRYPTO_INTERVAL_MS = config.CRYPTO_SYNC_INTERVAL_MS;
  const dbRow = await db
    .select()
    .from(protocolTvlSnapshots)
    .where(eq(protocolTvlSnapshots.slug, slug))
    .limit(1)
    .then((rows) => rows[0] ?? null)
    .catch(() => null);

  const dbRowAge =
    dbRow && dbRow.updatedAt ? Date.now() - new Date(dbRow.updatedAt).getTime() : Infinity;
  const dbTvl = dbRow ? parseFloat(dbRow.tvlUsd) : NaN;
  const dbRowFresh =
    dbRow != null && dbRowAge < CRYPTO_INTERVAL_MS && Number.isFinite(dbTvl);

  if (dbRow && dbRowFresh) {
    const tvlChange =
      dbRow.tvlChange24hPct != null ? parseFloat(dbRow.tvlChange24hPct) : null;
    const apy = dbRow.apyAvg != null ? parseFloat(dbRow.apyAvg) : null;
    data = {
      slug: dbRow.slug,
      name: dbRow.displayName,
      tvl_usd: dbTvl,
      tvl_change_24h_pct: tvlChange != null && Number.isFinite(tvlChange) ? tvlChange : null,
      apy_avg: apy != null && Number.isFinite(apy) ? apy : null,
      chains: Array.isArray(dbRow.chains) ? (dbRow.chains as string[]) : [],
    };
    source = 'db_cache';
    fetched_at = dbRow.fetchedAt
      ? new Date(dbRow.fetchedAt).toISOString()
      : new Date(dbRow.updatedAt).toISOString();
    shouldDeduct = true;
  } else {
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
    source === 'db_cache' ? 'db-cache' : source === 'live' ? 'fresh' : source === 'cache_fresh' ? 'hit' : 'stale-fallback',
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

const ONCHAIN_PAGE_SIZE = 50;
const ONCHAIN_MAX_OFFSET = 1000;
const ONCHAIN_MAX_IDENTIFIER = 255;
const EVM_ADDRESS = /^0x[a-f0-9]{40}$/;

function clampOffset(raw: string | undefined): number {
  if (!raw) return 0;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(n, ONCHAIN_MAX_OFFSET);
}

function normalizeIdentifier(raw: string): { value: string; isEvmAddress: boolean } {
  const trimmed = raw.trim();
  const lowered = trimmed.toLowerCase();
  // EVM addresses are case-insensitive (we lowercase for comparison).
  // Other chains (Solana base58, Cosmos bech32) preserve original case.
  if (EVM_ADDRESS.test(lowered)) return { value: lowered, isEvmAddress: true };
  return { value: trimmed, isEvmAddress: false };
}

jitSync.get('/onchain/:identifier', async (c) => {
  const raw = c.req.param('identifier');
  if (!raw || raw.length > ONCHAIN_MAX_IDENTIFIER) {
    throw new HTTPException(400, { message: 'invalid identifier' });
  }
  const { value: identifier } = normalizeIdentifier(raw);
  if (!identifier) {
    throw new HTTPException(400, { message: 'invalid identifier' });
  }

  const offset = clampOffset(c.req.query('offset'));

  // Branch on input shape: token-like vs wallet-like to use a single index path.
  // Both columns are searched only when the input shape is ambiguous.
  const filter = EVM_ADDRESS.test(identifier)
    ? eq(onChainDataIndex.walletAddress, identifier)
    : eq(onChainDataIndex.tokenAddress, identifier);

  try {
    const items = await db
      .select({
        id: onChainDataIndex.id,
        source: onChainDataIndex.source,
        metricName: onChainDataIndex.metricName,
        timestamp: onChainDataIndex.timestamp,
        walletAddress: onChainDataIndex.walletAddress,
        tokenAddress: onChainDataIndex.tokenAddress,
      })
      .from(onChainDataIndex)
      .where(filter)
      .orderBy(desc(onChainDataIndex.timestamp))
      .limit(ONCHAIN_PAGE_SIZE)
      .offset(offset);

    const nextOffset = items.length === ONCHAIN_PAGE_SIZE ? offset + ONCHAIN_PAGE_SIZE : null;
    c.header('Cache-Control', 'public, max-age=60');
    return c.json({
      success: true,
      items,
      pagination: { offset, limit: ONCHAIN_PAGE_SIZE, nextOffset },
    });
  } catch (err) {
    logger.error('[jit-sync] onchain query failed', { error: String(err) });
    return c.json({ success: false, error: 'onchain_unavailable' }, 503);
  }
});

export { jitSync };
