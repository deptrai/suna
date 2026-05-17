import { describe, test, expect, mock, beforeEach } from 'bun:test';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { AppContext } from '../../types';

const mockRows = [
  {
    id: '1',
    chain: 'ethereum',
    provider: 'quicknode',
    txHash: '0xabc',
    fromAddress: '0x1',
    toAddress: '0x2',
    routerAddress: '0x3',
    methodSelector: '0x38ed1739',
    alertType: 'sandwich_suspect',
    estimatedValueUsd: '1200.00',
    nativeValueWei: '2000000000000000000',
    gasLimit: '0x5208',
    chainIdHex: '0x1',
    gasPriceWei: '1000000000',
    status: 'pending',
    detectedAt: new Date('2026-05-17T00:00:00.000Z'),
    updatedAt: new Date('2026-05-17T00:00:00.000Z'),
  },
];

const queryLog: Array<{ method: string; arg?: unknown }> = [];
const deductCalls: Array<{ accountId: string; tool: string; rows: number; description?: string; sessionId?: string }> = [];

function chainMock(rows: any[]) {
  return {
    select: (..._args: any[]) => {
      queryLog.push({ method: 'select' });
      return {
        from: (..._args: any[]) => {
          queryLog.push({ method: 'from' });
          return {
            where: (..._args: any[]) => {
              queryLog.push({ method: 'where' });
              return {
                orderBy: (..._args: any[]) => {
                  queryLog.push({ method: 'orderBy' });
                  return {
                    limit: async (n: number) => {
                      queryLog.push({ method: 'limit', arg: n });
                      return rows;
                    },
                  };
                },
              };
            },
          };
        },
      };
    },
  };
}

mock.module('../../shared/db', () => ({ db: chainMock(mockRows) }));

mock.module('@epsilon/db', () => ({
  mempoolAlerts: {
    id: 'id',
    chain: 'chain',
    provider: 'provider',
    txHash: 'txHash',
    fromAddress: 'fromAddress',
    toAddress: 'toAddress',
    routerAddress: 'routerAddress',
    methodSelector: 'methodSelector',
    alertType: 'alertType',
    estimatedValueUsd: 'estimatedValueUsd',
    nativeValueWei: 'nativeValueWei',
    gasLimit: 'gasLimit',
    chainIdHex: 'chainIdHex',
    gasPriceWei: 'gasPriceWei',
    status: 'status',
    detectedAt: 'detectedAt',
    updatedAt: 'updatedAt',
  },
}));

let mockHasCredits = true;
mock.module('../../router/services/billing', () => ({
  checkCredits: async () => ({ hasCredits: mockHasCredits, balance: 100 }),
  deductToolCredits: async (
    accountId: string,
    tool: string,
    rows: number,
    description?: string,
    sessionId?: string,
  ) => {
    deductCalls.push({ accountId, tool, rows, description, sessionId });
    return undefined;
  },
}));

mock.module('../../config', () => ({
  config: {},
  getToolCost: () => 0.5,
}));

import { mempoolAlertsRoute } from '../../router/routes/mempool-alerts';

function makeApp(opts: { accountId?: string | null } = { accountId: 'test-account' }) {
  const app = new Hono<{ Variables: AppContext }>();
  app.use('*', async (c, next) => {
    if (!opts.accountId) throw new HTTPException(401, { message: 'Unauthenticated' });
    c.set('accountId', opts.accountId);
    await next();
  });
  app.route('/v1/router/mempool-alerts', mempoolAlertsRoute);
  app.onError((err, c) => {
    if (err instanceof HTTPException) return err.getResponse();
    return c.json({ success: false, error: String(err) }, 500);
  });
  return app;
}

beforeEach(() => {
  mockHasCredits = true;
  queryLog.length = 0;
  deductCalls.length = 0;
});

describe('GET /v1/router/mempool-alerts', () => {
  test('[P0] returns data through router mount and deducts credits with session_id', async () => {
    const app = makeApp();
    const res = await app.request('/v1/router/mempool-alerts?limit=999&since_minutes=10&session_id=abc_123');

    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.success).toBe(true);
    expect(body.source).toBe('db');
    expect(body.count).toBe(1);
    expect(body.alerts[0].chain).toBe('ethereum');
    expect(body.alerts[0].detectedAt).toBe('2026-05-17T00:00:00.000Z');
    expect(queryLog.map((c) => c.method)).toEqual(['select', 'from', 'where', 'orderBy', 'limit']);
    expect(queryLog.find((c) => c.method === 'limit')?.arg).toBe(100);
    expect(deductCalls).toHaveLength(1);
    expect(deductCalls[0]).toMatchObject({
      accountId: 'test-account',
      tool: 'mempool_alerts',
      rows: 1,
      sessionId: 'abc_123',
    });
  });

  test('[P0] rejects unauthenticated request before hitting billing', async () => {
    const app = makeApp({ accountId: null });
    const res = await app.request('/v1/router/mempool-alerts');

    expect(res.status).toBe(401);
    expect(deductCalls).toHaveLength(0);
  });

  test('[P0] returns 402 when account has no credits', async () => {
    mockHasCredits = false;
    const app = makeApp();
    const res = await app.request('/v1/router/mempool-alerts');

    expect(res.status).toBe(402);
    expect(deductCalls).toHaveLength(0);
  });
});
