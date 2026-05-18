import { beforeEach, describe, expect, mock, test } from 'bun:test';

const sandbox = {
  sandboxId: 'sandbox-1',
  accountId: 'account-1',
  provider: 'daytona',
  externalId: 'external-1',
  config: { serviceKey: 'epsilon_sb_old' },
};

const order: string[] = [];
const emitted: any[] = [];
const providerCacheInvalidations: string[] = [];
const previewCacheInvalidations: string[] = [];
const txSets: any[] = [];
let transactionCalls = 0;
let fetchStatus = 200;
let fetchCalls: Array<{ url: string; init: RequestInit }> = [];

const tx = {
  execute: mock(async () => { order.push('lock'); }),
  update: mock(() => ({
    set: (value: any) => {
      txSets.push(value);
      order.push(value?.status === 'revoked' ? 'revoke-keys' : 'update-sandbox');
      return { where: mock(async () => []) };
    },
  })),
  insert: mock(() => ({
    values: mock(async () => { order.push('insert-key'); }),
  })),
};

const dbMock = {
  select: mock(() => ({
    from: () => ({
      where: () => ({
        limit: mock(async () => [sandbox]),
      }),
    }),
  })),
  transaction: mock(async (fn: (tx: any) => Promise<void>) => {
    transactionCalls += 1;
    order.push('transaction-start');
    await fn(tx);
    order.push('transaction-end');
  }),
};

mock.module('../../shared/db', () => ({ db: dbMock }));
mock.module('../../shared/crypto', () => ({
  generateSandboxKeyPair: () => ({ publicKey: 'epsilon_pk_new', secretKey: 'epsilon_sb_new' }),
  hashSecretKey: (value: string) => `hash:${value}`,
}));
mock.module('../../platform/providers', () => ({
  getProvider: () => ({
    resolveEndpoint: mock(async () => {
      order.push('resolve-endpoint');
      return { url: 'http://sandbox.local', headers: { Authorization: 'Bearer stale-provider-header', 'X-Proxy-Token': 'proxy' } };
    }),
  }),
}));
mock.module('../../platform/services/sandbox-events', () => ({
  sandboxEventBus: { emit: mock((event: any) => emitted.push(event)) },
}));
mock.module('../../sandbox-proxy', () => ({
  invalidateProviderCache: mock((externalId: string) => providerCacheInvalidations.push(externalId)),
}));
mock.module('../../sandbox-proxy/routes/preview', () => ({
  invalidatePreviewServiceKeyCache: mock((externalId: string) => previewCacheInvalidations.push(externalId)),
}));

const { handleAdminRotateSandboxToken } = await import('../../router/routes/admin-rotate-sandbox-token');

function makeContext() {
  return {
    req: {
      param: () => 'sandbox-1',
      json: async () => ({ reason: 'manual' }),
    },
    get: () => 'admin-user-1',
    json: (body: unknown, status = 200) => new Response(JSON.stringify(body), { status }),
  };
}

describe('story 5.0.3 admin rotate token behavior', () => {
  beforeEach(() => {
    order.length = 0;
    emitted.length = 0;
    providerCacheInvalidations.length = 0;
    previewCacheInvalidations.length = 0;
    txSets.length = 0;
    transactionCalls = 0;
    fetchStatus = 200;
    fetchCalls = [];
    globalThis.fetch = mock(async (url: RequestInfo | URL, init?: RequestInit) => {
      order.push('push-token');
      fetchCalls.push({ url: String(url), init: init ?? {} });
      return new Response(fetchStatus === 200 ? '{}' : 'nope', { status: fetchStatus });
    }) as unknown as typeof fetch;
  });

  test('pushes the new token with the old token before committing DB rotation', async () => {
    const res = await handleAdminRotateSandboxToken(makeContext() as any);
    const body = await res.json() as any;

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(order.indexOf('push-token')).toBeLessThan(order.indexOf('transaction-start'));
    expect(fetchCalls[0].url).toBe('http://sandbox.local/env/rotate-token');
    expect((fetchCalls[0].init.headers as Record<string, string>).Authorization).toBe('Bearer epsilon_sb_old');
    expect(JSON.parse(String(fetchCalls[0].init.body))).toEqual({ token: 'epsilon_sb_new' });
  });

  test('revokes active sandbox keys, updates encrypted config, invalidates caches, and emits pubsub event', async () => {
    const res = await handleAdminRotateSandboxToken(makeContext() as any);

    expect(res.status).toBe(200);
    expect(order).toContain('lock');
    expect(order).toContain('revoke-keys');
    expect(order).toContain('insert-key');
    expect(order).toContain('update-sandbox');
    expect(txSets.some((value) => value?.status === 'revoked')).toBe(true);
    expect(txSets.some((value) => typeof value?.config?.serviceKeyEnc === 'string')).toBe(true);
    expect(providerCacheInvalidations).toEqual(['external-1']);
    expect(previewCacheInvalidations).toEqual(['external-1']);
    expect(emitted).toEqual([expect.objectContaining({ sandboxId: 'sandbox-1', event: 'sandbox.token.rotated' })]);
  });

  test('does not commit DB rotation when sandbox push fails', async () => {
    fetchStatus = 401;

    const res = await handleAdminRotateSandboxToken(makeContext() as any);
    const body = await res.json() as any;

    expect(res.status).toBe(502);
    expect(body.ok).toBe(false);
    expect(transactionCalls).toBe(0);
    expect(emitted).toHaveLength(0);
    expect(providerCacheInvalidations).toHaveLength(0);
  });
});
