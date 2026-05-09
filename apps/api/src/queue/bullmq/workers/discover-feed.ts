import { Worker, Job, Queue } from 'bullmq';
import { createHash } from 'node:crypto';
import { redisConnection } from '../connection';
import { db } from '../../../shared/db';
import { discoverFeeds } from '@epsilon/db';
import { config } from '../../../config';
import { logger } from '../../../lib/logger';
import { scrubPii, WARNING_LEVELS, type WarningLevel } from '@epsilon/shared/utils';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { generateObject } from 'ai';
import { z } from 'zod';

export const QUEUE_NAME = 'discover-feed-summarization';
const SCHEDULER_ID = 'discover-feed-hourly';
const CRON_PATTERN = '0 * * * *';
const TITLE_MAX = 500;

let _queue: Queue | null = null;
let _worker: Worker | null = null;

function deterministicId(title: string, summary: string): string {
  const h = createHash('sha256').update(`${title}\n${summary}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

async function fetchRawNews() {
  return [
    { source: 'Twitter', content: 'Vitalik says Ethereum fees might go down soon.' },
    { source: 'CoinDesk', content: 'New zero-day exploit found in popular smart contract protocol.' },
    { source: 'Nansen', content: 'A whale moved 5000 ETH to Binance.' },
  ];
}

function getOpenRouter() {
  if (!config.OPENROUTER_API_KEY) {
    throw new Error('[discover-feed] OPENROUTER_API_KEY is required to run the worker');
  }
  return createOpenAICompatible({
    name: 'openrouter',
    baseURL: config.OPENROUTER_API_URL,
    apiKey: config.OPENROUTER_API_KEY,
  });
}

const itemsSchema = z.object({
  items: z.array(
    z.object({
      title: z.string().min(1),
      summary: z.string().min(1),
      isAnomaly: z.boolean(),
      warningLevel: z.enum(WARNING_LEVELS as unknown as [WarningLevel, ...WarningLevel[]]),
      sources: z.array(z.object({ name: z.string(), url: z.string().optional() })),
    }),
  ),
});

async function runSummarizationJob(jobId: string | undefined) {
  logger.info('[discover-feed] job started', { jobId });

  const rawData = await fetchRawNews();
  const dataString = JSON.stringify(rawData);

  const openrouter = getOpenRouter();
  const { object } = await generateObject({
    model: openrouter('anthropic/claude-3-haiku'),
    schema: itemsSchema,
    prompt: `You are a crypto intelligence analyst. Summarize the raw data into feed items.
CRITICAL: Anonymize aggressively. Strip wallet addresses, transaction hashes, ENS names, emails, IPs, phone numbers — replace with generic descriptors ("a whale", "an exchange wallet").
If an event indicates a hack, exploit, or massive dump, mark it as anomaly with appropriate warningLevel.
Data: ${dataString}`,
  });

  if (!object.items?.length) {
    logger.warn('[discover-feed] AI returned no items — skipping insert', { jobId });
    return { inserted: 0, skipped: 0 };
  }

  let inserted = 0;
  let skipped = 0;

  await db.transaction(async (tx) => {
    for (const item of object.items) {
      const safeTitle = scrubPii(item.title).slice(0, TITLE_MAX);
      const safeSummary = scrubPii(item.summary);
      const id = deterministicId(safeTitle, safeSummary);

      const result = await tx
        .insert(discoverFeeds)
        .values({
          id,
          title: safeTitle,
          summary: safeSummary,
          isAnomaly: item.isAnomaly,
          warningLevel: item.warningLevel,
          sources: item.sources,
        })
        .onConflictDoNothing({ target: discoverFeeds.id })
        .returning({ id: discoverFeeds.id });

      if (result.length > 0) inserted += 1;
      else skipped += 1;
    }
  });

  logger.info('[discover-feed] job complete', { jobId, inserted, skipped });
  return { inserted, skipped };
}

export function getDiscoverFeedQueue(): Queue {
  if (!_queue) {
    _queue = new Queue(QUEUE_NAME, { connection: redisConnection });
  }
  return _queue;
}

export function startDiscoverFeedWorker(): Worker | null {
  if (!config.DISCOVER_WORKER_ENABLED) {
    logger.info('[discover-feed] worker disabled (DISCOVER_WORKER_ENABLED=false)');
    return null;
  }
  if (_worker) return _worker;

  _worker = new Worker(
    QUEUE_NAME,
    async (job: Job) => runSummarizationJob(job.id),
    { connection: redisConnection, concurrency: 1, lockDuration: 60_000 },
  );

  _worker.on('error', (err) => logger.error('[discover-feed] worker error', { error: String(err) }));
  _worker.on('failed', (job, err) =>
    logger.error('[discover-feed] job failed', {
      jobId: job?.id,
      attempts: job?.attemptsMade,
      error: String(err),
    }),
  );

  logger.info('[discover-feed] worker started');
  return _worker;
}

export async function setupDiscoverFeedJobs() {
  if (!config.DISCOVER_WORKER_ENABLED) return;
  const queue = getDiscoverFeedQueue();
  await queue.upsertJobScheduler(
    SCHEDULER_ID,
    { pattern: CRON_PATTERN },
    { name: 'summarize', data: {}, opts: { attempts: 3, backoff: { type: 'exponential', delay: 30_000 } } },
  );
  logger.info('[discover-feed] hourly scheduler registered', { pattern: CRON_PATTERN });
}

export async function stopDiscoverFeedWorker() {
  if (_worker) {
    await _worker.close();
    _worker = null;
  }
  if (_queue) {
    await _queue.close();
    _queue = null;
  }
}
