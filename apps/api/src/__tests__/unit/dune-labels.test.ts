import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';

// ─── Module mocks (hoisted) ───────────────────────────────────────────────────

const mockConfig: Record<string, unknown> = {
  DUNE_API_KEY: 'dune-test-key',
  DUNE_LABEL_QUERY_ID: '111',
  DUNE_TOKEN_HOLDERS_QUERY_ID: '222',
  ARKHAM_TOP_HOLDER_LIMIT: 50,
  REDIS_URL: 'redis://localhost:6379',
};

mock.module('../../config', () => ({ config: mockConfig }));
mock.module('../../lib/logger', () => ({
  logger: { warn: () => undefined, info: () => undefined, error: () => undefined, debug: () => undefined },
}));
// Prevent ioredis side-effects if config mock triggers connection.ts re-evaluation
mock.module('ioredis', () => ({
  default: class FakeRedis {
    constructor() {}
    on() { return this; }
    quit() {}
  },
}));

import { fetchDuneAddressLabel, fetchDuneTokenHolders } from '../../router/services/dune-labels';

// ─── Fetch mock helpers ───────────────────────────────────────────────────────

type MockResponse = { ok: boolean; status?: number; body: unknown };

function makeFetchSequence(responses: MockResponse[]): typeof fetch {
  let i = 0;
  return mock(async (_url: string | URL | Request, _init?: RequestInit): Promise<Response> => {
    const r = responses[i] ?? responses[responses.length - 1];
    i++;
    return {
      ok: r.ok,
      status: r.status ?? (r.ok ? 200 : 400),
      json: async () => r.body,
      text: async () => (typeof r.body === 'string' ? r.body : JSON.stringify(r.body)),
    } as unknown as Response;
  }) as unknown as unknown as typeof fetch;
}

const EXECUTE_OK: MockResponse = { ok: true, body: { execution_id: 'exec-123' } };
const completed = (rows: unknown[]): MockResponse => ({
  ok: true,
  body: { state: 'QUERY_STATE_COMPLETED', result: { rows } },
});
const FAILED_RESULT: MockResponse = {
  ok: true,
  body: { state: 'QUERY_STATE_FAILED', error: { message: 'bad query' } },
};

let savedFetch: typeof fetch;

beforeEach(() => {
  savedFetch = globalThis.fetch;
  mockConfig.DUNE_API_KEY = 'dune-test-key';
  mockConfig.DUNE_LABEL_QUERY_ID = '111';
  mockConfig.DUNE_TOKEN_HOLDERS_QUERY_ID = '222';
  mockConfig.ARKHAM_TOP_HOLDER_LIMIT = 50;
});

afterEach(() => {
  globalThis.fetch = savedFetch;
});

function useFetch(responses: MockResponse[]) {
  globalThis.fetch = makeFetchSequence(responses);
}

// ─── fetchDuneAddressLabel ────────────────────────────────────────────────────

describe('fetchDuneAddressLabel', () => {
  test('[P0] returns null when DUNE_API_KEY missing', async () => {
    mockConfig.DUNE_API_KEY = undefined;
    expect(await fetchDuneAddressLabel('0xabc', 'ethereum')).toBeNull();
  });

  test('[P0] returns null when DUNE_LABEL_QUERY_ID missing', async () => {
    mockConfig.DUNE_LABEL_QUERY_ID = undefined;
    expect(await fetchDuneAddressLabel('0xabc', 'ethereum')).toBeNull();
  });

  test('[P0] returns null when query returns 0 rows', async () => {
    useFetch([EXECUTE_OK, completed([])]);
    expect(await fetchDuneAddressLabel('0xabc', 'ethereum')).toBeNull();
  });

  test('[P0] returns normalized label — entityId slug, confidence 0.7', async () => {
    useFetch([
      EXECUTE_OK,
      completed([{ address: '0xabc', name: 'Binance Hot Wallet', category: 'exchange', label_type: 'cex' }]),
    ]);
    const result = await fetchDuneAddressLabel('0xabc', 'ethereum');
    expect(result).not.toBeNull();
    expect(result!.entityId).toBe('binance_hot_wallet');
    expect(result!.entityName).toBe('Binance Hot Wallet');
    expect(result!.entityType).toBe('exchange');
    expect(result!.confidence).toBe(0.7);
    expect(result!.label).toBe('cex');
    expect(result!.chain).toBe('ethereum');
    expect(result!.address).toBe('0xabc');
  });

  test('[P0] entityId slug uses lowercase + space→underscore', async () => {
    useFetch([EXECUTE_OK, completed([{ name: 'Some Multi Word Entity', category: 'defi' }])]);
    const result = await fetchDuneAddressLabel('0xdef', 'ethereum');
    expect(result!.entityId).toBe('some_multi_word_entity');
  });

  test('[P0] null entityId when name absent', async () => {
    useFetch([EXECUTE_OK, completed([{ category: 'defi' }])]);
    const result = await fetchDuneAddressLabel('0xdef', 'ethereum');
    expect(result!.entityId).toBeNull();
    expect(result!.entityName).toBeNull();
  });

  test('[P0] returns null when execute returns non-200', async () => {
    useFetch([{ ok: false, status: 403, body: 'Forbidden' }]);
    expect(await fetchDuneAddressLabel('0xabc', 'ethereum')).toBeNull();
  });

  test('[P0] returns null when poll returns FAILED state', async () => {
    useFetch([EXECUTE_OK, FAILED_RESULT]);
    expect(await fetchDuneAddressLabel('0xabc', 'ethereum')).toBeNull();
  });

  test('[P0] returns null on network error (fetch throws)', async () => {
    globalThis.fetch = mock(async () => {
      throw new TypeError('network error');
    }) as unknown as unknown as typeof fetch;
    expect(await fetchDuneAddressLabel('0xabc', 'ethereum')).toBeNull();
  });

  test('[P0] DUNE_API_KEY value not present in returned null', async () => {
    useFetch([{ ok: false, status: 401, body: 'Unauthorized' }]);
    const result = await fetchDuneAddressLabel('0xabc', 'ethereum');
    expect(result).toBeNull();
    expect(JSON.stringify(result)).not.toContain('dune-test-key');
  });

  test('[P1] tags contain category when present', async () => {
    useFetch([EXECUTE_OK, completed([{ name: 'Mixer', category: 'mixer' }])]);
    const result = await fetchDuneAddressLabel('0xmix', 'ethereum');
    expect(result!.tags).toEqual(['mixer']);
  });

  test('[P1] empty tags when category absent', async () => {
    useFetch([EXECUTE_OK, completed([{ name: 'Unknown' }])]);
    const result = await fetchDuneAddressLabel('0xunk', 'ethereum');
    expect(result!.tags).toEqual([]);
  });
});

// ─── fetchDuneTokenHolders ────────────────────────────────────────────────────

describe('fetchDuneTokenHolders', () => {
  test('[P0] returns empty result when DUNE_API_KEY missing', async () => {
    mockConfig.DUNE_API_KEY = undefined;
    const r = await fetchDuneTokenHolders('ethereum', '0xtoken');
    expect(r.holders).toHaveLength(0);
    expect(r.totalHolders).toBeNull();
    expect(r.analysisStatus).toBe('failed');
    expect(r.providerError).toContain('not configured');
  });

  test('[P0] returns empty result when DUNE_TOKEN_HOLDERS_QUERY_ID missing', async () => {
    mockConfig.DUNE_TOKEN_HOLDERS_QUERY_ID = undefined;
    const r = await fetchDuneTokenHolders('ethereum', '0xtoken');
    expect(r.holders).toHaveLength(0);
  });

  test('[P0] maps holders — address, balance, percentage, entityId slug, entityType', async () => {
    useFetch([
      EXECUTE_OK,
      completed([
        { address: '0xholder1', balance_raw: '1000000', percentage: 5.5, name: 'Whale Fund', category: 'fund' },
        { address: '0xholder2', balance_raw: '500000', percentage: 2.1 },
      ]),
    ]);
    const r = await fetchDuneTokenHolders('ethereum', '0xtoken');
    expect(r.holders).toHaveLength(2);
    expect(r.totalHolders).toBe(2);
    expect(r.analysisStatus).toBe('complete');

    const h1 = r.holders[0];
    expect(h1.address).toBe('0xholder1');
    expect(h1.balance).toBe('1000000');
    expect(h1.percentage).toBe(5.5);
    expect(h1.entityId).toBe('whale_fund');
    expect(h1.entityName).toBe('Whale Fund');
    expect(h1.entityType).toBe('fund');

    const h2 = r.holders[1];
    expect(h2.entityId).toBeNull();
    expect(h2.entityName).toBeNull();
    expect(h2.entityType).toBeNull();
    expect(h2.percentage).toBe(2.1);
  });

  test('[P0] clamps limit to 100 even when config is higher', async () => {
    mockConfig.ARKHAM_TOP_HOLDER_LIMIT = 200;
    let capturedBody: Record<string, unknown> | undefined;
    globalThis.fetch = mock(async (_url: string | URL | Request, init?: RequestInit): Promise<Response> => {
      if ((init as RequestInit | undefined)?.method === 'POST') {
        capturedBody = JSON.parse((init as RequestInit).body as string);
        return { ok: true, json: async () => ({ execution_id: 'e1' }), text: async () => '' } as unknown as Response;
      }
      return {
        ok: true,
        json: async () => ({ state: 'QUERY_STATE_COMPLETED', result: { rows: [] } }),
        text: async () => '',
      } as unknown as Response;
    }) as unknown as unknown as typeof fetch;

    await fetchDuneTokenHolders('ethereum', '0xtoken');
    expect((capturedBody?.query_parameters as Record<string, unknown>).holder_limit).toBe(100);
  });

  test('[P0] lowercases token_address in query parameters', async () => {
    let capturedBody: Record<string, unknown> | undefined;
    globalThis.fetch = mock(async (_url: string | URL | Request, init?: RequestInit): Promise<Response> => {
      if ((init as RequestInit | undefined)?.method === 'POST') {
        capturedBody = JSON.parse((init as RequestInit).body as string);
        return { ok: true, json: async () => ({ execution_id: 'e1' }), text: async () => '' } as unknown as Response;
      }
      return {
        ok: true,
        json: async () => ({ state: 'QUERY_STATE_COMPLETED', result: { rows: [] } }),
        text: async () => '',
      } as unknown as Response;
    }) as unknown as unknown as typeof fetch;

    await fetchDuneTokenHolders('ethereum', '0xTOKENADDR');
    const params = (capturedBody?.query_parameters as Record<string, unknown>);
    expect(params.token_address).toBe('0xtokenaddr');
    expect(params.chain).toBe('ethereum');
  });

  test('[P0] returns empty on execute HTTP error', async () => {
    useFetch([{ ok: false, status: 500, body: 'error' }]);
    const r = await fetchDuneTokenHolders('ethereum', '0xtoken');
    expect(r.holders).toHaveLength(0);
    expect(r.analysisStatus).toBe('failed');
  });

  test('[P0] returns empty on poll FAILED', async () => {
    useFetch([EXECUTE_OK, FAILED_RESULT]);
    const r = await fetchDuneTokenHolders('ethereum', '0xtoken');
    expect(r.holders).toHaveLength(0);
    expect(r.analysisStatus).toBe('failed');
  });

  test('[P0] returns empty on network error', async () => {
    globalThis.fetch = mock(async () => {
      throw new TypeError('network error');
    }) as unknown as unknown as typeof fetch;
    const r = await fetchDuneTokenHolders('ethereum', '0xtoken');
    expect(r.holders).toHaveLength(0);
  });

  test('[P1] chain and tokenAddress passed through to result', async () => {
    useFetch([EXECUTE_OK, completed([])]);
    const r = await fetchDuneTokenHolders('polygon', '0xpoly');
    expect(r.chain).toBe('polygon');
    expect(r.tokenAddress).toBe('0xpoly');
    expect(r.analysisStatus).toBe('empty');
  });

  test('[P1] non-numeric percentage mapped to null', async () => {
    useFetch([EXECUTE_OK, completed([{ address: '0xh', balance_raw: '100', percentage: 'not-a-number' }])]);
    const r = await fetchDuneTokenHolders('ethereum', '0xtoken');
    expect(r.holders[0].percentage).toBeNull();
  });

  test('[P1] retries token holders query without holder_limit on unknown-parameter error', async () => {
    let postCount = 0;
    const bodies: Array<Record<string, unknown>> = [];
    globalThis.fetch = mock(async (_url: string | URL | Request, init?: RequestInit): Promise<Response> => {
      if ((init as RequestInit | undefined)?.method === 'POST') {
        postCount += 1;
        const body = JSON.parse((init as RequestInit).body as string) as Record<string, unknown>;
        bodies.push(body);
        if (postCount === 1) {
          return {
            ok: false,
            status: 400,
            text: async () => '{"error":{"message":"unknown parameters (holder_limit)"}}',
            json: async () => ({}),
          } as unknown as Response;
        }
        return { ok: true, json: async () => ({ execution_id: 'e2' }), text: async () => '' } as unknown as Response;
      }
      return {
        ok: true,
        json: async () => ({ state: 'QUERY_STATE_COMPLETED', result: { rows: [] } }),
        text: async () => '',
      } as unknown as Response;
    }) as unknown as unknown as typeof fetch;

    const r = await fetchDuneTokenHolders('base', '0xTOKEN');
    expect(r.analysisStatus).toBe('empty');
    expect(postCount).toBe(2);
    const firstParams = (bodies[0].query_parameters as Record<string, unknown>);
    const secondParams = (bodies[1].query_parameters as Record<string, unknown>);
    expect(firstParams.holder_limit).toBe(50);
    expect(firstParams.token_address).toBe('0xtoken');
    expect(secondParams.holder_limit).toBeUndefined();
    expect(secondParams.token_address).toBe('0xtoken');
  });
});
