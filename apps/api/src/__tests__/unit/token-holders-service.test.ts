import { describe, test, expect, mock, beforeEach } from 'bun:test';

const mockConfig = {
  MORALIS_API_KEY: 'test-moralis-key',
};

mock.module('../../config', () => ({ config: mockConfig }));

import { fetchTokenHolders } from '../../router/services/token-holders';

const MOCK_MORALIS_RESPONSE = {
  result: [
    {
      owner_address: '0xabc1230000000000000000000000000000000001',
      balance: '1000000000000000000',
      percentage_relative_to_total_supply: 10.5,
    },
    {
      owner_address: '0xabc1230000000000000000000000000000000002',
      balance: '500000000000000000',
      percentage_relative_to_total_supply: 5.25,
    },
  ],
};

describe('fetchTokenHolders', () => {
  beforeEach(() => {
    mockConfig.MORALIS_API_KEY = 'test-moralis-key';
    globalThis.fetch = mock(() =>
      Promise.resolve(
        new Response(JSON.stringify(MOCK_MORALIS_RESPONSE), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    ) as any;
  });

  test('returns correct snapshot shape on happy path', async () => {
    const snap = await fetchTokenHolders('0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', 'ethereum');
    expect(snap.source).toBe('moralis');
    expect(snap.chain).toBe('ethereum');
    expect(snap.holders).toHaveLength(2);
    expect(snap.holders[0].rank).toBe(1);
    expect(snap.holders[0].address).toBe('0xabc1230000000000000000000000000000000001');
    expect(snap.holders[0].balance).toBe('1000000000000000000');
    expect(snap.holders[0].percentage).toBe(10.5);
    expect(snap.holders[1].rank).toBe(2);
    expect(snap.total_holders).toBeNull();
    expect(snap.unconfigured).toBeUndefined();
  });

  test('throws for Solana chain', async () => {
    await expect(
      fetchTokenHolders('So11111111111111111111111111111111111111112', 'solana'),
    ).rejects.toThrow('Solana token holders require paid tier');
  });

  test('returns unconfigured:true when MORALIS_API_KEY is missing', async () => {
    mockConfig.MORALIS_API_KEY = '';
    const snap = await fetchTokenHolders('0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', 'ethereum');
    expect(snap.unconfigured).toBe(true);
    expect(snap.holders).toHaveLength(0);
    expect(snap.total_holders).toBeNull();
    expect(snap.source).toBe('moralis');
  });

  test('throws on Moralis API non-200 response', async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response('Unauthorized', { status: 401 })),
    ) as any;
    await expect(
      fetchTokenHolders('0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', 'ethereum'),
    ).rejects.toThrow('Moralis API error: 401');
  });

  test('throws on network error', async () => {
    globalThis.fetch = mock(() => Promise.reject(new Error('ECONNREFUSED'))) as any;
    await expect(
      fetchTokenHolders('0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', 'ethereum'),
    ).rejects.toThrow('ECONNREFUSED');
  });

  test('throws for unsupported chain', async () => {
    await expect(
      fetchTokenHolders('0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', 'fantom'),
    ).rejects.toThrow('Unsupported chain: fantom');
  });
});
