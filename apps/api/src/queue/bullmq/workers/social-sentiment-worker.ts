import { Worker, Job, Queue } from 'bullmq';
import { redisConnection } from '../connection';
import { db } from '../../../shared/db';
import { tokenSocialSignals } from '@epsilon/db';
import { config } from '../../../config';
import { logger } from '../../../lib/logger';
import { fetchTokenMetrics } from '../../../router/services/santiment';
import type { NarrativeCategory } from './social-sentiment-types';

export const QUEUE_NAME = 'social-sentiment-sync';
const SCHEDULER_ID = 'sync-social-sentiment';
const JOB_NAME = 'fetch-social-sentiment';

let _queue: Queue | null = null;
let _worker: Worker | null = null;

// Hardcoded slug → narrative mapping for initial launch (Story 2.2.2)
// Future: Story 2.2.2.1 will implement ML-based clustering
const NARRATIVE_MAP: Record<string, NarrativeCategory> = {
  // L1
  bitcoin: 'l1',
  ethereum: 'l1',
  solana: 'l1',
  'avalanche-2': 'l1',
  // L2
  arbitrum: 'l2',
  optimism: 'l2',
  'matic-network': 'l2',
  starknet: 'l2',
  // AI
  'render-token': 'ai',
  'fetch-ai': 'ai',
  singularitynet: 'ai',
  'ocean-protocol': 'ai',
  bittensor: 'ai',
  // RWA
  'ondo-finance': 'rwa',
  maple: 'rwa',
  centrifuge: 'rwa',
  // Memes
  dogecoin: 'memes',
  'shiba-inu': 'memes',
  pepe: 'memes',
  bonk: 'memes',
  dogwifcoin: 'memes',
  // DePIN
  helium: 'depin',
  iotex: 'depin',
  // Gaming
  'beam-2': 'gaming',
  gala: 'gaming',
  apecoin: 'gaming',
  // DeFi
  uniswap: 'defi',
  aave: 'defi',
  chainlink: 'defi',
  // Privacy
  monero: 'privacy',
  zcash: 'privacy',
};

// Symbol lookup for display (slug → symbol)
const SYMBOL_MAP: Record<string, string> = {
  bitcoin: 'BTC', ethereum: 'ETH', solana: 'SOL', 'avalanche-2': 'AVAX',
  arbitrum: 'ARB', optimism: 'OP', 'matic-network': 'MATIC', starknet: 'STRK',
  'render-token': 'RNDR', 'fetch-ai': 'FET', singularitynet: 'AGIX',
  'ocean-protocol': 'OCEAN', bittensor: 'TAO',
  'ondo-finance': 'ONDO', maple: 'MPL', centrifuge: 'CFG',
  dogecoin: 'DOGE', 'shiba-inu': 'SHIB', pepe: 'PEPE', bonk: 'BONK', dogwifcoin: 'WIF',
  helium: 'HNT', iotex: 'IOTX',
  'beam-2': 'BEAM', gala: 'GALA', apecoin: 'APE',
  uniswap: 'UNI', aave: 'AAVE', chainlink: 'LINK',
  monero: 'XMR', zcash: 'ZEC',
};

function isAlphaSignal(socialVolumeChange: number | null, priceChange: number | null): boolean {
  if (socialVolumeChange === null || priceChange === null) return false;
  if (!Number.isFinite(socialVolumeChange) || !Number.isFinite(priceChange)) return false;
  return socialVolumeChange > 200 && Math.abs(priceChange) < 10;
}

async function processJob(jobId: string | undefined) {
  if (!config.SANTIMENT_API_KEY) {
    logger.info('[social-sentiment] SANTIMENT_API_KEY not set — skipping sync');
    return;
  }

  const start = Date.now();
  logger.info('[social-sentiment] job started', { jobId });

  const slugs = Object.keys(NARRATIVE_MAP);
  let successCount = 0;
  let alphaCount = 0;

  for (const slug of slugs) {
    try {
      const metrics = await fetchTokenMetrics(slug, config.SANTIMENT_API_KEY);
      const narrative = NARRATIVE_MAP[slug] ?? 'other';
      const symbol = SYMBOL_MAP[slug] ?? slug.toUpperCase().slice(0, 10);
      const alpha = isAlphaSignal(metrics.socialVolumeChange24hPct, metrics.priceChange24hPct);

      if (alpha) alphaCount++;

      const now = new Date();
      await db
        .insert(tokenSocialSignals)
        .values({
          slug,
          symbol,
          narrative,
          socialVolume24h: metrics.socialVolume24h != null ? String(metrics.socialVolume24h) : null,
          socialVolumeChange24hPct: metrics.socialVolumeChange24hPct != null ? String(metrics.socialVolumeChange24hPct) : null,
          socialDominancePct: metrics.socialDominancePct != null ? String(metrics.socialDominancePct) : null,
          sentimentScore: metrics.sentimentScore != null ? String(metrics.sentimentScore) : null,
          priceUsd: metrics.priceUsd != null ? String(metrics.priceUsd) : null,
          priceChange24hPct: metrics.priceChange24hPct != null ? String(metrics.priceChange24hPct) : null,
          isAlphaSignal: alpha,
          fetchedAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: tokenSocialSignals.slug,
          set: {
            symbol,
            narrative,
            socialVolume24h: metrics.socialVolume24h != null ? String(metrics.socialVolume24h) : null,
            socialVolumeChange24hPct: metrics.socialVolumeChange24hPct != null ? String(metrics.socialVolumeChange24hPct) : null,
            socialDominancePct: metrics.socialDominancePct != null ? String(metrics.socialDominancePct) : null,
            sentimentScore: metrics.sentimentScore != null ? String(metrics.sentimentScore) : null,
            priceUsd: metrics.priceUsd != null ? String(metrics.priceUsd) : null,
            priceChange24hPct: metrics.priceChange24hPct != null ? String(metrics.priceChange24hPct) : null,
            isAlphaSignal: alpha,
            fetchedAt: now,
            updatedAt: now,
          },
        });

      successCount++;
    } catch (err) {
      logger.warn('[social-sentiment] failed to sync token', {
        slug,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const elapsed = Date.now() - start;
  logger.info(
    `[social-sentiment] Synced ${successCount}/${slugs.length} tokens, ${alphaCount} alpha signals in ${elapsed}ms`,
    { jobId, successCount, total: slugs.length, alphaCount, elapsed },
  );

  return { successCount, total: slugs.length, alphaCount, elapsed };
}

export function getSocialSentimentQueue(): Queue {
  if (!_queue) {
    _queue = new Queue(QUEUE_NAME, { connection: redisConnection });
  }
  return _queue;
}

export function startSocialSentimentWorker(): Worker | null {
  if (!config.SOCIAL_SENTIMENT_WORKER_ENABLED) {
    logger.info('[social-sentiment] worker disabled (SOCIAL_SENTIMENT_WORKER_ENABLED=false)');
    return null;
  }
  if (_worker) return _worker;

  try {
    _worker = new Worker(
      QUEUE_NAME,
      async (job: Job) => processJob(job.id),
      {
        connection: redisConnection,
        concurrency: 1,
        lockDuration: 300_000,
      },
    );
  } catch (err) {
    logger.error('[social-sentiment] failed to start worker (Redis unavailable?)', {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }

  _worker.on('error', (err) => logger.error('[social-sentiment] worker error', { error: String(err) }));
  _worker.on('failed', (job, err) =>
    logger.error('[social-sentiment] job failed', {
      jobId: job?.id,
      attempts: job?.attemptsMade,
      error: String(err),
    }),
  );

  logger.info(`[social-sentiment] BullMQ worker started, queue: ${QUEUE_NAME}`);
  return _worker;
}

export async function setupSocialSentimentJobs() {
  if (!config.SOCIAL_SENTIMENT_WORKER_ENABLED) return;
  const queue = getSocialSentimentQueue();
  await queue.upsertJobScheduler(
    SCHEDULER_ID,
    { every: config.SOCIAL_SENTIMENT_INTERVAL_MS },
    { name: JOB_NAME, data: {}, opts: { attempts: 3, backoff: { type: 'exponential', delay: 30_000 } } },
  );
  logger.info('[social-sentiment] scheduler registered', {
    intervalMs: config.SOCIAL_SENTIMENT_INTERVAL_MS,
  });
}

export async function stopSocialSentimentWorker() {
  if (_worker) {
    await _worker.close();
    _worker = null;
  }
  if (_queue) {
    await _queue.close();
    _queue = null;
  }
}
