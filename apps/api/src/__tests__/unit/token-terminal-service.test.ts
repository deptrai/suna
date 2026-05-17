import { describe, test, expect, beforeEach, afterEach, mock } from 'bun:test';

let _status = 200;
let _body: any = { data: [] };
let _headers: Record<string, string> = {};
let _apiKey = 'tt-key';

mock.module('../../config', () => ({
  config: {
    get TOKEN_TERMINAL_API_KEY() { return _apiKey; },
    TOKEN_TERMINAL_API_BASE_URL: 'https://api.tokenterminal.com/v2',
  },
}));

mock.module('../../lib/logger', () => ({ logger: { info: () => {}, warn: () => {}, error: () => {} } }));

const realFetch = globalThis.fetch;
beforeEach(() => {
  _headers = {};
  globalThis.fetch = (async (_url: string, init?: RequestInit) => {
    const h = init?.headers as Record<string, string>;
    _headers = h || {};
    return { ok: _status >= 200 && _status < 300, status: _status, json: async () => _body } as any;
  }) as any;
});
afterEach(() => { globalThis.fetch = realFetch; _status = 200; _body = { data: [] }; _apiKey = 'tt-key'; mock.restore(); });

import {
  fetchTokenTerminalMetrics,
  fetchMetricData,
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
    expect(_headers.Authorization).toBe('Bearer tt-key');
  });

  test('normalizes metrics and metric data', async () => {
    _body = { data: [{ metric_id: 'fees', metric_name: 'Fees' }] };
    const m = await fetchTokenTerminalMetrics();
    expect(m[0]!.metricId).toBe('fees');

    _body = { data: [{ project_id: 'uniswap', project: 'uniswap', timestamp: '2026-01-01T00:00:00Z', value: '12.3' }] };
    const d = await fetchMetricData('fees', { projectIds: ['uniswap'] });
    expect(Array.isArray(d)).toBe(true);
    if (d.length > 0) expect(d[0]!.value).toBe(12.3);
  });

  test('handles 308/400/402/403/429/5xx distinctly', async () => {
    _status = 308; await expect(fetchTokenTerminalMetrics()).rejects.toThrow(TokenTerminalProjectRedirectError);
    _status = 400; await expect(fetchTokenTerminalMetrics()).rejects.toThrow(TokenTerminalInvalidQueryError);
    _status = 402; await expect(fetchTokenTerminalMetrics()).rejects.toThrow(TokenTerminalPaymentRequiredError);
    _status = 403; await expect(fetchTokenTerminalMetrics()).rejects.toThrow(TokenTerminalForbiddenError);
    _status = 429; await expect(fetchTokenTerminalMetrics()).rejects.toThrow(TokenTerminalRateLimitError);
    _status = 500; await expect(fetchTokenTerminalMetrics()).rejects.toThrow(TokenTerminalProviderError);
  });
});
