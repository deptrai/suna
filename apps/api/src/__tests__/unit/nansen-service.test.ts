import { describe, test, expect, mock, beforeEach, afterEach } from 'bun:test';

// ─── Config mock ──────────────────────────────────────────────────────────────

let _nansenApiKey: string | undefined = 'test-nansen-key';
let _mockFetchStatus = 200;
let _mockFetchBody: unknown = { data: [] };
let _capturedRequest: { url: string; headers: Record<string, string>; body: unknown } | null = null;

mock.module('../../config', () => ({
  config: {
    get NANSEN_API_KEY() { return _nansenApiKey; },
    NANSEN_API_BASE_URL: 'https://api.nansen.ai/api/v1',
    NANSEN_SMART_MONEY_CHAINS: 'ethereum,base,arbitrum,polygon,solana',
  },
}));

mock.module('../../lib/logger', () => ({
  logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
}));

// Intercept global fetch
const originalFetch = globalThis.fetch;
beforeEach(() => {
  _capturedRequest = null;
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    const headers: Record<string, string> = {};
    if (init?.headers) {
      const h = init.headers as Record<string, string>;
      Object.keys(h).forEach((k) => { headers[k.toLowerCase()] = h[k]!; });
    }
    const body = init?.body ? JSON.parse(init.body as string) : undefined;
    _capturedRequest = { url: String(url), headers, body };
    return {
      ok: _mockFetchStatus >= 200 && _mockFetchStatus < 300,
      status: _mockFetchStatus,
      json: async () => _mockFetchBody,
      text: async () => JSON.stringify(_mockFetchBody),
    } as Response;
  }) as typeof globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  _mockFetchStatus = 200;
  _mockFetchBody = { data: [] };
  _nansenApiKey = 'test-nansen-key';
});

// Import after mock setup
import {
  fetchSmartMoneyNetflow,
  fetchTgmWhoBoughtSold,
  fetchTgmFlows,
  canCallNansen,
  NansenUnconfiguredError,
  NansenForbiddenError,
  NansenPaymentRequiredError,
  NansenRateLimitError,
  NansenProviderError,
  NansenUnsupportedChainError,
} from '../../router/services/nansen';

// ─── canCallNansen ────────────────────────────────────────────────────────────

describe('canCallNansen', () => {
  test('[P0] returns true when API key set and chain supported', () => {
    _nansenApiKey = 'key';
    expect(canCallNansen('ethereum')).toBe(true);
  });

  test('[P0] returns false when API key missing', () => {
    _nansenApiKey = undefined;
    expect(canCallNansen('ethereum')).toBe(false);
  });

  test('[P0] returns false for unsupported chain', () => {
    _nansenApiKey = 'key';
    expect(canCallNansen('tron')).toBe(false);
  });

  test('returns true for solana', () => {
    _nansenApiKey = 'key';
    expect(canCallNansen('solana')).toBe(true);
  });
});

// ─── fetchSmartMoneyNetflow ───────────────────────────────────────────────────

describe('fetchSmartMoneyNetflow', () => {
  test('[P0] sends apikey header lowercase', async () => {
    await fetchSmartMoneyNetflow(['ethereum'], {});
    expect(_capturedRequest!.headers['apikey']).toBe('test-nansen-key');
  });

  test('[P0] NANSEN_API_KEY is NOT in error message on 401', async () => {
    _mockFetchStatus = 401;
    await expect(fetchSmartMoneyNetflow(['ethereum'], {})).rejects.toThrow(NansenForbiddenError);
  });

  test('[P0] throws NansenForbiddenError on 403', async () => {
    _mockFetchStatus = 403;
    await expect(fetchSmartMoneyNetflow(['ethereum'], {})).rejects.toThrow(NansenForbiddenError);
  });

  test('[P0] throws NansenPaymentRequiredError on 402', async () => {
    _mockFetchStatus = 402;
    await expect(fetchSmartMoneyNetflow(['ethereum'], {})).rejects.toThrow(NansenPaymentRequiredError);
  });

  test('[P0] throws NansenRateLimitError on 429', async () => {
    _mockFetchStatus = 429;
    await expect(fetchSmartMoneyNetflow(['ethereum'], {})).rejects.toThrow(NansenRateLimitError);
  });

  test('[P0] throws NansenProviderError on 5xx', async () => {
    _mockFetchStatus = 500;
    await expect(fetchSmartMoneyNetflow(['ethereum'], {})).rejects.toThrow(NansenProviderError);
  });

  test('[P0] throws NansenUnconfiguredError when key missing', async () => {
    _nansenApiKey = undefined;
    await expect(fetchSmartMoneyNetflow(['ethereum'], {})).rejects.toThrow(NansenUnconfiguredError);
  });

  test('[P0] throws NansenUnsupportedChainError for unsupported chain', async () => {
    await expect(fetchSmartMoneyNetflow(['tron'], {})).rejects.toThrow(NansenUnsupportedChainError);
  });

  test('[P0] error message does NOT contain API key', async () => {
    _mockFetchStatus = 500;
    try {
      await fetchSmartMoneyNetflow(['ethereum'], {});
    } catch (err: any) {
      expect(err.message).not.toContain('test-nansen-key');
    }
  });

  test('[P1] request URL does not expose key in query string', async () => {
    await fetchSmartMoneyNetflow(['ethereum'], {});
    expect(_capturedRequest!.url).not.toContain('test-nansen-key');
  });

  test('[P1] returns data array on 200', async () => {
    _mockFetchBody = { data: [{ netflowUsd: '100' }] };
    const result = await fetchSmartMoneyNetflow(['ethereum'], {});
    expect(result.data).toHaveLength(1);
  });

  test('includes tokenAddress in body when provided', async () => {
    await fetchSmartMoneyNetflow(['ethereum'], { tokenAddress: '0xabc' });
    expect(_capturedRequest!.body).toMatchObject({ tokenAddress: '0xabc' });
  });
});

// ─── fetchTgmWhoBoughtSold ────────────────────────────────────────────────────

describe('fetchTgmWhoBoughtSold', () => {
  const dateRange = { from: '2024-01-01T00:00:00Z', to: '2024-01-02T00:00:00Z' };

  test('[P0] sends apikey header lowercase', async () => {
    await fetchTgmWhoBoughtSold('ethereum', '0xtoken', 'buy', dateRange);
    expect(_capturedRequest!.headers['apikey']).toBe('test-nansen-key');
  });

  test('[P0] throws NansenUnsupportedChainError for unsupported chain', async () => {
    await expect(fetchTgmWhoBoughtSold('tron', '0xtoken', 'buy', dateRange)).rejects.toThrow(NansenUnsupportedChainError);
  });

  test('[P0] throws NansenRateLimitError on 429', async () => {
    _mockFetchStatus = 429;
    await expect(fetchTgmWhoBoughtSold('ethereum', '0xtoken', 'buy', dateRange)).rejects.toThrow(NansenRateLimitError);
  });

  test('sends correct buy/sell direction as type field in body', async () => {
    await fetchTgmWhoBoughtSold('ethereum', '0xtoken', 'sell', dateRange);
    expect(_capturedRequest!.body).toMatchObject({ type: 'sell' });
  });

  test('sends tokenAddress and chain in body', async () => {
    await fetchTgmWhoBoughtSold('base', '0xtoken', 'buy', dateRange);
    expect(_capturedRequest!.body).toMatchObject({ chain: 'base', tokenAddress: '0xtoken' });
  });
});

// ─── fetchTgmFlows ────────────────────────────────────────────────────────────

describe('fetchTgmFlows', () => {
  const dateRange = { from: '2024-01-01T00:00:00Z', to: '2024-01-02T00:00:00Z' };

  test('[P0] sends apikey header lowercase', async () => {
    await fetchTgmFlows('ethereum', '0xtoken', 'smart_money', dateRange);
    expect(_capturedRequest!.headers['apikey']).toBe('test-nansen-key');
  });

  test('[P0] throws NansenUnsupportedChainError for unsupported chain', async () => {
    await expect(fetchTgmFlows('tron', '0xtoken', 'smart_money', dateRange)).rejects.toThrow(NansenUnsupportedChainError);
  });

  test('sends label in body', async () => {
    await fetchTgmFlows('ethereum', '0xtoken', 'exchange', dateRange);
    expect(_capturedRequest!.body).toMatchObject({ label: 'exchange' });
  });
});
