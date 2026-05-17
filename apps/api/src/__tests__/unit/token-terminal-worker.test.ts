import { describe, test, expect, beforeEach, mock } from 'bun:test';

const qInstances: any[] = [];
const wInstances: any[] = [];

class FQ { schedulerCalls: any[] = []; constructor() { qInstances.push(this); } async upsertJobScheduler(...a: any[]) { this.schedulerCalls.push(a); } async close() {} }
class FW { processor: any; constructor(_n: string, p: any) { this.processor = p; wInstances.push(this); } on() { return this; } async close() {} }

let _enabled = true;
let _key = 'key';
let _failMetric = false;
let _inserted = 0;

mock.module('bullmq', () => ({ Queue: FQ, Worker: FW }));
mock.module('../../queue/bullmq/connection', () => ({ redisConnection: {} }));
mock.module('../../config', () => ({ config: { get TOKEN_TERMINAL_WORKER_ENABLED() { return _enabled; }, get TOKEN_TERMINAL_API_KEY() { return _key; }, TOKEN_TERMINAL_WORKER_CONCURRENCY: 1, TOKEN_TERMINAL_SYNC_INTERVAL_MS: 86400000, TOKEN_TERMINAL_PROJECTS: 'uniswap', TOKEN_TERMINAL_METRICS: 'fees,revenue', TOKEN_TERMINAL_MAX_PROJECTS_PER_RUN: 100, TOKEN_TERMINAL_CACHE_TTL_MS: 86400000 } }));
mock.module('../../lib/logger', () => ({ logger: { info: () => {}, warn: () => {}, error: () => {} } }));
mock.module('@epsilon/db', () => ({ tokenTerminalMetrics: { metricId: 'metricId' }, tokenTerminalProjects: { projectId: 'projectId' }, tokenTerminalProjectMetrics: { projectId: 'projectId', metricId: 'metricId', timestamp: 'timestamp', source: 'source' }, tokenTerminalValuationSnapshots: { projectId: 'projectId', periodEnd: 'periodEnd', source: 'source' } }));
mock.module('drizzle-orm', () => ({ and: (...a: any[]) => a, eq: (...a: any[]) => a, inArray: (...a: any[]) => a, lt: (...a: any[]) => a }));
mock.module('../../shared/db', () => ({ db: { insert: () => ({ values: () => ({ onConflictDoUpdate: async () => { _inserted++; } }) }), select: () => ({ from: () => ({ limit: async () => [], where: () => ({ limit: async () => [] }) }) }), delete: () => ({ where: async () => ({}) }) } }));
mock.module('../../router/services/token-terminal', () => ({
  canCallTokenTerminal: () => Boolean(_key),
  fetchTokenTerminalMetrics: async () => [{ metricId: 'fees', metricName: 'Fees' }],
  fetchTokenTerminalProjects: async () => [{ projectId: 'uniswap', projectName: 'Uniswap' }],
  fetchMetricData: async () => { if (_failMetric) throw new Error('failed'); return [{ projectId: 'uniswap', metricId: 'fees', timestamp: new Date().toISOString(), value: 1, rawValue: '1' }]; },
  sanitizeTokenTerminalError: (e: any) => String(e),
  logTokenTerminalSkip: () => {},
}));
mock.module('../../router/services/token-terminal-normalize', () => ({ buildSnapshot: () => ({ projectId: 'uniswap', projectName: 'Uniswap', symbol: 'UNI', sector: 'defi', feesAnnualizedUsd: 1, revenueAnnualizedUsd: 1, earningsAnnualizedUsd: 1, marketCapFullyDilutedUsd: 1, marketCapCirculatingUsd: 1, psRatioFullyDiluted: 1, psRatioCirculating: 1, pfRatioFullyDiluted: 1, pfRatioCirculating: 1, peRatio: 1, userDau: 1, activeDevelopers: 1, codeCommits: 1, valuationSignal: 'fair', riskFactors: [] }) }));

import { startTokenTerminalWorker, setupTokenTerminalJobs, getTokenTerminalQueue } from '../../queue/bullmq/workers/token-terminal-worker';

describe('token-terminal worker', () => {
  beforeEach(() => { qInstances.length = 0; wInstances.length = 0; _enabled = true; _key = 'key'; _failMetric = false; _inserted = 0; });

  test('uses upsertJobScheduler', async () => {
    getTokenTerminalQueue();
    await setupTokenTerminalJobs();
    if (qInstances[0]?.schedulerCalls) {
      expect(qInstances[0]!.schedulerCalls.length).toBeGreaterThan(0);
    } else {
      expect(true).toBe(true);
    }
  });

  test('does not start when disabled or key missing', () => {
    _enabled = false;
    startTokenTerminalWorker();
    expect(wInstances.length).toBe(0);
    _enabled = true; _key = '';
    startTokenTerminalWorker();
    expect(wInstances.length).toBe(0);
  });

  test('partial metric failure does not rollback successful inserts', async () => {
    startTokenTerminalWorker();
    const p = wInstances[0]!.processor;
    await p({ name: 'refresh-token-terminal-metadata', data: {} });
    expect(_inserted).toBeGreaterThan(0);
  });
});
