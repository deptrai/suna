import { describe, test, expect, mock, beforeEach, afterEach, spyOn } from 'bun:test';
import { startOnChainIndexWorker, stopOnChainIndexWorker, QUEUE_NAME } from '../../../apps/api/src/queue/bullmq/workers/onchain-index';
import { db } from '../../../apps/api/src/shared/db';
import { config } from '../../../apps/api/src/config';

// Mock config
mock.module('../../../apps/api/src/config', () => ({
  config: {
    ONCHAIN_WORKER_ENABLED: true,
    NANSEN_API_KEY: 'test_nansen_key',
    DUNE_API_KEY: 'test_dune_key',
    ONCHAIN_RETENTION_DAYS: 30,
  }
}));

// Mock DB
mock.module('../../../apps/api/src/shared/db', () => ({
  db: {
    transaction: mock(async (cb) => {
      await cb({
        insert: () => ({
          values: () => ({
            onConflictDoNothing: () => ({
              returning: () => [{ id: 'mock-id' }]
            })
          })
        })
      });
    }),
    delete: () => ({
      where: () => ({
        returning: () => [{ id: 'deleted-id' }]
      })
    })
  }
}));

// Mock Redis Connection
mock.module('../../../apps/api/src/queue/bullmq/connection', () => ({
  redisConnection: {
    status: 'ready'
  }
}));

describe('OnChain Index Worker', () => {
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
    // Mock global fetch to avoid real network requests
    global.fetch = mock(async (url: RequestInfo | URL, options?: RequestInit) => {
      const urlStr = url.toString();
      if (urlStr.includes('yields.llama.fi')) {
        return new Response(JSON.stringify({
          data: [
            {
              project: 'test-project',
              chain: 'Ethereum',
              symbol: 'TEST',
              tvlUsd: 150000,
              apy: 5.5,
              apyPct7D: 0.1,
              apyMean30d: 5.2,
              apyBase7d: 5.0,
              underlyingTokens: ['0xtest']
            }
          ]
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      
      if (urlStr.includes('api.nansen.ai')) {
        return new Response(JSON.stringify({
          data: [
            {
              balance_24h_percent_change: 10,
              value_usd: 1000,
              token_address: '0x123',
              token_symbol: 'NANSEN_TOKEN'
            }
          ]
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }

      return new Response('Not Found', { status: 404 });
    });
  });

  afterEach(async () => {
    global.fetch = originalFetch;
    await stopOnChainIndexWorker();
  });

  test('[P0] should initialize worker correctly when enabled', () => {
    const worker = startOnChainIndexWorker();
    expect(worker).not.toBeNull();
    expect(worker?.name).toBe(QUEUE_NAME);
  });
});
