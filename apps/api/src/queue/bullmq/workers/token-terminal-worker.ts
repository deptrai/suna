import { Queue, Worker, Job } from 'bullmq';
import { and, desc, eq, inArray, lt } from 'drizzle-orm';
import { redisConnection } from '../connection';
import { db } from '../../../shared/db';
import {
  tokenTerminalMetrics,
  tokenTerminalProjectMetrics,
  tokenTerminalProjects,
  tokenTerminalValuationSnapshots,
} from '@epsilon/db';
import { config } from '../../../config';
import { logger } from '../../../lib/logger';
import {
  canCallTokenTerminal,
  fetchMetricData,
  fetchTokenTerminalMetrics,
  fetchTokenTerminalProjects,
  sanitizeTokenTerminalError,
  logTokenTerminalSkip,
} from '../../../router/services/token-terminal';
import { buildSnapshot, classifyAgainstPeers, type SectorPeer } from '../../../router/services/token-terminal-normalize';

export const QUEUE_NAME = 'token-terminal-fundamentals';
export const JOB_REFRESH_METADATA = 'refresh-token-terminal-metadata';
export const JOB_REFRESH_FUNDAMENTALS = 'refresh-protocol-fundamentals';
export const JOB_COMPUTE_SNAPSHOTS = 'compute-valuation-snapshots';
export const JOB_CLEANUP_CACHE = 'cleanup-token-terminal-cache';

const METADATA_SCHEDULER_ID = 'tt-refresh-metadata-daily';
const FUNDAMENTALS_SCHEDULER_ID = 'tt-refresh-fundamentals-daily';
const SNAPSHOT_SCHEDULER_ID = 'tt-compute-snapshots-daily';
const CLEANUP_SCHEDULER_ID = 'tt-cleanup-daily';
const SNAPSHOT_RETENTION_MS = 90 * 24 * 3_600_000;
const PERIOD_FALLBACK_DAYS = 30;
const PERIOD_DAY_MS = 24 * 3_600_000;

let _queue: Queue | null = null;
let _worker: Worker | null = null;

export function getTokenTerminalQueue(): Queue {
  if (!_queue) {
    _queue = new Queue(QUEUE_NAME, {
      connection: redisConnection,
      defaultJobOptions: { removeOnComplete: { count: 20 }, removeOnFail: { count: 50 }, attempts: 1 },
    });
  }
  return _queue;
}

function projectAllowlist(): string[] {
  return String(config.TOKEN_TERMINAL_PROJECTS || '').split(',').map((x) => x.trim()).filter(Boolean);
}

function metricAllowlist(): string[] {
  return String(config.TOKEN_TERMINAL_METRICS || '').split(',').map((x) => x.trim()).filter(Boolean);
}

async function processMetadata(): Promise<void> {
  const [metrics, projects] = await Promise.allSettled([
    fetchTokenTerminalMetrics(),
    fetchTokenTerminalProjects(),
  ]);

  if (metrics.status === 'fulfilled') {
    for (const row of metrics.value) {
      try {
        await db.insert(tokenTerminalMetrics).values({
          metricId: row.metricId,
          metricName: row.metricName || row.metricId,
          description: row.description ?? null,
          url: row.url ?? null,
          metadata: row.metadata ?? {},
        }).onConflictDoUpdate({
          target: [tokenTerminalMetrics.metricId],
          set: { metricName: row.metricName || row.metricId, description: row.description ?? null, url: row.url ?? null, metadata: row.metadata ?? {}, updatedAt: new Date(), fetchedAt: new Date() },
        } as any);
      } catch (err) {
        logger.warn('[token-terminal-worker] metadata metric upsert failed', { metricId: row.metricId, error: sanitizeTokenTerminalError(err) });
      }
    }
  } else {
    logger.warn('[token-terminal-worker] fetchTokenTerminalMetrics failed', { error: sanitizeTokenTerminalError(metrics.reason) });
  }

  if (projects.status === 'fulfilled') {
    for (const row of projects.value) {
      try {
        await db.insert(tokenTerminalProjects).values({
          projectId: row.projectId,
          projectName: row.projectName || row.projectId,
          symbol: row.symbol ?? null,
          marketSector: row.marketSector ?? null,
          websiteUrl: row.websiteUrl ?? null,
          tokenAddresses: (row.tokenAddresses ?? []).filter((x): x is string => typeof x === 'string'),
          metadata: row.metadata ?? {},
        }).onConflictDoUpdate({
          target: [tokenTerminalProjects.projectId],
          set: { projectName: row.projectName || row.projectId, symbol: row.symbol ?? null, marketSector: row.marketSector ?? null, websiteUrl: row.websiteUrl ?? null, tokenAddresses: (row.tokenAddresses ?? []).filter((x): x is string => typeof x === 'string'), metadata: row.metadata ?? {}, updatedAt: new Date(), fetchedAt: new Date() },
        } as any);
      } catch (err) {
        logger.warn('[token-terminal-worker] metadata project upsert failed', { projectId: row.projectId, error: sanitizeTokenTerminalError(err) });
      }
    }
  } else {
    logger.warn('[token-terminal-worker] fetchTokenTerminalProjects failed', { error: sanitizeTokenTerminalError(projects.reason) });
  }
}

async function processFundamentals(): Promise<void> {
  const projects = projectAllowlist().slice(0, config.TOKEN_TERMINAL_MAX_PROJECTS_PER_RUN);
  const metrics = metricAllowlist();
  if (!projects.length || !metrics.length) return;

  for (const metricId of metrics) {
    let rows: Awaited<ReturnType<typeof fetchMetricData>> = [];
    try {
      rows = await fetchMetricData(metricId, { projectIds: projects });
    } catch (err) {
      logger.warn('[token-terminal-worker] fetchMetricData failed', { metricId, error: sanitizeTokenTerminalError(err) });
      continue;
    }

    if (!rows.length) continue;

    await Promise.allSettled(rows.map((r) => db.insert(tokenTerminalProjectMetrics).values({
      projectId: r.projectId,
      projectName: r.projectName ?? null,
      metricId: r.metricId,
      metricName: r.metricName ?? null,
      timestamp: new Date(r.timestamp),
      value: r.value === null ? null : String(r.value),
      rawValue: r.rawValue,
    }).onConflictDoUpdate({
      target: [tokenTerminalProjectMetrics.projectId, tokenTerminalProjectMetrics.metricId, tokenTerminalProjectMetrics.timestamp, tokenTerminalProjectMetrics.source],
      set: { value: r.value === null ? null : String(r.value), rawValue: r.rawValue, fetchedAt: new Date(), updatedAt: new Date() },
    } as any)));
  }
}

interface LatestMetric { value: number | null; timestamp: Date }

async function detectPeriodDays(projectId: string, metricId: string): Promise<number> {
  const rows = await db.select({ timestamp: tokenTerminalProjectMetrics.timestamp })
    .from(tokenTerminalProjectMetrics)
    .where(and(eq(tokenTerminalProjectMetrics.projectId, projectId), eq(tokenTerminalProjectMetrics.metricId, metricId)))
    .orderBy(desc(tokenTerminalProjectMetrics.timestamp))
    .limit(2);
  if (rows.length < 2) return PERIOD_FALLBACK_DAYS;
  const t1 = new Date(rows[0]!.timestamp as unknown as string).getTime();
  const t2 = new Date(rows[1]!.timestamp as unknown as string).getTime();
  if (!Number.isFinite(t1) || !Number.isFinite(t2)) return PERIOD_FALLBACK_DAYS;
  const days = Math.round(Math.abs(t1 - t2) / PERIOD_DAY_MS);
  return days >= 1 && days <= 365 ? days : PERIOD_FALLBACK_DAYS;
}

async function processSnapshots(): Promise<void> {
  const allowlist = projectAllowlist();
  const metrics = metricAllowlist();
  if (!metrics.length) {
    logger.info('[token-terminal-worker] processSnapshots skipped: empty metric allowlist');
    return;
  }

  const projectsQuery = db.select().from(tokenTerminalProjects);
  const projectRows = allowlist.length
    ? await projectsQuery.where(inArray(tokenTerminalProjects.projectId, allowlist)).limit(config.TOKEN_TERMINAL_MAX_PROJECTS_PER_RUN)
    : await projectsQuery.limit(config.TOKEN_TERMINAL_MAX_PROJECTS_PER_RUN);

  if (!projectRows.length) return;

  // First pass: compute per-project snapshot drafts (no peer comparison yet).
  const drafts: Array<{ project: typeof projectRows[number]; snap: ReturnType<typeof buildSnapshot> }> = [];

  for (const p of projectRows) {
    const rows = await db.select().from(tokenTerminalProjectMetrics)
      .where(and(eq(tokenTerminalProjectMetrics.projectId, p.projectId), inArray(tokenTerminalProjectMetrics.metricId, metrics)))
      .orderBy(desc(tokenTerminalProjectMetrics.timestamp))
      .limit(500);

    const latest: Record<string, LatestMetric> = {};
    for (const m of rows) {
      const num = m.value === null ? null : Number(m.value);
      const safeNum = num !== null && Number.isFinite(num) ? num : null;
      if (!(m.metricId in latest)) latest[m.metricId] = { value: safeNum, timestamp: m.timestamp as unknown as Date };
    }

    const values: Record<string, number | null> = {};
    for (const k of Object.keys(latest)) values[k] = latest[k]!.value;

    // Detect period using fees/revenue/earnings (the metrics that actually need annualization).
    let periodDays = PERIOD_FALLBACK_DAYS;
    const periodMetric = ['fees', 'revenue', 'earnings'].find((m) => metrics.includes(m));
    if (periodMetric) periodDays = await detectPeriodDays(p.projectId, periodMetric);

    const snap = buildSnapshot({
      projectId: p.projectId,
      projectName: p.projectName,
      symbol: p.symbol,
      sector: p.marketSector,
      values,
      periodDays,
    });
    drafts.push({ project: p, snap });
  }

  // Group by sector for percentile peer comparison.
  const bySector = new Map<string, SectorPeer[]>();
  for (const d of drafts) {
    const sector = d.project.marketSector || '_unknown';
    const arr = bySector.get(sector) ?? [];
    arr.push({ projectId: d.snap.projectId, psRatioFullyDiluted: d.snap.psRatioFullyDiluted, pfRatioFullyDiluted: d.snap.pfRatioFullyDiluted, peRatio: d.snap.peRatio });
    bySector.set(sector, arr);
  }

  const periodEnd = new Date();
  const periodStart = new Date(Date.now() - 30 * PERIOD_DAY_MS);

  // Second pass: classify against peers + persist with full upsert.
  for (const d of drafts) {
    const sector = d.project.marketSector || '_unknown';
    const peers = (bySector.get(sector) ?? []).filter((peer) => peer.projectId !== d.snap.projectId);
    const { valuationSignal, peerPercentiles } = classifyAgainstPeers(
      { psRatioFullyDiluted: d.snap.psRatioFullyDiluted, pfRatioFullyDiluted: d.snap.pfRatioFullyDiluted, peRatio: d.snap.peRatio },
      peers,
    );

    const finalSignal = peers.length === 0 && valuationSignal === 'insufficient_data' ? 'unknown' : valuationSignal;

    const row = {
      projectId: d.snap.projectId,
      projectName: d.snap.projectName,
      symbol: d.snap.symbol,
      sector: d.snap.sector,
      feesAnnualizedUsd: d.snap.feesAnnualizedUsd === null ? null : String(d.snap.feesAnnualizedUsd),
      revenueAnnualizedUsd: d.snap.revenueAnnualizedUsd === null ? null : String(d.snap.revenueAnnualizedUsd),
      earningsAnnualizedUsd: d.snap.earningsAnnualizedUsd === null ? null : String(d.snap.earningsAnnualizedUsd),
      marketCapFullyDilutedUsd: d.snap.marketCapFullyDilutedUsd === null ? null : String(d.snap.marketCapFullyDilutedUsd),
      marketCapCirculatingUsd: d.snap.marketCapCirculatingUsd === null ? null : String(d.snap.marketCapCirculatingUsd),
      psRatioFullyDiluted: d.snap.psRatioFullyDiluted === null ? null : String(d.snap.psRatioFullyDiluted),
      psRatioCirculating: d.snap.psRatioCirculating === null ? null : String(d.snap.psRatioCirculating),
      pfRatioFullyDiluted: d.snap.pfRatioFullyDiluted === null ? null : String(d.snap.pfRatioFullyDiluted),
      pfRatioCirculating: d.snap.pfRatioCirculating === null ? null : String(d.snap.pfRatioCirculating),
      peRatio: d.snap.peRatio === null ? null : String(d.snap.peRatio),
      userDau: d.snap.userDau === null ? null : Math.trunc(d.snap.userDau),
      activeDevelopers: d.snap.activeDevelopers === null ? null : Math.trunc(d.snap.activeDevelopers),
      codeCommits: d.snap.codeCommits === null ? null : Math.trunc(d.snap.codeCommits),
      valuationSignal: finalSignal,
      peerPercentiles,
      riskFactors: d.snap.riskFactors,
      periodStart,
      periodEnd,
    };

    await db.insert(tokenTerminalValuationSnapshots).values(row).onConflictDoUpdate({
      target: [tokenTerminalValuationSnapshots.projectId, tokenTerminalValuationSnapshots.periodEnd, tokenTerminalValuationSnapshots.source],
      set: {
        projectName: row.projectName,
        symbol: row.symbol,
        sector: row.sector,
        feesAnnualizedUsd: row.feesAnnualizedUsd,
        revenueAnnualizedUsd: row.revenueAnnualizedUsd,
        earningsAnnualizedUsd: row.earningsAnnualizedUsd,
        marketCapFullyDilutedUsd: row.marketCapFullyDilutedUsd,
        marketCapCirculatingUsd: row.marketCapCirculatingUsd,
        psRatioFullyDiluted: row.psRatioFullyDiluted,
        psRatioCirculating: row.psRatioCirculating,
        pfRatioFullyDiluted: row.pfRatioFullyDiluted,
        pfRatioCirculating: row.pfRatioCirculating,
        peRatio: row.peRatio,
        userDau: row.userDau,
        activeDevelopers: row.activeDevelopers,
        codeCommits: row.codeCommits,
        valuationSignal: finalSignal,
        peerPercentiles,
        riskFactors: row.riskFactors,
        periodStart,
        updatedAt: new Date(),
        fetchedAt: new Date(),
      },
    } as any);
  }
}

async function processCleanup(): Promise<void> {
  const expireMetricsAt = new Date(Date.now() - Math.max(config.TOKEN_TERMINAL_CACHE_TTL_MS, 86_400_000 * 3));
  await db.delete(tokenTerminalProjectMetrics).where(lt(tokenTerminalProjectMetrics.timestamp, expireMetricsAt));
  const expireSnapshotsAt = new Date(Date.now() - SNAPSHOT_RETENTION_MS);
  await db.delete(tokenTerminalValuationSnapshots).where(lt(tokenTerminalValuationSnapshots.periodEnd, expireSnapshotsAt));
}

async function processor(job: Job): Promise<void> {
  if (job.name === JOB_REFRESH_METADATA) return processMetadata();
  if (job.name === JOB_REFRESH_FUNDAMENTALS) return processFundamentals();
  if (job.name === JOB_COMPUTE_SNAPSHOTS) return processSnapshots();
  if (job.name === JOB_CLEANUP_CACHE) return processCleanup();
}

export function startTokenTerminalWorker(): void {
  if (_worker) return;
  if (!config.TOKEN_TERMINAL_WORKER_ENABLED) return logTokenTerminalSkip('TOKEN_TERMINAL_WORKER_ENABLED=false');
  if (!canCallTokenTerminal()) return logTokenTerminalSkip('TOKEN_TERMINAL_API_KEY missing');

  _worker = new Worker(QUEUE_NAME, async (job) => {
    try {
      await processor(job);
    } catch (err) {
      logger.warn('[token-terminal-worker] job failed', { job: job.name, error: sanitizeTokenTerminalError(err) });
      throw err;
    }
  }, { connection: redisConnection, concurrency: Math.max(1, config.TOKEN_TERMINAL_WORKER_CONCURRENCY) });
}

export async function setupTokenTerminalJobs(): Promise<void> {
  if (!config.TOKEN_TERMINAL_WORKER_ENABLED || !canCallTokenTerminal()) {
    logTokenTerminalSkip('setupTokenTerminalJobs skipped (worker disabled or key missing)');
    return;
  }

  const q = getTokenTerminalQueue();
  const every = Math.max(config.TOKEN_TERMINAL_SYNC_INTERVAL_MS, 3_600_000);
  const upsert = (q as any).upsertJobScheduler?.bind(q);
  if (!upsert) {
    throw new Error('BullMQ Queue.upsertJobScheduler is unavailable; upgrade BullMQ to >=5.4 (Story 2.3.2 AC5).');
  }
  await upsert(METADATA_SCHEDULER_ID, { every }, { name: JOB_REFRESH_METADATA });
  await upsert(FUNDAMENTALS_SCHEDULER_ID, { every }, { name: JOB_REFRESH_FUNDAMENTALS });
  await upsert(SNAPSHOT_SCHEDULER_ID, { every }, { name: JOB_COMPUTE_SNAPSHOTS });
  await upsert(CLEANUP_SCHEDULER_ID, { every: 86_400_000 }, { name: JOB_CLEANUP_CACHE });
}

export async function stopTokenTerminalWorker(): Promise<void> {
  if (_worker) {
    await _worker.close();
    _worker = null;
  }
  if (_queue) {
    await _queue.close();
    _queue = null;
  }
}
