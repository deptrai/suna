import { Worker, Job, Queue } from 'bullmq';
import { redisConnection } from '../connection';
import { db } from '../../../shared/db';
import { mempoolAlerts } from '@epsilon/db';
import { config } from '../../../config';
import { logger } from '../../../lib/logger';
import { classifyPendingTx, toPendingMempoolTx } from '../../../router/services/mempool';

export const QUEUE_NAME = 'mempool-alerts';
const JOB_NAME = 'process-pending-transaction';
const HEALTH_SCHEDULER_ID = 'sync-mempool-health';
const HEALTH_JOB_NAME = 'sync-mempool-health';

// Bound queue depth to protect Redis memory during traffic spikes.
const MAX_QUEUE_WAITING = 5000;
// pendingLookup eviction policy: cap entries + age.
const MAX_PENDING_LOOKUP = 10_000;
const PENDING_LOOKUP_TTL_MS = 60_000;

type Chain = 'ethereum' | 'bsc' | 'base';
type PendingEntry = { hash: string; ts: number };
type WsState = {
  chain: Chain;
  url: string;
  ws: WebSocket | null;
  reconnectTimer: ReturnType<typeof setTimeout> | null;
  requestId: number;
  pendingLookup: Map<number, PendingEntry>;
  stopped: boolean;
  consecutiveFailures: number;
};

let _queue: Queue | null = null;
let _worker: Worker | null = null;
const _wsState = new Map<Chain, WsState>();
let _droppedDueToBackpressure = 0;
let _lastBackpressureLog = 0;

function parseChains(): Chain[] {
  const raw = config.MEMPOOL_CHAINS || 'ethereum';
  const list = raw
    .split(',')
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean) as Chain[];
  return Array.from(new Set(list)).filter((c) => c === 'ethereum' || c === 'bsc' || c === 'base');
}

function wsUrlForChain(chain: Chain): string {
  if (chain === 'ethereum') return config.MEMPOOL_WS_URL_ETHEREUM || '';
  if (chain === 'bsc') return config.MEMPOOL_WS_URL_BSC || '';
  return config.MEMPOOL_WS_URL_BASE || '';
}

// JSON-RPC request id with wrap to stay within safe integer bounds even on
// very-long-running sessions with high mempool volume.
function nextId(state: WsState): number {
  state.requestId = (state.requestId + 1) % Number.MAX_SAFE_INTEGER;
  return state.requestId;
}

// Evict stale or excess pendingLookup entries — protects against memory growth
// from dropped responses or unresponsive nodes.
function sweepPendingLookup(state: WsState, now: number): void {
  if (state.pendingLookup.size <= MAX_PENDING_LOOKUP) {
    // Light sweep: only walk if oldest may be expired.
    const cutoff = now - PENDING_LOOKUP_TTL_MS;
    let expired = 0;
    for (const [key, entry] of state.pendingLookup) {
      if (entry.ts < cutoff) {
        state.pendingLookup.delete(key);
        expired++;
        if (expired >= 256) break;
      } else {
        break;
      }
    }
    return;
  }
  // Size cap exceeded — drop oldest entries (insertion order is preserved by Map).
  const overage = state.pendingLookup.size - MAX_PENDING_LOOKUP;
  let dropped = 0;
  for (const key of state.pendingLookup.keys()) {
    if (dropped >= overage) break;
    state.pendingLookup.delete(key);
    dropped++;
  }
  logger.warn('[mempool-worker] pendingLookup overflow — dropped oldest entries', { chain: state.chain, dropped });
}

export function getMempoolQueue(): Queue {
  if (!_queue) _queue = new Queue(QUEUE_NAME, { connection: redisConnection });
  return _queue;
}

async function enqueueTx(chain: Chain, tx: Record<string, unknown>): Promise<boolean> {
  const queue = getMempoolQueue();
  // Backpressure: skip enqueue if queue is overloaded — drop & log rather than
  // letting Redis memory grow unbounded under mempool spikes.
  try {
    const waiting = await queue.getWaitingCount();
    if (waiting > MAX_QUEUE_WAITING) {
      _droppedDueToBackpressure++;
      const now = Date.now();
      if (now - _lastBackpressureLog > 10_000) {
        logger.warn('[mempool-worker] dropping tx due to backpressure', {
          chain,
          waiting,
          dropped_total: _droppedDueToBackpressure,
        });
        _lastBackpressureLog = now;
      }
      return false;
    }
  } catch {
    // If Redis is unreachable just let queue.add throw — handled upstream.
  }
  await queue.add(
    JOB_NAME,
    {
      chain,
      provider: config.MEMPOOL_PROVIDER,
      tx,
      observedAt: new Date().toISOString(),
    },
    {
      removeOnComplete: 1000,
      removeOnFail: 1000,
      attempts: 3,
      backoff: { type: 'exponential', delay: 1000 },
    },
  );
  return true;
}

function sendJson(ws: WebSocket, payload: unknown): boolean {
  if (ws.readyState !== WebSocket.OPEN) return false;
  try {
    ws.send(JSON.stringify(payload));
    return true;
  } catch {
    return false;
  }
}

function scheduleReconnect(state: WsState): void {
  if (state.stopped) return;
  if (state.reconnectTimer) clearTimeout(state.reconnectTimer);
  // Exponential backoff with cap: base delay × 2^failures, max 30s.
  const base = Math.max(config.MEMPOOL_RECONNECT_DELAY_MS, 1000);
  const exp = Math.min(base * 2 ** Math.min(state.consecutiveFailures, 5), 30_000);
  // ±20% jitter to avoid thundering herd against the provider.
  const jitter = 1 + (Math.random() * 0.4 - 0.2);
  const delay = Math.round(exp * jitter);
  state.reconnectTimer = setTimeout(() => {
    if (state.stopped) return;
    setupSocket(state);
  }, delay);
  logger.warn('[mempool-worker] websocket reconnect scheduled', {
    chain: state.chain,
    delayMs: delay,
    failures: state.consecutiveFailures,
  });
}

function setupSocket(state: WsState): void {
  if (state.stopped) return;
  // Clear stale pending entries on every (re)connect: response IDs from the
  // dead socket would never arrive, leaking memory and risking ID-collision
  // with newly-assigned IDs.
  state.pendingLookup.clear();

  const ws = new WebSocket(state.url);
  state.ws = ws;

  ws.onopen = () => {
    state.consecutiveFailures = 0;
    logger.info('[mempool-worker] websocket connected', { chain: state.chain, provider: config.MEMPOOL_PROVIDER });
    const id = nextId(state);
    sendJson(ws, { jsonrpc: '2.0', id, method: 'eth_subscribe', params: ['newPendingTransactions'] });
  };

  ws.onmessage = async (evt) => {
    try {
      const payload = JSON.parse(typeof evt.data === 'string' ? evt.data : String(evt.data)) as Record<string, unknown>;

      if (typeof payload.id === 'number') {
        const txHashReqId = payload.id;
        const entry = state.pendingLookup.get(txHashReqId);
        if (entry) {
          state.pendingLookup.delete(txHashReqId);
          if (payload.result && typeof payload.result === 'object') {
            await enqueueTx(state.chain, payload.result as Record<string, unknown>);
          }
        }
        return;
      }

      const method = payload.method;
      if (method !== 'eth_subscription') return;
      const params = payload.params as Record<string, unknown> | undefined;
      const result = params?.result;
      if (!result) return;

      if (typeof result === 'string' && result.startsWith('0x')) {
        // Sweep stale entries periodically before allocating a new ID.
        sweepPendingLookup(state, Date.now());
        const requestId = nextId(state);
        const ok = sendJson(ws, { jsonrpc: '2.0', id: requestId, method: 'eth_getTransactionByHash', params: [result] });
        if (ok) {
          // Only register pending entry after a successful send — avoids leak on
          // closed/closing sockets.
          state.pendingLookup.set(requestId, { hash: result, ts: Date.now() });
        }
        return;
      }

      if (typeof result === 'object') {
        await enqueueTx(state.chain, result as Record<string, unknown>);
      }
    } catch (error) {
      logger.warn('[mempool-worker] websocket message handling failed', {
        chain: state.chain,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };

  ws.onerror = (error) => {
    logger.warn('[mempool-worker] websocket error', {
      chain: state.chain,
      error: String(error),
    });
  };

  ws.onclose = () => {
    state.ws = null;
    if (state.stopped) return;
    state.consecutiveFailures += 1;
    scheduleReconnect(state);
  };
}

async function processPendingTransaction(job: Job) {
  // Health-job branch (recurring scheduler tick) — no-op rather than treated as
  // an invalid payload.
  if (job.name === HEALTH_JOB_NAME) {
    return { skipped: true, reason: 'health_tick' };
  }

  const payload = (job.data || {}) as {
    chain?: string;
    provider?: string;
    tx?: Record<string, unknown>;
  };
  if (!payload.chain || !payload.tx) return { skipped: true, reason: 'invalid_payload' };

  const pending = toPendingMempoolTx({
    tx: payload.tx,
    chain: payload.chain,
  });
  if (!pending) return { skipped: true, reason: 'invalid_tx' };

  const classified = classifyPendingTx(pending, config.MEMPOOL_MIN_VALUE_USD);
  if (!classified) return { skipped: true, reason: 'below_threshold_or_unsupported' };

  const now = new Date();
  await db
    .insert(mempoolAlerts)
    .values({
      chain: classified.chain,
      provider: payload.provider || config.MEMPOOL_PROVIDER,
      txHash: classified.txHash,
      fromAddress: pending.from,
      toAddress: pending.to,
      routerAddress: classified.routerAddress,
      methodSelector: classified.methodSelector,
      alertType: classified.alertType,
      estimatedValueUsd: classified.estimatedValueUsd != null ? String(classified.estimatedValueUsd) : null,
      nativeValueWei: classified.nativeValueWei,
      tokenIn: classified.tokenIn,
      tokenOut: classified.tokenOut,
      gasLimit: pending.gas ?? null,
      chainIdHex: pending.chainId ?? null,
      gasPriceWei: pending.gasPrice ?? pending.maxFeePerGas ?? null,
      rawTx: pending.raw,
      status: 'pending',
      detectedAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [mempoolAlerts.chain, mempoolAlerts.txHash],
      set: {
        provider: payload.provider || config.MEMPOOL_PROVIDER,
        fromAddress: pending.from,
        toAddress: pending.to,
        routerAddress: classified.routerAddress,
        methodSelector: classified.methodSelector,
        alertType: classified.alertType,
        estimatedValueUsd: classified.estimatedValueUsd != null ? String(classified.estimatedValueUsd) : null,
        nativeValueWei: classified.nativeValueWei,
        gasLimit: pending.gas ?? null,
        chainIdHex: pending.chainId ?? null,
        gasPriceWei: pending.gasPrice ?? pending.maxFeePerGas ?? null,
        rawTx: pending.raw,
        updatedAt: now,
      },
    });

  return { skipped: false, txHash: classified.txHash, alertType: classified.alertType };
}

export function startMempoolWorker(): Worker | null {
  if (!config.MEMPOOL_WORKER_ENABLED) {
    logger.info('[mempool-worker] worker disabled (MEMPOOL_WORKER_ENABLED=false)');
    return null;
  }
  if (_worker) return _worker;

  const chains = parseChains();
  if (chains.length === 0) {
    logger.warn('[mempool-worker] no supported chains in MEMPOOL_CHAINS — worker not started', {
      raw: config.MEMPOOL_CHAINS,
    });
    return null;
  }
  const missing = chains.filter((chain) => !wsUrlForChain(chain));
  if (missing.length > 0) {
    logger.warn('[mempool-worker] skipped startup due to missing WSS urls', { missingChains: missing });
    return null;
  }

  try {
    _worker = new Worker(
      QUEUE_NAME,
      async (job: Job) => processPendingTransaction(job),
      {
        connection: redisConnection,
        concurrency: config.MEMPOOL_WORKER_CONCURRENCY,
        lockDuration: 120_000,
      },
    );
  } catch (err) {
    logger.error('[mempool-worker] failed to start worker', {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }

  _worker.on('error', (err) => logger.error('[mempool-worker] worker error', { error: String(err) }));
  _worker.on('failed', (job, err) =>
    logger.error('[mempool-worker] job failed', {
      jobId: job?.id,
      attempts: job?.attemptsMade,
      error: String(err),
    }),
  );

  for (const chain of chains) {
    const state: WsState = {
      chain,
      url: wsUrlForChain(chain),
      ws: null,
      reconnectTimer: null,
      requestId: 0,
      pendingLookup: new Map<number, PendingEntry>(),
      stopped: false,
      consecutiveFailures: 0,
    };
    _wsState.set(chain, state);
    setupSocket(state);
  }

  logger.info('[mempool-worker] started', { chains, provider: config.MEMPOOL_PROVIDER });
  return _worker;
}

export async function setupMempoolJobs() {
  // Only schedule recurring health jobs when the worker actually started — otherwise
  // jobs accumulate in Redis with no consumer.
  if (!config.MEMPOOL_WORKER_ENABLED || !_worker) return;
  const queue = getMempoolQueue();
  await queue.upsertJobScheduler(
    HEALTH_SCHEDULER_ID,
    { every: 300_000 },
    { name: HEALTH_JOB_NAME, data: {}, opts: { attempts: 1, removeOnComplete: 50, removeOnFail: 50 } },
  );
}

export async function stopMempoolWorker() {
  for (const [, state] of _wsState) {
    state.stopped = true;
    if (state.reconnectTimer) clearTimeout(state.reconnectTimer);
    state.pendingLookup.clear();
    if (state.ws) {
      try {
        state.ws.close();
      } catch {}
    }
  }
  _wsState.clear();

  if (_worker) {
    await _worker.close();
    _worker = null;
  }
  if (_queue) {
    await _queue.close();
    _queue = null;
  }
}
