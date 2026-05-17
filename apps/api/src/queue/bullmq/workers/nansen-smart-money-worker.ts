/**
 * Nansen Smart Money / Token God Mode background worker (Story 2.3.1).
 *
 * Queue name: nansen-smart-money-sync
 * Jobs:
 *   - refresh-smart-money-netflow  — refresh netflow data for configured chain batches
 *   - refresh-token-god-mode       — refresh TGM cache for a specific hot token
 *   - refresh-hot-token-watchlist  — scan watchlist and enqueue TGM jobs for stale tokens
 *   - cleanup-expired-nansen-cache — delete expired rows from both cache tables
 *
 * Concurrency: default 1 (respects Nansen 20 req/s rate limit via sequential processing).
 * Worker is feature-flagged; disabled unless NANSEN_SMART_MONEY_WORKER_ENABLED=true AND NANSEN_API_KEY set.
 */

import { Worker, Job, Queue } from 'bullmq';
import { lt, and, eq } from 'drizzle-orm';
import { redisConnection } from '../connection';
import { db } from '../../../shared/db';
import { nansenSmartMoneyFlows, nansenTokenGodModeCache } from '@epsilon/db';
import { config } from '../../../config';
import { logger } from '../../../lib/logger';
import {
  fetchSmartMoneyNetflow,
  fetchTgmWhoBoughtSold,
  fetchTgmFlows,
  canCallNansen,
  isChainSupported,
  NansenRateLimitError,
  NansenForbiddenError,
  NansenPaymentRequiredError,
} from '../../../router/services/nansen';
import {
  normalizeTopBuyers,
  normalizeTopSellers,
  normalizeFlowBreakdown,
  summarizeNetflow,
  computeSignalFactors,
  deriveRiskLevel,
  buildSignalSummary,
} from '../../../router/services/nansen-normalize';

export const QUEUE_NAME = 'nansen-smart-money-sync';
const NETFLOW_SCHEDULER_ID = 'nansen-netflow-refresh';
const CLEANUP_SCHEDULER_ID = 'nansen-cache-cleanup-daily';
export const JOB_REFRESH_NETFLOW = 'refresh-smart-money-netflow';
export const JOB_REFRESH_TGM = 'refresh-token-god-mode';
export const JOB_REFRESH_WATCHLIST = 'refresh-hot-token-watchlist';
export const JOB_CLEANUP = 'cleanup-expired-nansen-cache';

let _queue: Queue | null = null;
let _worker: Worker | null = null;

function isRateLimit(err: unknown): boolean {
  return err instanceof NansenRateLimitError || (err as { status?: number })?.status === 429;
}

function isFatal(err: unknown): boolean {
  return err instanceof NansenForbiddenError || err instanceof NansenPaymentRequiredError;
}

// ─── Queue singleton ──────────────────────────────────────────────────────────

export function getNansenSmartMoneyQueue(): Queue {
  if (!_queue) {
    _queue = new Queue(QUEUE_NAME, {
      connection: redisConnection,
      defaultJobOptions: {
        removeOnComplete: { count: 20 },
        removeOnFail: { count: 50 },
        attempts: 1,
        backoff: { type: 'exponential', delay: 10_000 },
      },
    });
  }
  return _queue;
}

// ─── Job helpers ──────────────────────────────────────────────────────────────

function getConfiguredChains(): string[] {
  return config.NANSEN_SMART_MONEY_CHAINS
    .split(',')
    .map((c) => c.trim().toLowerCase())
    .filter(Boolean);
}

function cacheTtlMs(): number {
  return config.NANSEN_SMART_MONEY_CACHE_TTL_MS;
}

function nowPlusTtl(): Date {
  return new Date(Date.now() + cacheTtlMs());
}

function buildDateRange(lookbackHours: number): { from: string; to: string } {
  const now = new Date();
  const from = new Date(now.getTime() - lookbackHours * 3_600_000);
  return { from: from.toISOString(), to: now.toISOString() };
}

// ─── Job processors ───────────────────────────────────────────────────────────

async function processRefreshNetflow(job: Job): Promise<void> {
  const { chain, tokenAddress, lookbackHours } = job.data as {
    chain: string;
    tokenAddress: string;
    lookbackHours?: number;
  };
  const normalizedChain = String(chain || '').trim().toLowerCase();
  const normalizedToken = normalizedChain === 'solana' ? String(tokenAddress || '') : String(tokenAddress || '').toLowerCase();
  const lb = lookbackHours ?? config.NANSEN_SMART_MONEY_LOOKBACK_HOURS;
  const timeWindow = `${lb}h`;
  if (!normalizedToken) return;
  if (!isChainSupported(normalizedChain) || !canCallNansen(normalizedChain)) return;

  logger.info('[nansen-worker] refresh-smart-money-netflow started', { chain: normalizedChain, tokenAddress: normalizedToken });
  const resp = await fetchSmartMoneyNetflow([normalizedChain], { tokenAddress: normalizedToken, timeWindow }, { limit: config.NANSEN_SMART_MONEY_TOP_N });
  const rows = resp.data ?? [];
  const summary = summarizeNetflow(rows);
  const cacheExpiresAt = nowPlusTtl();
  await db
    .insert(nansenSmartMoneyFlows)
    .values({
      chain: normalizedChain,
      tokenAddress: normalizedToken,
      metricType: 'netflow',
      timeWindow,
      netFlowUsd: String(summary.smart_money_net_flow_usd),
      walletCount: summary.wallet_count,
      flowBreakdown: { rows } as any,
      cacheExpiresAt,
    })
    .onConflictDoUpdate({
      target: [nansenSmartMoneyFlows.chain, nansenSmartMoneyFlows.tokenAddress, nansenSmartMoneyFlows.metricType, nansenSmartMoneyFlows.timeWindow, nansenSmartMoneyFlows.source],
      set: {
        netFlowUsd: String(summary.smart_money_net_flow_usd),
        walletCount: summary.wallet_count,
        flowBreakdown: { rows } as any,
        cacheExpiresAt,
        updatedAt: new Date(),
      },
    } as any);
}

async function processRefreshTokenGodMode(job: Job): Promise<void> {
  const { chain, tokenAddress, tokenSymbol, lookbackHours } = job.data as {
    chain: string;
    tokenAddress: string;
    tokenSymbol?: string;
    lookbackHours?: number;
  };

  const normalizedChain = chain.trim().toLowerCase();
  const normalizedToken = normalizedChain === 'solana' ? tokenAddress : tokenAddress.toLowerCase();
  if (!isChainSupported(normalizedChain) || !canCallNansen(normalizedChain)) {
    logger.warn('[nansen-worker] chain unsupported or no API key, skipping TGM', { chain });
    return;
  }

  const lb = lookbackHours ?? config.NANSEN_SMART_MONEY_LOOKBACK_HOURS;
  const dateRange = buildDateRange(lb);
  const limit = config.NANSEN_SMART_MONEY_TOP_N;
  const cacheExpiresAt = nowPlusTtl();

  logger.info('[nansen-worker] refresh-token-god-mode started', { chain, tokenAddress });

  const [buyersResult, sellersResult, smFlowsResult, exFlowsResult] = await Promise.allSettled([
    fetchTgmWhoBoughtSold(normalizedChain, normalizedToken, 'buy', dateRange, { limit }),
    fetchTgmWhoBoughtSold(normalizedChain, normalizedToken, 'sell', dateRange, { limit }),
    fetchTgmFlows(normalizedChain, normalizedToken, 'smart_money', dateRange, { limit }),
    fetchTgmFlows(normalizedChain, normalizedToken, 'exchange', dateRange, { limit }),
  ]);
  const rejected = [buyersResult, sellersResult, smFlowsResult, exFlowsResult]
    .find((r) => r.status === 'rejected') as PromiseRejectedResult | undefined;
  if (rejected) {
    if (isFatal(rejected.reason) || isRateLimit(rejected.reason)) throw rejected.reason;
    logger.warn('[nansen-worker] non-fatal TGM call failed', { err: String(rejected.reason) });
    return;
  }

  const topBuyers = buyersResult.status === 'fulfilled'
    ? normalizeTopBuyers(buyersResult.value.data ?? [], limit)
    : [];
  const topSellers = sellersResult.status === 'fulfilled'
    ? normalizeTopSellers(sellersResult.value.data ?? [], limit)
    : [];
  const smFlows = smFlowsResult.status === 'fulfilled'
    ? normalizeFlowBreakdown(smFlowsResult.value.data ?? [])
    : [];
  const exFlows = exFlowsResult.status === 'fulfilled'
    ? normalizeFlowBreakdown(exFlowsResult.value.data ?? [])
    : [];

  const isPartial = false;
  const smNetFlow = smFlows.reduce((s, r) => s + r.netflow_usd, 0);
  const exNetFlow = exFlows.reduce((s, r) => s + r.netflow_usd, 0);

  const factors = computeSignalFactors({
    smartMoneyNetFlowUsd: smNetFlow,
    exchangeNetFlowUsd: exNetFlow,
    topBuyerCount: topBuyers.length,
    topSellerCount: topSellers.length,
    flowBreakdown: [...smFlows, ...exFlows],
    isPartialData: isPartial,
  });

  const riskLevel = deriveRiskLevel(factors);
  const summary = buildSignalSummary({
    smartMoneyNetFlowUsd: smNetFlow,
    exchangeNetFlowUsd: exNetFlow,
    topBuyers,
    topSellers,
    flowBreakdown: [...smFlows, ...exFlows],
  });

  const status = isPartial ? 'partial' : 'complete';

  await db
    .insert(nansenTokenGodModeCache)
    .values({
      chain: normalizedChain,
      tokenAddress: normalizedToken,
      tokenSymbol,
      summary: { ...summary, risk_level: riskLevel, risk_factors: factors } as any,
      topBuyers: topBuyers as any,
      topSellers: topSellers as any,
      smartMoneyFlows: { rows: smFlows } as any,
      exchangeFlows: { rows: exFlows } as any,
      status,
      cacheExpiresAt,
    })
    .onConflictDoUpdate({
      target: [nansenTokenGodModeCache.chain, nansenTokenGodModeCache.tokenAddress, nansenTokenGodModeCache.source],
      set: {
        tokenSymbol,
        summary: { ...summary, risk_level: riskLevel, risk_factors: factors } as any,
        topBuyers: topBuyers as any,
        topSellers: topSellers as any,
        smartMoneyFlows: { rows: smFlows } as any,
        exchangeFlows: { rows: exFlows } as any,
        status,
        cacheExpiresAt,
        updatedAt: new Date(),
      },
    } as any);

  logger.info('[nansen-worker] TGM cache updated', { chain, tokenAddress, status, riskLevel });
}

async function processRefreshHotTokenWatchlist(job: Job): Promise<void> {
  // Query recently stale TGM cache entries that are still within configured chain scope
  const chains = getConfiguredChains();
  const now = new Date();
  const q = getNansenSmartMoneyQueue();

  const staleRows = await db
    .select({ chain: nansenTokenGodModeCache.chain, tokenAddress: nansenTokenGodModeCache.tokenAddress, tokenSymbol: nansenTokenGodModeCache.tokenSymbol })
    .from(nansenTokenGodModeCache)
    .where(lt(nansenTokenGodModeCache.cacheExpiresAt, now))
    .limit(50);

  const enqueued = staleRows.filter((r) => chains.includes(r.chain));
  logger.info('[nansen-worker] watchlist scan', { staleCount: staleRows.length, enqueuedCount: enqueued.length });

  for (const row of enqueued) {
    await q.add(JOB_REFRESH_TGM, {
      chain: row.chain,
      tokenAddress: row.tokenAddress,
      tokenSymbol: row.tokenSymbol,
    }, { jobId: `tgm:${row.chain}:${row.tokenAddress}` });
  }
}

async function processCleanup(job: Job): Promise<void> {
  const expiredBefore = new Date();
  const [flowsDel, tgmDel] = await Promise.allSettled([
    db.delete(nansenSmartMoneyFlows).where(lt(nansenSmartMoneyFlows.cacheExpiresAt, expiredBefore)),
    db.delete(nansenTokenGodModeCache).where(lt(nansenTokenGodModeCache.cacheExpiresAt, expiredBefore)),
  ]);
  if (flowsDel.status === 'rejected' || tgmDel.status === 'rejected') {
    throw new Error('cleanup failed');
  }
  logger.info('[nansen-worker] cleanup-expired-nansen-cache done', {
    flowsDeleted: flowsDel.status === 'fulfilled',
    tgmDeleted: tgmDel.status === 'fulfilled',
  });
}

// ─── Worker lifecycle ─────────────────────────────────────────────────────────

export function startNansenSmartMoneyWorker(): void {
  if (!config.NANSEN_SMART_MONEY_WORKER_ENABLED || !config.NANSEN_API_KEY) {
    logger.info('[nansen-worker] disabled (NANSEN_SMART_MONEY_WORKER_ENABLED=false or NANSEN_API_KEY missing)');
    return;
  }
  if (_worker) return;

  _worker = new Worker(
    QUEUE_NAME,
    async (job: Job) => {
      switch (job.name) {
        case JOB_REFRESH_NETFLOW:     return processRefreshNetflow(job);
        case JOB_REFRESH_TGM:         return processRefreshTokenGodMode(job);
        case JOB_REFRESH_WATCHLIST:   return processRefreshHotTokenWatchlist(job);
        case JOB_CLEANUP:             return processCleanup(job);
        default:
          logger.warn('[nansen-worker] unknown job name', { jobName: job.name });
      }
    },
    {
      connection: redisConnection,
      concurrency: config.NANSEN_SMART_MONEY_CONCURRENCY,
    },
  );

  _worker.on('error', (err) => {
    logger.error('[nansen-worker] worker error', { err: String(err) });
  });

  _worker.on('failed', (job, err) => {
    if (isRateLimit(err)) {
      logger.warn('[nansen-worker] job failed: rate limited', { jobId: job?.id, jobName: job?.name });
      if (job) {
        job.retry().catch(() => undefined);
      }
    } else {
      logger.error('[nansen-worker] job failed', { jobId: job?.id, jobName: job?.name, err: String(err) });
    }
  });

  logger.info('[nansen-worker] started');
}

export async function setupNansenSmartMoneyJobs(): Promise<void> {
  if (!config.NANSEN_SMART_MONEY_WORKER_ENABLED || !config.NANSEN_API_KEY) return;

  const q = getNansenSmartMoneyQueue();
  await q.removeJobScheduler(NETFLOW_SCHEDULER_ID).catch(() => undefined);
  await q.upsertJobScheduler(
    CLEANUP_SCHEDULER_ID,
    { pattern: '37 2 * * *' },
    { name: JOB_CLEANUP, data: {} },
  );
  logger.info('[nansen-worker] job schedulers registered');
}

export async function stopNansenSmartMoneyWorker(): Promise<void> {
  await _worker?.close();
  await _queue?.close();
  _worker = null;
  _queue = null;
}
