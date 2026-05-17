import { expect, test, describe, vi, beforeEach, afterEach } from 'vitest';

// Imports must come before spies but after vi.mock hoisting completes.
// We use vi.spyOn (not vi.mock) so mutations to envValues are visible per test.
import entityWalletRiskTool from './tools/entity_wallet_risk';
import * as getEnvModule from './tools/lib/get-env';
import * as sanitizeModule from './tools/lib/sanitize';

// ─── Env mock state ───────────────────────────────────────────────────────────

const envValues: Record<string, string | undefined> = {
  EPSILON_TOKEN: 'test-epsilon-token',
  EPSILON_API_URL: 'https://api.epsilon.test',
};

// ─── Fetch mock state ─────────────────────────────────────────────────────────

type MockResponse =
  | { ok: true; json: unknown }
  | { ok: false; status: number; text: string }
  | { throw: Error };

let _mockResponse: MockResponse = { ok: true, json: { success: true } };

let fetchSpy: ReturnType<typeof vi.fn>;

function stubFetch(override?: () => Promise<Response>) {
  const impl = override ?? (async (): Promise<Response> => {
    const r = _mockResponse;
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
  });
  fetchSpy = vi.fn(impl);
  vi.stubGlobal('fetch', fetchSpy);
}

beforeEach(() => {
  envValues.EPSILON_TOKEN = 'test-epsilon-token';
  envValues.EPSILON_API_URL = 'https://api.epsilon.test';
  _mockResponse = { ok: true, json: { success: true } };
  vi.spyOn(getEnvModule, 'getEnv').mockImplementation((key: string) => envValues[key] as string);
  vi.spyOn(sanitizeModule, 'sanitizeUpstreamErr').mockImplementation((msg: string) => String(msg).slice(0, 100));
  stubFetch();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

const WALLET = '0xd8da6bf26964af9d7eed9e03e53415d37aa96045';
const TOKEN = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';

function execute(args: Record<string, string | undefined>) {
  return entityWalletRiskTool.execute(args as any, {} as any);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('entity_wallet_risk tool', () => {
  describe('env guard', () => {
    test('[P0] returns error when EPSILON_TOKEN not set', async () => {
      envValues.EPSILON_TOKEN = undefined;
      const result = await execute({ mode: 'wallet', chain: 'ethereum', address: WALLET });
      const parsed = JSON.parse(result as string);
      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain('EPSILON_TOKEN');
    });

    test('[P0] returns error when EPSILON_API_URL not set', async () => {
      envValues.EPSILON_API_URL = undefined;
      const result = await execute({ mode: 'wallet', chain: 'ethereum', address: WALLET });
      const parsed = JSON.parse(result as string);
      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain('EPSILON_API_URL');
    });
  });

  describe('wallet mode validation', () => {
    test('[P0] returns error when address is missing', async () => {
      const result = await execute({ mode: 'wallet', chain: 'ethereum' });
      const parsed = JSON.parse(result as string);
      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain('address is required');
    });

    test('[P0] returns error for invalid EVM address', async () => {
      const result = await execute({ mode: 'wallet', chain: 'ethereum', address: 'not-valid' });
      const parsed = JSON.parse(result as string);
      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain('Invalid EVM address');
    });
  });

  describe('token_holders mode validation', () => {
    test('[P0] returns error when token_address is missing', async () => {
      const result = await execute({ mode: 'token_holders', chain: 'ethereum' });
      const parsed = JSON.parse(result as string);
      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain('token_address is required');
    });

    test('[P0] returns error for invalid token_address EVM format', async () => {
      const result = await execute({ mode: 'token_holders', chain: 'ethereum', token_address: '0xshort' });
      const parsed = JSON.parse(result as string);
      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain('Invalid token_address EVM format');
    });
  });

  describe('HTTP call behaviour', () => {
    test('[P0] calls internal proxy URL, not Arkham directly', async () => {
      _mockResponse = { ok: true, json: { success: true, risk_level: 'none' } };
      await execute({ mode: 'wallet', chain: 'ethereum', address: WALLET });
      expect(fetchSpy).toHaveBeenCalledOnce();
      const calledUrl = fetchSpy.mock.calls[0][0] as string;
      expect(calledUrl).toContain('/v1/router/entity-wallet-risk');
      expect(calledUrl).not.toContain('arkm.com');
    });

    test('[P0] sends Authorization header with Bearer token', async () => {
      _mockResponse = { ok: true, json: { success: true } };
      await execute({ mode: 'wallet', chain: 'ethereum', address: WALLET });
      const init = fetchSpy.mock.calls[0][1] as RequestInit;
      const headers = init.headers as Record<string, string>;
      expect(headers['Authorization']).toBe('Bearer test-epsilon-token');
    });

    test('[P0] successful response is returned as JSON string passthrough', async () => {
      const payload = { success: true, risk_level: 'high', risk_score: 85 };
      _mockResponse = { ok: true, json: payload };
      const result = await execute({ mode: 'wallet', chain: 'ethereum', address: WALLET });
      const parsed = JSON.parse(result as string);
      expect(parsed.risk_level).toBe('high');
      expect(parsed.risk_score).toBe(85);
    });

    test('[P0] 402 response returns insufficient credits error', async () => {
      _mockResponse = { ok: false, status: 402, text: 'Insufficient credits' };
      const result = await execute({ mode: 'wallet', chain: 'ethereum', address: WALLET });
      const parsed = JSON.parse(result as string);
      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain('Insufficient credits');
    });

    test('[P0] non-ok response returns proxy error with status code', async () => {
      _mockResponse = { ok: false, status: 500, text: 'Internal Server Error' };
      const result = await execute({ mode: 'wallet', chain: 'ethereum', address: WALLET });
      const parsed = JSON.parse(result as string);
      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain('500');
    });

    test('[P0] network error returns error JSON (does not throw)', async () => {
      _mockResponse = { throw: new Error('connection refused') };
      const result = await execute({ mode: 'wallet', chain: 'ethereum', address: WALLET });
      const parsed = JSON.parse(result as string);
      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain('Network error');
    });

    test('[P0] invalid JSON from proxy returns parse error', async () => {
      stubFetch(async () => ({
        ok: true,
        status: 200,
        json: async () => { throw new SyntaxError('Unexpected token'); },
        text: async () => 'not-json',
      } as unknown as Response));
      const result = await execute({ mode: 'wallet', chain: 'ethereum', address: WALLET });
      const parsed = JSON.parse(result as string);
      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain('Invalid JSON');
    });

    test('[P1] token_holders mode sends correct body fields', async () => {
      _mockResponse = { ok: true, json: { success: true } };
      await execute({ mode: 'token_holders', chain: 'base', token_address: TOKEN });
      const init = fetchSpy.mock.calls[0][1] as RequestInit;
      const body = JSON.parse(init.body as string);
      expect(body.mode).toBe('token_holders');
      expect(body.chain).toBe('base');
      expect(body.token_address).toBe(TOKEN);
    });

    test('[P1] session_id is forwarded in request body', async () => {
      _mockResponse = { ok: true, json: { success: true } };
      await execute({ mode: 'wallet', chain: 'ethereum', address: WALLET, session_id: 'sess123' });
      const init = fetchSpy.mock.calls[0][1] as RequestInit;
      const body = JSON.parse(init.body as string);
      expect(body.session_id).toBe('sess123');
    });
  });
});
