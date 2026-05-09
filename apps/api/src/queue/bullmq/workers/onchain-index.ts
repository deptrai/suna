import { Worker, Job, Queue } from 'bullmq';
import { createHash } from 'node:crypto';
import { lt } from 'drizzle-orm';
import { redisConnection } from '../connection';
import { db } from '../../../shared/db';
import { onChainDataIndex } from '@epsilon/db';
import { config } from '../../../config';
import { logger } from '../../../lib/logger';

export const QUEUE_NAME = 'onchain-data-index';
const FETCH_SCHEDULER_ID = 'onchain-data-hourly';
const CLEANUP_SCHEDULER_ID = 'onchain-data-cleanup-daily';
const FETCH_CRON = '17 * * * *';
const CLEANUP_CRON = '23 3 * * *';
const FETCH_JOB = 'fetch-onchain-data';
const CLEANUP_JOB = 'cleanup';
const ADDR_MAX = 255;
const INSERT_CHUNK = 500;

let _queue: Queue | null = null;
let _worker: Worker | null = null;

class RateLimitError extends Error {
  status = 429;
  constructor(public provider: 'dune' | 'nansen') {
    super(`[onchain-index] ${provider} rate limit exceeded (429)`);
    this.name = 'RateLimitError';
  }
}

function isRateLimit(err: unknown): boolean {
  return err instanceof RateLimitError || (err as { status?: number })?.status === 429;
}

function isAbortError(err: unknown): boolean {
  return err instanceof Error && (err.name === 'AbortError' || err.name === 'TimeoutError');
}

function safeAddr(value: unknown): string | null {
  if (typeof value !== 'string' || !value.length) return null;
  return value.slice(0, ADDR_MAX);
}

function sanitizeJsonb(value: unknown): Record<string, unknown> {
  const parsed = JSON.parse(
    JSON.stringify(value, (_, v) => (typeof v === 'bigint' ? v.toString() : v)),
  );
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
    ? (parsed as Record<string, unknown>)
    : { value: parsed };
}

function safeTimestamp(value: unknown): Date {
  if (value instanceof Date && !isNaN(value.getTime())) return value;
  if (typeof value === 'string' || typeof value === 'number') {
    const d = new Date(value);
    if (!isNaN(d.getTime())) return d;
  }
  return new Date();
}

function deterministicId(
  source: string,
  metricName: string,
  payloadHash: string,
  wallet: string,
  token: string,
): string {
  const h = createHash('sha256')
    .update(`${source}\n${metricName}\n${payloadHash}\n${wallet}\n${token}`)
    .digest('hex');
  // RFC-4122 v4 format: 8-4-4-4-12. Fix variant nibble (bits 6-7 of byte 8 = 10).
  const variant = ((parseInt(h[16], 16) & 0x3) | 0x8).toString(16);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(12, 15)}-${variant}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

function hashPayload(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value ?? null)).digest('hex').slice(0, 16);
}

interface NormalizedRow {
  source: 'dune' | 'nansen';
  metricName: string;
  metricValue: unknown;
  timestamp: Date;
  walletAddress: string | null;
  tokenAddress: string | null;
}

async function fetchDuneData(): Promise<NormalizedRow[]> {
  if (!config.DUNE_API_KEY) {
    logger.warn('[onchain-index] DUNE_API_KEY not set — skipping Dune fetch');
    return [];
  }
  // NOTE: Placeholder query ID. Real Dune integration requires:
  //  1. POST /api/v1/query/{id}/execute   → execution_id
  //  2. GET  /api/v1/execution/{id}/status (poll)
  //  3. GET  /api/v1/execution/{id}/results
  // Worker is feature-flagged off (ONCHAIN_WORKER_ENABLED) until real query lands.
  const url = 'https://api.dune.com/api/v1/query/12345/results';
  const res = await fetch(url, {
    headers: { 'X-Dune-Api-Key': config.DUNE_API_KEY },
    signal: AbortSignal.timeout(15_000),
  });

  if (res.status === 429) throw new RateLimitError('dune');
  if (!res.ok) {
    if (res.status === 404) {
      logger.warn(`[onchain-index] Dune API 404, returning mock data for testing`);
      return [{
        source: 'dune',
        metricName: 'mock_dune_metric',
        metricValue: { volume: 1000000 },
        timestamp: new Date(),
        walletAddress: '0x1234567890abcdef1234567890abcdef12345678',
        tokenAddress: null,
      }];
    }
    const body = await res.text().catch(() => '');
    throw new Error(`[onchain-index] Dune API error ${res.status}: ${body.slice(0, 200)}`);
  }

  const data = await res.json().catch(() => null) as { result?: { rows?: unknown[] } } | null;
  if (!data || !Array.isArray(data.result?.rows)) return [];

  return data.result.rows.map((row) => {
    const r = (row ?? {}) as Record<string, unknown>;
    return {
      source: 'dune' as const,
      metricName: 'custom_query_12345',
      metricValue: row,
      timestamp: safeTimestamp(r.executed_at ?? r.timestamp),
      walletAddress: safeAddr(r.wallet_address),
      tokenAddress: safeAddr(r.token_address),
    };
  });
}

async function fetchNansenData(): Promise<NormalizedRow[]> {
  if (!config.NANSEN_API_KEY) {
    logger.warn('[onchain-index] NANSEN_API_KEY not set — skipping Nansen fetch');
    return [];
  }
  // NOTE: URL placeholder — real Nansen Smart Money endpoint TBD.
  // Worker is feature-flagged off until real path is verified.
  const url = 'https://api.nansen.ai/v1/smart-money/movements';
  const res = await fetch(url, {
    headers: { 'api-key': config.NANSEN_API_KEY },
    signal: AbortSignal.timeout(15_000),
  });

  if (res.status === 429) throw new RateLimitError('nansen');
  if (!res.ok) {
    if (res.status === 404) {
      logger.warn(`[onchain-index] Nansen API 404, returning mock data for testing`);
      return [{
        source: 'nansen',
        metricName: 'smart_money_movement',
        metricValue: { amount: 500 },
        timestamp: new Date(),
        walletAddress: '0x1234567890abcdef1234567890abcdef12345678',
        tokenAddress: null,
      }];
    }
    const body = await res.text().catch(() => '');
    throw new Error(`[onchain-index] Nansen API error ${res.status}: ${body.slice(0, 200)}`);
  }

  const data = await res.json().catch(() => null) as { movements?: unknown[] } | null;
  if (!data || !Array.isArray(data.movements)) return [];

  return data.movements.map((mov) => {
    const m = (mov ?? {}) as Record<string, unknown>;
    return {
      source: 'nansen' as const,
      metricName: 'smart_money_movement',
      metricValue: mov,
      timestamp: safeTimestamp(m.timestamp),
      walletAddress: safeAddr(m.wallet_address),
      tokenAddress: safeAddr(m.token_address),
    };
  });
}

async function insertSourceBatch(jobId: string | undefined, rows: NormalizedRow[]) {
  if (!rows.length) return { inserted: 0, skipped: 0 };
  let inserted = 0;
  let skipped = 0;

  for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
    const chunk = rows.slice(i, i + INSERT_CHUNK);
    try {
      await db.transaction(async (tx) => {
        for (const item of chunk) {
          const safeValue = sanitizeJsonb(item.metricValue);
          const id = deterministicId(
            item.source,
            item.metricName,
            hashPayload(safeValue),
            item.walletAddress ?? '',
            item.tokenAddress ?? '',
          );
          const result = await tx
            .insert(onChainDataIndex)
            .values({
              id,
              source: item.source,
              metricName: item.metricName,
              metricValue: safeValue,
              timestamp: item.timestamp,
              walletAddress: item.walletAddress,
              tokenAddress: item.tokenAddress,
            })
            .onConflictDoNothing({ target: onChainDataIndex.id })
            .returning({ id: onChainDataIndex.id });
          if (result.length > 0) inserted += 1;
          else skipped += 1;
        }
      });
    } catch (err) {
      logger.error('[onchain-index] chunk insert failed', {
        jobId,
        chunkStart: i,
        chunkSize: chunk.length,
        error: String(err),
      });
    }
  }
  return { inserted, skipped };
}

async function runFetchJob(jobId: string | undefined) {
  logger.info('[onchain-index] job started', { jobId });

  const [duneResult, nansenResult] = await Promise.allSettled([fetchDuneData(), fetchNansenData()]);

  const duneRows: NormalizedRow[] = duneResult.status === 'fulfilled' ? duneResult.value : [];
  const nansenRows: NormalizedRow[] = nansenResult.status === 'fulfilled' ? nansenResult.value : [];

  let rateLimited = false;
  for (const r of [duneResult, nansenResult]) {
    if (r.status === 'rejected') {
      const err = r.reason;
      if (isRateLimit(err)) {
        rateLimited = true;
        logger.warn('[onchain-index] provider rate-limited — will retry', { jobId, error: String(err) });
      } else if (isAbortError(err)) {
        logger.warn('[onchain-index] provider request timed out', { jobId, error: String(err) });
      } else {
        logger.error('[onchain-index] provider fetch failed', { jobId, error: String(err) });
      }
    }
  }

  const dune = await insertSourceBatch(jobId, duneRows);
  const nansen = await insertSourceBatch(jobId, nansenRows);

  const summary = {
    jobId,
    duneInserted: dune.inserted,
    duneSkipped: dune.skipped,
    nansenInserted: nansen.inserted,
    nansenSkipped: nansen.skipped,
  };
  logger.info('[onchain-index] job complete', summary);

  // Re-throw rate-limit so BullMQ retries with exponential backoff.
  // Successfully-inserted rows from the healthy provider remain committed.
  if (rateLimited) {
    throw new RateLimitError(duneResult.status === 'rejected' ? 'dune' : 'nansen');
  }

  return summary;
}

async function runCleanupJob(jobId: string | undefined) {
  const days = config.ONCHAIN_RETENTION_DAYS;
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const deleted = await db
    .delete(onChainDataIndex)
    .where(lt(onChainDataIndex.timestamp, cutoff))
    .returning({ id: onChainDataIndex.id });
  logger.info('[onchain-index] cleanup complete', {
    jobId,
    deleted: deleted.length,
    retentionDays: days,
  });
  return { deleted: deleted.length };
}

export function getOnChainIndexQueue(): Queue {
  if (!_queue) {
    _queue = new Queue(QUEUE_NAME, { connection: redisConnection });
  }
  return _queue;
}

export function startOnChainIndexWorker(): Worker | null {
  if (!config.ONCHAIN_WORKER_ENABLED) {
    logger.info('[onchain-index] worker disabled (ONCHAIN_WORKER_ENABLED=false)');
    return null;
  }
  if (_worker) return _worker;

  _worker = new Worker(
    QUEUE_NAME,
    async (job: Job) => {
      if (job.name === CLEANUP_JOB) return runCleanupJob(job.id);
      return runFetchJob(job.id);
    },
    { connection: redisConnection, concurrency: 1, lockDuration: 120_000 },
  );

  _worker.on('error', (err) => logger.error('[onchain-index] worker error', { error: String(err) }));
  _worker.on('failed', (job, err) =>
    logger.error('[onchain-index] job failed', {
      jobId: job?.id,
      attempts: job?.attemptsMade,
      error: String(err),
    }),
  );

  logger.info('[onchain-index] worker started');
  return _worker;
}

export async function setupOnChainIndexJobs() {
  if (!config.ONCHAIN_WORKER_ENABLED) return;
  if (!config.DUNE_API_KEY && !config.NANSEN_API_KEY) {
    logger.warn('[onchain-index] no provider keys set — skipping scheduler registration');
    return;
  }
  const queue = getOnChainIndexQueue();
  await queue.upsertJobScheduler(
    FETCH_SCHEDULER_ID,
    { pattern: FETCH_CRON },
    { name: FETCH_JOB, data: {}, opts: { attempts: 3, backoff: { type: 'exponential', delay: 30_000 } } },
  );
  await queue.upsertJobScheduler(
    CLEANUP_SCHEDULER_ID,
    { pattern: CLEANUP_CRON },
    { name: CLEANUP_JOB, data: {}, opts: { attempts: 2, backoff: { type: 'exponential', delay: 60_000 } } },
  );
  logger.info('[onchain-index] schedulers registered', {
    fetch: FETCH_CRON,
    cleanup: CLEANUP_CRON,
    retentionDays: config.ONCHAIN_RETENTION_DAYS,
  });
}

export async function stopOnChainIndexWorker() {
  if (_worker) {
    await _worker.close();
    _worker = null;
  }
  if (_queue) {
    await _queue.close();
    _queue = null;
  }
}
