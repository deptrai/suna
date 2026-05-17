import { Worker, Job, Queue } from 'bullmq';
import { redisConnection } from '../connection';
import { db } from '../../../shared/db';
import { entityWalletLabels, tokenHolderEntityRisks } from '@epsilon/db';
import { config } from '../../../config';
import { logger } from '../../../lib/logger';
import {
  fetchArkhamTokenHolders,
  fetchArkhamBatchAddressIntelligence,
  scoreEntity,
  computeHolderRiskSummary,
  type ArkhamHolderEntry,
} from '../../../router/services/arkham';
import { fetchDuneTokenHolders, type DuneAnalysisStatus } from '../../../router/services/dune-labels';
import { eq, and } from 'drizzle-orm';

export const QUEUE_NAME = 'entity-wallet-sync';
const SCHEDULER_ID = 'refresh-entity-labels';
const JOB_NAME_REFRESH = 'refresh-entity-labels';
const JOB_NAME_TOKEN_HOLDERS = 'analyze-token-holders';

let _queue: Queue | null = null;
let _worker: Worker | null = null;

// ─── Job processors ──────────────────────────────────────────────────────────

async function processTokenHolders(
  chain: string,
  tokenAddress: string,
): Promise<{ inserted: number; riskLevel: string }> {
  let dataSource: 'arkham' | 'dune' = 'arkham';
  let analysisStatus: DuneAnalysisStatus | 'complete' = 'complete';
  let result = { holders: [] as ArkhamHolderEntry[], totalHolders: null as number | null, chain, tokenAddress };

  if (config.ARKHAM_API_KEY) {
    try {
      result = await fetchArkhamTokenHolders(chain, tokenAddress, {
        limit: config.ARKHAM_TOP_HOLDER_LIMIT,
      });
      logger.info('[entity-wallet] provider fetch success', {
        provider: 'arkham',
        chain,
        tokenAddress,
        holders: result.holders.length,
      });
    } catch (arkhamErr) {
      logger.warn('[entity-wallet] Arkham fetch failed, trying Dune fallback', {
        error: arkhamErr instanceof Error ? arkhamErr.message : String(arkhamErr),
        chain,
        tokenAddress,
      });
      if (config.DUNE_API_KEY && config.DUNE_TOKEN_HOLDERS_QUERY_ID) {
        const duneResult = await fetchDuneTokenHolders(chain, tokenAddress, { limit: config.ARKHAM_TOP_HOLDER_LIMIT });
        result = duneResult;
        dataSource = 'dune';
        analysisStatus = duneResult.analysisStatus;
        logger.info('[entity-wallet] provider fetch result', {
          provider: 'dune',
          chain,
          tokenAddress,
          holders: duneResult.holders.length,
          analysisStatus: duneResult.analysisStatus,
          hasError: Boolean(duneResult.providerError),
        });
      }
    }
  } else if (config.DUNE_API_KEY && config.DUNE_TOKEN_HOLDERS_QUERY_ID) {
    const duneResult = await fetchDuneTokenHolders(chain, tokenAddress, { limit: config.ARKHAM_TOP_HOLDER_LIMIT });
    result = duneResult;
    dataSource = 'dune';
    analysisStatus = duneResult.analysisStatus;
    logger.info('[entity-wallet] provider fetch result', {
      provider: 'dune',
      chain,
      tokenAddress,
      holders: duneResult.holders.length,
      analysisStatus: duneResult.analysisStatus,
      hasError: Boolean(duneResult.providerError),
    });
  }

  const holders = result.holders;
  if (holders.length === 0) {
    if (analysisStatus === 'failed' || analysisStatus === 'timeout') {
      logger.warn('[entity-wallet] provider failed — skipping DB write to avoid masking failure as clean result', {
        analysisStatus,
        chain,
        tokenAddress,
        source: dataSource,
      });
      return { inserted: 0, riskLevel: 'none' };
    }
    const now = new Date();
    const tokenAddr = tokenAddress.toLowerCase();
    await db
      .insert(tokenHolderEntityRisks)
      .values({
        chain,
        tokenAddress: tokenAddr,
        holderCount: 0,
        labeledHolderCount: 0,
        riskyHolderCount: 0,
        topEntities: [],
        riskFactors: [],
        riskScore: 0,
        riskLevel: 'none',
        source: dataSource,
        analysisStatus,
        fetchedAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [tokenHolderEntityRisks.chain, tokenHolderEntityRisks.tokenAddress, tokenHolderEntityRisks.source],
        set: {
          holderCount: 0,
          labeledHolderCount: 0,
          riskyHolderCount: 0,
          topEntities: [],
          riskFactors: [],
          riskScore: 0,
          riskLevel: 'none',
          analysisStatus,
          fetchedAt: now,
          updatedAt: now,
        },
      });
    logger.warn('[entity-wallet] no holders returned', {
      chain,
      tokenAddress,
      source: dataSource,
      analysisStatus,
    });
    return { inserted: 0, riskLevel: 'none' };
  }

  // Batch enrich via address intelligence for holders lacking entity data
  const unknownAddresses = holders
    .filter((h) => !h.entityId && !h.entityName)
    .map((h) => h.address)
    .filter(Boolean)
    .slice(0, 100);
  let enriched: Map<string, ArkhamHolderEntry> = new Map();
  if (config.ARKHAM_API_KEY && unknownAddresses.length > 0) {
    try {
      const batchResults = await fetchArkhamBatchAddressIntelligence(unknownAddresses, chain);
      for (const r of batchResults) {
        if (r.address) {
          const existing = holders.find((h) => h.address.toLowerCase() === r.address.toLowerCase());
          if (existing) {
            enriched.set(r.address.toLowerCase(), {
              ...existing,
              entityId: r.entityId ?? existing.entityId,
              entityName: r.entityName ?? existing.entityName,
              entityType: r.entityType ?? existing.entityType,
              tags: r.tags.length > 0 ? r.tags : existing.tags,
            });
          }
        }
      }
    } catch (e) {
      logger.warn('[entity-wallet] batch enrich failed, using holder-only data', {
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  const resolvedHolders = holders.map((h) =>
    enriched.get(h.address.toLowerCase()) ?? h,
  );

  // Upsert entity wallet labels for each holder
  const now = new Date();
  let inserted = 0;
  for (const holder of resolvedHolders) {
    if (!holder.address) continue;
    const scored = scoreEntity(holder.tags, holder.entityType, holder.entityName);
    const addr = holder.address.toLowerCase();
    if (addr.length > 128) continue;
    try {
      await db
        .insert(entityWalletLabels)
        .values({
          chain,
          address: addr,
          entityId: holder.entityId,
          entityName: holder.entityName,
          entityType: holder.entityType,
          tags: holder.tags,
          confidence: null,
          riskCategory: scored.riskCategory,
          riskScore: scored.riskScore,
          source: dataSource,
          fetchedAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [entityWalletLabels.chain, entityWalletLabels.address, entityWalletLabels.source],
          set: {
            entityId: holder.entityId,
            entityName: holder.entityName,
            entityType: holder.entityType,
            tags: holder.tags,
            riskCategory: scored.riskCategory,
            riskScore: scored.riskScore,
            fetchedAt: now,
            updatedAt: now,
          },
        });
      inserted++;
    } catch (e) {
      logger.warn('[entity-wallet] label upsert failed', {
        address: addr,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  // Compute token holder risk summary
  const riskSummary = computeHolderRiskSummary(resolvedHolders);
  const topEntities = resolvedHolders.slice(0, 10).map((h) => ({
    address: h.address,
    entityName: h.entityName,
    entityType: h.entityType,
    tags: h.tags,
    riskCategory: scoreEntity(h.tags, h.entityType, h.entityName).riskCategory,
  }));

  const tokenAddr = tokenAddress.toLowerCase();
  await db
    .insert(tokenHolderEntityRisks)
    .values({
      chain,
      tokenAddress: tokenAddr,
      holderCount: result.totalHolders,
      labeledHolderCount: resolvedHolders.filter((h) => h.entityId || h.entityName).length,
      riskyHolderCount: riskSummary.riskyHolderCount,
      topEntities,
      riskFactors: riskSummary.riskFactors,
      riskScore: riskSummary.riskScore,
      riskLevel: riskSummary.riskLevel,
      source: dataSource,
      analysisStatus: dataSource === 'dune' ? analysisStatus : 'complete',
      fetchedAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [tokenHolderEntityRisks.chain, tokenHolderEntityRisks.tokenAddress, tokenHolderEntityRisks.source],
      set: {
        holderCount: result.totalHolders,
        labeledHolderCount: resolvedHolders.filter((h) => h.entityId || h.entityName).length,
        riskyHolderCount: riskSummary.riskyHolderCount,
        topEntities,
        riskFactors: riskSummary.riskFactors,
        riskScore: riskSummary.riskScore,
        riskLevel: riskSummary.riskLevel,
        analysisStatus: dataSource === 'dune' ? analysisStatus : 'complete',
        fetchedAt: now,
        updatedAt: now,
      },
    });

  return { inserted, riskLevel: riskSummary.riskLevel };
}

async function processJob(job: Job): Promise<unknown> {
  if (job.name === JOB_NAME_TOKEN_HOLDERS) {
    const { chain, tokenAddress } = job.data as { chain: string; tokenAddress: string };
    if (!chain || !tokenAddress) return { skipped: true, reason: 'missing_args' };
    logger.info('[entity-wallet] analyzing token holders', { chain, tokenAddress });
    const result = await processTokenHolders(chain, tokenAddress);
    logger.info('[entity-wallet] token holders analysis complete', { ...result, chain, tokenAddress });
    return result;
  }

  if (job.name === JOB_NAME_REFRESH) {
    // Periodic scheduler heartbeat — no-op for now; future: refresh stale watchlist entries
    logger.debug('[entity-wallet] refresh scheduler tick');
    return { ok: true };
  }

  return { skipped: true, reason: 'unknown_job' };
}

// ─── Public worker API ───────────────────────────────────────────────────────

export function getEntityWalletQueue(): Queue {
  if (!_queue) {
    _queue = new Queue(QUEUE_NAME, { connection: redisConnection });
  }
  return _queue;
}

export function startEntityWalletWorker(): Worker | null {
  if (!config.ARKHAM_WORKER_ENABLED) {
    logger.info('[entity-wallet] worker disabled (ARKHAM_WORKER_ENABLED=false)');
    return null;
  }
  const hasArkham = Boolean(config.ARKHAM_API_KEY);
  const hasDune = Boolean(config.DUNE_API_KEY && config.DUNE_TOKEN_HOLDERS_QUERY_ID);
  if (!hasArkham && !hasDune) {
    logger.warn('[entity-wallet] skipped startup — neither ARKHAM_API_KEY nor DUNE_API_KEY+DUNE_TOKEN_HOLDERS_QUERY_ID set');
    return null;
  }
  if (!hasArkham) {
    logger.info('[entity-wallet] ARKHAM_API_KEY not set — using Dune Analytics as primary source');
  }
  if (_worker) return _worker;

  try {
    _worker = new Worker(QUEUE_NAME, processJob, {
      connection: redisConnection,
      concurrency: config.ARKHAM_WORKER_CONCURRENCY,
      lockDuration: 300_000,
    });
  } catch (err) {
    logger.error('[entity-wallet] failed to start worker', {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }

  _worker.on('error', (err) =>
    logger.error('[entity-wallet] worker error', { error: String(err) }),
  );
  _worker.on('failed', (job, err) =>
    logger.error('[entity-wallet] job failed', {
      jobId: job?.id,
      attempts: job?.attemptsMade,
      error: String(err),
    }),
  );

  logger.info(`[entity-wallet] BullMQ worker started, queue: ${QUEUE_NAME}`);
  return _worker;
}

export async function setupEntityWalletJobs(): Promise<void> {
  if (!config.ARKHAM_WORKER_ENABLED) return;
  const hasArkham = Boolean(config.ARKHAM_API_KEY);
  const hasDune = Boolean(config.DUNE_API_KEY && config.DUNE_TOKEN_HOLDERS_QUERY_ID);
  if (!hasArkham && !hasDune) {
    logger.warn('[entity-wallet] scheduler skipped — neither Arkham nor Dune keys configured');
    return;
  }
  // Access _queue directly to avoid ESM live-binding contamination in tests
  if (!_queue) {
    _queue = new Queue(QUEUE_NAME, { connection: redisConnection });
  }
  await _queue.upsertJobScheduler(
    SCHEDULER_ID,
    { every: config.ARKHAM_SYNC_INTERVAL_MS },
    {
      name: JOB_NAME_REFRESH,
      data: {},
      opts: { attempts: 3, backoff: { type: 'exponential', delay: 60_000 } },
    },
  );
  logger.info('[entity-wallet] scheduler registered', {
    intervalMs: config.ARKHAM_SYNC_INTERVAL_MS,
  });
}

export async function stopEntityWalletWorker(): Promise<void> {
  if (_worker) {
    await _worker.close();
    _worker = null;
  }
  if (_queue) {
    await _queue.close();
    _queue = null;
  }
}
