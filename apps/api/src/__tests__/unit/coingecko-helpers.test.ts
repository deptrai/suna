import { describe, test, expect, mock, beforeEach, afterEach } from 'bun:test';

// ─── Config mock ─────────────────────────────────────────────────────────────

let _coinGeckoKey: string | undefined = 'cg-test-key';
let _coinGeckoUrl: string | undefined = 'https://api.coingecko.com/api/v3';

mock.module('../../config', () => ({
  config: {
    get COINGECKO_API_KEY() { return _coinGeckoKey; },
    get COINGECKO_API_URL() { return _coinGeckoUrl; },
  },
}));

const {
  isEvmAddress,
  buildCoinGeckoHeaders,
  resolveCoinIdFromAddress,
  COINGECKO_PLATFORM_MAP,
} = await import('../../router/services/coingecko-helpers');

const originalFetch = globalThis.fetch;

function stubFetchOk(body: unknown) {
  globalThis.fetch = (async () =>
    new Response(JSON.stringify(body), { status: 200 })) as unknown as typeof fetch;
}

function stubFetchStatus(status: number, body: unknown = {}) {
  globalThis.fetch = (async () =>
    new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('isEvmAddress', () => {
  test('[P0] accepts canonical 0x + 40 hex chars', () => {
    expect(isEvmAddress('0x' + 'a'.repeat(40))).toBe(true);
    expect(isEvmAddress('0x' + 'F'.repeat(40))).toBe(true);
  });

  test('[P0] rejects wrong length', () => {
    expect(isEvmAddress('0xabc')).toBe(false);
    expect(isEvmAddress('0x' + 'a'.repeat(41))).toBe(false);
  });

  test('[P0] rejects missing 0x prefix', () => {
    expect(isEvmAddress('a'.repeat(40))).toBe(false);
  });

  test('[P0] rejects non-hex characters', () => {
    expect(isEvmAddress('0x' + 'g'.repeat(40))).toBe(false);
  });
});

describe('buildCoinGeckoHeaders', () => {
  beforeEach(() => {
    _coinGeckoKey = 'cg-test-key';
  });

  test('[P1] always includes Accept: application/json', () => {
    const headers = buildCoinGeckoHeaders();
    expect(headers.Accept).toBe('application/json');
  });

  test('[P1] adds x-cg-demo-api-key header when key present', () => {
    const headers = buildCoinGeckoHeaders();
    expect(headers['x-cg-demo-api-key']).toBe('cg-test-key');
  });

  test('[P1] omits api key header when key is missing', () => {
    _coinGeckoKey = undefined;
    const headers = buildCoinGeckoHeaders();
    expect(headers['x-cg-demo-api-key']).toBeUndefined();
  });
});

describe('COINGECKO_PLATFORM_MAP', () => {
  test('[P0] maps known chain aliases to CoinGecko platform IDs', () => {
    expect(COINGECKO_PLATFORM_MAP.ethereum).toBe('ethereum');
    expect(COINGECKO_PLATFORM_MAP.arbitrum).toBe('arbitrum-one');
    expect(COINGECKO_PLATFORM_MAP.bsc).toBe('binance-smart-chain');
    expect(COINGECKO_PLATFORM_MAP.optimism).toBe('optimistic-ethereum');
  });
});

describe('resolveCoinIdFromAddress', () => {
  beforeEach(() => {
    _coinGeckoKey = 'cg-test-key';
    _coinGeckoUrl = 'https://api.coingecko.com/api/v3';
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test('[P0] returns coin id when CoinGecko 200 with id', async () => {
    stubFetchOk({ id: 'bitcoin' });
    const id = await resolveCoinIdFromAddress('0x' + 'a'.repeat(40), 'ethereum');
    expect(id).toBe('bitcoin');
  });

  test('[P0] throws "not indexed" when 200 but no id', async () => {
    stubFetchOk({});
    await expect(
      resolveCoinIdFromAddress('0x' + 'a'.repeat(40), 'ethereum'),
    ).rejects.toThrow('not indexed');
  });

  test('[P0] throws "not indexed" on 404', async () => {
    stubFetchStatus(404);
    await expect(
      resolveCoinIdFromAddress('0x' + 'a'.repeat(40), 'ethereum'),
    ).rejects.toThrow('not indexed');
  });

  test('[P0] throws "rate-limited" on 429', async () => {
    stubFetchStatus(429);
    await expect(
      resolveCoinIdFromAddress('0x' + 'a'.repeat(40), 'ethereum'),
    ).rejects.toThrow('rate-limited');
  });

  test('[P0] throws "CoinGecko API error: <status>" on other 5xx', async () => {
    stubFetchStatus(503);
    await expect(
      resolveCoinIdFromAddress('0x' + 'a'.repeat(40), 'ethereum'),
    ).rejects.toThrow(/CoinGecko API error: 503/);
  });

  test('[P0] throws explicit error for unsupported chain', async () => {
    await expect(
      resolveCoinIdFromAddress('0x' + 'a'.repeat(40), 'solana'),
    ).rejects.toThrow(/unsupported chain 'solana'/);
  });

  test('[P1] defaults to ethereum when chain is undefined', async () => {
    let capturedUrl = '';
    globalThis.fetch = (async (url: string | URL | Request) => {
      capturedUrl = String(url);
      return new Response(JSON.stringify({ id: 'eth-token' }), { status: 200 });
    }) as unknown as typeof fetch;

    await resolveCoinIdFromAddress('0x' + 'a'.repeat(40), undefined);
    expect(capturedUrl).toContain('/coins/ethereum/contract/');
  });

  test('[P1] lowercases address in URL path', async () => {
    let capturedUrl = '';
    globalThis.fetch = (async (url: string | URL | Request) => {
      capturedUrl = String(url);
      return new Response(JSON.stringify({ id: 'x' }), { status: 200 });
    }) as unknown as typeof fetch;

    const upper = '0xABCDEF0123456789012345678901234567890123';
    await resolveCoinIdFromAddress(upper, 'ethereum');
    expect(capturedUrl).toContain(upper.toLowerCase());
    expect(capturedUrl).not.toContain('ABCDEF');
  });

  test('[P1] strips trailing slashes from baseUrl', async () => {
    _coinGeckoUrl = 'https://api.coingecko.com/api/v3//';
    let capturedUrl = '';
    globalThis.fetch = (async (url: string | URL | Request) => {
      capturedUrl = String(url);
      return new Response(JSON.stringify({ id: 'x' }), { status: 200 });
    }) as unknown as typeof fetch;

    await resolveCoinIdFromAddress('0x' + 'a'.repeat(40), 'ethereum');
    expect(capturedUrl).not.toContain('//coins');
  });

  test('[P1] wraps unrelated network errors with "CoinGecko request failed"', async () => {
    globalThis.fetch = (async () => {
      throw new Error('ECONNREFUSED');
    }) as unknown as typeof fetch;

    await expect(
      resolveCoinIdFromAddress('0x' + 'a'.repeat(40), 'ethereum'),
    ).rejects.toThrow(/CoinGecko request failed/);
  });
});
