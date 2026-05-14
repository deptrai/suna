import { Worker, Job, Queue } from 'bullmq';
import { eq } from 'drizzle-orm';
import { redisConnection } from '../connection';
import { db } from '../../../shared/db';
import { protocolWatchlist, protocolTvlSnapshots } from '@epsilon/db';
import { config } from '../../../config';
import { logger } from '../../../lib/logger';
import { fetchProtocolSnapshot } from '../../../router/services/defillama';

export const QUEUE_NAME = 'crypto-data-sync';
const SCHEDULER_ID = 'sync-protocol-tvl';
const JOB_NAME = 'fetch-protocol-tvl';

const TVL_MAX = 1e15;
const APY_MAX = 1e6;
const FETCH_TIMEOUT_MS = 30_000;

let _queue: Queue | null = null;
let _worker: Worker | null = null;

function clampNumeric(value: number | null | undefined, max: number): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  const sign = value < 0 ? -1 : 1;
  return sign * Math.min(Math.abs(value), max);
}

async function processJob(jobId: string | undefined) {
  const start = Date.now();
  logger.info('[crypto-worker] job started', { jobId });

  const protocols = await db
    .select({ slug: protocolWatchlist.slug })
    .from(protocolWatchlist)
    .where(eq(protocolWatchlist.active, true));

  let successCount = 0;
  for (const { slug } of protocols) {
    try {
      const snapshot = await fetchProtocolSnapshot(slug, { timeoutMs: FETCH_TIMEOUT_MS });

      const tvlUsd = clampNumeric(snapshot.tvl_usd, TVL_MAX);
      if (tvlUsd == null || tvlUsd <= 0) {
        logger.warn('[crypto-worker] skipping slug with invalid tvl', { slug, tvl: snapshot.tvl_usd });
        continue;
      }

      const tvlChange = clampNumeric(snapshot.tvl_change_24h_pct, APY_MAX);
      const apyAvg = clampNumeric(snapshot.apy_avg, APY_MAX);
      const chains = Array.isArray(snapshot.chains) ? snapshot.chains : [];

      await db
        .insert(protocolTvlSnapshots)
        .values({
          slug,
          displayName: snapshot.name,
          tvlUsd: String(tvlUsd),
          tvlChange24hPct: tvlChange != null ? String(tvlChange) : null,
          apyAvg: apyAvg != null ? String(apyAvg) : null,
          chains,
          rawSnapshot: null,
          fetchedAt: new Date(),
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: protocolTvlSnapshots.slug,
          set: {
            displayName: snapshot.name,
            tvlUsd: String(tvlUsd),
            tvlChange24hPct: tvlChange != null ? String(tvlChange) : null,
            apyAvg: apyAvg != null ? String(apyAvg) : null,
            chains,
            fetchedAt: new Date(),
            updatedAt: new Date(),
          },
        });

      successCount++;
    } catch (err) {
      logger.warn('[crypto-worker] failed to sync slug', {
        slug,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const elapsed = Date.now() - start;
  logger.info(`[crypto-worker] Synced ${successCount}/${protocols.length} protocols in ${elapsed}ms`, {
    jobId,
    successCount,
    total: protocols.length,
    elapsed,
  });

  return { successCount, total: protocols.length, elapsed };
}

export function getCryptoQueue(): Queue {
  if (!_queue) {
    _queue = new Queue(QUEUE_NAME, { connection: redisConnection });
  }
  return _queue;
}

export function startCryptoWorker(): Worker | null {
  if (!config.CRYPTO_WORKER_ENABLED) {
    logger.info('[crypto-worker] worker disabled (CRYPTO_WORKER_ENABLED=false)');
    return null;
  }
  if (_worker) return _worker;

  try {
    _worker = new Worker(
      QUEUE_NAME,
      async (job: Job) => processJob(job.id),
      {
        connection: redisConnection,
        concurrency: config.CRYPTO_WORKER_CONCURRENCY,
        lockDuration: 120_000,
      },
    );
  } catch (err) {
    logger.error('[crypto-worker] failed to start worker (Redis unavailable?)', {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }

  _worker.on('error', (err) => logger.error('[crypto-worker] worker error', { error: String(err) }));
  _worker.on('failed', (job, err) =>
    logger.error('[crypto-worker] job failed', {
      jobId: job?.id,
      attempts: job?.attemptsMade,
      error: String(err),
    }),
  );

  logger.info(`[crypto-worker] BullMQ worker started, queue: ${QUEUE_NAME}`);
  return _worker;
}

export async function setupCryptoWorkerJobs() {
  if (!config.CRYPTO_WORKER_ENABLED) return;
  const queue = getCryptoQueue();
  await queue.upsertJobScheduler(
    SCHEDULER_ID,
    { every: config.CRYPTO_SYNC_INTERVAL_MS },
    { name: JOB_NAME, data: {}, opts: { attempts: 3, backoff: { type: 'exponential', delay: 30_000 } } },
  );
  logger.info('[crypto-worker] scheduler registered', {
    intervalMs: config.CRYPTO_SYNC_INTERVAL_MS,
  });
}

export async function stopCryptoWorker() {
  if (_worker) {
    await _worker.close();
    _worker = null;
  }
  if (_queue) {
    await _queue.close();
    _queue = null;
  }
}
