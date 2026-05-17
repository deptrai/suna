import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';

// ─── Config mock ──────────────────────────────────────────────────────────────

const mockConfig = {
  ARKHAM_API_KEY: 'test-arkham-key',
  ARKHAM_API_BASE_URL: 'https://api.arkm.com',
  ARKHAM_TOP_HOLDER_LIMIT: 50,
  REDIS_URL: 'redis://localhost:6379',
};

mock.module('../../config', () => ({ config: mockConfig }));
mock.module('../../lib/logger', () => ({
  logger: { info: () => undefined, warn: () => undefined, error: () => undefined, debug: () => undefined },
}));

// Guard against ioredis being evaluated when Bun cascades config-mock invalidation to
// connection.ts (which imports config). Without this, connection.ts would crash on
// redisUrl.startsWith() when subsequent test files load in the same process.
mock.module('ioredis', () => ({
  default: class Redis {
    constructor() {}
    on() { return this; }
    quit() { return Promise.resolve(); }
  },
}));

// ─── Fetch mock state ─────────────────────────────────────────────────────────

type FetchResult =
  | { ok: true; status: 200; json: unknown }
  | { ok: false; status: number; text: string }
  | { throw: Error };

let _fetchResult: FetchResult = { ok: true, status: 200, json: {} };
let _lastRequest: { url: string; init?: RequestInit } | null = null;

let _savedFetch: typeof globalThis.fetch;

import {
  fetchArkhamTokenHolders,
  fetchArkhamAddressIntelligence,
  fetchArkhamBatchAddressIntelligence,
} from '../../router/services/arkham';

beforeEach(() => {
  mockConfig.ARKHAM_API_KEY = 'test-arkham-key';
  _fetchResult = { ok: true, status: 200, json: {} };
  _lastRequest = null;
  _savedFetch = globalThis.fetch;
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    _lastRequest = { url: String(input), init };
    const r = _fetchResult;
    if ('throw' in r) throw r.throw;
    if (r.ok) {
      return {
        ok: true,
        status: 200,
        json: async () => r.json,
        text: async () => JSON.stringify(r.json),
      } as unknown as Response;
    }
    return {
      ok: false,
      status: r.status,
      json: async () => { throw new Error('not ok'); },
      text: async () => r.text,
    } as unknown as Response;
  };
});

afterEach(() => {
  mockConfig.ARKHAM_API_KEY = 'test-arkham-key';
  globalThis.fetch = _savedFetch;
});

// ─── fetchArkhamTokenHolders ─────────────────────────────────────────────────

describe('fetchArkhamTokenHolders', () => {
  test('[P0] returns empty result when ARKHAM_API_KEY not set', async () => {
    mockConfig.ARKHAM_API_KEY = '';
    const result = await fetchArkhamTokenHolders('ethereum', '0xabcd');
    expect(result.holders).toHaveLength(0);
    expect(result.totalHolders).toBeNull();
    expect(_lastRequest).toBeNull();
  });

  test('[P0] sends API-Key auth header', async () => {
    _fetchResult = { ok: true, status: 200, json: { holders: [], total: 0 } };
    await fetchArkhamTokenHolders('ethereum', '0xtoken');
    expect(_lastRequest).not.toBeNull();
    const headers = _lastRequest!.init?.headers as Record<string, string>;
    expect(headers['API-Key']).toBe('test-arkham-key');
  });

  test('[P0] normalizes holder with object tags', async () => {
    _fetchResult = {
      ok: true,
      status: 200,
      json: {
        holders: [
          {
            address: '0xabc',
            balance: '1000',
            percentage: 0.5,
            entity: { id: 'binance', name: 'Binance', type: 'cex' },
            tags: [{ name: 'exchange' }, 'mixer'],
          },
        ],
        total: 1,
      },
    };
    const result = await fetchArkhamTokenHolders('ethereum', '0xtoken');
    expect(result.holders).toHaveLength(1);
    const h = result.holders[0];
    expect(h.entityId).toBe('binance');
    expect(h.entityName).toBe('Binance');
    expect(h.entityType).toBe('cex');
    expect(h.tags).toEqual(['exchange', 'mixer']);
    expect(h.balance).toBe('1000');
    expect(h.percentage).toBe(0.5);
    expect(result.totalHolders).toBe(1);
  });

  test('[P0] throws on HTTP error (401)', async () => {
    _fetchResult = { ok: false, status: 401, text: 'Unauthorized' };
    await expect(fetchArkhamTokenHolders('ethereum', '0xtoken')).rejects.toThrow('Arkham token holders 401');
  });

  test('[P0] throws on HTTP error (429)', async () => {
    _fetchResult = { ok: false, status: 429, text: 'Rate limited' };
    await expect(fetchArkhamTokenHolders('ethereum', '0xtoken')).rejects.toThrow('Arkham token holders 429');
  });

  test('[P0] throws on network failure with sanitized message (no key leak)', async () => {
    _fetchResult = { throw: new Error(`connect failed, key=test-arkham-key, details`) };
    await expect(fetchArkhamTokenHolders('ethereum', '0xtoken')).rejects.toThrow('Arkham network error:');
    try {
      await fetchArkhamTokenHolders('ethereum', '0xtoken');
    } catch (e) {
      expect(String(e)).not.toContain('test-arkham-key');
    }
  });

  test('[P1] clamps limit to 100 even when options.limit > 100', async () => {
    _fetchResult = { ok: true, status: 200, json: { holders: [], total: 0 } };
    await fetchArkhamTokenHolders('ethereum', '0xtoken', { limit: 999 });
    expect(_lastRequest!.url).toContain('limit=100');
  });

  test('[P1] handles flat array response format', async () => {
    _fetchResult = {
      ok: true,
      status: 200,
      json: [{ address: '0xflat', entity: {}, tags: [] }],
    };
    const result = await fetchArkhamTokenHolders('ethereum', '0xtoken');
    expect(result.holders).toHaveLength(1);
    expect(result.holders[0].address).toBe('0xflat');
  });
});

// ─── fetchArkhamAddressIntelligence ──────────────────────────────────────────

describe('fetchArkhamAddressIntelligence', () => {
  test('[P0] returns empty label when ARKHAM_API_KEY not set', async () => {
    mockConfig.ARKHAM_API_KEY = '';
    const result = await fetchArkhamAddressIntelligence('0xabc', 'ethereum');
    expect(result.entityId).toBeNull();
    expect(result.entityName).toBeNull();
    expect(result.tags).toHaveLength(0);
    expect(_lastRequest).toBeNull();
  });

  test('[P0] returns empty label on 404 without throwing', async () => {
    _fetchResult = { ok: false, status: 404, text: 'not found' };
    const result = await fetchArkhamAddressIntelligence('0xunknown', 'ethereum');
    expect(result.entityId).toBeNull();
    expect(result.entityName).toBeNull();
  });

  test('[P0] throws on non-404 HTTP error', async () => {
    _fetchResult = { ok: false, status: 500, text: 'Internal Server Error' };
    await expect(fetchArkhamAddressIntelligence('0xabc', 'ethereum')).rejects.toThrow(
      'Arkham address intelligence 500',
    );
  });

  test('[P0] throws on network failure', async () => {
    _fetchResult = { throw: new Error('connection refused') };
    await expect(fetchArkhamAddressIntelligence('0xabc', 'ethereum')).rejects.toThrow('Arkham network error:');
  });

  test('[P0] sends API-Key auth header', async () => {
    _fetchResult = { ok: true, status: 200, json: { arkhamEntity: {}, arkhamLabel: {} } };
    await fetchArkhamAddressIntelligence('0xabc', 'ethereum');
    const headers = _lastRequest!.init?.headers as Record<string, string>;
    expect(headers['API-Key']).toBe('test-arkham-key');
  });

  test('[P1] normalizes arkhamEntity over entity fallback', async () => {
    _fetchResult = {
      ok: true,
      status: 200,
      json: {
        arkhamEntity: { id: 'binance', name: 'Binance', type: 'cex' },
        entity: { id: 'other', name: 'Other' },
        arkhamLabel: { name: 'Hot Wallet', tags: ['exchange'] },
        confidence: 0.9,
      },
    };
    const result = await fetchArkhamAddressIntelligence('0xabc', 'ethereum');
    expect(result.entityId).toBe('binance');
    expect(result.entityName).toBe('Binance');
    expect(result.label).toBe('Hot Wallet');
    expect(result.tags).toContain('exchange');
    expect(result.confidence).toBe(0.9);
  });
});

// ─── fetchArkhamBatchAddressIntelligence ─────────────────────────────────────

describe('fetchArkhamBatchAddressIntelligence', () => {
  test('[P0] returns [] when ARKHAM_API_KEY not set', async () => {
    mockConfig.ARKHAM_API_KEY = '';
    const result = await fetchArkhamBatchAddressIntelligence(['0xabc'], 'ethereum');
    expect(result).toEqual([]);
    expect(_lastRequest).toBeNull();
  });

  test('[P0] returns [] when addresses is empty', async () => {
    const result = await fetchArkhamBatchAddressIntelligence([], 'ethereum');
    expect(result).toEqual([]);
    expect(_lastRequest).toBeNull();
  });

  test('[P0] returns [] on non-OK response (graceful degradation)', async () => {
    _fetchResult = { ok: false, status: 503, text: 'unavailable' };
    const result = await fetchArkhamBatchAddressIntelligence(['0xabc'], 'ethereum');
    expect(result).toEqual([]);
  });

  test('[P0] sends POST request with JSON body', async () => {
    _fetchResult = { ok: true, status: 200, json: { addresses: [] } };
    await fetchArkhamBatchAddressIntelligence(['0xabc', '0xdef'], 'ethereum');
    expect(_lastRequest!.init?.method).toBe('POST');
    const body = JSON.parse(_lastRequest!.init?.body as string);
    expect(body.addresses).toEqual(['0xabc', '0xdef']);
  });

  test('[P1] slices addresses to 100 max', async () => {
    _fetchResult = { ok: true, status: 200, json: { addresses: [] } };
    const addrs = Array.from({ length: 150 }, (_, i) => `0x${i.toString(16).padStart(40, '0')}`);
    await fetchArkhamBatchAddressIntelligence(addrs, 'ethereum');
    const body = JSON.parse(_lastRequest!.init?.body as string);
    expect(body.addresses).toHaveLength(100);
  });

  test('[P1] normalizes batch response array', async () => {
    _fetchResult = {
      ok: true,
      status: 200,
      json: {
        addresses: [
          {
            address: '0xabc',
            arkhamEntity: { id: 'binance', name: 'Binance', type: 'cex' },
            arkhamLabel: { name: 'Cold Wallet', tags: [] },
          },
        ],
      },
    };
    const result = await fetchArkhamBatchAddressIntelligence(['0xabc'], 'ethereum');
    expect(result).toHaveLength(1);
    expect(result[0].address).toBe('0xabc');
    expect(result[0].entityName).toBe('Binance');
  });
});
