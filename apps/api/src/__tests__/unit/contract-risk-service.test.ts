import { describe, test, expect, mock, beforeEach } from 'bun:test';

const mockConfig = {
  GOPLUS_API_URL: 'https://api.gopluslabs.io',
  RUGCHECK_API_URL: 'https://api.rugcheck.xyz/v1',
};

mock.module('../../config', () => ({ config: mockConfig }));

import { fetchContractRisk } from '../../router/services/contract-risk';

const GOPLUS_RESPONSE_LOW_RISK = {
  code: 1,
  result: {
    '0x1f9840a85d5af5bf1d1762f925bdaddc4201f984': {
      is_honeypot: '0',
      sell_tax: '0',
      buy_tax: '0',
      is_mintable: '0',
      hidden_owner: '0',
      is_open_source: '1',
      is_proxy: '0',
    },
  },
};

const GOPLUS_RESPONSE_HIGH_RISK = {
  code: 1,
  result: {
    '0xabcdef1234567890abcdef1234567890abcdef12': {
      is_honeypot: '1',
      sell_tax: '0.9',
      is_mintable: '1',
      hidden_owner: '1',
      is_open_source: '0',
      is_proxy: '0',
    },
  },
};

describe('fetchContractRisk — GoPlus EVM', () => {
  test('LOW risk for clean token', async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(
        new Response(JSON.stringify(GOPLUS_RESPONSE_LOW_RISK), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    ) as any;

    const result = await fetchContractRisk(
      '0x1f9840a85d5af5bf1d1762f925bdaddc4201f984',
      'ethereum',
    );
    expect(result.risk_level).toBe('LOW');
    expect(result.risk_score).toBeLessThanOrEqual(30);
    expect(result.sources).toContain('GoPlus');
  });

  test('HIGH/CRITICAL risk for honeypot + high tax token', async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(
        new Response(JSON.stringify(GOPLUS_RESPONSE_HIGH_RISK), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    ) as any;

    const result = await fetchContractRisk(
      '0xabcdef1234567890abcdef1234567890abcdef12',
      'ethereum',
    );
    expect(['HIGH', 'CRITICAL']).toContain(result.risk_level);
    expect(result.risk_score).toBeGreaterThan(60);
    expect(result.top_factors.length).toBeGreaterThan(0);
  });

  test('Promise.allSettled — partial success still returns result', async () => {
    let callCount = 0;
    globalThis.fetch = mock(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve(
          new Response(JSON.stringify(GOPLUS_RESPONSE_LOW_RISK), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        );
      }
      // Second upstream fails
      return Promise.reject(new Error('network error'));
    }) as any;

    const result = await fetchContractRisk(
      '0x1f9840a85d5af5bf1d1762f925bdaddc4201f984',
      'ethereum',
    );
    expect(result).toBeDefined();
    expect(result.sources).toContain('GoPlus');
  });

  test('throws when ALL upstreams fail', async () => {
    globalThis.fetch = mock(() => Promise.reject(new Error('offline'))) as any;

    await expect(
      fetchContractRisk('0x1f9840a85d5af5bf1d1762f925bdaddc4201f984', 'ethereum'),
    ).rejects.toThrow();
  });
});
