import { Worker, Job, Queue } from 'bullmq';
import { createHash } from 'node:crypto';
import { lt, eq, desc, and } from 'drizzle-orm';
import { redisConnection } from '../connection';
import { db } from '../../../shared/db';
import { discoverFeeds, tokenSocialSignals } from '@epsilon/db';
import { config } from '../../../config';
import { logger } from '../../../lib/logger';
import { scrubPii, WARNING_LEVELS, type WarningLevel } from '@epsilon/shared/utils';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { generateObject } from 'ai';
import { z } from 'zod';

export const QUEUE_NAME = 'discover-feed-summarization';
const SUMMARIZE_SCHEDULER_ID = 'discover-feed-hourly';
const CLEANUP_SCHEDULER_ID = 'discover-feed-cleanup-daily';
const SUMMARIZE_CRON = '0 * * * *';
const CLEANUP_CRON = '13 3 * * *';
const TITLE_MAX = 500;
const SUMMARIZE_JOB = 'summarize';
const CLEANUP_JOB = 'cleanup';

let _queue: Queue | null = null;
let _worker: Worker | null = null;

function deterministicId(title: string, summary: string): string {
  const h = createHash('sha256').update(`${title}\n${summary}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

const NEWS_API_QUERY = 'crypto OR DeFi OR blockchain OR "smart contract" OR NFT OR "layer 2"';
const NEWS_API_PAGE_SIZE = 20;

async function fetchRawNews(): Promise<{ source: string; url: string; content: string }[]> {
  if (!config.NEWS_API_KEY) {
    logger.warn('[discover-feed] NEWS_API_KEY not set — skipping news fetch');
    return [];
  }
  const url = new URL(`${config.NEWS_API_URL}/everything`);
  url.searchParams.set('q', NEWS_API_QUERY);
  url.searchParams.set('sortBy', 'publishedAt');
  url.searchParams.set('language', 'en');
  url.searchParams.set('pageSize', String(NEWS_API_PAGE_SIZE));
  url.searchParams.set('apiKey', config.NEWS_API_KEY);

  const res = await fetch(url.toString(), { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`[discover-feed] NewsAPI error ${res.status}: ${body.slice(0, 200)}`);
  }

  const data = (await res.json()) as {
    status: string;
    articles?: Array<{
      source?: { name?: string };
      title?: string;
      description?: string;
      content?: string;
      url?: string;
    }>;
  };

  if (data.status !== 'ok' || !data.articles?.length) return [];

  return data.articles
    .filter((a) => a.title && (a.description || a.content))
    .map((a) => ({
      source: a.source?.name ?? 'NewsAPI',
      url: a.url ?? '',
      content: `${a.title}. ${a.description ?? a.content ?? ''}`.slice(0, 1000),
    }));
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

async function injectAlphaSignals(jobId: string | undefined) {
  try {
    const alphaTokens = await db
      .select()
      .from(tokenSocialSignals)
      .where(and(eq(tokenSocialSignals.isAlphaSignal, true)))
      .orderBy(desc(tokenSocialSignals.socialVolumeChange24hPct))
      .limit(5);

    if (!alphaTokens.length) return;

    const openrouter = getOpenRouter();
    let alphaInserted = 0;

    for (const token of alphaTokens) {
      const svChange = token.socialVolumeChange24hPct != null ? parseFloat(token.socialVolumeChange24hPct) : null;
      const priceChange = token.priceChange24hPct != null ? parseFloat(token.priceChange24hPct) : null;
      if (svChange === null || priceChange === null) continue;

      const context = `Token ${token.symbol} (${token.slug}) under narrative ${token.narrative} has social volume up ${svChange.toFixed(1)}% in 24h but price only changed ${priceChange.toFixed(2)}%.`;

      const { object } = await generateObject({
        model: openrouter('anthropic/claude-3-haiku'),
        schema: z.object({
          title: z.string().min(1),
          summary: z.string().min(1),
        }),
        prompt: `You are a crypto alpha analyst. Write a concise discover feed item for this alpha signal. Be factual and specific. Context: ${context}`,
      });

      const safeTitle = scrubPii(object.title).slice(0, TITLE_MAX);
      const safeSummary = scrubPii(object.summary);
      const id = deterministicId(`alpha:${token.slug}:${new Date().toISOString().slice(0, 10)}`, safeSummary);

      await db
        .insert(discoverFeeds)
        .values({
          id,
          title: safeTitle,
          summary: safeSummary,
          isAnomaly: true,
          warningLevel: 'alpha',
          sources: [{ name: 'Santiment', url: `https://app.santiment.net/s/${token.slug}` }],
        })
        .onConflictDoNothing({ target: discoverFeeds.id });

      alphaInserted++;
    }

    logger.info('[discover-feed] alpha signals injected', { jobId, alphaInserted });
  } catch (err) {
    logger.warn('[discover-feed] alpha signal injection failed (non-fatal)', {
      jobId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

async function runSummarizationJob(jobId: string | undefined) {
  logger.info('[discover-feed] job started', { jobId });

  const rawData = await fetchRawNews();
  if (!rawData.length) {
    logger.warn('[discover-feed] no raw news fetched — skipping summarization', { jobId });
    return { inserted: 0, skipped: 0 };
  }
  const dataString = JSON.stringify(rawData);

  const openrouter = getOpenRouter();
  const { object } = await generateObject({
    model: openrouter('anthropic/claude-3-haiku'),
    schema: itemsSchema,
    prompt: `You are a crypto intelligence analyst. Summarize the raw news into feed items.
Each item must use source names and URLs from the raw data — do not invent sources.
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

  // Integrate alpha signals from social sentiment worker (Story 2.2.2)
  await injectAlphaSignals(jobId);

  return { inserted, skipped };
}

async function runCleanupJob(jobId: string | undefined) {
  const days = config.DISCOVER_RETENTION_DAYS;
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const deleted = await db
    .delete(discoverFeeds)
    .where(lt(discoverFeeds.timestamp, cutoff))
    .returning({ id: discoverFeeds.id });
  logger.info('[discover-feed] cleanup complete', { jobId, deleted: deleted.length, retentionDays: days });
  return { deleted: deleted.length };
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
    async (job: Job) => {
      if (job.name === CLEANUP_JOB) return runCleanupJob(job.id);
      return runSummarizationJob(job.id);
    },
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
    SUMMARIZE_SCHEDULER_ID,
    { pattern: SUMMARIZE_CRON },
    { name: SUMMARIZE_JOB, data: {}, opts: { attempts: 3, backoff: { type: 'exponential', delay: 30_000 } } },
  );
  await queue.upsertJobScheduler(
    CLEANUP_SCHEDULER_ID,
    { pattern: CLEANUP_CRON },
    { name: CLEANUP_JOB, data: {}, opts: { attempts: 2, backoff: { type: 'exponential', delay: 60_000 } } },
  );
  logger.info('[discover-feed] schedulers registered', {
    summarize: SUMMARIZE_CRON,
    cleanup: CLEANUP_CRON,
    retentionDays: config.DISCOVER_RETENTION_DAYS,
  });
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
