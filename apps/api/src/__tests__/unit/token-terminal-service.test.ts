import { describe, test, expect, beforeEach, afterEach, mock } from 'bun:test';

let _status = 200;
let _body: any = { data: [] };
let _headers: Record<string, string> = {};
let _capturedUrl = '';
let _apiKey = 'tt-secret-key-12345';

mock.module('../../config', () => ({
  config: {
    get TOKEN_TERMINAL_API_KEY() { return _apiKey; },
    TOKEN_TERMINAL_API_BASE_URL: 'https://api.tokenterminal.com/v2',
  },
}));

mock.module('../../lib/logger', () => ({ logger: { info: () => {}, warn: () => {}, error: () => {} } }));

const realFetch = globalThis.fetch;
beforeEach(() => {
  process.env.TOKEN_TERMINAL_THROTTLE_MS_OVERRIDE_FOR_TESTS = '1';
  _headers = {};
  _capturedUrl = '';
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    _capturedUrl = String(url);
    const h = init?.headers as Record<string, string>;
    _headers = h || {};
    return { ok: _status >= 200 && _status < 300, status: _status, json: async () => _body } as any;
  }) as any;
});
afterEach(() => { globalThis.fetch = realFetch; _status = 200; _body = { data: [] }; _apiKey = 'tt-secret-key-12345'; mock.restore(); });

import {
  fetchTokenTerminalMetrics,
  fetchMetricData,
  sanitizeTokenTerminalError,
  TokenTerminalProjectRedirectError,
  TokenTerminalInvalidQueryError,
  TokenTerminalPaymentRequiredError,
  TokenTerminalForbiddenError,
  TokenTerminalRateLimitError,
  TokenTerminalProviderError,
} from '../../router/services/token-terminal';

describe('token-terminal service', () => {
  test('adds bearer auth header', async () => {
    _body = { data: [{ metric_id: 'fees', metric_name: 'Fees' }] };
    await fetchTokenTerminalMetrics();
    expect(_headers.Authorization).toBe(`Bearer ${_apiKey}`);
  });

  test('does not put api key in URL', async () => {
    _body = { data: [{ metric_id: 'fees', metric_name: 'Fees' }] };
    await fetchTokenTerminalMetrics();
    expect(_capturedUrl).not.toContain(_apiKey);
  });

  test('skips rows without timestamp', async () => {
    _body = { data: [
      { project_id: 'uniswap', value: '12.3' },                                  // no timestamp -> dropped
      { project_id: 'aave', timestamp: '2026-01-01T00:00:00Z', value: '4.5' },
    ] };
    const d = await fetchMetricData('fees', { projectIds: ['uniswap', 'aave'] });
    expect(d.length).toBe(1);
    expect(d[0]!.projectId).toBe('aave');
  });

  test('coerces non-finite numeric strings to null', async () => {
    _body = { data: [{ project_id: 'x', timestamp: '2026-01-01T00:00:00Z', value: 'NaN' }] };
    const d = await fetchMetricData('fees', { projectIds: ['x'] });
    expect(d[0]!.value).toBeNull();
  });

  test('normalizes metrics and metric data', async () => {
    _body = { data: [{ metric_id: 'fees', metric_name: 'Fees' }] };
    const m = await fetchTokenTerminalMetrics();
    expect(m[0]!.metricId).toBe('fees');

    _body = { data: [{ project_id: 'uniswap', timestamp: '2026-01-01T00:00:00Z', value: '12.3' }] };
    const d = await fetchMetricData('fees', { projectIds: ['uniswap'] });
    expect(d[0]!.value).toBe(12.3);
  });

  test('handles 308/400/402/403/429/5xx distinctly', async () => {
    _status = 308; await expect(fetchTokenTerminalMetrics()).rejects.toThrow(TokenTerminalProjectRedirectError);
    _status = 400; await expect(fetchTokenTerminalMetrics()).rejects.toThrow(TokenTerminalInvalidQueryError);
    _status = 402; await expect(fetchTokenTerminalMetrics()).rejects.toThrow(TokenTerminalPaymentRequiredError);
    _status = 403; await expect(fetchTokenTerminalMetrics()).rejects.toThrow(TokenTerminalForbiddenError);
    _status = 429; await expect(fetchTokenTerminalMetrics()).rejects.toThrow(TokenTerminalRateLimitError);
    _status = 500; await expect(fetchTokenTerminalMetrics()).rejects.toThrow(TokenTerminalProviderError);
  });

  test('sanitizeTokenTerminalError redacts plain api key', () => {
    const err = new Error(`request failed for ${_apiKey}`);
    expect(sanitizeTokenTerminalError(err)).toBe('request failed for [REDACTED]');
  });

  test('sanitizeTokenTerminalError redacts URL-encoded api key', () => {
    _apiKey = 'tt secret/key+abc';
    const enc = encodeURIComponent(_apiKey);
    const err = new Error(`url leaked: https://example.com?token=${enc}`);
    const sanitized = sanitizeTokenTerminalError(err);
    expect(sanitized).not.toContain(enc);
    expect(sanitized).toContain('[REDACTED]');
  });
});
