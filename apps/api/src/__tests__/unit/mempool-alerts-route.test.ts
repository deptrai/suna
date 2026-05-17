import { describe, test, expect, mock } from 'bun:test';
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
    detectedAt: new Date(),
    updatedAt: new Date(),
  },
];

// Mock the full Drizzle chain shape so each link is verified.
const dbCalls: { method: string; arg?: unknown }[] = [];
function chainMock(rows: any[]) {
  return {
    select: (..._args: any[]) => {
      dbCalls.push({ method: 'select' });
      return {
        from: (..._args: any[]) => {
          dbCalls.push({ method: 'from' });
          return {
            where: (arg: any) => {
              dbCalls.push({ method: 'where', arg });
              return {
                orderBy: (..._args: any[]) => {
                  dbCalls.push({ method: 'orderBy' });
                  return {
                    limit: async (n: number) => {
                      dbCalls.push({ method: 'limit', arg: n });
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

// Stub billing — by default hasCredits=true, deduct succeeds.
let _hasCredits = true;
mock.module('../../router/services/billing', () => ({
  checkCredits: async () => ({ hasCredits: _hasCredits }),
  deductToolCredits: async () => undefined,
}));

import { mempoolAlertsRoute } from '../../router/routes/mempool-alerts';

function makeApp(opts: { accountId?: string | null } = { accountId: 'test-account' }) {
  const app = new Hono<{ Variables: AppContext }>();
  app.use('*', async (c, next) => {
    if (opts.accountId) c.set('accountId', opts.accountId);
    else throw new HTTPException(401, { message: 'Unauthenticated' });
    await next();
  });
  app.route('/', mempoolAlertsRoute);
  app.onError((err, c) => {
    if (err instanceof HTTPException) return err.getResponse();
    return c.json({ success: false, error: String(err) }, 500);
  });
  return app;
}

describe('GET /mempool-alerts', () => {
  test('returns success shape and clamps limit', async () => {
    _hasCredits = true;
    dbCalls.length = 0;
    const app = makeApp();
    const res = await app.request('/?limit=999&since_minutes=10');
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.success).toBe(true);
    expect(body.source).toBe('db');
    expect(Array.isArray(body.alerts)).toBe(true);
    expect(body.count).toBe(1);
    // Verify Drizzle chain order is exercised end-to-end.
    expect(dbCalls.map((c) => c.method)).toEqual(['select', 'from', 'where', 'orderBy', 'limit']);
    const limitCall = dbCalls.find((c) => c.method === 'limit');
    expect(limitCall?.arg).toBe(100); // 999 clamped to 100
  });

  test('returns 400 for invalid query (limit=0)', async () => {
    const app = makeApp();
    const res = await app.request('/?limit=0');
    expect(res.status).toBe(400);
  });

  test('rejects min_value_usd=Infinity via .finite()', async () => {
    const app = makeApp();
    const res = await app.request('/?min_value_usd=Infinity');
    expect(res.status).toBe(400);
  });

  test('rejects unknown alert_type via Zod enum', async () => {
    const app = makeApp();
    const res = await app.request('/?alert_type=Large_Swap');
    expect(res.status).toBe(400);
  });

  test('returns 402 when account has no credits', async () => {
    _hasCredits = false;
    const app = makeApp();
    const res = await app.request('/');
    expect(res.status).toBe(402);
    _hasCredits = true;
  });

  test('rejects unauthenticated request with 401', async () => {
    const app = makeApp({ accountId: null });
    const res = await app.request('/');
    expect(res.status).toBe(401);
  });
});
