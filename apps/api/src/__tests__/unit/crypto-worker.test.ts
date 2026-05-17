import { afterAll, afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';

const mockConfig = {
  CRYPTO_WORKER_ENABLED: true,
  CRYPTO_SYNC_INTERVAL_MS: 5 * 60 * 1000,
  CRYPTO_WORKER_CONCURRENCY: 2,
};

const queueInstances: Array<any> = [];
const workerInstances: Array<any> = [];

class FakeQueue {
  name: string;
  options: unknown;
  closed = false;
  schedulerCalls: Array<any> = [];
  constructor(name: string, options: unknown) {
    this.name = name;
    this.options = options;
    queueInstances.push(this);
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

let _workerCtorThrows = false;

mock.module('bullmq', () => ({
  Queue: FakeQueue,
  Worker: class extends FakeWorker {
    constructor(name: string, processor: unknown, options: unknown) {
      if (_workerCtorThrows) throw new Error('Redis unavailable');
      super(name, processor, options);
    }
  },
  Job: class {},
}));

mock.module('../../config', () => ({
  config: mockConfig,
}));

mock.module('../../queue/bullmq/connection', () => ({
  redisConnection: { host: 'localhost', port: 6379 },
}));

mock.module('../../shared/db', () => ({
  db: {} as any,
  hasDatabase: false,
}));

mock.module('@epsilon/db', () => ({
  createDb: () => ({} as any),
  protocolWatchlist: { slug: 'slug', enabled: 'enabled' },
  protocolTvlSnapshots: { slug: 'slug' },
}));

mock.module('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ eq: [a, b] }),
}));

mock.module('../../lib/logger', () => ({
  logger: { info: () => undefined, warn: () => undefined, error: () => undefined, debug: () => undefined },
}));

mock.module('../../router/services/defillama', () => ({
  fetchProtocolSnapshot: async () => ({
    slug: 'aave', name: 'Aave', tvl_usd: 1e9, tvl_change_24h_pct: 1, apy_avg: null, chains: ['Ethereum'],
  }),
}));

const {
  startCryptoWorker,
  stopCryptoWorker,
  setupCryptoWorkerJobs,
  getCryptoQueue,
  QUEUE_NAME,
} = await import('../../queue/bullmq/workers/crypto-worker');

beforeEach(async () => {
  // Full reset before each test: stop singleton + clear arrays + reset config
  await stopCryptoWorker();
  queueInstances.length = 0;
  workerInstances.length = 0;
  _workerCtorThrows = false;
  mockConfig.CRYPTO_WORKER_ENABLED = true;
  mockConfig.CRYPTO_SYNC_INTERVAL_MS = 5 * 60 * 1000;
  mockConfig.CRYPTO_WORKER_CONCURRENCY = 2;
});

afterAll(async () => {
  await stopCryptoWorker();
});

describe('crypto-worker lifecycle', () => {
  test('[P0] returns null when CRYPTO_WORKER_ENABLED=false (no Worker created)', () => {
    mockConfig.CRYPTO_WORKER_ENABLED = false;
    const w = startCryptoWorker();
    expect(w).toBeNull();
    expect(workerInstances.length).toBe(0);
  });

  test('[P0] creates a single Worker when enabled', () => {
    const w = startCryptoWorker();
    expect(w).not.toBeNull();
    expect(workerInstances.length).toBe(1);
    expect(workerInstances[0].name).toBe(QUEUE_NAME);
  });

  test('[P0] is idempotent — second call returns same Worker instance', () => {
    const w1 = startCryptoWorker();
    const w2 = startCryptoWorker();
    expect(w1).toBe(w2);
    expect(workerInstances.length).toBe(1);
  });

  test('[P0] returns null when Worker constructor throws (Redis unavailable)', () => {
    _workerCtorThrows = true;
    const w = startCryptoWorker();
    expect(w).toBeNull();
  });

  test('[P0] uses configured concurrency in worker options', () => {
    mockConfig.CRYPTO_WORKER_CONCURRENCY = 5;
    startCryptoWorker();
    expect((workerInstances[0].options as any).concurrency).toBe(5);
  });

  test('[P0] registers error and failed event listeners', () => {
    startCryptoWorker();
    const listeners = workerInstances[0].listeners;
    expect(typeof listeners.error).toBe('function');
    expect(typeof listeners.failed).toBe('function');
  });

  test('[P0] stopCryptoWorker closes worker AND queue', async () => {
    startCryptoWorker();
    getCryptoQueue();
    await stopCryptoWorker();
    expect(workerInstances[0].closed).toBe(true);
    expect(queueInstances[0].closed).toBe(true);
  });

  test('[P0] stopCryptoWorker is safe to call when nothing started', async () => {
    await expect(stopCryptoWorker()).resolves.toBeUndefined();
  });
});

describe('setupCryptoWorkerJobs', () => {
  test('[P0] no-op when CRYPTO_WORKER_ENABLED=false (no scheduler call)', async () => {
    mockConfig.CRYPTO_WORKER_ENABLED = false;
    await setupCryptoWorkerJobs();
    expect(queueInstances.length).toBe(0);
  });

  test('[P0] registers job scheduler with configured interval', async () => {
    mockConfig.CRYPTO_SYNC_INTERVAL_MS = 60_000;
    await setupCryptoWorkerJobs();
    expect(queueInstances.length).toBe(1);
    const call = queueInstances[0].schedulerCalls[0];
    expect(call[1].every).toBe(60_000);
  });

  test('[P0] scheduler uses exponential backoff with 3 attempts', async () => {
    await setupCryptoWorkerJobs();
    const call = queueInstances[0].schedulerCalls[0];
    expect(call[2].opts.attempts).toBe(3);
    expect(call[2].opts.backoff.type).toBe('exponential');
  });
});

describe('getCryptoQueue', () => {
  test('[P1] reuses single queue instance across calls', () => {
    const q1 = getCryptoQueue();
    const q2 = getCryptoQueue();
    expect(q1).toBe(q2);
    expect(queueInstances.length).toBe(1);
  });

  test('[P1] queue name is QUEUE_NAME', () => {
    getCryptoQueue();
    expect(queueInstances[0].name).toBe(QUEUE_NAME);
  });
});
