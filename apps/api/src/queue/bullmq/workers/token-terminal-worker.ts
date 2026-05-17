import { Queue, Worker, Job } from 'bullmq';
import { and, eq, inArray, lt } from 'drizzle-orm';
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
import { buildSnapshot } from '../../../router/services/token-terminal-normalize';

export const QUEUE_NAME = 'token-terminal-fundamentals';
export const JOB_REFRESH_METADATA = 'refresh-token-terminal-metadata';
export const JOB_REFRESH_FUNDAMENTALS = 'refresh-protocol-fundamentals';
export const JOB_COMPUTE_SNAPSHOTS = 'compute-valuation-snapshots';
export const JOB_CLEANUP_CACHE = 'cleanup-token-terminal-cache';

const METADATA_SCHEDULER_ID = 'tt-refresh-metadata-daily';
const FUNDAMENTALS_SCHEDULER_ID = 'tt-refresh-fundamentals-daily';
const SNAPSHOT_SCHEDULER_ID = 'tt-compute-snapshots-daily';
const CLEANUP_SCHEDULER_ID = 'tt-cleanup-daily';

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
    }
  }

  if (projects.status === 'fulfilled') {
    for (const row of projects.value) {
      await db.insert(tokenTerminalProjects).values({
        projectId: row.projectId,
        projectName: row.projectName || row.projectId,
        symbol: row.symbol ?? null,
        marketSector: row.marketSector ?? null,
        websiteUrl: row.websiteUrl ?? null,
        tokenAddresses: row.tokenAddresses ?? [],
        metadata: row.metadata ?? {},
      }).onConflictDoUpdate({
        target: [tokenTerminalProjects.projectId],
        set: { projectName: row.projectName || row.projectId, symbol: row.symbol ?? null, marketSector: row.marketSector ?? null, websiteUrl: row.websiteUrl ?? null, tokenAddresses: row.tokenAddresses ?? [], metadata: row.metadata ?? {}, updatedAt: new Date(), fetchedAt: new Date() },
      } as any);
    }
  }
}

async function processFundamentals(): Promise<void> {
  const projects = projectAllowlist().slice(0, config.TOKEN_TERMINAL_MAX_PROJECTS_PER_RUN);
  const metrics = metricAllowlist();
  if (!projects.length || !metrics.length) return;

  for (const metricId of metrics) {
    const rows = await fetchMetricData(metricId, { projectIds: projects });
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

async function processSnapshots(): Promise<void> {
  const projects = await db.select().from(tokenTerminalProjects).limit(config.TOKEN_TERMINAL_MAX_PROJECTS_PER_RUN);
  const metrics = metricAllowlist();

  for (const p of projects) {
    const rows = await db.select().from(tokenTerminalProjectMetrics)
      .where(and(eq(tokenTerminalProjectMetrics.projectId, p.projectId), inArray(tokenTerminalProjectMetrics.metricId, metrics)))
      .limit(500);

    const latest: Record<string, number | null> = {};
    for (const m of rows) {
      if (!(m.metricId in latest)) latest[m.metricId] = m.value === null ? null : Number(m.value);
    }

    const snap = buildSnapshot({ projectId: p.projectId, projectName: p.projectName, symbol: p.symbol, sector: p.marketSector, values: latest });
    await db.insert(tokenTerminalValuationSnapshots).values({
      projectId: snap.projectId,
      projectName: snap.projectName,
      symbol: snap.symbol,
      sector: snap.sector,
      feesAnnualizedUsd: snap.feesAnnualizedUsd === null ? null : String(snap.feesAnnualizedUsd),
      revenueAnnualizedUsd: snap.revenueAnnualizedUsd === null ? null : String(snap.revenueAnnualizedUsd),
      earningsAnnualizedUsd: snap.earningsAnnualizedUsd === null ? null : String(snap.earningsAnnualizedUsd),
      marketCapFullyDilutedUsd: snap.marketCapFullyDilutedUsd === null ? null : String(snap.marketCapFullyDilutedUsd),
      marketCapCirculatingUsd: snap.marketCapCirculatingUsd === null ? null : String(snap.marketCapCirculatingUsd),
      psRatioFullyDiluted: snap.psRatioFullyDiluted === null ? null : String(snap.psRatioFullyDiluted),
      psRatioCirculating: snap.psRatioCirculating === null ? null : String(snap.psRatioCirculating),
      pfRatioFullyDiluted: snap.pfRatioFullyDiluted === null ? null : String(snap.pfRatioFullyDiluted),
      pfRatioCirculating: snap.pfRatioCirculating === null ? null : String(snap.pfRatioCirculating),
      peRatio: snap.peRatio === null ? null : String(snap.peRatio),
      userDau: snap.userDau === null ? null : Math.trunc(snap.userDau),
      activeDevelopers: snap.activeDevelopers === null ? null : Math.trunc(snap.activeDevelopers),
      codeCommits: snap.codeCommits === null ? null : Math.trunc(snap.codeCommits),
      valuationSignal: snap.valuationSignal,
      peerPercentiles: {},
      riskFactors: snap.riskFactors,
      periodEnd: new Date(),
      periodStart: new Date(Date.now() - 30 * 24 * 3_600_000),
    }).onConflictDoUpdate({
      target: [tokenTerminalValuationSnapshots.projectId, tokenTerminalValuationSnapshots.periodEnd, tokenTerminalValuationSnapshots.source],
      set: { valuationSignal: snap.valuationSignal, riskFactors: snap.riskFactors, updatedAt: new Date(), fetchedAt: new Date() },
    } as any);
  }
}

async function processCleanup(): Promise<void> {
  const expireAt = new Date(Date.now() - Math.max(config.TOKEN_TERMINAL_CACHE_TTL_MS, 86_400_000 * 3));
  await db.delete(tokenTerminalProjectMetrics).where(lt(tokenTerminalProjectMetrics.timestamp, expireAt));
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
  const q = getTokenTerminalQueue();
  const every = Math.max(config.TOKEN_TERMINAL_SYNC_INTERVAL_MS, 3_600_000);
  const upsert = (q as any).upsertJobScheduler?.bind(q);
  if (upsert) {
    await upsert(METADATA_SCHEDULER_ID, { every }, { name: JOB_REFRESH_METADATA });
    await upsert(FUNDAMENTALS_SCHEDULER_ID, { every }, { name: JOB_REFRESH_FUNDAMENTALS });
    await upsert(SNAPSHOT_SCHEDULER_ID, { every }, { name: JOB_COMPUTE_SNAPSHOTS });
    await upsert(CLEANUP_SCHEDULER_ID, { every: 86_400_000 }, { name: JOB_CLEANUP_CACHE });
    return;
  }
  // Backward-compatible fallback for older BullMQ API in tests/runtime.
  await q.add(JOB_REFRESH_METADATA, {}, { jobId: METADATA_SCHEDULER_ID });
  await q.add(JOB_REFRESH_FUNDAMENTALS, {}, { jobId: FUNDAMENTALS_SCHEDULER_ID });
  await q.add(JOB_COMPUTE_SNAPSHOTS, {}, { jobId: SNAPSHOT_SCHEDULER_ID });
  await q.add(JOB_CLEANUP_CACHE, {}, { jobId: CLEANUP_SCHEDULER_ID });
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
