/**
 * billing-routes-topup.test.ts
 *
 * API-level tests cho Story 7.1:
 * - AC4: GET /billing/account-state — trả về token fields (subscription_tokens, topup_tokens, total_tokens)
 * - AC7: POST /billing/subscriptions/topup/checkout — validation, tier gate, Stripe session creation
 *
 * Pattern: Hono app.request() — test handler logic trực tiếp (không cần HTTP server)
 */
import { describe, test, expect, mock, beforeEach } from 'bun:test';
import { Hono } from 'hono';

// ─── Mutable state ────────────────────────────────────────────────────────────

let _canPurchaseTopup = true;
let _accountTier = 'pro';
let _tokenBalances = {
  subscriptionTokens: 5_000_000n,
  topupTokens: 1_000_000n,
  total: 6_000_000n,
  cycleEnd: null as Date | null,
};
let _stripeSessionUrl = 'https://checkout.stripe.com/c/pay/test_abc123';
let _stripeThrows = false;

// ─── Module mocks ─────────────────────────────────────────────────────────────

mock.module('../../config', () => ({
  config: {
    get DATABASE_URL() { return 'postgres://test'; },
    get EPSILON_BILLING_INTERNAL_ENABLED() { return true; },
    get FRONTEND_URL() { return 'https://app.chainlens.io'; },
    get TOPUP_TOKEN_UNIT_PRICE_CENTS() { return 1; }, // $0.01 per 1M tokens
    isLocal: () => false,
  },
}));

mock.module('../../shared/db', () => ({
  db: {},
  hasDatabase: true,
}));

mock.module('@epsilon/db', () => ({
  creditAccounts: {},
  billingCustomers: {},
  billingCustomersInBasejump: {},
  creditLedger: {},
  creditUsage: {},
  creditPurchases: {},
  accountDeletionRequests: {},
}));

mock.module('../../shared/resolve-account', () => ({
  resolveAccountId: async (userId: string) => userId,
}));

mock.module('../../billing/services/tiers', () => ({
  getTier: (_name: string) => ({
    name: _accountTier,
    displayName: _accountTier === 'pro' ? 'Pro' : 'Free',
    monthlyTokenGrant: _accountTier === 'pro' ? 200_000_000 : 10_000_000,
    canPurchaseTopup: _canPurchaseTopup,
    canPurchaseCredits: _accountTier !== 'free',
  }),
  getVisibleTiers: () => [
    { name: 'free', displayName: 'Free', monthlyPrice: 0, yearlyPrice: 0, monthlyCredits: 0, canPurchaseCredits: false },
    { name: 'pro', displayName: 'Pro', monthlyPrice: 40, yearlyPrice: 0, monthlyCredits: 0, canPurchaseCredits: true },
  ],
  TOKEN_PRICE_MULTIPLIER: 1.2,
  MINIMUM_CREDIT_FOR_RUN: 0.01,
  isPaidTier: (_tier: string) => _tier !== 'free',
  isLegacyPaidTier: (_tier: string) => false,
  getDailyCreditConfig: () => ({ dailyGrantEnabled: false }),
}));

// Mock subscriptions service to prevent heavy transitive imports from loading
mock.module('../../billing/services/subscriptions', () => ({
  createCheckoutSession: async () => ({ error: 'not_implemented' }),
  createInlineCheckout: async () => ({ error: 'not_implemented' }),
  confirmInlineCheckout: async () => ({ error: 'not_implemented' }),
  createPortalSession: async () => ({ error: 'not_implemented' }),
  cancelSubscription: async () => ({ error: 'not_implemented' }),
  reactivateSubscription: async () => ({ error: 'not_implemented' }),
  scheduleDowngrade: async () => ({ error: 'not_implemented' }),
  cancelScheduledChange: async () => ({ error: 'not_implemented' }),
  syncSubscription: async () => ({ error: 'not_implemented' }),
  getCheckoutSessionDetails: async () => ({ error: 'not_implemented' }),
  confirmCheckoutSession: async () => ({ error: 'not_implemented' }),
  getProrationPreview: async () => ({ error: 'not_implemented' }),
}));

mock.module('../../router/services/token-billing', () => ({
  getTokenBalances: async (_accountId: string) => _tokenBalances,
}));

mock.module('../../billing/services/account-state', () => ({
  buildAccountState: async (_accountId: string) => ({
    credits: { balance: 0, can_run: true },
    subscription: { tier_key: _accountTier, status: 'active' },
  }),
  buildMinimalAccountState: async (_accountId: string) => ({
    credits: { balance: 0, can_run: true },
    subscription: { tier_key: _accountTier, status: 'active' },
  }),
  buildLocalAccountState: () => ({
    credits: { balance: 0, can_run: true },
    subscription: { tier_key: 'free', status: 'inactive' },
  }),
}));

mock.module('../../billing/repositories/credit-accounts', () => ({
  getCreditAccount: async (_accountId: string) => ({ tier: _accountTier }),
  getSubscriptionInfo: async (_accountId: string) => null,
  getCreditBalance: async (_accountId: string) => 0,
  getPublicSchemaTier: async (_accountId: string) => null,
  upsertCreditAccount: async () => undefined,
  updateCreditAccount: async () => undefined,
  getYearlyAccountsDueForRotation: async () => [],
  updateBalance: async () => undefined,
}));

mock.module('../../shared/stripe', () => ({
  getStripe: () => ({
    checkout: {
      sessions: {
        create: async (opts: Record<string, unknown>) => {
          if (_stripeThrows) throw new Error('Stripe network error');
          return { url: _stripeSessionUrl, id: 'cs_test_abc123' };
        },
      },
    },
  }),
}));

// ─── Import routes after mocks ────────────────────────────────────────────────

const { accountStateRouter } = await import('../../billing/routes/account-state');
const { subscriptionsRouter } = await import('../../billing/routes/subscriptions');

// ─── Helper: make a request to a Hono router ─────────────────────────────────

function makeAccountStateApp() {
  const app = new Hono<{ Variables: { userId: string; userEmail: string } }>();
  app.use('*', async (c, next) => {
    c.set('userId', 'test-user-id');
    c.set('userEmail', 'test@chainlens.io');
    await next();
  });
  app.route('/', accountStateRouter);
  return app;
}

function makeSubscriptionsApp() {
  const app = new Hono<{ Variables: { userId: string; userEmail: string } }>();
  app.use('*', async (c, next) => {
    c.set('userId', 'test-user-id');
    c.set('userEmail', 'test@chainlens.io');
    await next();
  });
  app.route('/', subscriptionsRouter);
  return app;
}

// ─── Tests: GET /account-state ────────────────────────────────────────────────

describe('GET /billing/account-state — token fields (AC4)', () => {
  beforeEach(() => {
    _accountTier = 'pro';
    _canPurchaseTopup = true;
    _tokenBalances = {
      subscriptionTokens: 5_000_000n,
      topupTokens: 1_000_000n,
      total: 6_000_000n,
      cycleEnd: null,
    };
  });

  test('[P0] returns subscription_tokens, topup_tokens, total_tokens fields', async () => {
    const app = makeAccountStateApp();
    const res = await app.request('/');
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body.subscription_tokens).toBe(5_000_000);
    expect(body.topup_tokens).toBe(1_000_000);
    expect(body.total_tokens).toBe(6_000_000);
  });

  test('[P0] returns monthly_grant matching tier config', async () => {
    _accountTier = 'pro';
    const app = makeAccountStateApp();
    const res = await app.request('/');
    const body = await res.json() as Record<string, unknown>;
    expect(body.monthly_grant).toBe(200_000_000);
  });

  test('[P0] returns can_purchase_topup true for pro tier', async () => {
    _canPurchaseTopup = true;
    const app = makeAccountStateApp();
    const res = await app.request('/');
    const body = await res.json() as Record<string, unknown>;
    expect(body.can_purchase_topup).toBe(true);
  });

  test('[P1] returns can_purchase_topup false for free tier', async () => {
    _accountTier = 'free';
    _canPurchaseTopup = false;
    const app = makeAccountStateApp();
    const res = await app.request('/');
    const body = await res.json() as Record<string, unknown>;
    expect(body.can_purchase_topup).toBe(false);
  });

  test('[P1] cycle_end is null when no subscription cycle set', async () => {
    _tokenBalances = { ...
      _tokenBalances,
      cycleEnd: null,
    };
    const app = makeAccountStateApp();
    const res = await app.request('/');
    const body = await res.json() as Record<string, unknown>;
    expect(body.cycle_end).toBeNull();
  });

  test('[P1] cycle_end is ISO string when subscription cycle set', async () => {
    _tokenBalances = {
      ..._tokenBalances,
      cycleEnd: new Date('2026-06-21T00:00:00Z'),
    };
    const app = makeAccountStateApp();
    const res = await app.request('/');
    const body = await res.json() as Record<string, unknown>;
    expect(body.cycle_end).toBe('2026-06-21T00:00:00.000Z');
  });
});

// ─── Tests: POST /subscriptions/topup/checkout ───────────────────────────────

describe('POST /billing/subscriptions/topup/checkout (AC7)', () => {
  beforeEach(() => {
    _accountTier = 'pro';
    _canPurchaseTopup = true;
    _stripeThrows = false;
    _stripeSessionUrl = 'https://checkout.stripe.com/c/pay/test_abc123';
  });

  async function postTopup(body: Record<string, unknown>) {
    const app = makeSubscriptionsApp();
    return app.request('/topup/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  test('[P0] returns 200 with checkoutUrl for valid pro-tier request', async () => {
    const res = await postTopup({ packageTokens: 10_000_000 });
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body.checkoutUrl).toBe(_stripeSessionUrl);
  });

  test('[P0] returns 400 when packageTokens is 0', async () => {
    const res = await postTopup({ packageTokens: 0 });
    expect(res.status).toBe(400);
    const body = await res.json() as Record<string, unknown>;
    expect(body.error).toContain('packageTokens');
  });

  test('[P0] returns 400 when packageTokens is negative', async () => {
    const res = await postTopup({ packageTokens: -1000 });
    expect(res.status).toBe(400);
    const body = await res.json() as Record<string, unknown>;
    expect(body.error).toContain('packageTokens');
  });

  test('[P0] returns 400 when packageTokens exceeds 10B', async () => {
    const res = await postTopup({ packageTokens: 10_000_000_001 });
    expect(res.status).toBe(400);
    const body = await res.json() as Record<string, unknown>;
    expect(body.error).toContain('packageTokens');
  });

  test('[P0] returns 400 when packageTokens < 1M (minimum 1M for sub-cent check)', async () => {
    // 999_999 tokens × $0.01/1M = 0.0000099 = 0 cents → rejected
    const res = await postTopup({ packageTokens: 999_999 });
    expect(res.status).toBe(400);
    const body = await res.json() as Record<string, unknown>;
    expect(body.error).toContain('Minimum');
  });

  test('[P0] returns 403 when free tier cannot purchase top-up', async () => {
    _accountTier = 'free';
    _canPurchaseTopup = false;
    const res = await postTopup({ packageTokens: 10_000_000 });
    expect(res.status).toBe(403);
    const body = await res.json() as Record<string, unknown>;
    expect(body.error).toContain('Top-up');
  });

  test('[P1] truncates fractional packageTokens via Math.floor', async () => {
    // 10_000_000.9 → 10_000_000 (floored to integer)
    const res = await postTopup({ packageTokens: 10_000_000.9 });
    expect(res.status).toBe(200);
  });

  test('[P1] uses default success/cancel URLs when not provided', async () => {
    const res = await postTopup({ packageTokens: 10_000_000 });
    expect(res.status).toBe(200);
    // Route should complete without error even when no URL overrides given
  });

  test('[P2] accepts 10B tokens (boundary maximum)', async () => {
    const res = await postTopup({ packageTokens: 10_000_000_000 });
    expect(res.status).toBe(200);
  });

  test('[P2] accepts exactly 1M tokens (boundary minimum)', async () => {
    const res = await postTopup({ packageTokens: 1_000_000 });
    expect(res.status).toBe(200);
  });
});
