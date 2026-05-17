import { describe, test, expect, mock, beforeEach } from 'bun:test';

// ─── Mutable DB state ─────────────────────────────────────────────────────────

type DbTierValue = 'free' | 'pro' | 'enterprise' | null;
let _dbTier: DbTierValue = 'pro';
let _dbThrows = false;
let _hasDatabaseUrl = true;

// ─── Module mocks (hoisted) ───────────────────────────────────────────────────

mock.module('../../config', () => ({
  config: {
    get DATABASE_URL() { return _hasDatabaseUrl ? 'postgres://test' : undefined; },
    isLocal: () => false,
  },
  getToolCost: (name: string) => 0.01,
}));

mock.module('../../shared/db', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => {
            if (_dbThrows) throw new Error('DB connection failed');
            if (_dbTier === null) return [];
            return [{ tier: _dbTier }];
          },
        }),
      }),
    }),
  },
}));

mock.module('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ a, b }),
}));

mock.module('@epsilon/db', () => ({
  creditAccounts: { accountId: 'accountId', tier: 'tier' },
}));

mock.module('../../repositories/credits', () => ({
  checkCredits: async () => ({ hasCredits: true, balance: 10, message: '' }),
  deductCredits: async () => ({ success: true, amountDeducted: 0.01, newBalance: 9.99 }),
}));

mock.module('../../lib/logger', () => ({
  logger: { info: () => undefined, warn: () => undefined, error: () => undefined, debug: () => undefined },
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

const { resolveAccountTier } = await import('../../router/services/billing');

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('resolveAccountTier', () => {
  beforeEach(() => {
    _dbTier = 'pro';
    _dbThrows = false;
    _hasDatabaseUrl = true;
  });

  // ── DB tier mapping ───────────────────────────────────────────────────────

  test('[P0] "pro" DB value maps to tier2', async () => {
    _dbTier = 'pro';
    const tier = await resolveAccountTier('acct-pro');
    expect(tier).toBe('tier2');
  });

  test('[P0] "enterprise" DB value maps to tier3', async () => {
    _dbTier = 'enterprise';
    const tier = await resolveAccountTier('acct-ent');
    expect(tier).toBe('tier3');
  });

  test('[P0] "free" DB value maps to tier1', async () => {
    _dbTier = 'free';
    const tier = await resolveAccountTier('acct-free');
    expect(tier).toBe('tier1');
  });

  test('[P0] missing row (null) defaults to tier1', async () => {
    _dbTier = null;
    const tier = await resolveAccountTier('acct-unknown');
    expect(tier).toBe('tier1');
  });

  // ── Fallback behavior ─────────────────────────────────────────────────────

  test('[P0] returns tier1 when DATABASE_URL is absent', async () => {
    _hasDatabaseUrl = false;
    const tier = await resolveAccountTier('acct-nodb');
    expect(tier).toBe('tier1');
  });

  test('[P0] returns tier1 when DB throws (fail-safe)', async () => {
    _dbThrows = true;
    const tier = await resolveAccountTier('acct-dberr');
    expect(tier).toBe('tier1');
  });

  // ── Cache behavior ────────────────────────────────────────────────────────

  test('[P1] second call for same accountId returns cached value without re-querying DB', async () => {
    _dbTier = 'enterprise';
    const first = await resolveAccountTier('acct-cache-test');
    expect(first).toBe('tier3');

    // Change DB value — cache should still return tier3
    _dbTier = 'free';
    const second = await resolveAccountTier('acct-cache-test');
    expect(second).toBe('tier3');
  });

  test('[P1] different accountIds are cached independently', async () => {
    _dbTier = 'pro';
    const tierA = await resolveAccountTier('acct-a-independent');
    expect(tierA).toBe('tier2');

    _dbTier = 'enterprise';
    const tierB = await resolveAccountTier('acct-b-independent');
    expect(tierB).toBe('tier3');

    // acct-a should still be tier2 from cache
    _dbTier = 'free';
    const tierAAgain = await resolveAccountTier('acct-a-independent');
    expect(tierAAgain).toBe('tier2');
  });
});
