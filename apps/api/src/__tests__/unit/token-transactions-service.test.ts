import { describe, test, expect, mock, beforeEach } from 'bun:test';

const mockConfig = {
  ETHERSCAN_API_KEY: 'test-etherscan-key',
  ARBISCAN_API_KEY: '',
  BASESCAN_API_KEY: '',
  POLYGONSCAN_API_KEY: '',
};

mock.module('../../config', () => ({ config: mockConfig }));

import { fetchTokenTransactions } from '../../router/services/token-transactions';

const MOCK_ETHERSCAN_RESPONSE = {
  status: '1',
  message: 'OK',
  result: [
    {
      hash: '0xabc123',
      from: '0xsender000000000000000000000000000000001',
      to: '0xreceiver00000000000000000000000000000001',
      value: '1000000000000000000',
      tokenDecimal: '18',
      timeStamp: '1700000000',
      blockNumber: '18000000',
      gasUsed: '21000',
    },
    {
      hash: '0xdef456',
      from: '0xsender000000000000000000000000000000002',
      to: '0xreceiver00000000000000000000000000000002',
      value: '500000000',
      tokenDecimal: '6',
      timeStamp: '1700001000',
      blockNumber: '18000001',
      gasUsed: '21000',
    },
  ],
};

describe('fetchTokenTransactions', () => {
  beforeEach(() => {
    mockConfig.ETHERSCAN_API_KEY = 'test-etherscan-key';
    globalThis.fetch = mock(() =>
      Promise.resolve(
        new Response(JSON.stringify(MOCK_ETHERSCAN_RESPONSE), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    ) as any;
  });

  test('returns correct snapshot shape on happy path', async () => {
    const snap = await fetchTokenTransactions('0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', 'ethereum');
    expect(snap.chain).toBe('ethereum');
    expect(snap.transactions).toHaveLength(2);
    expect(snap.transactions[0].hash).toBe('0xabc123');
    expect(snap.transactions[0].value_decimal).toBe(18);
    expect(snap.transactions[0].block_number).toBe('18000000');
    expect(snap.transactions[0].type).toBe('transfer');
    expect(snap.transactions[1].value_decimal).toBe(6);
    expect(snap.source).toBe('etherscan');
  });

  test('throws for Solana chain', async () => {
    await expect(
      fetchTokenTransactions('So11111111111111111111111111111111111111112', 'solana'),
    ).rejects.toThrow('Solana token transactions require paid tier');
  });

  test('filters out entries with invalid NaN timestamp', async () => {
    const responseWithBadTs = {
      status: '1',
      message: 'OK',
      result: [
        { ...MOCK_ETHERSCAN_RESPONSE.result[0], timeStamp: 'not-a-number' },
        { ...MOCK_ETHERSCAN_RESPONSE.result[1] },
      ],
    };
    globalThis.fetch = mock(() =>
      Promise.resolve(
        new Response(JSON.stringify(responseWithBadTs), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    ) as any;
    const snap = await fetchTokenTransactions('0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', 'ethereum');
    expect(snap.transactions).toHaveLength(1);
    expect(snap.transactions[0].hash).toBe('0xdef456');
  });

  test('throws on HTTP error response', async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response('Forbidden', { status: 403 })),
    ) as any;
    await expect(
      fetchTokenTransactions('0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', 'ethereum'),
    ).rejects.toThrow('etherscan API error: 403');
  });

  test('throws on rate limit response from Etherscan body', async () => {
    const rateLimitBody = { status: '0', message: 'Max rate limit reached', result: '' };
    globalThis.fetch = mock(() =>
      Promise.resolve(
        new Response(JSON.stringify(rateLimitBody), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    ) as any;
    await expect(
      fetchTokenTransactions('0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', 'ethereum'),
    ).rejects.toThrow('rate-limited');
  });

  test('uses tokenDecimal=18 as default when tokenDecimal is null', async () => {
    const responseNullDecimal = {
      status: '1',
      message: 'OK',
      result: [{ ...MOCK_ETHERSCAN_RESPONSE.result[0], tokenDecimal: null }],
    };
    globalThis.fetch = mock(() =>
      Promise.resolve(
        new Response(JSON.stringify(responseNullDecimal), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    ) as any;
    const snap = await fetchTokenTransactions('0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', 'ethereum');
    expect(snap.transactions[0].value_decimal).toBe(18);
  });
});
