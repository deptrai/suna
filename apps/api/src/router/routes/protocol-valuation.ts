import { Hono } from 'hono';
import { z } from 'zod';
import { and, desc, eq, gt, inArray } from 'drizzle-orm';
import { db } from '../../shared/db';
import { tokenTerminalProjects, tokenTerminalProjectMetrics, tokenTerminalValuationSnapshots } from '@epsilon/db';
import type { AppContext } from '../../types';
import { checkCredits, deductToolCredits } from '../services/billing';
import { config, getToolCost } from '../../config';
import { canCallTokenTerminal, fetchMetricData } from '../services/token-terminal';
import { getTokenTerminalQueue, JOB_REFRESH_FUNDAMENTALS, JOB_COMPUTE_SNAPSHOTS } from '../../queue/bullmq/workers/token-terminal-worker';
import { logger } from '../../lib/logger';

const TOOL = 'protocol_valuation';
const MAX_LIVE_CALLS = 10;

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

export const protocolValuation = new Hono<{ Variables: AppContext }>();

protocolValuation.post('/', async (c) => {
  const accountId = c.get('accountId') as string;
  const body = await c.req.json().catch(() => null);
  if (!body) return c.json({ error: 'Invalid JSON body' }, 400);

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return c.json({ error: 'Invalid request', details: parsed.error.flatten().fieldErrors }, 400);

  const q = parsed.data;
  const cacheWindow = new Date(Date.now() - config.TOKEN_TERMINAL_CACHE_TTL_MS);

  let projectIds: string[] = [];
  if (q.project_id) projectIds.push(q.project_id);
  if (q.peer_project_ids?.length) projectIds.push(...q.peer_project_ids);

  if (!projectIds.length && (q.symbol || q.token_address || q.sector)) {
    const rows = await db.select().from(tokenTerminalProjects).limit(200);
    projectIds = rows
      .filter((r) => (!q.symbol || (r.symbol || '').toLowerCase() === q.symbol!.toLowerCase())
        && (!q.sector || (r.marketSector || '').toLowerCase() === q.sector!.toLowerCase())
        && (!q.token_address || (r.tokenAddresses || []).map((x: string) => x.toLowerCase()).includes(q.token_address!.toLowerCase())))
      .map((r) => r.projectId);
  }

  const ids = Array.from(new Set(projectIds)).slice(0, 100);

  const snapshots = ids.length ? await safeSelectSnapshots(ids, cacheWindow) : [];

  const noData = snapshots.length === 0;
  const shouldLive = q.force_refresh || (noData && config.TOKEN_TERMINAL_WORKER_ENABLED);

  if (!shouldLive) {
    if (noData) {
      return c.json({ success: true, mode: q.mode, cache_status: 'no_data', code: 'unconfigured', message: 'No cached Token Terminal data. Enable worker and API key, or retry after sync.', provider: 'token_terminal', cost: 0 });
    }
    return formatResponse(q.mode, ids, snapshots, q.metrics, 'cache_fresh');
  }

  if (!config.TOKEN_TERMINAL_WORKER_ENABLED || !canCallTokenTerminal()) {
    return c.json({ success: true, mode: q.mode, cache_status: 'no_data', code: 'unconfigured', message: 'Token Terminal worker/API key is not configured', provider: 'token_terminal', cost: 0 });
  }

  const cost = getToolCost(TOOL, 0);
  const check = await checkCredits(accountId, cost);
  if (!check.hasCredits) return c.json({ error: 'Insufficient credits for live provider refresh' }, 402);

  const metrics = (q.metrics?.length ? q.metrics : String(config.TOKEN_TERMINAL_METRICS).split(',')).slice(0, MAX_LIVE_CALLS);
  const projects = ids.slice(0, config.TOKEN_TERMINAL_MAX_PROJECTS_PER_RUN);

  for (const metricId of metrics) {
    await fetchMetricData(metricId.trim(), { projectIds: projects });
  }

  const queue = getTokenTerminalQueue();
  await queue.add(JOB_REFRESH_FUNDAMENTALS, {}, { jobId: `tt:refresh:${Date.now()}` }).catch(() => undefined);
  await queue.add(JOB_COMPUTE_SNAPSHOTS, {}, { jobId: `tt:snap:${Date.now()}` }).catch(() => undefined);

  await deductToolCredits(accountId, TOOL, 0, 'Protocol valuation live refresh', q.session_id);

  const fresh = ids.length ? await safeSelectSnapshots(ids) : [];

  return formatResponse(q.mode, ids, fresh, q.metrics, 'live', cost);
});

function formatResponse(
  mode: 'project_snapshot' | 'valuation_matrix' | 'metric_timeseries',
  projectIds: string[],
  snapshots: any[],
  metrics?: string[],
  cacheStatus: 'cache_fresh' | 'live' | 'cache_stale' | 'no_data' = 'cache_fresh',
  cost = 0,
) {
  if (mode === 'project_snapshot') {
    const s = snapshots[0];
    return new Response(JSON.stringify({
      success: true,
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
      },
      risk_factors: s?.riskFactors ?? [],
      peer_percentiles: s?.peerPercentiles ?? {},
      source: 'token_terminal',
      provider: 'token_terminal',
      attribution: 'Powered by Token Terminal API',
      cache_status: cacheStatus,
      fetched_at: s?.fetchedAt ?? null,
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
      cost,
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }

  return new Response(JSON.stringify({
    success: true,
    mode,
    project_id: projectIds[0] ?? null,
    metric_ids: metrics ?? [],
    points: [],
    source: 'token_terminal',
    provider: 'token_terminal',
    attribution: 'Powered by Token Terminal API',
    cache_status: cacheStatus,
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
