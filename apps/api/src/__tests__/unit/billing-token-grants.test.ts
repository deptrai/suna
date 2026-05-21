/**
 * billing-token-grants.test.ts
 *
 * Tests cho Story 7.1 AC3 (auto-activate free → grant tokens) và
 * AC6 (renewal: reset từ stored monthly_grant_amount, KHÔNG re-read env config).
 *
 * P22: On renewal, dùng stored monthly_grant_amount để đảm bảo users
 * subscribed ở price cũ giữ nguyên grant — Stripe/Notion/Slack pattern.
 */
import { describe, test, expect, mock, beforeEach } from 'bun:test';

// ─── Mutable DB state ─────────────────────────────────────────────────────────

// Capture updates made by grantSubscriptionTokens / resetSubscriptionTokensFromStoredGrant
let _lastUpdate: Record<string, unknown> = {};
let _storedMonthlyGrantAmount = 200_000_000n;  // 200M tokens (pro tier)

// ─── Module mocks (hoisted) ──────────────────────────────────────────────────

// Mock tiers directly to avoid TIERS object being initialized at module-load time
// with whatever env values exist — we want deterministic tier grants in tests.
mock.module('../../billing/services/tiers', () => ({
  getTier: (name: string) => {
    const TIER_GRANTS: Record<string, number> = {
      free: 10_000_000,
      pro: 200_000_000,
      enterprise: 1_500_000_000,
    };
    return {
      name,
      monthlyTokenGrant: TIER_GRANTS[name] ?? 0,
    };
  },
}));

mock.module('../../shared/db', () => ({
  hasDatabase: true,
  db: {
    update: (_table: unknown) => ({
      set: (values: Record<string, unknown>) => {
        _lastUpdate = values;
        return {
          where: (_cond: unknown) => Promise.resolve(),
        };
      },
    }),
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => [{ monthlyGrantAmount: _storedMonthlyGrantAmount }],
        }),
      }),
    }),
  },
}));

mock.module('@epsilon/db', () => ({
  creditAccounts: { accountId: 'accountId', subscriptionTokens: 'subscriptionTokens' },
}));

mock.module('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ a, b }),
  relations: (..._args: unknown[]) => ({}),
  inArray: (a: unknown, b: unknown) => ({ a, b }),
  sql: (() => { const fn: any = () => 'sql'; fn.raw = (s: string) => s; return fn; })(),
}));

mock.module('../../shared/stripe', () => ({
  getStripe: () => ({
    subscriptions: {
      retrieve: async (_id: string) => ({
        current_period_end: Math.floor(Date.now() / 1000) + 30 * 24 * 3600,
      }),
    },
  }),
}));

// ─── Import after mocks ──────────────────────────────────────────────────────

const {
  grantSubscriptionTokens,
  resetSubscriptionTokensFromStoredGrant,
  grantSubscriptionTokensFromStripePeriod,
} = await import('../../billing/services/token-grants');

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('grantSubscriptionTokens (AC3 — auto-activate)', () => {
  beforeEach(() => {
    _lastUpdate = {};
  });

  test('[P0] grants correct tokens for free tier (10M)', async () => {
    await grantSubscriptionTokens('acct-free', 'free');
    expect(_lastUpdate.subscriptionTokens).toBe(10_000_000n);
    expect(_lastUpdate.monthlyGrantAmount).toBe(10_000_000n);
  });

  test('[P0] grants correct tokens for pro tier (200M)', async () => {
    await grantSubscriptionTokens('acct-pro', 'pro');
    expect(_lastUpdate.subscriptionTokens).toBe(200_000_000n);
    expect(_lastUpdate.monthlyGrantAmount).toBe(200_000_000n);
  });

  test('[P0] grants correct tokens for enterprise tier (1.5B)', async () => {
    await grantSubscriptionTokens('acct-ent', 'enterprise');
    expect(_lastUpdate.subscriptionTokens).toBe(1_500_000_000n);
    expect(_lastUpdate.monthlyGrantAmount).toBe(1_500_000_000n);
  });

  test('[P0] sets subscriptionCycleEnd when cycleEnd provided', async () => {
    const cycleEnd = new Date('2026-06-21T00:00:00Z');
    await grantSubscriptionTokens('acct-pro', 'pro', cycleEnd);
    expect(_lastUpdate.subscriptionCycleEnd).toBe(cycleEnd.toISOString());
  });

  test('[P1] sets subscriptionCycleEnd ~30 days ahead when not provided', async () => {
    const before = Date.now();
    await grantSubscriptionTokens('acct-free', 'free');
    const after = Date.now();
    const cycleEndStr = _lastUpdate.subscriptionCycleEnd as string;
    const cycleEnd = new Date(cycleEndStr).getTime();
    const expected30Days = 30 * 24 * 60 * 60 * 1000;
    // should be ~30 days ahead
    expect(cycleEnd - before).toBeGreaterThanOrEqual(expected30Days - 5000);
    expect(cycleEnd - after).toBeLessThanOrEqual(expected30Days + 5000);
  });

  test('[P1] unknown tier grants 0 tokens (falls back to none)', async () => {
    await grantSubscriptionTokens('acct-unknown', 'nonexistent_tier');
    expect(_lastUpdate.subscriptionTokens).toBe(0n);
    expect(_lastUpdate.monthlyGrantAmount).toBe(0n);
  });
});

describe('resetSubscriptionTokensFromStoredGrant (AC6 / P22 — renewal)', () => {
  beforeEach(() => {
    _lastUpdate = {};
    _storedMonthlyGrantAmount = 200_000_000n;
  });

  test('[P0] resets subscription_tokens from stored monthly_grant_amount (not env config)', async () => {
    _storedMonthlyGrantAmount = 200_000_000n;
    const cycleEnd = new Date('2026-06-21T00:00:00Z');
    await resetSubscriptionTokensFromStoredGrant('acct-pro', cycleEnd);
    expect(_lastUpdate.subscriptionTokens).toBe(200_000_000n);
    expect(_lastUpdate.subscriptionCycleEnd).toBe(cycleEnd.toISOString());
  });

  test('[P0] skips reset if stored grant is 0 (warn-only, no DB write)', async () => {
    _storedMonthlyGrantAmount = 0n;
    await resetSubscriptionTokensFromStoredGrant('acct-no-grant', null);
    // If grant=0, function should return early — no subscriptionTokens update
    expect(_lastUpdate.subscriptionTokens).toBeUndefined();
  });

  test('[P1] uses stored grant NOT env-config value (P22 price-lock guarantee)', async () => {
    // Simulate user subscribed at old price: stored grant = 150M (old tier)
    // env config now has TIER2 = 200M (new price), but renewal must use stored 150M
    _storedMonthlyGrantAmount = 150_000_000n;
    const cycleEnd = new Date('2026-06-21T00:00:00Z');
    await resetSubscriptionTokensFromStoredGrant('acct-old-price', cycleEnd);
    expect(_lastUpdate.subscriptionTokens).toBe(150_000_000n);
    // NOT 200M from env config
    expect(_lastUpdate.subscriptionTokens).not.toBe(200_000_000n);
  });

  test('[P1] uses fallback cycleEnd ~30 days ahead when null passed', async () => {
    const before = Date.now();
    await resetSubscriptionTokensFromStoredGrant('acct-pro', null);
    const after = Date.now();
    const cycleEndStr = _lastUpdate.subscriptionCycleEnd as string;
    const cycleEnd = new Date(cycleEndStr).getTime();
    const expected30Days = 30 * 24 * 60 * 60 * 1000;
    expect(cycleEnd - before).toBeGreaterThanOrEqual(expected30Days - 5000);
    expect(cycleEnd - after).toBeLessThanOrEqual(expected30Days + 5000);
  });

  test('[P1] topup_tokens are NOT touched during renewal (subscription_tokens only)', async () => {
    await resetSubscriptionTokensFromStoredGrant('acct-pro', new Date('2026-06-21T00:00:00Z'));
    // topupTokens should not appear in the update payload
    expect(_lastUpdate.topupTokens).toBeUndefined();
  });
});

describe('grantSubscriptionTokensFromStripePeriod (AC3 — Stripe cycle-aware grant)', () => {
  beforeEach(() => {
    _lastUpdate = {};
  });

  test('[P0] falls back to 30-day window when no Stripe subscriptionId provided', async () => {
    await grantSubscriptionTokensFromStripePeriod('acct-1', 'free', undefined);
    expect(_lastUpdate.subscriptionTokens).toBe(10_000_000n);
  });

  test('[P0] uses Stripe current_period_end when subscriptionId provided', async () => {
    await grantSubscriptionTokensFromStripePeriod('acct-2', 'pro', 'sub_abc123');
    expect(_lastUpdate.subscriptionTokens).toBe(200_000_000n);
    // Cycle end should come from Stripe (mock returns ~30 days ahead)
    expect(_lastUpdate.subscriptionCycleEnd).toBeTruthy();
  });
});
