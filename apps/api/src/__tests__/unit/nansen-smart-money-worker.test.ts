import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';

const mockConfig = {
  NANSEN_SMART_MONEY_WORKER_ENABLED: true,
  NANSEN_API_KEY: 'nansen-test-key',
  NANSEN_SMART_MONEY_CHAINS: 'ethereum,solana',
  NANSEN_SMART_MONEY_CONCURRENCY: 1,
};

const queueInstances: Array<any> = [];
const workerInstances: Array<any> = [];

class FakeQueue {
  name: string;
  options: unknown;
  closed = false;
  upsertCalls: Array<any> = [];
  removeCalls: Array<any> = [];
  constructor(name: string, options: unknown) {
    this.name = name;
    this.options = options;
    queueInstances.push(this);
  }
  async upsertJobScheduler(...args: any[]) {
    this.upsertCalls.push(args);
  }
  async removeJobScheduler(...args: any[]) {
    this.removeCalls.push(args);
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

mock.module('bullmq', () => ({
  Queue: FakeQueue,
  Worker: FakeWorker,
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
  nansenSmartMoneyFlows: { id: 'id' },
  nansenTokenGodModeCache: { id: 'id' },
}));

mock.module('drizzle-orm', () => ({
  lt: () => ({}),
  and: () => ({}),
  eq: () => ({}),
}));

mock.module('../../lib/logger', () => ({
  logger: { info: () => undefined, warn: () => undefined, error: () => undefined, debug: () => undefined },
}));

class FakeNansenError extends Error {
  status?: number;
}

mock.module('../../router/services/nansen', () => ({
  fetchSmartMoneyNetflow: async () => ({}),
  fetchTgmWhoBoughtSold: async () => ({}),
  fetchTgmFlows: async () => ({}),
  canCallNansen: () => true,
  isChainSupported: () => true,
  NansenRateLimitError: class extends FakeNansenError { constructor() { super('rate limit'); this.status = 429; } },
  NansenForbiddenError: class extends FakeNansenError { constructor() { super('forbidden'); this.status = 403; } },
  NansenPaymentRequiredError: class extends FakeNansenError { constructor() { super('402'); this.status = 402; } },
}));

mock.module('../../router/services/nansen-normalize', () => ({
  normalizeTopBuyers: () => [],
  normalizeTopSellers: () => [],
  normalizeFlowBreakdown: () => ({}),
  summarizeNetflow: () => ({}),
  computeSignalFactors: () => ({}),
  deriveRiskLevel: () => 'LOW',
  buildSignalSummary: () => '',
}));

const {
  startNansenSmartMoneyWorker,
  stopNansenSmartMoneyWorker,
  setupNansenSmartMoneyJobs,
  getNansenSmartMoneyQueue,
  QUEUE_NAME,
  JOB_CLEANUP,
} = await import('../../queue/bullmq/workers/nansen-smart-money-worker');

beforeEach(async () => {
  await stopNansenSmartMoneyWorker();
  queueInstances.length = 0;
  workerInstances.length = 0;
  mockConfig.NANSEN_SMART_MONEY_WORKER_ENABLED = true;
  mockConfig.NANSEN_API_KEY = 'nansen-test-key';
  mockConfig.NANSEN_SMART_MONEY_CHAINS = 'ethereum,solana';
  mockConfig.NANSEN_SMART_MONEY_CONCURRENCY = 1;
});

afterAll(async () => {
  await stopNansenSmartMoneyWorker();
});

describe('nansen-smart-money-worker lifecycle', () => {
  test('[P0] does not start when NANSEN_SMART_MONEY_WORKER_ENABLED=false', () => {
    mockConfig.NANSEN_SMART_MONEY_WORKER_ENABLED = false;
    startNansenSmartMoneyWorker();
    expect(workerInstances.length).toBe(0);
  });

  test('[P0] does not start when NANSEN_API_KEY missing (key-required guard)', () => {
    mockConfig.NANSEN_API_KEY = '';
    startNansenSmartMoneyWorker();
    expect(workerInstances.length).toBe(0);
  });

  test('[P0] starts Worker when both enabled flag AND API key set', () => {
    startNansenSmartMoneyWorker();
    expect(workerInstances.length).toBe(1);
    expect(workerInstances[0].name).toBe(QUEUE_NAME);
  });

  test('[P0] is idempotent — second call does not create another Worker', () => {
    startNansenSmartMoneyWorker();
    startNansenSmartMoneyWorker();
    expect(workerInstances.length).toBe(1);
  });

  test('[P0] uses configured concurrency', () => {
    mockConfig.NANSEN_SMART_MONEY_CONCURRENCY = 3;
    startNansenSmartMoneyWorker();
    expect((workerInstances[0].options as any).concurrency).toBe(3);
  });

  test('[P0] registers error and failed listeners', () => {
    startNansenSmartMoneyWorker();
    const listeners = workerInstances[0].listeners;
    expect(typeof listeners.error).toBe('function');
    expect(typeof listeners.failed).toBe('function');
  });

  test('[P0] stop closes worker and queue', async () => {
    startNansenSmartMoneyWorker();
    getNansenSmartMoneyQueue();
    await stopNansenSmartMoneyWorker();
    expect(workerInstances[0].closed).toBe(true);
    expect(queueInstances[0].closed).toBe(true);
  });
});

describe('setupNansenSmartMoneyJobs', () => {
  test('[P0] no-op when worker disabled', async () => {
    mockConfig.NANSEN_SMART_MONEY_WORKER_ENABLED = false;
    await setupNansenSmartMoneyJobs();
    expect(queueInstances.length).toBe(0);
  });

  test('[P0] no-op when NANSEN_API_KEY missing', async () => {
    mockConfig.NANSEN_API_KEY = '';
    await setupNansenSmartMoneyJobs();
    expect(queueInstances.length).toBe(0);
  });

  test('[P0] removes legacy NETFLOW scheduler then upserts CLEANUP cron', async () => {
    await setupNansenSmartMoneyJobs();
    expect(queueInstances[0].removeCalls.length).toBe(1);
    expect(queueInstances[0].upsertCalls.length).toBe(1);
    const upsertCall = queueInstances[0].upsertCalls[0];
    expect(upsertCall[0]).toContain('cleanup');
    expect(upsertCall[1].pattern).toBe('37 2 * * *');
    expect(upsertCall[2].name).toBe(JOB_CLEANUP);
  });

  test('[P0] removeJobScheduler errors are swallowed gracefully', async () => {
    // Force removeJobScheduler to throw
    const origRemove = FakeQueue.prototype.removeJobScheduler;
    FakeQueue.prototype.removeJobScheduler = async () => {
      throw new Error('not found');
    };
    try {
      await expect(setupNansenSmartMoneyJobs()).resolves.toBeUndefined();
    } finally {
      FakeQueue.prototype.removeJobScheduler = origRemove;
    }
  });
});

describe('getNansenSmartMoneyQueue', () => {
  test('[P1] reuses single queue instance', () => {
    const q1 = getNansenSmartMoneyQueue();
    const q2 = getNansenSmartMoneyQueue();
    expect(q1).toBe(q2);
    expect(queueInstances.length).toBe(1);
  });

  test('[P1] queue name is QUEUE_NAME', () => {
    getNansenSmartMoneyQueue();
    expect(queueInstances[0].name).toBe(QUEUE_NAME);
  });
});
