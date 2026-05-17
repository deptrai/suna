import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';

const mockConfig = {
  ARKHAM_WORKER_ENABLED: true,
  ARKHAM_API_KEY: 'test-arkham-key',
  ARKHAM_API_BASE_URL: 'https://api.arkm.com',
  ARKHAM_SYNC_INTERVAL_MS: 3_600_000,
  ARKHAM_WORKER_CONCURRENCY: 1,
  ARKHAM_TOP_HOLDER_LIMIT: 50,
  ARKHAM_CACHE_TTL_MS: 86_400_000,
  DUNE_API_KEY: 'dune-test-key',
  DUNE_TOKEN_HOLDERS_QUERY_ID: '222',
};

const queueInstances: Array<any> = [];
const workerInstances: Array<any> = [];

// Captures every db.insert().values() call for assertion in failover tests
const capturedInserts: Array<{ values: any }> = [];

class FakeQueue {
  name: string;
  options: unknown;
  closed = false;
  schedulerCalls: Array<any> = [];
  addCalls: Array<any> = [];
  constructor(name: string, options: unknown) {
    this.name = name;
    this.options = options;
    queueInstances.push(this);
  }
  async add(...args: any[]) {
    this.addCalls.push(args);
    return { id: 'job-1' };
  }
  async upsertJobScheduler(...args: any[]) {
    this.schedulerCalls.push(args);
  }
  async close() {
    this.closed = true;
  }
}

class FakeWorker {
  name: string;
  processor: unknown;
  options: unknown;
  closed = false;
  listeners: Record<string, Function> = {};
  constructor(name: string, processor: unknown, options: unknown) {
    this.name = name;
    this.processor = processor;
    this.options = options;
    workerInstances.push(this);
  }
  on(event: string, handler: Function) {
    this.listeners[event] = handler;
    return this;
  }
  async close() {
    this.closed = true;
  }
}

// Mutable Arkham mock — tests can override these to simulate failure
let mockFetchArkhamTokenHolders: (chain: string, tokenAddress: string, opts?: any) => Promise<any> = async () => ({
  holders: [],
  totalHolders: 0,
  chain: 'ethereum',
  tokenAddress: '0xtoken',
});
let mockFetchDuneTokenHolders: (chain: string, tokenAddress: string, opts?: any) => Promise<any> = async () => ({
  holders: [],
  totalHolders: null,
  chain: 'ethereum',
  tokenAddress: '0xtoken',
  analysisStatus: 'empty', // explicit: not failed/timeout → DB write for observability
});

mock.module('bullmq', () => ({ Worker: FakeWorker, Queue: FakeQueue }));
mock.module('../../queue/bullmq/connection', () => ({ redisConnection: { host: 'redis', port: 6379 } }));
mock.module('../../shared/db', () => ({
  db: {
    insert: (_table: any) => ({
      values: (vals: any) => {
        capturedInserts.push({ values: vals });
        return { onConflictDoUpdate: async () => undefined };
      },
    }),
  },
}));
mock.module('@epsilon/db', () => ({ entityWalletLabels: {}, tokenHolderEntityRisks: {} }));
mock.module('../../lib/logger', () => ({
  logger: { info: () => undefined, warn: () => undefined, error: () => undefined, debug: () => undefined },
}));
mock.module('../../config', () => ({ config: mockConfig }));
mock.module('../../router/services/arkham', () => ({
  fetchArkhamTokenHolders: async (chain: string, tokenAddress: string, opts?: any) =>
    mockFetchArkhamTokenHolders(chain, tokenAddress, opts),
  fetchArkhamBatchAddressIntelligence: async () => [],
  scoreEntity: () => ({ riskCategory: 'unknown', riskLevel: 'none', riskScore: 0 }),
  computeHolderRiskSummary: () => ({ riskyHolderCount: 0, riskScore: 0, riskLevel: 'none', riskFactors: [] }),
}));
mock.module('../../router/services/dune-labels', () => ({
  fetchDuneTokenHolders: async (chain: string, tokenAddress: string, opts?: any) =>
    mockFetchDuneTokenHolders(chain, tokenAddress, opts),
}));

import { startEntityWalletWorker, setupEntityWalletJobs, stopEntityWalletWorker } from '../../queue/bullmq/workers/entity-wallet-worker';

// One holder with entity data so it skips the Arkham batch-enrich path
const DUNE_HOLDER = {
  address: '0xduneholder',
  balance: '1000000',
  percentage: 3.5,
  entityId: 'known_exchange',
  entityName: 'Known Exchange',
  entityType: 'exchange',
  tags: ['exchange'],
};
const ARKHAM_HOLDER = {
  address: '0xarkhamholder',
  balance: '2000000',
  percentage: 7.0,
  entityId: 'arkham_entity',
  entityName: 'Arkham Entity',
  entityType: 'exchange',
  tags: ['exchange'],
};

beforeEach(async () => {
  mockConfig.ARKHAM_WORKER_ENABLED = true;
  mockConfig.ARKHAM_API_KEY = 'test-arkham-key';
  mockConfig.DUNE_API_KEY = 'dune-test-key';
  mockConfig.DUNE_TOKEN_HOLDERS_QUERY_ID = '222';
  queueInstances.length = 0;
  workerInstances.length = 0;
  capturedInserts.length = 0;
  mockFetchArkhamTokenHolders = async () => ({ holders: [], totalHolders: 0, chain: 'ethereum', tokenAddress: '0xtoken' });
  mockFetchDuneTokenHolders = async () => ({ holders: [], totalHolders: null, chain: 'ethereum', tokenAddress: '0xtoken' });
  await stopEntityWalletWorker();
});

// ─── Lifecycle ───────────────────────────────────────────────────────────────

describe('entity-wallet worker lifecycle', () => {
  test('[P0] does not start when ARKHAM_WORKER_ENABLED=false', () => {
    mockConfig.ARKHAM_WORKER_ENABLED = false;
    const worker = startEntityWalletWorker();
    expect(worker).toBeNull();
    expect(workerInstances).toHaveLength(0);
  });

  test('[P0] returns null when neither Arkham nor Dune configured', () => {
    mockConfig.ARKHAM_API_KEY = '';
    (mockConfig as any).DUNE_API_KEY = undefined;
    const worker = startEntityWalletWorker();
    expect(worker).toBeNull();
    expect(workerInstances).toHaveLength(0);
  });

  test('[P0] starts worker when enabled + Arkham key present', () => {
    const worker = startEntityWalletWorker();
    expect(worker).not.toBeNull();
    expect(workerInstances).toHaveLength(1);
    expect(workerInstances[0].name).toBe('entity-wallet-sync');
  });

  test('[P0] second startEntityWalletWorker() is idempotent', () => {
    startEntityWalletWorker();
    startEntityWalletWorker();
    expect(workerInstances).toHaveLength(1);
  });

  test('[P0] setupEntityWalletJobs registers scheduler', async () => {
    await setupEntityWalletJobs();
    expect(queueInstances).toHaveLength(1);
    const queue = queueInstances[0] as FakeQueue;
    expect(queue.schedulerCalls).toHaveLength(1);
    expect(queue.schedulerCalls[0][0]).toBe('refresh-entity-labels');
    expect(queue.schedulerCalls[0][1]).toEqual({ every: mockConfig.ARKHAM_SYNC_INTERVAL_MS });
    expect(queue.schedulerCalls[0][2]).toMatchObject({ name: 'refresh-entity-labels' });
  });

  test('[P0] stops worker and queue cleanly', async () => {
    startEntityWalletWorker();
    await setupEntityWalletJobs();
    expect(queueInstances).toHaveLength(1);
    const queue = queueInstances[0] as FakeQueue;
    await stopEntityWalletWorker();
    expect(workerInstances[0].closed).toBe(true);
    expect(queue.closed).toBe(true);
  });

  test('[P1] setupEntityWalletJobs skips when disabled', async () => {
    mockConfig.ARKHAM_WORKER_ENABLED = false;
    await setupEntityWalletJobs();
    expect(queueInstances).toHaveLength(0);
  });
});

// ─── Dune startup guard ───────────────────────────────────────────────────────

describe('entity-wallet worker — Dune startup guard', () => {
  test('[P0] starts when Dune-only config (no Arkham key)', () => {
    mockConfig.ARKHAM_API_KEY = '';
    mockConfig.DUNE_API_KEY = 'dune-test-key';
    mockConfig.DUNE_TOKEN_HOLDERS_QUERY_ID = '222';
    const worker = startEntityWalletWorker();
    expect(worker).not.toBeNull();
    expect(workerInstances).toHaveLength(1);
  });

  test('[P0] returns null when Dune keys present but DUNE_TOKEN_HOLDERS_QUERY_ID absent', () => {
    mockConfig.ARKHAM_API_KEY = '';
    (mockConfig as any).DUNE_TOKEN_HOLDERS_QUERY_ID = undefined;
    const worker = startEntityWalletWorker();
    expect(worker).toBeNull();
  });
});

// ─── Dune failover in processTokenHolders ────────────────────────────────────

describe('entity-wallet worker — Dune failover in processTokenHolders', () => {
  async function runTokenHoldersJob(chain = 'ethereum', tokenAddress = '0xtoken') {
    startEntityWalletWorker();
    const processor = workerInstances[0].processor as Function;
    return processor({ name: 'analyze-token-holders', data: { chain, tokenAddress } });
  }

  test('[P0] uses Dune when ARKHAM_API_KEY absent — entityWalletLabels.source = dune', async () => {
    mockConfig.ARKHAM_API_KEY = '';
    mockFetchDuneTokenHolders = async () => ({
      holders: [DUNE_HOLDER],
      totalHolders: 1,
      chain: 'ethereum',
      tokenAddress: '0xtoken',
      analysisStatus: 'complete',
    });

    await runTokenHoldersJob();

    const labelInsert = capturedInserts.find((ci) => ci.values.source === 'dune');
    expect(labelInsert).toBeDefined();
    expect(labelInsert!.values.address).toBe('0xduneholder');
    expect(labelInsert!.values.chain).toBe('ethereum');
  });

  test('[P0] falls back to Dune when fetchArkhamTokenHolders throws', async () => {
    mockFetchArkhamTokenHolders = async () => { throw new Error('arkham 503'); };
    mockFetchDuneTokenHolders = async () => ({
      holders: [DUNE_HOLDER],
      totalHolders: 1,
      chain: 'ethereum',
      tokenAddress: '0xtoken',
      analysisStatus: 'complete',
    });

    await runTokenHoldersJob();

    const labelInsert = capturedInserts.find((ci) => ci.values.source === 'dune');
    expect(labelInsert).toBeDefined();
  });

  test('[P0] keeps source = arkham when Arkham succeeds', async () => {
    mockFetchArkhamTokenHolders = async () => ({
      holders: [ARKHAM_HOLDER],
      totalHolders: 1,
      chain: 'ethereum',
      tokenAddress: '0xtoken',
    });

    await runTokenHoldersJob();

    const labelInsert = capturedInserts.find((ci) => ci.values.source === 'arkham');
    expect(labelInsert).toBeDefined();
    expect(capturedInserts.find((ci) => ci.values.source === 'dune')).toBeUndefined();
  });

  test('[P1] returns inserted=0 and riskLevel=none when no holders from Dune (empty result)', async () => {
    mockConfig.ARKHAM_API_KEY = '';
    mockFetchDuneTokenHolders = async () => ({
      holders: [],
      totalHolders: null,
      chain: 'ethereum',
      tokenAddress: '0xtoken',
      analysisStatus: 'empty', // genuine empty — DB write proceeds for observability
    });

    const result = await runTokenHoldersJob() as { inserted: number; riskLevel: string };
    expect(result.inserted).toBe(0);
    expect(result.riskLevel).toBe('none');
    // Empty result still upserts token-holder risk status for observability.
    expect(capturedInserts).toHaveLength(1);
  });

  test('[P11] skips DB write when Dune returns analysisStatus=failed', async () => {
    mockConfig.ARKHAM_API_KEY = '';
    mockFetchDuneTokenHolders = async () => ({
      holders: [],
      totalHolders: null,
      chain: 'ethereum',
      tokenAddress: '0xtoken',
      analysisStatus: 'failed',
    });

    const result = await runTokenHoldersJob() as { inserted: number; riskLevel: string };
    expect(result.inserted).toBe(0);
    expect(result.riskLevel).toBe('none');
    expect(capturedInserts).toHaveLength(0); // P11: no DB write — provider failure must not mask as clean result
  });

  test('[P11] skips DB write when Dune returns analysisStatus=timeout', async () => {
    mockConfig.ARKHAM_API_KEY = '';
    mockFetchDuneTokenHolders = async () => ({
      holders: [],
      totalHolders: null,
      chain: 'ethereum',
      tokenAddress: '0xtoken',
      analysisStatus: 'timeout',
    });

    const result = await runTokenHoldersJob() as { inserted: number; riskLevel: string };
    expect(result.inserted).toBe(0);
    expect(result.riskLevel).toBe('none');
    expect(capturedInserts).toHaveLength(0); // P11: no DB write — timeout must not mask as clean result
  });

  test('[P1] no Dune fallback when Arkham throws but Dune not configured', async () => {
    mockConfig.ARKHAM_API_KEY = 'test-arkham-key';
    (mockConfig as any).DUNE_TOKEN_HOLDERS_QUERY_ID = undefined;
    mockFetchArkhamTokenHolders = async () => { throw new Error('arkham 503'); };

    // Worker should still run (ARKHAM_API_KEY is set), but processTokenHolders returns 0 holders
    startEntityWalletWorker();
    const processor = workerInstances[0].processor as Function;
    const result = await processor({
      name: 'analyze-token-holders',
      data: { chain: 'ethereum', tokenAddress: '0xtoken' },
    }) as { inserted: number; riskLevel: string };

    expect(result.inserted).toBe(0);
    expect(capturedInserts).toHaveLength(1);
  });
});

afterEach(async () => {
  await stopEntityWalletWorker();
});

// mock.restore() intentionally omitted: it clears ALL module mocks globally in Bun's test
// process, invalidating mocks set by concurrent test files and causing connection.ts to
// re-evaluate with an undefined REDIS_URL. Bun cleans up between test file processes.
