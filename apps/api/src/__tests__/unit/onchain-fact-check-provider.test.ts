/**
 * Provider adapter tests for onchain-fact-check service.
 * Tests runOnchainFactCheck via mocked fetch + DB to verify:
 *   - insufficient_wallet_context when watchlist is empty
 *   - QuickNode happy path: full flow with eth_getLogs + eth_call
 *   - QuickNode failure → Etherscan fallback
 *   - All providers fail → provider_unavailable
 *   - Etherscan happy path: tokentx response parsed correctly
 *   - Blockscout empty result: 0 transfers, passed
 */
import { beforeEach, describe, expect, mock, test } from 'bun:test';

const mockConfig = {
  ONCHAIN_FACT_CHECK_WORKER_ENABLED: true,
  ONCHAIN_FACT_CHECK_PROVIDER: 'quicknode',
  ONCHAIN_FACT_CHECK_CHAINS: 'ethereum',
  ONCHAIN_FACT_CHECK_RPC_URL_ETHEREUM: 'https://mock-qn.test',
  ONCHAIN_FACT_CHECK_RPC_URL_BASE: '',
  ONCHAIN_FACT_CHECK_RPC_URL_POLYGON: '',
  ONCHAIN_FACT_CHECK_RPC_URL_ARBITRUM: '',
  ONCHAIN_FACT_CHECK_LOOKBACK_HOURS: 24,
  ONCHAIN_FACT_CHECK_DUMP_THRESHOLD_PCT: 5,
  ONCHAIN_FACT_CHECK_MAX_WALLETS_PER_TOKEN: 10,
  ONCHAIN_FACT_CHECK_MAX_TRANSFERS_PER_WALLET: 200,
  ETHERSCAN_API_KEY: 'test-etherscan-key',
  BASESCAN_API_KEY: '',
  ARBISCAN_API_KEY: '',
  POLYGONSCAN_API_KEY: '',
  DUNE_API_KEY: '',
};

let watchlistRows: Array<{ walletAddress: string; walletRole: string; label: string | null }> = [];

mock.module('../../config', () => ({ config: mockConfig, getToolCost: () => 0.1 }));
mock.module('../../lib/logger', () => ({
  logger: { info: () => undefined, warn: () => undefined, error: () => undefined },
}));
mock.module('../../queue/bullmq/connection', () => ({ redisConnection: {} }));
mock.module('@epsilon/db', () => ({
  onchainFactChecks: { id: 'id' },
  projectWalletWatchlist: {
    walletAddress: 'walletAddress',
    walletRole: 'walletRole',
    label: 'label',
    chain: 'chain',
    tokenAddress: 'tokenAddress',
    active: 'active',
  },
}));
mock.module('drizzle-orm', () => ({
  eq: (_col: unknown, _val: unknown) => ({ col: _col, val: _val }),
  desc: (col: unknown) => ({ col }),
  and: (...args: unknown[]) => args,
}));
mock.module('../../shared/db', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => watchlistRows,
        }),
        orderBy: () => ({
          limit: async () => [],
        }),
      }),
    }),
    insert: () => ({
      values: async () => undefined,
    }),
  },
}));

import { runOnchainFactCheck } from '../../router/services/onchain-fact-check';

const TOKEN = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';
const WALLET = '0xdevwallet000000000000000000000000000001';

function makeJsonRpcOk(result: unknown): Response {
  return new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function makeHttpError(status: number): Response {
  return new Response('error', { status });
}

function makeEtherscanOk(rows: Array<Record<string, string>>): Response {
  return new Response(JSON.stringify({ status: '1', message: 'OK', result: rows }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function makeEtherscanEmpty(): Response {
  return new Response(JSON.stringify({ status: '0', message: 'No transactions found', result: [] }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function makeBlockscoutOk(rows: Array<Record<string, string>>): Response {
  return new Response(JSON.stringify({ result: rows }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

// Queue-based fetch mock for sequential calls
function enqueueFetch(responses: Response[]): void {
  let idx = 0;
  globalThis.fetch = mock(() => {
    const res = responses[idx++];
    if (!res) throw new Error(`Unexpected fetch call #${idx} — no more queued responses`);
    return Promise.resolve(res);
  }) as unknown as typeof fetch;
}

describe('runOnchainFactCheck — provider adapters', () => {
  beforeEach(() => {
    watchlistRows = [];
    mockConfig.ONCHAIN_FACT_CHECK_PROVIDER = 'quicknode';
    mockConfig.ONCHAIN_FACT_CHECK_RPC_URL_ETHEREUM = 'https://mock-qn.test';
    mockConfig.ETHERSCAN_API_KEY = 'test-etherscan-key';
  });

  test('[P0] no watchlist entries => insufficient_wallet_context', async () => {
    watchlistRows = [];
    const result = await runOnchainFactCheck({
      chain: 'ethereum',
      tokenAddress: TOKEN,
      articleSentiment: 'positive',
    });
    expect(result.status).toBe('insufficient_wallet_context');
    expect(result.riskLevel).toBe('none');
    expect(result.walletsChecked).toBe(0);
    expect(result.riskFactors[0]?.code).toBe('insufficient_wallet_context');
  });

  test('[P0] QuickNode happy path: outflow <5% => passed', async () => {
    watchlistRows = [{ walletAddress: WALLET, walletRole: 'dev', label: null }];
    // 4 sequential calls: eth_blockNumber, eth_getLogs (out), eth_getLogs (in), eth_call (balance)
    // outgoing = 10 tokens, current balance = 1000 tokens → previous = 1010 → outflow ≈ 0.99%
    enqueueFetch([
      makeJsonRpcOk('0x1312d00'), // eth_blockNumber
      makeJsonRpcOk([{ data: '0x000000000000000000000000000000000000000000000000000000000000000a' }]), // outgoing: 10
      makeJsonRpcOk([]), // incoming: 0
      makeJsonRpcOk('0x00000000000000000000000000000000000000000000000000000000000003e8'), // balance: 1000
    ]);
    const result = await runOnchainFactCheck({
      chain: 'ethereum',
      tokenAddress: TOKEN,
      articleSentiment: 'positive',
    });
    expect(result.status).toBe('passed');
    expect(result.riskLevel).toBe('none');
    expect(result.source).toBe('quicknode');
    expect(result.walletsChecked).toBe(1);
  });

  test('[P0] QuickNode happy path: outflow >5% on positive article => flagged', async () => {
    watchlistRows = [{ walletAddress: WALLET, walletRole: 'dev', label: null }];
    // outgoing = 100 tokens, current = 800 → previous = 900 → outflow ≈ 11.1%
    enqueueFetch([
      makeJsonRpcOk('0x1312d00'),
      makeJsonRpcOk([{ data: '0x0000000000000000000000000000000000000000000000000000000000000064' }]), // outgoing: 100
      makeJsonRpcOk([]), // incoming: 0
      makeJsonRpcOk('0x0000000000000000000000000000000000000000000000000000000000000320'), // balance: 800
    ]);
    const result = await runOnchainFactCheck({
      chain: 'ethereum',
      tokenAddress: TOKEN,
      articleSentiment: 'positive',
    });
    expect(result.status).toBe('flagged');
    expect(result.riskLevel).toBe('high');
    expect(result.netOutflowPct).toBeGreaterThan(5);
  });

  test('[P0] QuickNode HTTP 500 => falls back to Etherscan, returns result', async () => {
    watchlistRows = [{ walletAddress: WALLET, walletRole: 'dev', label: null }];
    const lookbackFrom = Date.now() - 24 * 3600 * 1000;
    const recentTs = Math.floor((lookbackFrom + 60_000) / 1000); // 1 minute after lookback start
    enqueueFetch([
      makeHttpError(500), // QuickNode fails on eth_blockNumber
      makeEtherscanOk([
        {
          from: WALLET,
          to: '0xexchange0000000000000000000000000000001',
          value: '5000000',
          timeStamp: String(recentTs),
        },
      ]),
    ]);
    const result = await runOnchainFactCheck({
      chain: 'ethereum',
      tokenAddress: TOKEN,
      articleSentiment: 'neutral',
    });
    expect(result.status).toBe('passed');
    expect(result.transferCount).toBe(1);
  });

  test('[P1] all providers fail => provider_unavailable status', async () => {
    watchlistRows = [{ walletAddress: WALLET, walletRole: 'dev', label: null }];
    enqueueFetch([
      makeHttpError(500), // QuickNode fails
      makeHttpError(429), // Etherscan rate-limited
      makeHttpError(503), // Blockscout unavailable
    ]);
    const result = await runOnchainFactCheck({
      chain: 'ethereum',
      tokenAddress: TOKEN,
      articleSentiment: 'positive',
    });
    expect(result.status).toBe('provider_unavailable');
    expect(result.riskLevel).toBe('low');
    expect(result.riskFactors[0]?.code).toBe('provider_rate_limited');
    expect(result.walletsChecked).toBe(1);
    expect(result.transferCount).toBe(0);
  });

  test('[P1] Etherscan returns status=0 error string => fallback to Blockscout', async () => {
    watchlistRows = [{ walletAddress: WALLET, walletRole: 'dev', label: null }];
    enqueueFetch([
      makeHttpError(500), // QuickNode fails
      new Response(JSON.stringify({ status: '0', message: 'NOTOK', result: 'Max rate limit reached' }), { status: 200 }), // Etherscan NOTOK
      makeBlockscoutOk([]), // Blockscout returns empty
    ]);
    const result = await runOnchainFactCheck({
      chain: 'ethereum',
      tokenAddress: TOKEN,
      articleSentiment: 'positive',
    });
    // Blockscout returned empty → metrics computed with 0 transfers
    expect(result.status).toBe('passed');
    expect(result.transferCount).toBe(0);
  });

  test('[P1] Etherscan provider (not quicknode): direct call, no QuickNode fallback attempted', async () => {
    mockConfig.ONCHAIN_FACT_CHECK_PROVIDER = 'etherscan';
    watchlistRows = [{ walletAddress: WALLET, walletRole: 'dev', label: null }];
    const lookbackFrom = Date.now() - 24 * 3600 * 1000;
    const recentTs = Math.floor((lookbackFrom + 60_000) / 1000);
    enqueueFetch([
      makeEtherscanOk([
        {
          from: WALLET,
          to: '0xexchange0000000000000000000000000000001',
          value: '1000000',
          timeStamp: String(recentTs),
        },
      ]),
    ]);
    const result = await runOnchainFactCheck({
      chain: 'ethereum',
      tokenAddress: TOKEN,
      articleSentiment: 'neutral',
    });
    expect(result.source).toBe('etherscan');
    expect(result.transferCount).toBe(1);
  });

  test('[P2] QuickNode eth_call fails (balance unavailable) => transfer_only basis, confidence downgraded', async () => {
    watchlistRows = [{ walletAddress: WALLET, walletRole: 'dev', label: null }];
    enqueueFetch([
      makeJsonRpcOk('0x1312d00'), // eth_blockNumber
      makeJsonRpcOk([{ data: '0x0000000000000000000000000000000000000000000000000000000000000064' }]), // outgoing: 100
      makeJsonRpcOk([]), // incoming: 0
      makeHttpError(500), // eth_call fails → balance unavailable
    ]);
    const result = await runOnchainFactCheck({
      chain: 'ethereum',
      tokenAddress: TOKEN,
      articleSentiment: 'positive',
    });
    // Without previous balance, netOutflowPct is null → not flagged; transfer_only downgrade → low
    expect(result.status).toBe('passed');
    expect(result.riskLevel).toBe('low');
    expect(result.riskFactors.some((r) => r.code === 'transfer_only_confidence')).toBe(true);
  });

  test('[P2] Etherscan result filters out transfers older than lookback window', async () => {
    watchlistRows = [{ walletAddress: WALLET, walletRole: 'dev', label: null }];
    const oldTs = Math.floor((Date.now() - 48 * 3600 * 1000) / 1000); // 48h ago — outside 24h window
    const recentTs = Math.floor((Date.now() - 1 * 3600 * 1000) / 1000);   // 1h ago — inside window
    enqueueFetch([
      makeHttpError(500), // QuickNode fails
      makeEtherscanOk([
        { from: WALLET, to: '0xexchange0000000000000000000000000000001', value: '9000000', timeStamp: String(oldTs) },
        { from: WALLET, to: '0xexchange0000000000000000000000000000001', value: '1000000', timeStamp: String(recentTs) },
      ]),
    ]);
    const result = await runOnchainFactCheck({
      chain: 'ethereum',
      tokenAddress: TOKEN,
      articleSentiment: 'neutral',
    });
    expect(result.transferCount).toBe(1); // only the recent transfer counted
  });
});
