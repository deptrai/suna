import { afterAll, afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';

const mockConfig = {
  MEMPOOL_WORKER_ENABLED: true,
  MEMPOOL_CHAINS: 'ethereum',
  MEMPOOL_WS_URL_ETHEREUM: 'wss://eth.example',
  MEMPOOL_WS_URL_BSC: '',
  MEMPOOL_WS_URL_BASE: '',
  MEMPOOL_PROVIDER: 'quicknode',
  MEMPOOL_MIN_VALUE_USD: 1000,
  MEMPOOL_RECONNECT_DELAY_MS: 1000,
  MEMPOOL_WORKER_CONCURRENCY: 2,
};

const queueInstances: Array<any> = [];
const workerInstances: Array<any> = [];
const websocketInstances: Array<any> = [];

class FakeQueue {
  name: string;
  options: unknown;
  closed = false;
  schedulerCalls: Array<any> = [];
  waitingCount = 0;
  addCalls: Array<any> = [];
  constructor(name: string, options: unknown) {
    this.name = name;
    this.options = options;
    queueInstances.push(this);
  }
  async getWaitingCount() {
    return this.waitingCount;
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

class FakeWebSocket {
  static OPEN = 1;
  static CONNECTING = 0;
  static CLOSED = 3;

  url: string;
  readyState = FakeWebSocket.OPEN;
  sent: string[] = [];
  closed = false;
  onopen: null | (() => void) = null;
  onmessage: null | ((evt: { data: string }) => void | Promise<void>) = null;
  onerror: null | ((evt: unknown) => void) = null;
  onclose: null | (() => void) = null;

  constructor(url: string) {
    this.url = url;
    websocketInstances.push(this);
  }

  send(payload: string) {
    this.sent.push(payload);
  }

  close() {
    this.closed = true;
    this.readyState = FakeWebSocket.CLOSED;
    this.onclose?.();
  }
}

mock.module('bullmq', () => ({ Worker: FakeWorker, Queue: FakeQueue }));
mock.module('../../queue/bullmq/connection', () => ({ redisConnection: { host: 'redis', port: 6379 } }));
mock.module('../../shared/db', () => ({ db: {} }));
mock.module('@epsilon/db', () => ({ mempoolAlerts: {} }));
mock.module('../../lib/logger', () => ({
  logger: {
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined,
  },
}));
mock.module('../../config', () => ({ config: mockConfig }));
mock.module('../../router/services/mempool', () => ({
  classifyPendingTx: () => null,
  toPendingMempoolTx: () => null,
}));

const originalWebSocket = globalThis.WebSocket;
globalThis.WebSocket = FakeWebSocket as unknown as typeof WebSocket;

import { getMempoolQueue, setupMempoolJobs, startMempoolWorker, stopMempoolWorker } from '../../queue/bullmq/workers/mempool-worker';

beforeEach(async () => {
  mockConfig.MEMPOOL_WORKER_ENABLED = true;
  mockConfig.MEMPOOL_CHAINS = 'ethereum';
  mockConfig.MEMPOOL_WS_URL_ETHEREUM = 'wss://eth.example';
  mockConfig.MEMPOOL_WS_URL_BSC = '';
  mockConfig.MEMPOOL_WS_URL_BASE = '';
  mockConfig.MEMPOOL_PROVIDER = 'quicknode';
  mockConfig.MEMPOOL_MIN_VALUE_USD = 1000;
  mockConfig.MEMPOOL_RECONNECT_DELAY_MS = 1000;
  mockConfig.MEMPOOL_WORKER_CONCURRENCY = 2;
  queueInstances.length = 0;
  workerInstances.length = 0;
  websocketInstances.length = 0;
  await stopMempoolWorker();
});

describe('mempool worker lifecycle', () => {
  test('[P0] does not start when disabled', async () => {
    mockConfig.MEMPOOL_WORKER_ENABLED = false;
    const worker = startMempoolWorker();

    expect(worker).toBeNull();
    expect(workerInstances).toHaveLength(0);
  });

  test('[P0] skips startup when a configured chain is missing its WSS URL', async () => {
    mockConfig.MEMPOOL_CHAINS = 'ethereum,bsc';
    mockConfig.MEMPOOL_WS_URL_BSC = '';

    const worker = startMempoolWorker();

    expect(worker).toBeNull();
    expect(workerInstances).toHaveLength(0);
    expect(websocketInstances).toHaveLength(0);
  });

  test('[P0] starts worker, registers scheduler, and stops cleanly', async () => {
    const worker = startMempoolWorker();
    expect(worker).not.toBeNull();
    expect(workerInstances).toHaveLength(1);
    expect(websocketInstances).toHaveLength(1);
    expect(websocketInstances[0].url).toBe('wss://eth.example');

    await setupMempoolJobs();
    const queue = getMempoolQueue() as unknown as FakeQueue;
    expect(queueInstances).toHaveLength(1);
    expect(queue.schedulerCalls).toHaveLength(1);
    expect(queue.schedulerCalls[0][0]).toBe('sync-mempool-health');
    expect(queue.schedulerCalls[0][1]).toEqual({ every: 300_000 });
    expect(queue.schedulerCalls[0][2]).toMatchObject({
      name: 'sync-mempool-health',
      opts: { attempts: 1, removeOnComplete: 50, removeOnFail: 50 },
    });

    await stopMempoolWorker();

    expect(workerInstances[0].closed).toBe(true);
    expect(queue.closed).toBe(true);
    expect(websocketInstances[0].closed).toBe(true);
  });
});

afterEach(async () => {
  await stopMempoolWorker();
});

afterAll(() => {
  globalThis.WebSocket = originalWebSocket;
  mock.restore();
});
