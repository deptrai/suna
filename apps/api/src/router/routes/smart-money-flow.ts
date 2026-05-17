/**
 * Smart Money Flow API route (Story 2.3.1).
 * POST /v1/router/smart-money-flow
 *
 * Cache-first by default. Live provider call is only allowed when force_refresh=true.
 */

import { Hono } from 'hono';
import type { AppContext } from '../../types';
import { z } from 'zod';
import { and, eq, gt, lte } from 'drizzle-orm';
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
  isChainSupported,
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
import {
  getNansenSmartMoneyQueue,
  JOB_REFRESH_NETFLOW,
  JOB_REFRESH_TGM,
} from '../../queue/bullmq/workers/nansen-smart-money-worker';

export const smartMoneyFlow = new Hono<{ Variables: AppContext }>();

const TOOL = 'smart_money_flow';

const bodySchema = z
  .object({
    chain: z.string().min(1).max(32),
    token_address: z.string().min(6).max(128).optional(),
    token_symbol: z.string().max(32).optional(),
    mode: z.enum(['token_god_mode', 'smart_money_netflow', 'top_buyers', 'top_sellers', 'exchange_flows']),
    lookback_hours: z.number().int().min(1).max(168).optional().default(1),
    limit: z.number().int().min(1).max(100).optional().default(20),
    force_refresh: z.boolean().optional().default(false),
    session_id: z.string().max(128).optional(),
  })
  .superRefine((v, ctx) => {
    if (v.mode !== 'smart_money_netflow' && !v.token_address) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['token_address'],
        message: 'token_address is required for token_god_mode/top_buyers/top_sellers/exchange_flows',
      });
    }
  });

smartMoneyFlow.post('/', async (c) => {
  const accountId: string = c.get('accountId');

  const rawBody = await c.req.json().catch(() => null);
  if (!rawBody) return c.json({ error: 'Invalid JSON body' }, 400);

  const parsed = bodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return c.json({ error: 'Invalid request', details: parsed.error.flatten().fieldErrors }, 400);
  }

  const chain = parsed.data.chain.trim().toLowerCase();
  const tokenAddress = parsed.data.token_address ?? '';
  const tokenSymbol = parsed.data.token_symbol;
  const mode = parsed.data.mode;
  const lookbackHours = parsed.data.lookback_hours;
  const limit = parsed.data.limit;
  const forceRefresh = parsed.data.force_refresh;
  const sessionId = parsed.data.session_id;
  const cacheToken = chain === 'solana' ? tokenAddress : tokenAddress.toLowerCase();
  const timeWindow = `${lookbackHours}h`;

  const now = new Date();

  if (mode !== 'smart_money_netflow') {
    const cached = await db
      .select()
      .from(nansenTokenGodModeCache)
      .where(
        and(
          eq(nansenTokenGodModeCache.chain, chain),
          eq(nansenTokenGodModeCache.tokenAddress, cacheToken),
          gt(nansenTokenGodModeCache.cacheExpiresAt, now),
        ),
      )
      .limit(1);

    if (cached.length > 0 && !forceRefresh) {
      const row = cached[0]!;
      return c.json({
        success: true,
        mode,
        chain,
        token_address: cacheToken,
        token_symbol: row.tokenSymbol ?? tokenSymbol,
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
  } else {
    const cached = await db
      .select()
      .from(nansenSmartMoneyFlows)
      .where(
        and(
          eq(nansenSmartMoneyFlows.chain, chain),
          eq(nansenSmartMoneyFlows.tokenAddress, cacheToken),
          eq(nansenSmartMoneyFlows.metricType, 'netflow'),
          eq(nansenSmartMoneyFlows.timeWindow, timeWindow),
          gt(nansenSmartMoneyFlows.cacheExpiresAt, now),
        ),
      )
      .limit(1);

    if (cached.length > 0 && !forceRefresh) {
      const row = cached[0]!;
      return c.json({
        success: true,
        mode,
        chain,
        token_address: cacheToken,
        token_symbol: row.tokenSymbol ?? tokenSymbol,
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

  if (!isChainSupported(chain)) {
    return c.json({ error: `Chain "${chain}" is not supported`, code: 'unsupported_chain' }, 422);
  }

  const stale = await getStaleCache(chain, cacheToken, mode, timeWindow);

  if (!forceRefresh || !config.NANSEN_SMART_MONEY_WORKER_ENABLED || !canCallNansen(chain)) {
    const queue = getNansenSmartMoneyQueue();
    const name = mode === 'smart_money_netflow' ? JOB_REFRESH_NETFLOW : JOB_REFRESH_TGM;
    const jobId = mode === 'smart_money_netflow'
      ? `netflow:${chain}:${cacheToken}:${timeWindow}`
      : `tgm:${chain}:${cacheToken}:${timeWindow}`;

    await queue
      .add(name, { chain, tokenAddress: cacheToken, tokenSymbol: tokenSymbol, lookbackHours }, { jobId })
      .catch(() => undefined);

    if (stale) {
      return c.json({
        ...stale,
        source: 'stale_cache',
        cache_status: 'cache_stale',
        analysis_status: 'queued',
        cost: 0,
        provider: 'nansen',
        attribution: 'Powered by Nansen API',
      });
    }

    return c.json({
      success: true,
      mode,
      chain,
      token_address: cacheToken,
      token_symbol: tokenSymbol,
      risk_level: 'none',
      summary: {},
      top_buyers: [],
      top_sellers: [],
      smart_money_flows: {},
      exchange_flows: {},
      risk_factors: [],
      source: 'stale_cache',
      cache_status: 'queued',
      analysis_status: 'queued',
      fetched_at: null,
      cache_expires_at: null,
      cost: 0,
      provider: 'nansen',
      attribution: 'Powered by Nansen API',
    });
  }

  const cost = getToolCost(TOOL, 0);
  const creditCheck = await checkCredits(accountId, cost);
  if (!creditCheck.hasCredits) {
    return c.json({ error: 'Insufficient credits for live provider refresh' }, 402);
  }

  const dateRange = {
    from: new Date(Date.now() - lookbackHours * 3_600_000).toISOString(),
    to: new Date().toISOString(),
  };
  const cacheExpiresAt = new Date(Date.now() + config.NANSEN_SMART_MONEY_CACHE_TTL_MS);

  try {
    let responseData: Record<string, unknown>;

    if (mode !== 'smart_money_netflow') {
      if (config.NANSEN_SMART_MONEY_MAX_LIVE_CALLS_PER_REQUEST < 4) {
        throw new NansenRateLimitError();
      }

      const [buyersR, sellersR, smFlowsR, exFlowsR] = await Promise.allSettled([
        fetchTgmWhoBoughtSold(chain, cacheToken, 'buy', dateRange, { limit }),
        fetchTgmWhoBoughtSold(chain, cacheToken, 'sell', dateRange, { limit }),
        fetchTgmFlows(chain, cacheToken, 'smart_money', dateRange, { limit }),
        fetchTgmFlows(chain, cacheToken, 'exchange', dateRange, { limit }),
      ]);

      const rejected = [buyersR, sellersR, smFlowsR, exFlowsR].find((r) => r.status === 'rejected') as PromiseRejectedResult | undefined;
      if (rejected) throw rejected.reason;

      const topBuyers = normalizeTopBuyers((buyersR as PromiseFulfilledResult<any>).value?.data ?? [], limit);
      const topSellers = normalizeTopSellers((sellersR as PromiseFulfilledResult<any>).value?.data ?? [], limit);
      const smFlows = normalizeFlowBreakdown((smFlowsR as PromiseFulfilledResult<any>).value?.data ?? []);
      const exFlows = normalizeFlowBreakdown((exFlowsR as PromiseFulfilledResult<any>).value?.data ?? []);

      const smNet = smFlows.reduce((s, r) => s + r.netflow_usd, 0);
      const exNet = exFlows.reduce((s, r) => s + r.netflow_usd, 0);
      const factors = computeSignalFactors({ smartMoneyNetFlowUsd: smNet, exchangeNetFlowUsd: exNet, topBuyerCount: topBuyers.length, topSellerCount: topSellers.length, isPartialData: false });
      const riskLevel = deriveRiskLevel(factors);
      const summary = buildSignalSummary({ smartMoneyNetFlowUsd: smNet, exchangeNetFlowUsd: exNet, topBuyers, topSellers });

      await db
        .insert(nansenTokenGodModeCache)
        .values({
          chain,
          tokenAddress: cacheToken,
          tokenSymbol: tokenSymbol,
          summary: { ...summary, risk_level: riskLevel, risk_factors: factors } as any,
          topBuyers: topBuyers as any,
          topSellers: topSellers as any,
          smartMoneyFlows: { rows: smFlows } as any,
          exchangeFlows: { rows: exFlows } as any,
          status: 'complete',
          cacheExpiresAt,
        })
        .onConflictDoUpdate({
          target: [nansenTokenGodModeCache.chain, nansenTokenGodModeCache.tokenAddress, nansenTokenGodModeCache.source],
          set: {
            tokenSymbol: tokenSymbol,
            summary: { ...summary, risk_level: riskLevel, risk_factors: factors } as any,
            topBuyers: topBuyers as any,
            topSellers: topSellers as any,
            smartMoneyFlows: { rows: smFlows } as any,
            exchangeFlows: { rows: exFlows } as any,
            status: 'complete',
            cacheExpiresAt,
            updatedAt: new Date(),
          },
        } as any)
        .catch((e) => logger.warn('[smart-money-flow] cache write failed', { e: String(e) }));

      responseData = {
        risk_level: riskLevel,
        summary,
        top_buyers: topBuyers,
        top_sellers: topSellers,
        smart_money_flows: { rows: smFlows },
        exchange_flows: { rows: exFlows },
        risk_factors: factors,
      };
    } else {
      const resp = await fetchSmartMoneyNetflow([chain], { tokenAddress: cacheToken, timeWindow }, { limit });
      const rows = resp.data ?? [];
      const netFlowUsd = rows.reduce((s, r) => s + Number(r.netflowUsd ?? 0), 0);

      await db
        .insert(nansenSmartMoneyFlows)
        .values({
          chain,
          tokenAddress: cacheToken,
          tokenSymbol: tokenSymbol,
          metricType: 'netflow',
          timeWindow,
          netFlowUsd: String(netFlowUsd),
          flowBreakdown: { rows } as any,
          cacheExpiresAt,
        })
        .onConflictDoUpdate({
          target: [nansenSmartMoneyFlows.chain, nansenSmartMoneyFlows.tokenAddress, nansenSmartMoneyFlows.metricType, nansenSmartMoneyFlows.timeWindow, nansenSmartMoneyFlows.source],
          set: { netFlowUsd: String(netFlowUsd), flowBreakdown: { rows } as any, cacheExpiresAt, updatedAt: new Date() },
        } as any)
        .catch((e) => logger.warn('[smart-money-flow] netflow cache write failed', { e: String(e) }));

      const factors = computeSignalFactors({ smartMoneyNetFlowUsd: netFlowUsd });
      responseData = {
        risk_level: deriveRiskLevel(factors),
        summary: { smart_money_net_flow_usd: netFlowUsd, signal: netFlowUsd > 0 ? 'bullish' : netFlowUsd < 0 ? 'bearish' : 'neutral' },
        top_buyers: [],
        top_sellers: [],
        smart_money_flows: { rows },
        exchange_flows: {},
        risk_factors: factors,
      };
    }

    const bill = await deductToolCredits(accountId, TOOL, 0, `Smart money flow: ${cacheToken} on ${chain}`, sessionId);
    if (!bill.success) {
      return c.json({ error: 'Insufficient credits for live provider refresh' }, 402);
    }

    return c.json({
      success: true,
      mode,
      chain,
      token_address: cacheToken,
      token_symbol: tokenSymbol,
      ...responseData,
      source: 'nansen',
      cache_status: 'live',
      fetched_at: new Date().toISOString(),
      cache_expires_at: cacheExpiresAt.toISOString(),
      cost,
      provider: 'nansen',
      attribution: 'Powered by Nansen API',
    });
  } catch (err: unknown) {
    if (err instanceof NansenUnsupportedChainError) {
      return c.json({ error: `Chain "${chain}" is not supported`, code: 'unsupported_chain' }, 422);
    }
    if (err instanceof NansenRateLimitError || err instanceof NansenPaymentRequiredError || err instanceof NansenForbiddenError) {
      const staleFallback = await getStaleCache(chain, cacheToken, mode, timeWindow);
      if (staleFallback) {
        return c.json({
          ...staleFallback,
          source: 'stale_cache',
          cache_status: 'cache_stale',
          analysis_status: 'queued',
          cost: 0,
          provider: 'nansen',
          attribution: 'Powered by Nansen API',
        });
      }
      return c.json({ error: 'Provider temporarily unavailable', cache_status: 'queued' }, 503);
    }

    logger.error('[smart-money-flow] unexpected error', { err: String(err), chain, token_address: cacheToken });
    return c.json({ error: 'Internal server error' }, 500);
  }
});

function flattenCachedTgm(row: typeof nansenTokenGodModeCache.$inferSelect) {
  const summary = (row.summary as any) ?? {};
  return {
    risk_level: summary.risk_level ?? 'none',
    summary: {
      smart_money_net_flow_usd: summary.smart_money_net_flow_usd ?? null,
      exchange_net_flow_usd: summary.exchange_net_flow_usd ?? null,
      signal: summary.signal ?? 'neutral',
      top_buyer_count: summary.top_buyer_count ?? null,
      top_seller_count: summary.top_seller_count ?? null,
    },
    top_buyers: (row.topBuyers as any[]) ?? [],
    top_sellers: (row.topSellers as any[]) ?? [],
    smart_money_flows: row.smartMoneyFlows,
    exchange_flows: row.exchangeFlows,
    risk_factors: summary.risk_factors ?? [],
  };
}

async function getStaleCache(chain: string, tokenAddress: string, mode: z.infer<typeof bodySchema>['mode'], timeWindow: string) {
  if (mode === 'smart_money_netflow') {
    const rows = await db
      .select()
      .from(nansenSmartMoneyFlows)
      .where(
        and(
          eq(nansenSmartMoneyFlows.chain, chain),
          eq(nansenSmartMoneyFlows.tokenAddress, tokenAddress),
          eq(nansenSmartMoneyFlows.metricType, 'netflow'),
          eq(nansenSmartMoneyFlows.timeWindow, timeWindow),
          lte(nansenSmartMoneyFlows.cacheExpiresAt, new Date()),
        ),
      )
      .limit(1);
    if (rows.length === 0) return null;
    const row = rows[0]!;
    return {
      success: true,
      mode,
      chain,
      token_address: tokenAddress,
      token_symbol: row.tokenSymbol ?? null,
      risk_level: 'none',
      summary: { smart_money_net_flow_usd: Number(row.netFlowUsd ?? 0), exchange_net_flow_usd: null, signal: 'neutral' },
      top_buyers: [],
      top_sellers: [],
      smart_money_flows: row.flowBreakdown,
      exchange_flows: {},
      risk_factors: row.riskFactors,
      fetched_at: row.fetchedAt?.toISOString() ?? null,
      cache_expires_at: row.cacheExpiresAt.toISOString(),
    };
  }

  const rows = await db
    .select()
    .from(nansenTokenGodModeCache)
    .where(
      and(
        eq(nansenTokenGodModeCache.chain, chain),
        eq(nansenTokenGodModeCache.tokenAddress, tokenAddress),
        lte(nansenTokenGodModeCache.cacheExpiresAt, new Date()),
      ),
    )
    .limit(1);
  if (rows.length === 0) return null;

  const row = rows[0]!;
  return {
    success: true,
    mode,
    chain,
    token_address: tokenAddress,
    token_symbol: row.tokenSymbol ?? null,
    ...flattenCachedTgm(row),
    fetched_at: row.fetchedAt?.toISOString() ?? null,
    cache_expires_at: row.cacheExpiresAt.toISOString(),
  };
}
