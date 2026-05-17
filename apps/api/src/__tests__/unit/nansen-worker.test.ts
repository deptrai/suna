import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';

// ─── BullMQ mock ──────────────────────────────────────────────────────────────

const queueInstances: Array<any> = [];
const workerInstances: Array<any> = [];

class FakeQueue {
  name: string;
  closed = false;
  schedulerCalls: Array<any> = [];
  addCalls: Array<any> = [];
  constructor(name: string, _opts?: unknown) {
    this.name = name;
    queueInstances.push(this);
  }
  async add(...args: any[]) { this.addCalls.push(args); return { id: 'job-1' }; }
  async upsertJobScheduler(...args: any[]) { this.schedulerCalls.push(args); }
  async close() { this.closed = true; }
}

class FakeWorker {
  name: string;
  processor: unknown;
  closed = false;
  listeners: Record<string, Function> = {};
  constructor(name: string, processor: unknown, _opts?: unknown) {
    this.name = name;
    this.processor = processor;
    workerInstances.push(this);
  }
  on(event: string, handler: Function) { this.listeners[event] = handler; return this; }
  async close() { this.closed = true; }
}

mock.module('bullmq', () => ({ Worker: FakeWorker, Queue: FakeQueue }));

mock.module('../../queue/bullmq/connection', () => ({
  redisConnection: { host: 'localhost', port: 6379 },
}));

// ─── DB mock ──────────────────────────────────────────────────────────────────

const capturedInserts: Array<any> = [];
let _tgmCacheRows: any[] = [];

mock.module('../../shared/db', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          orderBy: () => ({
            limit: async () => _tgmCacheRows,
          }),
          limit: async () => _tgmCacheRows,
        }),
      }),
    }),
    insert: (table: any) => ({
      values: (vals: any) => {
        capturedInserts.push({ table, values: vals });
        return { onConflictDoUpdate: async () => undefined };
      },
    }),
    delete: () => ({
      where: async () => ({ rowCount: 1 }),
    }),
  },
}));

mock.module('@epsilon/db', () => ({
  nansenSmartMoneyFlows: { name: 'nansen_smart_money_flows', chain: 'chain', tokenAddress: 'tokenAddress', cacheExpiresAt: 'cacheExpiresAt' },
  nansenTokenGodModeCache: { name: 'nansen_token_god_mode_cache', chain: 'chain', tokenAddress: 'tokenAddress', cacheExpiresAt: 'cacheExpiresAt', source: 'source' },
}));

mock.module('drizzle-orm', () => ({
  eq: (col: unknown, val: unknown) => ({ col, val, op: 'eq' }),
  and: (...args: unknown[]) => ({ args, op: 'and' }),
  gt: (col: unknown, val: unknown) => ({ col, val, op: 'gt' }),
  lt: (col: unknown, val: unknown) => ({ col, val, op: 'lt' }),
  lte: (col: unknown, val: unknown) => ({ col, val, op: 'lte' }),
  asc: (col: unknown) => ({ col, dir: 'asc' }),
}));

// ─── Config mock ──────────────────────────────────────────────────────────────

const mockConfig = {
  NANSEN_SMART_MONEY_WORKER_ENABLED: true,
  NANSEN_API_KEY: 'test-nansen-key',
  NANSEN_API_BASE_URL: 'https://api.nansen.ai/api/v1',
  NANSEN_SMART_MONEY_CHAINS: 'ethereum,base',
  NANSEN_SMART_MONEY_SYNC_INTERVAL_MS: 300_000,
  NANSEN_SMART_MONEY_CACHE_TTL_MS: 300_000,
  NANSEN_SMART_MONEY_CONCURRENCY: 1,
  NANSEN_SMART_MONEY_TOP_N: 20,
  NANSEN_SMART_MONEY_LOOKBACK_HOURS: 1,
  REDIS_URL: 'redis://localhost:6379',
};

mock.module('../../config', () => ({ config: mockConfig }));
mock.module('../../lib/logger', () => ({
  logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
}));

// ─── Nansen service mock ──────────────────────────────────────────────────────

let _nansenCallEnabled = true;
let _netflowShouldFail = false;
let _buyersShouldFail = false;
let _sellersShouldFail = false;
let _smFlowsShouldFail = false;
let _exFlowsShouldFail = false;
let _netflowCallCount = 0;
let _tgmCallCount = 0;

class FakeNansenError extends Error {
  constructor(msg: string) { super(msg); this.name = 'NansenError'; }
}

class FakeFatalError extends Error {
  constructor(msg: string) { super(msg); this.name = 'NansenFatalError'; }
}

mock.module('../../router/services/nansen', () => ({
  canCallNansen: () => _nansenCallEnabled,
  NansenRateLimitError: FakeNansenError,
  NansenPaymentRequiredError: FakeFatalError,
  NansenForbiddenError: FakeFatalError,
  NansenUnsupportedChainError: FakeNansenError,
  fetchSmartMoneyNetflow: async () => {
    _netflowCallCount++;
    if (_netflowShouldFail) throw new FakeNansenError('netflow failed');
    return { data: [{ netflowUsd: '10000', walletCount: 5 }] };
  },
  fetchTgmWhoBoughtSold: async (_chain: string, _addr: string, buyOrSell: string) => {
    _tgmCallCount++;
    if (buyOrSell === 'buy' && _buyersShouldFail) throw new FakeNansenError('buyers failed');
    if (buyOrSell === 'sell' && _sellersShouldFail) throw new FakeNansenError('sellers failed');
    return { data: [{ wallet_address: '0xtest', bought_volume_usd: '5000', sold_volume_usd: '0', net_usd: '5000', trades: 3, label: null, last_active: null }] };
  },
  fetchTgmFlows: async (_chain: string, _addr: string, label: string) => {
    _tgmCallCount++;
    if (label === 'smart_money' && _smFlowsShouldFail) throw new FakeNansenError('sm flows failed');
    if (label === 'exchange' && _exFlowsShouldFail) throw new FakeNansenError('ex flows failed');
    return { data: [{ label, inflow_usd: '5000', outflow_usd: '1000', wallet_count: 3, trader_count: 2 }] };
  },
}));

mock.module('../../router/services/nansen-normalize', () => ({
  normalizeTopBuyers: (rows: any[]) => rows,
  normalizeTopSellers: (rows: any[]) => rows,
  normalizeFlowBreakdown: (rows: any[]) => rows.map((r: any) => ({ ...r, netflow_usd: 4000 })),
  computeSignalFactors: () => [],
  deriveRiskLevel: () => 'none',
  buildSignalSummary: () => ({ signal: 'neutral', smart_money_net_flow_usd: 0, exchange_net_flow_usd: 0, top_buyer_count: 0, top_seller_count: 0 }),
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import {
  startNansenSmartMoneyWorker,
  setupNansenSmartMoneyJobs,
  stopNansenSmartMoneyWorker,
  getNansenSmartMoneyQueue,
} from '../../queue/bullmq/workers/nansen-smart-money-worker';

// ─── Tests ────────────────────────────────────────────────────────────────────

beforeEach(async () => {
  // Reset singletons between tests so startNansenSmartMoneyWorker() always creates a fresh worker
  await stopNansenSmartMoneyWorker();
  queueInstances.length = 0;
  workerInstances.length = 0;
  capturedInserts.length = 0;
  _tgmCacheRows = [];
  _nansenCallEnabled = true;
  _netflowShouldFail = false;
  _buyersShouldFail = false;
  _sellersShouldFail = false;
  _smFlowsShouldFail = false;
  _exFlowsShouldFail = false;
  _netflowCallCount = 0;
  _tgmCallCount = 0;
  mockConfig.NANSEN_SMART_MONEY_WORKER_ENABLED = true;
  mockConfig.NANSEN_API_KEY = 'test-nansen-key';
});

// ─── Lifecycle ────────────────────────────────────────────────────────────────

describe('worker lifecycle', () => {
  test('[P0] startNansenSmartMoneyWorker creates worker and queue', () => {
    startNansenSmartMoneyWorker();
    expect(workerInstances.length).toBeGreaterThan(0);
    expect(workerInstances[0]!.name).toBe('nansen-smart-money-sync');
  });

  test('[P0] startNansenSmartMoneyWorker is no-op when disabled', () => {
    mockConfig.NANSEN_SMART_MONEY_WORKER_ENABLED = false;
    startNansenSmartMoneyWorker();
    expect(workerInstances.length).toBe(0);
  });

  test('[P0] startNansenSmartMoneyWorker is no-op when API key missing', () => {
    mockConfig.NANSEN_API_KEY = '';
    startNansenSmartMoneyWorker();
    expect(workerInstances.length).toBe(0);
  });

  test('[P0] stopNansenSmartMoneyWorker closes worker and queue', async () => {
    startNansenSmartMoneyWorker();
    const w = workerInstances[0];
    await stopNansenSmartMoneyWorker();
    expect(w.closed).toBe(true);
  });

  test('[P0] setupNansenSmartMoneyJobs registers schedulers', async () => {
    startNansenSmartMoneyWorker();
    await setupNansenSmartMoneyJobs();
    const q = queueInstances[0];
    expect(q.schedulerCalls.length).toBeGreaterThan(0);
  });
});

// ─── Queue singleton ──────────────────────────────────────────────────────────

describe('getNansenSmartMoneyQueue singleton', () => {
  test('[P0] returns same queue instance on multiple calls', () => {
    const q1 = getNansenSmartMoneyQueue();
    const q2 = getNansenSmartMoneyQueue();
    expect(q1).toBe(q2);
  });
});

// ─── Worker processor ─────────────────────────────────────────────────────────

describe('worker processor — partial success', () => {
  test('[P0] partial TGM failure still commits successful results', async () => {
    _buyersShouldFail = true;
    startNansenSmartMoneyWorker();
    const w = workerInstances[0]!;
    const processor = w.processor as Function;

    await processor({
      name: 'refresh-token-god-mode',
      data: { chain: 'ethereum', tokenAddress: '0xtoken', tokenSymbol: 'TEST' },
    });

    // Insert should have been called (sellers/flows succeeded)
    expect(capturedInserts.length).toBeGreaterThan(0);
  });

  test('[P0] all TGM calls fail — still commits empty result with partial status', async () => {
    _buyersShouldFail = true;
    _sellersShouldFail = true;
    _smFlowsShouldFail = true;
    _exFlowsShouldFail = true;

    startNansenSmartMoneyWorker();
    const w = workerInstances[0]!;
    const processor = w.processor as Function;

    // Should not throw even if all calls fail — use direct await
    let caughtErr: unknown = null;
    try {
      await processor({
        name: 'refresh-token-god-mode',
        data: { chain: 'ethereum', tokenAddress: '0xtoken', tokenSymbol: 'TEST' },
      });
    } catch (e) {
      caughtErr = e;
    }
    expect(caughtErr).toBeNull();
  });

  test('[P0] netflow job commits data to DB', async () => {
    startNansenSmartMoneyWorker();
    const w = workerInstances[0]!;
    const processor = w.processor as Function;

    await processor({
      name: 'refresh-smart-money-netflow',
      data: { chains: ['ethereum'] },
    });

    // Netflow was called
    expect(_netflowCallCount).toBeGreaterThan(0);
    expect(capturedInserts.length).toBeGreaterThan(0);
  });

  test('[P1] netflow job gracefully continues when one chain fails', async () => {
    _netflowShouldFail = true;
    startNansenSmartMoneyWorker();
    const w = workerInstances[0]!;
    const processor = w.processor as Function;

    let caughtErr: unknown = null;
    try {
      await processor({
        name: 'refresh-smart-money-netflow',
        data: {},
      });
    } catch (e) {
      caughtErr = e;
    }
    expect(caughtErr).toBeNull();
  });
});
