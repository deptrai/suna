import { describe, expect, test } from 'bun:test';

const mockConfig = {
  ONCHAIN_FACT_CHECK_WORKER_ENABLED: false,
  ONCHAIN_FACT_CHECK_PROVIDER: 'quicknode',
  ONCHAIN_FACT_CHECK_CHAINS: 'ethereum',
  ONCHAIN_FACT_CHECK_RPC_URL_ETHEREUM: '',
  ONCHAIN_FACT_CHECK_RPC_URL_BASE: '',
  ONCHAIN_FACT_CHECK_RPC_URL_POLYGON: '',
  ONCHAIN_FACT_CHECK_RPC_URL_ARBITRUM: '',
};

mock.module('../../config', () => ({ config: mockConfig }));
mock.module('../../lib/logger', () => ({
  logger: { info: () => undefined, warn: () => undefined, error: () => undefined },
}));
mock.module('../../shared/db', () => ({ db: {} }));
mock.module('@epsilon/db', () => ({ onchainFactChecks: {}, projectWalletWatchlist: {} }));
mock.module('drizzle-orm', () => ({ eq: () => ({}), desc: () => ({}), and: () => ({}) }));

import { mock } from 'bun:test';
import { canStartFactCheckWorker } from '../../router/services/onchain-fact-check';

describe('canStartFactCheckWorker', () => {
  test('[P0] returns false when worker is disabled', () => {
    mockConfig.ONCHAIN_FACT_CHECK_WORKER_ENABLED = false;
    expect(canStartFactCheckWorker()).toBe(false);
  });

  test('[P0] returns false when quicknode provider and no RPC URLs configured', () => {
    mockConfig.ONCHAIN_FACT_CHECK_WORKER_ENABLED = true;
    mockConfig.ONCHAIN_FACT_CHECK_PROVIDER = 'quicknode';
    mockConfig.ONCHAIN_FACT_CHECK_CHAINS = 'ethereum';
    mockConfig.ONCHAIN_FACT_CHECK_RPC_URL_ETHEREUM = '';
    expect(canStartFactCheckWorker()).toBe(false);
  });

  test('[P1] returns true when quicknode provider and at least one chain URL is configured', () => {
    mockConfig.ONCHAIN_FACT_CHECK_WORKER_ENABLED = true;
    mockConfig.ONCHAIN_FACT_CHECK_PROVIDER = 'quicknode';
    mockConfig.ONCHAIN_FACT_CHECK_CHAINS = 'ethereum';
    mockConfig.ONCHAIN_FACT_CHECK_RPC_URL_ETHEREUM = 'https://quicknode.example.com/rpc';
    expect(canStartFactCheckWorker()).toBe(true);
  });

  test('[P1] returns true when non-quicknode provider (no RPC URL check applied)', () => {
    mockConfig.ONCHAIN_FACT_CHECK_WORKER_ENABLED = true;
    mockConfig.ONCHAIN_FACT_CHECK_PROVIDER = 'etherscan';
    mockConfig.ONCHAIN_FACT_CHECK_RPC_URL_ETHEREUM = '';
    expect(canStartFactCheckWorker()).toBe(true);
  });

  test('[P2] returns false when multi-chain configured but no URLs for any chain', () => {
    mockConfig.ONCHAIN_FACT_CHECK_WORKER_ENABLED = true;
    mockConfig.ONCHAIN_FACT_CHECK_PROVIDER = 'quicknode';
    mockConfig.ONCHAIN_FACT_CHECK_CHAINS = 'ethereum,base,polygon';
    mockConfig.ONCHAIN_FACT_CHECK_RPC_URL_ETHEREUM = '';
    mockConfig.ONCHAIN_FACT_CHECK_RPC_URL_BASE = '';
    mockConfig.ONCHAIN_FACT_CHECK_RPC_URL_POLYGON = '';
    expect(canStartFactCheckWorker()).toBe(false);
  });

  test('[P2] returns true when at least one of multi-chain has a URL', () => {
    mockConfig.ONCHAIN_FACT_CHECK_WORKER_ENABLED = true;
    mockConfig.ONCHAIN_FACT_CHECK_PROVIDER = 'quicknode';
    mockConfig.ONCHAIN_FACT_CHECK_CHAINS = 'ethereum,base';
    mockConfig.ONCHAIN_FACT_CHECK_RPC_URL_ETHEREUM = '';
    mockConfig.ONCHAIN_FACT_CHECK_RPC_URL_BASE = 'https://quicknode.example.com/base';
    expect(canStartFactCheckWorker()).toBe(true);
  });
});
