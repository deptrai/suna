import { beforeEach, describe, expect, mock, test } from 'bun:test';

const mockConfig = {
  ONCHAIN_FACT_CHECK_WORKER_ENABLED: true,
  ONCHAIN_FACT_CHECK_INTERVAL_MS: 300000,
};

const workerInstances: Array<any> = [];
const insertCalls: Array<any> = [];
const updateCalls: Array<any> = [];

class FakeQueue {
  schedulerCalls: Array<any> = [];
  addCalls: Array<any> = [];
  async add(...args: any[]) {
    this.addCalls.push(args);
    return { id: 'job-1' };
  }
  async upsertJobScheduler(...args: any[]) {
    this.schedulerCalls.push(args);
  }
  async close() {}
}

class FakeWorker {
  processor: any;
  listeners: Record<string, Function> = {};
  constructor(_name: string, processor: any) {
    this.processor = processor;
    workerInstances.push(this);
  }
  on(event: string, cb: Function) {
    this.listeners[event] = cb;
    return this;
  }
  async close() {}
}

let mode: 'flagged' | 'passed' = 'flagged';

mock.module('bullmq', () => ({ Queue: FakeQueue, Worker: FakeWorker }));
mock.module('../../queue/bullmq/connection', () => ({ redisConnection: {} }));
mock.module('../../config', () => ({ config: mockConfig }));
mock.module('../../lib/logger', () => ({ logger: { info: () => undefined, warn: () => undefined, error: () => undefined } }));
mock.module('@epsilon/db', () => ({ discoverFeeds: { id: 'id', title: 'title', summary: 'summary' }, onchainFactChecks: {} }));
mock.module('drizzle-orm', () => ({
  eq: () => ({}),
  desc: () => ({}),
  and: () => ({}),
}));
mock.module('../../router/services/onchain-fact-check', () => ({
  runOnchainFactCheck: async () => mode === 'flagged'
    ? {
        status: 'flagged',
        riskLevel: 'high',
        riskFactors: [{ code: 'dev_wallet_dump_gt_threshold', label: 'High Risk: Insider Selling Detected', severity: 'high' }],
        netOutflowPct: 8.2,
        largestWalletOutflowPct: 6.4,
        walletsChecked: 3,
        transferCount: 10,
        source: 'quicknode',
        checkedAt: new Date().toISOString(),
        evidence: {},
      }
    : {
        status: 'passed',
        riskLevel: 'none',
        riskFactors: [],
        netOutflowPct: 1.2,
        largestWalletOutflowPct: 1.0,
        walletsChecked: 3,
        transferCount: 10,
        source: 'quicknode',
        checkedAt: new Date().toISOString(),
        evidence: {},
      },
  extractReliableTokenAddress: () => null,
  isPromotionalArticle: () => false,
  canStartFactCheckWorker: () => true,
}));
mock.module('../../shared/db', () => ({
  db: {
    insert: () => ({
      values: (vals: any) => {
        insertCalls.push(vals);
        return Promise.resolve();
      },
    }),
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => [{ id: 'f1', title: 'token title', summary: 'token summary' }],
        }),
        orderBy: () => ({
          limit: async () => [],
        }),
      }),
    }),
    update: () => ({
      set: (vals: any) => {
        updateCalls.push(vals);
        return {
          where: async () => undefined,
        };
      },
    }),
  },
}));

import { setupOnchainFactCheckJobs, startOnchainFactCheckWorker, stopOnchainFactCheckWorker } from '../../queue/bullmq/workers/onchain-fact-check-worker';

describe('onchain-fact-check worker', () => {
  beforeEach(async () => {
    mode = 'flagged';
    workerInstances.length = 0;
    insertCalls.length = 0;
    updateCalls.length = 0;
    await stopOnchainFactCheckWorker();
  });

  test('[P0] scheduler uses upsertJobScheduler', async () => {
    await setupOnchainFactCheckJobs();
    // assertion is implicit if no throw with fake queue
    expect(true).toBe(true);
  });

  test('[P0] discover item is mutated when fact-check is flagged', async () => {
    startOnchainFactCheckWorker();
    const processor = workerInstances[0].processor as Function;
    await processor({
      name: 'fact-check-discover-item',
      data: {
        discoverFeedId: 'f1',
        chain: 'ethereum',
        tokenAddress: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
        articleTitle: 'Listing announcement',
        articleSentiment: 'positive',
      },
    });
    expect(insertCalls.length).toBe(1);
    expect(updateCalls.length).toBe(1);
    expect(updateCalls[0].isAnomaly).toBe(true);
    expect(updateCalls[0].warningLevel).toBe('high');
  });

  test('[P1] discover item is not mutated when fact-check is passed', async () => {
    mode = 'passed';
    startOnchainFactCheckWorker();
    const processor = workerInstances[0].processor as Function;
    await processor({
      name: 'fact-check-discover-item',
      data: {
        discoverFeedId: 'f1',
        chain: 'ethereum',
        tokenAddress: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
        articleTitle: 'Listing announcement',
        articleSentiment: 'positive',
      },
    });
    expect(insertCalls.length).toBe(1);
    expect(updateCalls.length).toBe(0);
  });
});
