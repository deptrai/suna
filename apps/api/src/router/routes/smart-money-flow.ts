/**
 * Smart Money Flow API route (Story 2.3.1).
 * POST /v1/router/smart-money-flow
 *
 * Cache-first: reads from DB. Live refresh only when force_refresh=true and credits available.
 * NANSEN_API_KEY is never forwarded. Provider boundary is enforced in nansen.ts.
 */

import { Hono } from 'hono';
import type { AppContext } from '../../types';
import { z } from 'zod';
import { and, eq, gt } from 'drizzle-orm';
import { db } from '../../shared/db';
import { nansenSmartMoneyFlows, nansenTokenGodModeCache } from '@epsilon/db';
import { config, getToolCost } from '../../config';
import { logger } from '../../lib/logger';
import { checkCredits, deductToolCredits } from '../services/billing';
import {
  fetchSmartMoneyNetflow,
  fetchTgmWhoBoughtSold,
  fetchTgmFlows,
  canCallNansen,
  NansenRateLimitError,
  NansenPaymentRequiredError,
  NansenForbiddenError,
  NansenUnsupportedChainError,
} from '../services/nansen';
import {
  normalizeTopBuyers,
  normalizeTopSellers,
  normalizeFlowBreakdown,
  computeSignalFactors,
  deriveRiskLevel,
  buildSignalSummary,
} from '../services/nansen-normalize';
import { getNansenSmartMoneyQueue, JOB_REFRESH_TGM } from '../../queue/bullmq/workers/nansen-smart-money-worker';

export const smartMoneyFlow = new Hono<{ Variables: AppContext }>();

const TOOL = 'smart_money_flow';
const LIVE_TIMEOUT_MS = 8_000;

const bodySchema = z.object({
  chain: z.string().min(1).max(32),
  token_address: z.string().min(6).max(128),
  token_symbol: z.string().max(32).optional(),
  mode: z.enum(['token_god_mode', 'smart_money_netflow', 'top_buyers', 'top_sellers', 'exchange_flows']),
  lookback_hours: z.number().int().min(1).max(168).optional().default(1),
  limit: z.number().int().min(1).max(100).optional().default(20),
  force_refresh: z.boolean().optional().default(false),
  session_id: z.string().max(128).optional(),
});

smartMoneyFlow.post('/', async (c) => {
  const accountId: string = c.get('accountId');

  const rawBody = await c.req.json().catch(() => null);
  if (!rawBody) return c.json({ error: 'Invalid JSON body' }, 400);

  const parsed = bodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return c.json({ error: 'Invalid request', details: parsed.error.flatten().fieldErrors }, 400);
  }

  const { chain, token_address, token_symbol, mode, lookback_hours, limit, force_refresh, session_id } = parsed.data;

  // ── Cache-first lookup ──────────────────────────────────────────────────────
  const now = new Date();

  if (mode === 'token_god_mode' || mode === 'top_buyers' || mode === 'top_sellers' || mode === 'exchange_flows') {
    const cached = await db
      .select()
      .from(nansenTokenGodModeCache)
      .where(
        and(
          eq(nansenTokenGodModeCache.chain, chain),
          eq(nansenTokenGodModeCache.tokenAddress, token_address.toLowerCase()),
          gt(nansenTokenGodModeCache.cacheExpiresAt, now),
        ),
      )
      .limit(1);

    if (cached.length > 0 && !force_refresh) {
      const row = cached[0]!;
      return c.json({
        success: true,
        mode,
        chain,
        token_address,
        token_symbol: row.tokenSymbol ?? token_symbol,
        ...flattenCachedTgm(row),
        source: 'db_cache',
        cache_status: 'cache_fresh' as const,
        fetched_at: row.fetchedAt?.toISOString() ?? null,
        cache_expires_at: row.cacheExpiresAt.toISOString(),
        cost: 0,
        provider: 'nansen',
        attribution: 'Powered by Nansen API',
      });
    }
  }

  if (mode === 'smart_money_netflow') {
    const cached = await db
      .select()
      .from(nansenSmartMoneyFlows)
      .where(
        and(
          eq(nansenSmartMoneyFlows.chain, chain),
          eq(nansenSmartMoneyFlows.tokenAddress, token_address.toLowerCase()),
          eq(nansenSmartMoneyFlows.metricType, 'netflow'),
          gt(nansenSmartMoneyFlows.cacheExpiresAt, now),
        ),
      )
      .limit(1);

    if (cached.length > 0 && !force_refresh) {
      const row = cached[0]!;
      return c.json({
        success: true,
        mode,
        chain,
        token_address,
        token_symbol: row.tokenSymbol ?? token_symbol,
        risk_level: 'none',
        summary: { smart_money_net_flow_usd: Number(row.netFlowUsd ?? 0), exchange_net_flow_usd: null, signal: 'neutral' },
        top_buyers: [],
        top_sellers: [],
        smart_money_flows: row.flowBreakdown,
        exchange_flows: {},
        risk_factors: row.riskFactors,
        source: 'db_cache',
        cache_status: 'cache_fresh' as const,
        fetched_at: row.fetchedAt?.toISOString() ?? null,
        cache_expires_at: row.cacheExpiresAt.toISOString(),
        cost: 0,
        provider: 'nansen',
        attribution: 'Powered by Nansen API',
      });
    }
  }

  // ── Live refresh path ───────────────────────────────────────────────────────
  if (!config.NANSEN_SMART_MONEY_WORKER_ENABLED || !canCallNansen(chain)) {
    // Cannot do live refresh — enqueue and return stale/queued
    const q = getNansenSmartMoneyQueue();
    await q.add(JOB_REFRESH_TGM, { chain, tokenAddress: token_address, tokenSymbol: token_symbol }, { jobId: `tgm:${chain}:${token_address}` }).catch(() => undefined);

    return c.json({
      success: true,
      mode,
      chain,
      token_address,
      token_symbol,
      risk_level: 'none',
      summary: {},
      top_buyers: [],
      top_sellers: [],
      smart_money_flows: {},
      exchange_flows: {},
      risk_factors: [],
      source: 'stale_cache' as const,
      cache_status: 'queued' as const,
      fetched_at: null,
      cache_expires_at: null,
      cost: 0,
      provider: 'nansen',
      attribution: 'Powered by Nansen API',
    });
  }

  // Credits check before live Nansen calls
  const creditCheck = await checkCredits(accountId);
  if (!creditCheck.hasCredits) {
    return c.json({ error: 'Insufficient credits for live provider refresh' }, 402);
  }

  const maxLive = config.NANSEN_SMART_MONEY_MAX_LIVE_CALLS_PER_REQUEST;
  const dateRange = {
    from: new Date(Date.now() - lookback_hours * 3_600_000).toISOString(),
    to: new Date().toISOString(),
  };
  const cacheExpiresAt = new Date(Date.now() + config.NANSEN_SMART_MONEY_CACHE_TTL_MS);

  try {
    let responseData: Record<string, unknown>;

    if (mode === 'token_god_mode' || mode === 'top_buyers' || mode === 'top_sellers' || mode === 'exchange_flows') {
      const calls: Promise<unknown>[] = [];
      if (calls.length < maxLive) calls.push(fetchTgmWhoBoughtSold(chain, token_address, 'buy', dateRange, { limit }));
      if (calls.length < maxLive) calls.push(fetchTgmWhoBoughtSold(chain, token_address, 'sell', dateRange, { limit }));
      if (calls.length < maxLive) calls.push(fetchTgmFlows(chain, token_address, 'smart_money', dateRange, { limit }));
      if (calls.length < maxLive) calls.push(fetchTgmFlows(chain, token_address, 'exchange', dateRange, { limit }));

      const [buyersR, sellersR, smFlowsR, exFlowsR] = await Promise.allSettled(calls);

      const topBuyers = buyersR?.status === 'fulfilled' ? normalizeTopBuyers((buyersR.value as any)?.data ?? [], limit) : [];
      const topSellers = sellersR?.status === 'fulfilled' ? normalizeTopSellers((sellersR.value as any)?.data ?? [], limit) : [];
      const smFlows = smFlowsR?.status === 'fulfilled' ? normalizeFlowBreakdown((smFlowsR.value as any)?.data ?? []) : [];
      const exFlows = exFlowsR?.status === 'fulfilled' ? normalizeFlowBreakdown((exFlowsR.value as any)?.data ?? []) : [];

      const isPartial = [buyersR, sellersR, smFlowsR, exFlowsR].some((r) => r?.status === 'rejected');
      const smNet = smFlows.reduce((s, r) => s + r.netflow_usd, 0);
      const exNet = exFlows.reduce((s, r) => s + r.netflow_usd, 0);
      const factors = computeSignalFactors({ smartMoneyNetFlowUsd: smNet, exchangeNetFlowUsd: exNet, topBuyerCount: topBuyers.length, topSellerCount: topSellers.length, isPartialData: isPartial });
      const riskLevel = deriveRiskLevel(factors);
      const summary = buildSignalSummary({ smartMoneyNetFlowUsd: smNet, exchangeNetFlowUsd: exNet, topBuyers, topSellers });

      // Persist to cache
      await db.insert(nansenTokenGodModeCache).values({
        chain, tokenAddress: token_address.toLowerCase(), tokenSymbol: token_symbol,
        summary: { ...summary, risk_level: riskLevel, risk_factors: factors } as any,
        topBuyers: topBuyers as any, topSellers: topSellers as any,
        smartMoneyFlows: { rows: smFlows } as any, exchangeFlows: { rows: exFlows } as any,
        status: isPartial ? 'partial' : 'complete', cacheExpiresAt,
      }).onConflictDoUpdate({
        target: [nansenTokenGodModeCache.chain, nansenTokenGodModeCache.tokenAddress, nansenTokenGodModeCache.source],
        set: { tokenSymbol: token_symbol, summary: { ...summary, risk_level: riskLevel, risk_factors: factors } as any, topBuyers: topBuyers as any, topSellers: topSellers as any, smartMoneyFlows: { rows: smFlows } as any, exchangeFlows: { rows: exFlows } as any, status: isPartial ? 'partial' : 'complete', cacheExpiresAt, updatedAt: new Date() },
      } as any).catch((e) => logger.warn('[smart-money-flow] cache write failed', { e: String(e) }));

      responseData = {
        risk_level: riskLevel, summary, top_buyers: topBuyers, top_sellers: topSellers,
        smart_money_flows: { rows: smFlows }, exchange_flows: { rows: exFlows }, risk_factors: factors,
      };
    } else {
      // smart_money_netflow
      const resp = await fetchSmartMoneyNetflow([chain], { tokenAddress: token_address }, { limit });
      const rows = resp.data ?? [];
      const netFlowUsd = rows.reduce((s, r) => s + Number(r.netflowUsd ?? 0), 0);

      await db.insert(nansenSmartMoneyFlows).values({
        chain, tokenAddress: token_address.toLowerCase(), tokenSymbol: token_symbol,
        metricType: 'netflow', timeWindow: `${lookback_hours}h`, netFlowUsd: String(netFlowUsd), cacheExpiresAt,
      }).onConflictDoUpdate({
        target: [nansenSmartMoneyFlows.chain, nansenSmartMoneyFlows.tokenAddress, nansenSmartMoneyFlows.metricType, nansenSmartMoneyFlows.timeWindow, nansenSmartMoneyFlows.source],
        set: { netFlowUsd: String(netFlowUsd), cacheExpiresAt, updatedAt: new Date() },
      } as any).catch((e) => logger.warn('[smart-money-flow] netflow cache write failed', { e: String(e) }));

      const factors = computeSignalFactors({ smartMoneyNetFlowUsd: netFlowUsd });
      responseData = { risk_level: deriveRiskLevel(factors), summary: { smart_money_net_flow_usd: netFlowUsd, signal: netFlowUsd > 0 ? 'bullish' : netFlowUsd < 0 ? 'bearish' : 'neutral' }, top_buyers: [], top_sellers: [], smart_money_flows: { netflow_usd: netFlowUsd }, exchange_flows: {}, risk_factors: factors };
    }

    const cost = getToolCost(TOOL);
    await deductToolCredits(accountId, TOOL, cost, `Smart money flow: ${token_address} on ${chain}`, session_id);

    return c.json({
      success: true, mode, chain, token_address, token_symbol,
      ...responseData,
      source: 'nansen' as const,
      cache_status: 'live' as const,
      fetched_at: new Date().toISOString(),
      cache_expires_at: cacheExpiresAt.toISOString(),
      cost,
      provider: 'nansen',
      attribution: 'Powered by Nansen API',
    });
  } catch (err: unknown) {
    if (err instanceof NansenRateLimitError || err instanceof NansenPaymentRequiredError) {
      // Fall back to stale cache if available
      logger.warn('[smart-money-flow] provider limited, checking stale cache', { err: String(err), chain, token_address });
      const stale = await db
        .select()
        .from(nansenTokenGodModeCache)
        .where(and(eq(nansenTokenGodModeCache.chain, chain), eq(nansenTokenGodModeCache.tokenAddress, token_address.toLowerCase())))
        .limit(1);
      if (stale.length > 0) {
        const row = stale[0]!;
        return c.json({
          success: true, mode, chain, token_address, token_symbol: row.tokenSymbol ?? token_symbol,
          ...flattenCachedTgm(row),
          source: 'stale_cache' as const,
          cache_status: 'cache_stale' as const,
          fetched_at: row.fetchedAt?.toISOString() ?? null,
          cache_expires_at: row.cacheExpiresAt.toISOString(),
          cost: 0,
          provider: 'nansen',
          attribution: 'Powered by Nansen API',
        });
      }
      return c.json({ error: err instanceof NansenRateLimitError ? 'Provider rate limited' : 'Provider credit quota exceeded', cache_status: 'queued' }, 503);
    }
    if (err instanceof NansenUnsupportedChainError) {
      return c.json({ error: `Chain "${chain}" is not supported`, code: 'unsupported_chain' }, 422);
    }
    if (err instanceof NansenForbiddenError) {
      return c.json({ error: 'Provider access forbidden — check NANSEN_API_KEY configuration' }, 503);
    }
    logger.error('[smart-money-flow] unexpected error', { err: String(err), chain, token_address });
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// ─── Helper ────────────────────────────────────────────────────────────────────

function flattenCachedTgm(row: typeof nansenTokenGodModeCache.$inferSelect) {
  const summary = (row.summary as any) ?? {};
  return {
    risk_level: summary.risk_level ?? 'none',
    summary: { smart_money_net_flow_usd: summary.smart_money_net_flow_usd ?? null, exchange_net_flow_usd: summary.exchange_net_flow_usd ?? null, signal: summary.signal ?? 'neutral', top_buyer_count: summary.top_buyer_count ?? null, top_seller_count: summary.top_seller_count ?? null },
    top_buyers: (row.topBuyers as any[]) ?? [],
    top_sellers: (row.topSellers as any[]) ?? [],
    smart_money_flows: row.smartMoneyFlows,
    exchange_flows: row.exchangeFlows,
    risk_factors: summary.risk_factors ?? [],
  };
}
