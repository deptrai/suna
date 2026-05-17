import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';

const mockConfig = {
  SOCIAL_SENTIMENT_WORKER_ENABLED: true,
  SOCIAL_SENTIMENT_INTERVAL_MS: 30 * 60 * 1000,
  SANTIMENT_API_KEY: 'sntm-test',
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
  tokenSocialSignals: { slug: 'slug', symbol: 'symbol' },
}));

mock.module('../../lib/logger', () => ({
  logger: { info: () => undefined, warn: () => undefined, error: () => undefined, debug: () => undefined },
}));

mock.module('../../router/services/santiment', () => ({
  fetchTokenMetrics: async () => ({
    slug: 'bitcoin',
    socialVolume24h: 100,
    socialVolumeChange24hPct: 5,
    socialDominancePct: 10,
    sentimentScore: 0.5,
    priceUsd: 50000,
    priceChange24hPct: 2,
  }),
}));

const {
  startSocialSentimentWorker,
  stopSocialSentimentWorker,
  setupSocialSentimentJobs,
  getSocialSentimentQueue,
  QUEUE_NAME,
} = await import('../../queue/bullmq/workers/social-sentiment-worker');

beforeEach(async () => {
  await stopSocialSentimentWorker();
  queueInstances.length = 0;
  workerInstances.length = 0;
  _workerCtorThrows = false;
  mockConfig.SOCIAL_SENTIMENT_WORKER_ENABLED = true;
  mockConfig.SOCIAL_SENTIMENT_INTERVAL_MS = 30 * 60 * 1000;
});

afterAll(async () => {
  await stopSocialSentimentWorker();
});

describe('social-sentiment-worker lifecycle', () => {
  test('[P0] returns null when SOCIAL_SENTIMENT_WORKER_ENABLED=false', () => {
    mockConfig.SOCIAL_SENTIMENT_WORKER_ENABLED = false;
    const w = startSocialSentimentWorker();
    expect(w).toBeNull();
    expect(workerInstances.length).toBe(0);
  });

  test('[P0] creates Worker when enabled', () => {
    const w = startSocialSentimentWorker();
    expect(w).not.toBeNull();
    expect(workerInstances.length).toBe(1);
    expect(workerInstances[0].name).toBe(QUEUE_NAME);
  });

  test('[P0] is idempotent — second call returns same Worker', () => {
    const w1 = startSocialSentimentWorker();
    const w2 = startSocialSentimentWorker();
    expect(w1).toBe(w2);
    expect(workerInstances.length).toBe(1);
  });

  test('[P0] returns null when Worker constructor throws', () => {
    _workerCtorThrows = true;
    const w = startSocialSentimentWorker();
    expect(w).toBeNull();
  });

  test('[P0] uses concurrency=1 (rate-limit safe)', () => {
    startSocialSentimentWorker();
    expect((workerInstances[0].options as any).concurrency).toBe(1);
  });

  test('[P0] registers error and failed listeners', () => {
    startSocialSentimentWorker();
    const listeners = workerInstances[0].listeners;
    expect(typeof listeners.error).toBe('function');
    expect(typeof listeners.failed).toBe('function');
  });

  test('[P0] stopSocialSentimentWorker closes worker and queue', async () => {
    startSocialSentimentWorker();
    getSocialSentimentQueue();
    await stopSocialSentimentWorker();
    expect(workerInstances[0].closed).toBe(true);
    expect(queueInstances[0].closed).toBe(true);
  });
});

describe('setupSocialSentimentJobs', () => {
  test('[P0] no-op when worker disabled', async () => {
    mockConfig.SOCIAL_SENTIMENT_WORKER_ENABLED = false;
    await setupSocialSentimentJobs();
    expect(queueInstances.length).toBe(0);
  });

  test('[P0] registers scheduler with configured interval', async () => {
    mockConfig.SOCIAL_SENTIMENT_INTERVAL_MS = 600_000;
    await setupSocialSentimentJobs();
    expect(queueInstances[0].schedulerCalls[0][1].every).toBe(600_000);
  });

  test('[P0] scheduler uses 3 attempts with exponential backoff', async () => {
    await setupSocialSentimentJobs();
    const opts = queueInstances[0].schedulerCalls[0][2].opts;
    expect(opts.attempts).toBe(3);
    expect(opts.backoff.type).toBe('exponential');
  });
});

describe('getSocialSentimentQueue', () => {
  test('[P1] reuses single queue instance', () => {
    const q1 = getSocialSentimentQueue();
    const q2 = getSocialSentimentQueue();
    expect(q1).toBe(q2);
    expect(queueInstances.length).toBe(1);
  });
});
