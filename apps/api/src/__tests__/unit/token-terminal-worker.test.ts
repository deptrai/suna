import { describe, test, expect, beforeEach, mock } from 'bun:test';

const qInstances: any[] = [];
const wInstances: any[] = [];

class FQ {
  schedulerCalls: any[] = [];
  addCalls: any[] = [];
  constructor() { qInstances.push(this); }
  async upsertJobScheduler(...a: any[]) { this.schedulerCalls.push(a); }
  async add(...a: any[]) { this.addCalls.push(a); return {}; }
  async close() {}
}
class FW { processor: any; constructor(_n: string, p: any) { this.processor = p; wInstances.push(this); } on() { return this; } async close() {} }

let _enabled = true;
let _key = 'key';
let _failMetric = false;
let _metadataInserts = 0;
let _fundamentalsInserts = 0;
let _snapshotInserts = 0;
let _selectMetricsRows: any[] = [];
let _selectProjectRows: any[] = [];
let _selectTimestampRows: any[] = [];

mock.module('bullmq', () => ({ Queue: FQ, Worker: FW }));
mock.module('../../queue/bullmq/connection', () => ({ redisConnection: {} }));
mock.module('../../config', () => ({ config: {
  get TOKEN_TERMINAL_WORKER_ENABLED() { return _enabled; },
  get TOKEN_TERMINAL_API_KEY() { return _key; },
  TOKEN_TERMINAL_WORKER_CONCURRENCY: 1,
  TOKEN_TERMINAL_SYNC_INTERVAL_MS: 86400000,
  TOKEN_TERMINAL_PROJECTS: 'uniswap,aave',
  TOKEN_TERMINAL_METRICS: 'fees,revenue',
  TOKEN_TERMINAL_MAX_PROJECTS_PER_RUN: 100,
  TOKEN_TERMINAL_CACHE_TTL_MS: 86400000,
} }));
mock.module('../../lib/logger', () => ({ logger: { info: () => {}, warn: () => {}, error: () => {} } }));
mock.module('@epsilon/db', () => ({
  tokenTerminalMetrics: { metricId: 'metricId' },
  tokenTerminalProjects: { projectId: 'projectId' },
  tokenTerminalProjectMetrics: { projectId: 'projectId', metricId: 'metricId', timestamp: 'timestamp', source: 'source' },
  tokenTerminalValuationSnapshots: { projectId: 'projectId', periodEnd: 'periodEnd', source: 'source' },
}));
mock.module('drizzle-orm', () => ({
  and: (...a: any[]) => a,
  eq: (...a: any[]) => a,
  inArray: (...a: any[]) => a,
  lt: (...a: any[]) => a,
  desc: (x: any) => x,
}));

let _currentTable: 'metrics_table' | 'projects_table' | 'metric_rows' | 'timestamp_rows' | null = null;

mock.module('../../shared/db', () => ({
  db: {
    insert: (table: any) => ({
      values: () => ({
        onConflictDoUpdate: async () => {
          if (table === 'projects_table' || table?.metricId === 'metricId') _metadataInserts++;
          if (table?.projectId === 'projectId' && table?.timestamp === 'timestamp') _fundamentalsInserts++;
          if (table?.periodEnd === 'periodEnd') _snapshotInserts++;
        },
      }),
    }),
    select: (cols?: any) => ({
      from: (table: any) => {
        // detect intent based on selected columns
        const isTimestampOnly = cols && Object.keys(cols).length === 1 && cols.timestamp;
        return {
          limit: async () => (table?.metricId === 'metricId' ? _selectMetricsRows : _selectProjectRows),
          where: () => ({
            limit: async () => (isTimestampOnly ? _selectTimestampRows : _selectMetricsRows),
            orderBy: () => ({ limit: async () => (isTimestampOnly ? _selectTimestampRows : _selectMetricsRows) }),
          }),
          orderBy: () => ({ limit: async () => _selectProjectRows }),
        };
      },
    }),
    delete: () => ({ where: async () => ({}) }),
  },
}));

mock.module('../../router/services/token-terminal', () => ({
  canCallTokenTerminal: () => Boolean(_key),
  fetchTokenTerminalMetrics: async () => [{ metricId: 'fees', metricName: 'Fees' }, { metricId: 'revenue', metricName: 'Revenue' }],
  fetchTokenTerminalProjects: async () => [{ projectId: 'uniswap', projectName: 'Uniswap' }, { projectId: 'aave', projectName: 'Aave' }],
  fetchMetricData: async (metricId: string) => {
    if (_failMetric && metricId === 'fees') throw new Error('rate limit');
    return [{ projectId: 'uniswap', metricId, timestamp: new Date().toISOString(), value: 1, rawValue: '1' }];
  },
  sanitizeTokenTerminalError: (e: any) => String(e),
  logTokenTerminalSkip: () => {},
}));

mock.module('../../router/services/token-terminal-normalize', () => ({
  buildSnapshot: () => ({
    projectId: 'uniswap', projectName: 'Uniswap', symbol: 'UNI', sector: 'defi',
    feesAnnualizedUsd: 1, revenueAnnualizedUsd: 1, earningsAnnualizedUsd: 1,
    marketCapFullyDilutedUsd: 1, marketCapCirculatingUsd: 1,
    psRatioFullyDiluted: 1, psRatioCirculating: 1, pfRatioFullyDiluted: 1, pfRatioCirculating: 1, peRatio: 1,
    userDau: 1, activeDevelopers: 1, codeCommits: 1,
    riskFactors: [],
  }),
  classifyAgainstPeers: () => ({ valuationSignal: 'fair', peerPercentiles: { ps_ratio_fully_diluted: 50 } }),
}));

import { startTokenTerminalWorker, setupTokenTerminalJobs, getTokenTerminalQueue, stopTokenTerminalWorker } from '../../queue/bullmq/workers/token-terminal-worker';

describe('token-terminal worker', () => {
  beforeEach(async () => {
    await stopTokenTerminalWorker();
    qInstances.length = 0; wInstances.length = 0;
    _enabled = true; _key = 'key'; _failMetric = false;
    _metadataInserts = 0; _fundamentalsInserts = 0; _snapshotInserts = 0;
    _selectMetricsRows = []; _selectProjectRows = []; _selectTimestampRows = [];
  });

  test('uses upsertJobScheduler (not deprecated repeat)', async () => {
    getTokenTerminalQueue();
    await setupTokenTerminalJobs();
    expect(qInstances[0]).toBeDefined();
    expect(qInstances[0]!.schedulerCalls.length).toBeGreaterThan(0);
    expect(qInstances[0]!.addCalls.length).toBe(0);
  });

  test('does not start worker when disabled', () => {
    _enabled = false;
    startTokenTerminalWorker();
    expect(wInstances.length).toBe(0);
  });

  test('does not start worker when API key missing', () => {
    _key = '';
    startTokenTerminalWorker();
    expect(wInstances.length).toBe(0);
  });

  test('setupTokenTerminalJobs skips when disabled (no jobs scheduled)', async () => {
    _enabled = false;
    await setupTokenTerminalJobs();
    // no queue should be created
    expect(qInstances.length).toBe(0);
  });

  test('partial metric failure does not abort fundamentals job', async () => {
    _failMetric = true;
    startTokenTerminalWorker();
    const p = wInstances[0]!.processor;
    await p({ name: 'refresh-protocol-fundamentals', data: {} });
    // 'fees' fails, 'revenue' succeeds — at least one insert from revenue's row
    expect(_fundamentalsInserts).toBeGreaterThan(0);
  });

  test('snapshots use ordered metrics + classify against peers', async () => {
    _selectProjectRows = [
      { projectId: 'uniswap', projectName: 'Uniswap', symbol: 'UNI', marketSector: 'defi' },
      { projectId: 'aave', projectName: 'Aave', symbol: 'AAVE', marketSector: 'defi' },
    ];
    _selectMetricsRows = [
      { metricId: 'fees', value: '100', timestamp: new Date('2026-05-15') },
      { metricId: 'fees', value: '50', timestamp: new Date('2026-05-10') },
    ];
    _selectTimestampRows = [
      { timestamp: new Date('2026-05-15') },
      { timestamp: new Date('2026-05-14') },
    ];
    startTokenTerminalWorker();
    const p = wInstances[0]!.processor;
    await p({ name: 'compute-valuation-snapshots', data: {} });
    expect(_snapshotInserts).toBe(2);
  });

  test('processSnapshots skips when metric allowlist empty', async () => {
    // override config metrics to empty for this test
    const origMetrics = (await import('../../config')).config.TOKEN_TERMINAL_METRICS;
    (await import('../../config') as any).config.TOKEN_TERMINAL_METRICS = '';
    try {
      _selectProjectRows = [{ projectId: 'uniswap', projectName: 'Uniswap', marketSector: 'defi' }];
      startTokenTerminalWorker();
      const p = wInstances[0]!.processor;
      await p({ name: 'compute-valuation-snapshots', data: {} });
      expect(_snapshotInserts).toBe(0);
    } finally {
      (await import('../../config') as any).config.TOKEN_TERMINAL_METRICS = origMetrics;
    }
  });
});
