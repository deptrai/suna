import { Hono } from 'hono';
import { z } from 'zod';
import { and, desc, eq, gt, inArray, or, sql } from 'drizzle-orm';
import { db } from '../../shared/db';
import { tokenTerminalProjects, tokenTerminalProjectMetrics, tokenTerminalValuationSnapshots } from '@epsilon/db';
import type { AppContext } from '../../types';
import { checkCredits, deductToolCredits } from '../services/billing';
import { config, getToolCost } from '../../config';
import {
  canCallTokenTerminal,
  fetchMetricData,
  TokenTerminalRateLimitError,
  TokenTerminalPaymentRequiredError,
  TokenTerminalForbiddenError,
  TokenTerminalInvalidQueryError,
  TokenTerminalProjectRedirectError,
  TokenTerminalProviderError,
  TokenTerminalUnconfiguredError,
  sanitizeTokenTerminalError,
} from '../services/token-terminal';
import { getTokenTerminalQueue, JOB_REFRESH_FUNDAMENTALS, JOB_COMPUTE_SNAPSHOTS } from '../../queue/bullmq/workers/token-terminal-worker';
import { logger } from '../../lib/logger';

const TOOL = 'protocol_valuation';
const MAX_LIVE_CALLS = 10;
const TIMESERIES_LIMIT = 365;

const bodySchema = z.object({
  project_id: z.string().max(128).optional(),
  symbol: z.string().max(64).optional(),
  token_address: z.string().max(128).optional(),
  peer_project_ids: z.array(z.string().max(128)).max(50).optional(),
  sector: z.string().max(128).optional(),
  mode: z.enum(['project_snapshot', 'valuation_matrix', 'metric_timeseries']),
  metrics: z.array(z.string().max(128)).max(20).optional(),
  force_refresh: z.boolean().optional().default(false),
  session_id: z.string().max(128).optional(),
}).refine((v) => Boolean(v.project_id || v.symbol || v.token_address || v.sector || (v.peer_project_ids && v.peer_project_ids.length)), {
  message: 'One of project_id/symbol/token_address/sector/peer_project_ids is required',
});

type Mode = z.infer<typeof bodySchema>['mode'];

export const protocolValuation = new Hono<{ Variables: AppContext }>();

protocolValuation.post('/', async (c) => {
  const accountId = c.get('accountId') as string;
  const body = await c.req.json().catch(() => null);
  if (!body) return c.json({ error: 'Invalid JSON body' }, 400);

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return c.json({ error: 'Invalid request', details: parsed.error.flatten().fieldErrors }, 400);

  const q = parsed.data;
  const cacheWindow = new Date(Date.now() - config.TOKEN_TERMINAL_CACHE_TTL_MS);

  const projectIds = await resolveProjectIds(q);
  const ids = Array.from(new Set(projectIds)).slice(0, 100);
  const snapshots = ids.length ? await safeSelectSnapshots(ids, cacheWindow) : [];
  const cachedAllTime = ids.length ? await safeSelectSnapshots(ids) : [];

  const noFreshData = snapshots.length === 0;

  // Cache-first by default. Live refresh only on explicit force_refresh + provider configured.
  if (!q.force_refresh) {
    if (noFreshData) {
      const status = cachedAllTime.length ? 'cache_stale' : 'no_data';
      return formatResponse(q.mode, ids, cachedAllTime, q.metrics, status, 0);
    }
    return formatResponse(q.mode, ids, snapshots, q.metrics, 'cache_fresh', 0);
  }

  if (!config.TOKEN_TERMINAL_WORKER_ENABLED || !canCallTokenTerminal()) {
    return c.json({ success: true, mode: q.mode, cache_status: 'no_data', code: 'unconfigured', message: 'Token Terminal worker/API key is not configured', provider: 'token_terminal', cost: 0 });
  }

  const cost = getToolCost(TOOL, 0);
  const check = await checkCredits(accountId, cost);
  if (!check.hasCredits) return c.json({ error: 'Insufficient credits for live provider refresh' }, 402);

  // Live path: queue worker jobs to refresh + recompute. Do NOT block on synchronous provider calls
  // (they would burn quota without persisting). Return queued status; client polls for fresh cache.
  let liveError: { code: string; message: string } | null = null;
  if (q.metrics?.length) {
    const metrics = q.metrics.slice(0, MAX_LIVE_CALLS);
    const projects = ids.slice(0, config.TOKEN_TERMINAL_MAX_PROJECTS_PER_RUN);
    for (const metricId of metrics) {
      try {
        await fetchMetricData(metricId.trim(), { projectIds: projects });
      } catch (err) {
        liveError = mapProviderError(err);
        logger.warn('[protocol-valuation] live fetch failed', { metricId, error: sanitizeTokenTerminalError(err) });
        break;
      }
    }
  }

  await deductToolCredits(accountId, TOOL, 0, 'Protocol valuation live refresh', q.session_id);

  const queue = getTokenTerminalQueue();
  await queue.add(JOB_REFRESH_FUNDAMENTALS, {}, { jobId: `tt:refresh:${Date.now()}` }).catch(() => undefined);
  await queue.add(JOB_COMPUTE_SNAPSHOTS, {}, { jobId: `tt:snap:${Date.now()}` }).catch(() => undefined);

  if (liveError) return c.json({ success: false, mode: q.mode, code: liveError.code, message: liveError.message, provider: 'token_terminal', cost }, 200);

  const fresh = ids.length ? await safeSelectSnapshots(ids) : [];
  return formatResponse(q.mode, ids, fresh, q.metrics, 'queued', cost);
});

async function resolveProjectIds(q: z.infer<typeof bodySchema>): Promise<string[]> {
  const ids: string[] = [];
  if (q.project_id) ids.push(q.project_id);
  if (q.peer_project_ids?.length) ids.push(...q.peer_project_ids);
  if (ids.length) return ids;

  if (!q.symbol && !q.token_address && !q.sector) return ids;

  const conds: any[] = [];
  if (q.symbol) conds.push(sql`LOWER(${tokenTerminalProjects.symbol}) = ${q.symbol.toLowerCase()}`);
  if (q.sector) conds.push(sql`LOWER(${tokenTerminalProjects.marketSector}) = ${q.sector.toLowerCase()}`);
  if (q.token_address) {
    conds.push(sql`${tokenTerminalProjects.tokenAddresses} @> ${JSON.stringify([q.token_address.toLowerCase()])}::jsonb OR ${tokenTerminalProjects.tokenAddresses} @> ${JSON.stringify([q.token_address])}::jsonb`);
  }

  try {
    const rows = await db.select({ projectId: tokenTerminalProjects.projectId })
      .from(tokenTerminalProjects)
      .where(conds.length === 1 ? conds[0] : and(...conds))
      .limit(100);
    return rows.map((r) => r.projectId);
  } catch (err) {
    logger.warn('[protocol-valuation] resolveProjectIds failed', { error: String(err) });
    return [];
  }
}

function mapProviderError(err: unknown): { code: string; message: string } {
  if (err instanceof TokenTerminalRateLimitError) return { code: 'rate_limited', message: 'Token Terminal rate limit hit, try again shortly' };
  if (err instanceof TokenTerminalPaymentRequiredError) return { code: 'payment_required', message: 'Token Terminal subscription invalid' };
  if (err instanceof TokenTerminalForbiddenError) return { code: 'forbidden', message: 'Token Terminal access forbidden' };
  if (err instanceof TokenTerminalInvalidQueryError) return { code: 'invalid_query', message: 'Token Terminal rejected the query' };
  if (err instanceof TokenTerminalProjectRedirectError) return { code: 'project_renamed', message: 'Token Terminal project was renamed; refresh metadata' };
  if (err instanceof TokenTerminalUnconfiguredError) return { code: 'unconfigured', message: 'Token Terminal API key not configured' };
  if (err instanceof TokenTerminalProviderError) return { code: 'provider_error', message: 'Token Terminal provider error' };
  return { code: 'provider_error', message: 'Token Terminal request failed' };
}

async function formatResponse(
  mode: Mode,
  projectIds: string[],
  snapshots: any[],
  metrics: string[] | undefined,
  cacheStatus: 'cache_fresh' | 'live' | 'cache_stale' | 'no_data' | 'queued',
  cost: number,
) {
  const fetchedAt = snapshots[0]?.fetchedAt ?? null;

  if (mode === 'project_snapshot') {
    const s = snapshots[0];
    return new Response(JSON.stringify({
      success: true,
      mode,
      project_id: s?.projectId ?? projectIds[0] ?? null,
      project_name: s?.projectName ?? null,
      symbol: s?.symbol ?? null,
      sector: s?.sector ?? null,
      valuation_signal: s?.valuationSignal ?? 'unknown',
      metrics: {
        ps_ratio_fully_diluted: s?.psRatioFullyDiluted ?? null,
        pf_ratio_fully_diluted: s?.pfRatioFullyDiluted ?? null,
        pe_ratio: s?.peRatio ?? null,
        fees_annualized_usd: s?.feesAnnualizedUsd ?? null,
        revenue_annualized_usd: s?.revenueAnnualizedUsd ?? null,
        earnings_annualized_usd: s?.earningsAnnualizedUsd ?? null,
        user_dau: s?.userDau ?? null,
        active_developers: s?.activeDevelopers ?? null,
        code_commits: s?.codeCommits ?? null,
      },
      risk_factors: s?.riskFactors ?? [],
      peer_percentiles: s?.peerPercentiles ?? {},
      source: 'token_terminal',
      provider: 'token_terminal',
      attribution: 'Powered by Token Terminal API',
      cache_status: cacheStatus,
      fetched_at: fetchedAt,
      cost,
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }

  if (mode === 'valuation_matrix') {
    return new Response(JSON.stringify({
      success: true,
      mode,
      projects: snapshots.map((s) => ({
        project_id: s.projectId,
        project_name: s.projectName,
        symbol: s.symbol,
        sector: s.sector,
        valuation_signal: s.valuationSignal,
        ps_ratio_fully_diluted: s.psRatioFullyDiluted,
        pf_ratio_fully_diluted: s.pfRatioFullyDiluted,
        pe_ratio: s.peRatio,
        fees_annualized_usd: s.feesAnnualizedUsd,
        revenue_annualized_usd: s.revenueAnnualizedUsd,
        earnings_annualized_usd: s.earningsAnnualizedUsd,
        user_dau: s.userDau,
        active_developers: s.activeDevelopers,
        code_commits: s.codeCommits,
        percentiles: s.peerPercentiles ?? {},
        missing_data_flags: s.riskFactors ?? [],
      })),
      provider: 'token_terminal',
      attribution: 'Powered by Token Terminal API',
      cache_status: cacheStatus,
      fetched_at: fetchedAt,
      cost,
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }

  // metric_timeseries — read DB cache only
  const metricIds = (metrics ?? []).slice(0, 5);
  const points = (projectIds.length && metricIds.length) ? await safeSelectTimeseries(projectIds, metricIds) : [];

  return new Response(JSON.stringify({
    success: true,
    mode,
    project_id: projectIds[0] ?? null,
    metric_ids: metricIds,
    points,
    source: 'token_terminal',
    provider: 'token_terminal',
    attribution: 'Powered by Token Terminal API',
    cache_status: cacheStatus,
    fetched_at: points[0]?.fetched_at ?? null,
    cost,
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

async function safeSelectSnapshots(projectIds: string[], fetchedAfter?: Date): Promise<any[]> {
  try {
    if (fetchedAfter) {
      return await db.select().from(tokenTerminalValuationSnapshots)
        .where(and(inArray(tokenTerminalValuationSnapshots.projectId, projectIds), gt(tokenTerminalValuationSnapshots.fetchedAt, fetchedAfter)))
        .orderBy(desc(tokenTerminalValuationSnapshots.periodEnd))
        .limit(300);
    }
    return await db.select().from(tokenTerminalValuationSnapshots)
      .where(inArray(tokenTerminalValuationSnapshots.projectId, projectIds))
      .orderBy(desc(tokenTerminalValuationSnapshots.periodEnd))
      .limit(300);
  } catch (err) {
    logger.warn('[protocol-valuation] snapshot query failed; returning empty cache', { error: String(err) });
    return [];
  }
}

async function safeSelectTimeseries(projectIds: string[], metricIds: string[]): Promise<Array<{ project_id: string; metric_id: string; timestamp: string; value: number | null; fetched_at?: string | null }>> {
  try {
    const rows = await db.select({
      projectId: tokenTerminalProjectMetrics.projectId,
      metricId: tokenTerminalProjectMetrics.metricId,
      timestamp: tokenTerminalProjectMetrics.timestamp,
      value: tokenTerminalProjectMetrics.value,
      fetchedAt: tokenTerminalProjectMetrics.fetchedAt,
    })
      .from(tokenTerminalProjectMetrics)
      .where(and(inArray(tokenTerminalProjectMetrics.projectId, projectIds), inArray(tokenTerminalProjectMetrics.metricId, metricIds)))
      .orderBy(desc(tokenTerminalProjectMetrics.timestamp))
      .limit(TIMESERIES_LIMIT);

    return rows.map((r) => ({
      project_id: r.projectId,
      metric_id: r.metricId,
      timestamp: (r.timestamp as unknown as Date).toISOString?.() ?? String(r.timestamp),
      value: r.value === null ? null : Number(r.value),
      fetched_at: (r.fetchedAt as unknown as Date)?.toISOString?.() ?? null,
    }));
  } catch (err) {
    logger.warn('[protocol-valuation] timeseries query failed; returning empty', { error: String(err) });
    return [];
  }
}
