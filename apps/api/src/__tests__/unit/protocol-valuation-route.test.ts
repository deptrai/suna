import { describe, test, expect, beforeEach, afterEach, mock } from 'bun:test';
import { Hono } from 'hono';
import type { AppContext } from '../../types';

let _snapshots: any[] = [];
let _credits = true;
let _deduct = false;
let _fetchCalled = 0;
let _workerEnabled = false;
let _providerEnabled = false;

mock.module('../../shared/db', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({ orderBy: () => ({ limit: async () => _snapshots }), limit: async () => _snapshots }),
        limit: async () => [],
      }),
    }),
  },
}));

mock.module('@epsilon/db', () => ({
  tokenTerminalProjects: { projectId: 'projectId', symbol: 'symbol', marketSector: 'marketSector', tokenAddresses: 'tokenAddresses' },
  tokenTerminalProjectMetrics: { projectId: 'projectId', metricId: 'metricId', timestamp: 'timestamp' },
  tokenTerminalValuationSnapshots: { projectId: 'projectId', fetchedAt: 'fetchedAt', periodEnd: 'periodEnd' },
}));

mock.module('drizzle-orm', () => ({ and: (...a: any[]) => a, gt: (...a: any[]) => a, eq: (...a: any[]) => a, desc: (x: any) => x, inArray: (...a: any[]) => a }));
mock.module('../../router/services/billing', () => ({ checkCredits: async () => ({ hasCredits: _credits }), deductToolCredits: async () => { _deduct = true; } }));
mock.module('../../config', () => ({
  config: {
    TOKEN_TERMINAL_CACHE_TTL_MS: 86_400_000,
    get TOKEN_TERMINAL_WORKER_ENABLED() { return _workerEnabled; },
    TOKEN_TERMINAL_METRICS: 'fees,revenue',
    TOKEN_TERMINAL_MAX_PROJECTS_PER_RUN: 100,
  },
  getToolCost: () => 0.2,
}));
mock.module('../../router/services/token-terminal', () => ({ canCallTokenTerminal: () => _providerEnabled, fetchMetricData: async () => { _fetchCalled++; return []; } }));
mock.module('../../queue/bullmq/workers/token-terminal-worker', () => ({ getTokenTerminalQueue: () => ({ add: async () => ({}) }), JOB_REFRESH_FUNDAMENTALS: 'a', JOB_COMPUTE_SNAPSHOTS: 'b' }));

import { protocolValuation } from '../../router/routes/protocol-valuation';

function app() {
  const a = new Hono<{ Variables: AppContext }>();
  a.use('*', async (c, n) => { c.set('accountId', 'acct'); await n(); });
  a.route('/', protocolValuation);
  return a;
}

beforeEach(() => { _snapshots = []; _credits = true; _deduct = false; _fetchCalled = 0; _workerEnabled = false; _providerEnabled = false; });
afterEach(() => { mock.restore(); });

describe('protocol-valuation route', () => {
  test('cache hit costs 0 and does not call provider', async () => {
    _snapshots = [{ projectId: 'uniswap', valuationSignal: 'fair', riskFactors: [], peerPercentiles: {}, fetchedAt: new Date() }];
    const res = await app().request('/', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ mode: 'project_snapshot', project_id: 'uniswap' }) });
    const data = await res.json() as any;
    expect(data.cost).toBe(0);
    expect(_fetchCalled).toBe(0);
  });

  test('live refresh requires credits', async () => {
    _workerEnabled = true; _providerEnabled = true; _credits = false;
    const res = await app().request('/', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ mode: 'project_snapshot', project_id: 'uniswap', force_refresh: true }) });
    expect(res.status).toBe(402);
  });

  test('missing provider config returns unconfigured', async () => {
    const res = await app().request('/', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ mode: 'project_snapshot', project_id: 'uniswap', force_refresh: true }) });
    const data = await res.json() as any;
    expect(data.code).toBe('unconfigured');
  });
});
