import { Job, Queue, Worker } from 'bullmq';
import { and, desc, eq } from 'drizzle-orm';
import { discoverFeeds, onchainFactChecks } from '@epsilon/db';
import { db } from '../../../shared/db';
import { config } from '../../../config';
import { logger } from '../../../lib/logger';
import { redisConnection } from '../connection';
import { canStartFactCheckWorker, extractReliableTokenAddress, isPromotionalArticle, runOnchainFactCheck } from '../../../router/services/onchain-fact-check';

export const QUEUE_NAME = 'onchain-fact-check';
const SCHEDULER_ID = 'onchain-fact-check-refresh';
const JOB_FACT_CHECK_DISCOVER_ITEM = 'fact-check-discover-item';
const JOB_REFRESH_RECENT = 'refresh-recent-positive-feed';

let _queue: Queue | null = null;
let _worker: Worker | null = null;

export function getOnchainFactCheckQueue(): Queue {
  if (!_queue) {
    _queue = new Queue(QUEUE_NAME, { connection: redisConnection });
  }
  return _queue;
}

async function mutateDiscoverRowWhenFlagged(discoverFeedId: string, title: string, summary: string, riskLevel: 'high' | 'critical') {
  const flaggedPrefix = 'High Risk: Insider Selling Detected';
  const nextTitle = title.includes(flaggedPrefix) ? title : `${flaggedPrefix} — ${title}`.slice(0, 500);
  const nextSummary = summary.includes(flaggedPrefix) ? summary : `${summary}\n\n${flaggedPrefix}`;
  await db
    .update(discoverFeeds)
    .set({
      title: nextTitle,
      summary: nextSummary,
      isAnomaly: true,
      warningLevel: riskLevel,
    })
    .where(eq(discoverFeeds.id, discoverFeedId));
}

async function runFactCheckDiscoverItem(job: Job) {
  const { discoverFeedId, chain, tokenAddress, tokenSymbol, articleTitle, articleSentiment } = job.data as {
    discoverFeedId: string;
    chain: string;
    tokenAddress: string;
    tokenSymbol?: string;
    articleTitle?: string;
    articleSentiment?: 'positive' | 'neutral' | 'negative' | 'unknown';
  };

  const checked = await runOnchainFactCheck({
    discoverFeedId,
    chain,
    tokenAddress,
    tokenSymbol,
    articleTitle,
    articleSentiment,
    forceRefresh: true,
  });

  await db.insert(onchainFactChecks).values({
    discoverFeedId,
    chain: chain.toLowerCase(),
    tokenAddress: tokenAddress.toLowerCase(),
    tokenSymbol: tokenSymbol ?? null,
    articleTitle: articleTitle ?? null,
    articleSentiment: articleSentiment ?? 'unknown',
    status: checked.status,
    walletsChecked: checked.walletsChecked,
    netOutflowPct: checked.netOutflowPct != null ? String(checked.netOutflowPct) : null,
    largestWalletOutflowPct: checked.largestWalletOutflowPct != null ? String(checked.largestWalletOutflowPct) : null,
    transferCount: checked.transferCount,
    riskLevel: checked.riskLevel,
    riskFactors: checked.riskFactors as unknown as Record<string, unknown>[],
    evidence: checked.evidence,
    checkedAt: new Date(checked.checkedAt),
    updatedAt: new Date(),
  });

  if (checked.status === 'flagged') {
    const [feedRow] = await db
      .select({ id: discoverFeeds.id, title: discoverFeeds.title, summary: discoverFeeds.summary })
      .from(discoverFeeds)
      .where(eq(discoverFeeds.id, discoverFeedId))
      .limit(1);
    if (feedRow) {
      const severity: 'high' | 'critical' = checked.riskLevel === 'critical' ? 'critical' : 'high';
      await mutateDiscoverRowWhenFlagged(feedRow.id, feedRow.title, feedRow.summary, severity);
    }
  }
}

async function refreshRecentPositiveFeed() {
  const recent = await db
    .select({
      id: discoverFeeds.id,
      title: discoverFeeds.title,
      summary: discoverFeeds.summary,
      warningLevel: discoverFeeds.warningLevel,
      timestamp: discoverFeeds.timestamp,
    })
    .from(discoverFeeds)
    .orderBy(desc(discoverFeeds.timestamp))
    .limit(50);

  const queue = getOnchainFactCheckQueue();
  for (const row of recent) {
    if (row.warningLevel === 'critical' || row.warningLevel === 'high' || !isPromotionalArticle(`${row.title} ${row.summary}`)) continue;
    const tokenAddress = extractReliableTokenAddress(`${row.title} ${row.summary}`);
    if (!tokenAddress) continue;
    await queue.add(JOB_FACT_CHECK_DISCOVER_ITEM, {
      discoverFeedId: row.id,
      chain: 'ethereum',
      tokenAddress,
      articleTitle: row.title,
      articleSentiment: 'positive',
    }, {
      removeOnComplete: 100,
      attempts: 3,
      backoff: { type: 'exponential', delay: 30_000 },
    });
  }
}

export function startOnchainFactCheckWorker(): Worker | null {
  if (!canStartFactCheckWorker()) return null;
  if (_worker) return _worker;

  _worker = new Worker(
    QUEUE_NAME,
    async (job: Job) => {
      if (job.name === JOB_REFRESH_RECENT) return refreshRecentPositiveFeed();
      return runFactCheckDiscoverItem(job);
    },
    { connection: redisConnection, concurrency: 1 },
  );

  _worker.on('error', (err) => logger.error('[onchain-fact-check] worker error', { error: String(err) }));
  _worker.on('failed', (job, err) => logger.error('[onchain-fact-check] job failed', {
    jobId: job?.id,
    jobName: job?.name,
    attempts: job?.attemptsMade,
    error: String(err),
  }));

  logger.info('[onchain-fact-check] worker started');
  return _worker;
}

export async function setupOnchainFactCheckJobs() {
  if (!config.ONCHAIN_FACT_CHECK_WORKER_ENABLED) return;
  const queue = getOnchainFactCheckQueue();
  await queue.upsertJobScheduler(
    SCHEDULER_ID,
    { every: config.ONCHAIN_FACT_CHECK_INTERVAL_MS },
    {
      name: JOB_REFRESH_RECENT,
      data: {},
      opts: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 30_000 },
      },
    },
  );
  logger.info('[onchain-fact-check] scheduler registered', {
    everyMs: config.ONCHAIN_FACT_CHECK_INTERVAL_MS,
  });
}

export async function stopOnchainFactCheckWorker() {
  if (_worker) {
    await _worker.close();
    _worker = null;
  }
  if (_queue) {
    await _queue.close();
    _queue = null;
  }
}

export async function enqueueDiscoverFactCheck(data: {
  discoverFeedId: string;
  chain: string;
  tokenAddress: string;
  tokenSymbol?: string;
  articleTitle?: string;
  articleSentiment?: 'positive' | 'neutral' | 'negative' | 'unknown';
}) {
  const queue = getOnchainFactCheckQueue();
  await queue.add(JOB_FACT_CHECK_DISCOVER_ITEM, data, {
    removeOnComplete: 100,
    attempts: 3,
    backoff: { type: 'exponential', delay: 30_000 },
  });
}
