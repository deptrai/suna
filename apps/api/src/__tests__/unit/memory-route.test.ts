import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { Hono } from 'hono';
import type { AppContext, AuthVariables } from '../../types';

let mockedExtractResult = { extracted: 1, deduped: 0, skipped: false };
let mockedRenderResult = { rendered: '## Persistent Memory\n[preference] Prefers 4H timeframe', memoryCount: 1 };
let mockedAccountId: string | null = 'acc-1';
let listedItems: any[] = [
  { id: 'm1', category: 'preference', content: 'Prefers 4H timeframe', updatedAt: new Date().toISOString() },
];
let updateCalls = 0;

mock.module('../../router/services/memory-extraction', () => ({
  extractMemoriesForUser: async () => mockedExtractResult,
}));

mock.module('../../router/services/memory-render', () => ({
  renderMemoriesForUser: async () => ({ ...mockedRenderResult, accountId: mockedAccountId }),
}));

mock.module('../../router/services/memory-account-resolver', () => ({
  resolveAccountIdFromUserId: async () => mockedAccountId,
}));

mock.module('../../shared/db', () => ({
  db: {
    query: {
      accountMemories: {
        findMany: async () => listedItems,
      },
    },
    update: () => ({
      set: () => ({
        where: async () => {
          updateCalls += 1;
        },
      }),
    }),
  },
}));

mock.module('@epsilon/db', () => ({ accountMemories: { id: 'id', accountId: 'accountId', invalidatedAt: 'invalidatedAt' } }));

import { memory } from '../../router/routes/memory';

type Vars = AppContext & AuthVariables;

function makeApp() {
  const app = new Hono<{ Variables: Vars }>();
  app.use('*', async (c, next) => {
    c.set('userId', '00000000-0000-0000-0000-000000000001');
    c.set('accountId', 'acc-1');
    await next();
  });
  app.route('/', memory);
  return app;
}

describe('memory routes', () => {
  beforeEach(() => {
    mockedExtractResult = { extracted: 1, deduped: 0, skipped: false };
    mockedRenderResult = { rendered: '## Persistent Memory\n[preference] Prefers 4H timeframe', memoryCount: 1 };
    mockedAccountId = 'acc-1';
    listedItems = [
      { id: 'm1', category: 'preference', content: 'Prefers 4H timeframe', updatedAt: new Date().toISOString() },
    ];
    updateCalls = 0;
  });

  test('POST /render returns rendered memory', async () => {
    const app = makeApp();
    const res = await app.request('/render', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: '00000000-0000-0000-0000-000000000001',
        sessionId: 'ses_1',
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.memoryCount).toBe(1);
    expect(body.rendered).toContain('Persistent Memory');
  });

  test('POST /extract enforces rate limit after 10 requests per account', async () => {
    const app = makeApp();
    const payload = {
      userId: '00000000-0000-0000-0000-000000000001',
      sessionId: 'ses_1',
      messages: [{ role: 'user', content: 'hello' }],
    };

    for (let i = 0; i < 10; i++) {
      const res = await app.request('/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      expect(res.status).toBe(200);
    }

    const limited = await app.request('/extract', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    expect(limited.status).toBe(429);
  });

  test('GET / returns list for authenticated user', async () => {
    const app = makeApp();
    const res = await app.request('/');
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(Array.isArray(body.items)).toBe(true);
    expect(body.items).toHaveLength(1);
  });

  test('DELETE /:id soft deletes one memory', async () => {
    const app = makeApp();
    const res = await app.request('/m1', { method: 'DELETE' });
    expect(res.status).toBe(200);
    expect(updateCalls).toBe(1);
  });

  test('DELETE / clears all memories', async () => {
    const app = makeApp();
    const res = await app.request('/', { method: 'DELETE' });
    expect(res.status).toBe(200);
    expect(updateCalls).toBe(1);
  });
});
