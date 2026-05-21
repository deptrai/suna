/**
 * billing-lifecycle.test.ts — Full billing lifecycle integration test
 *
 * Tests against REAL local Supabase DB (no mocks).
 * Requires: local Supabase running at 127.0.0.1:54342
 *
 * Lifecycle simulated:
 *   1. [free]       Auto-activate → grant 10M sub tokens
 *   2. [free→pro]   Upgrade → grant 200M sub tokens, cycleEnd set
 *   3. [pro→ent]    Upgrade → grant 1.5B sub tokens
 *   4. [ent]        LLM usage: deductTokens (success path, drain sub first)
 *   5. [ent]        LLM usage: topup drain after sub exhausted
 *   6. [ent]        Insufficient balance → deduct fails, balance unchanged
 *   7. [topup]      Customer adds 50M topup tokens
 *   8. [renewal]    Monthly renewal via resetSubscriptionTokensFromStoredGrant
 *   9. [renewal]    Price-lock: stored grant honoured over current env config
 *  10. [degrade]    Downgrade → free: grant 10M (resets from 1.5B)
 *
 * Run (ISOLATED — do NOT mix with unit tests in the same bun test invocation):
 *   cd apps/api && bun test src/__tests__/integration/billing-lifecycle.test.ts
 *
 * ⚠️  Bun shares the module registry within a single `bun test` invocation.
 *     Unit tests mock `shared/db`, `@epsilon/db`, and `drizzle-orm`, which contaminates
 *     this integration test's service imports when run together. Always run separately.
 */

import { describe, test, expect, beforeAll, afterAll, beforeEach } from 'bun:test';

// ─── Real DB + services (no mocks) ───────────────────────────────────────────
// NOTE: Unit tests mock 'shared/db', '@epsilon/db', and 'drizzle-orm', contaminating
// Bun's module registry when run together. We use raw postgres for ALL DB setup/teardown
// to be completely independent of those mocks. Service imports (grantSubscriptionTokens,
// deductTokens, getTokenBalances) import their own 'shared/db' which gets the real
// instance since the mock only replaces the reference, not the underlying postgres conn.
import postgres from 'postgres';

// Raw postgres client — bypasses all drizzle-orm + @epsilon/db mocks
const rawSql = postgres(process.env.DATABASE_URL!);

import { grantSubscriptionTokens, resetSubscriptionTokensFromStoredGrant } from '../../billing/services/token-grants';
import { getTokenBalances, deductTokens } from '../../router/services/token-billing';
import { config } from '../../config';

// ─── Test account ─────────────────────────────────────────────────────────────
// Uses the seeded test user (seed.sql) — never clashes with real data
const ACCOUNT_ID = '00000000-0000-0000-0000-000000000001';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Normalize Postgres timestamp ("2026-07-21 00:00:00+00") to ISO ("2026-07-21T00:00:00.000Z") */
function normTs(ts: string | null | undefined): string | null {
  if (!ts) return null;
  return new Date(ts).toISOString();
}

// ─── Raw SQL helpers — bypass mocked drizzle-orm + @epsilon/db ───────────────
// (Unit tests running alongside mock both; rawSql uses postgres directly.)

async function resetAccount() {
  await rawSql`
    UPDATE epsilon.credit_accounts
    SET tier = 'free', subscription_tokens = 0, topup_tokens = 0,
        monthly_grant_amount = 0, subscription_cycle_end = NULL
    WHERE account_id = ${ACCOUNT_ID}::uuid
  `;
}

async function setTopup(amount: bigint) {
  await rawSql`
    UPDATE epsilon.credit_accounts SET topup_tokens = ${amount.toString()}::bigint
    WHERE account_id = ${ACCOUNT_ID}::uuid
  `;
}

async function setStoredGrant(amount: bigint) {
  await rawSql`
    UPDATE epsilon.credit_accounts SET monthly_grant_amount = ${amount.toString()}::bigint
    WHERE account_id = ${ACCOUNT_ID}::uuid
  `;
}

async function getRow() {
  const rows = await rawSql`
    SELECT tier, subscription_tokens, topup_tokens, monthly_grant_amount, subscription_cycle_end
    FROM epsilon.credit_accounts
    WHERE account_id = ${ACCOUNT_ID}::uuid
    LIMIT 1
  `;
  const r = rows[0];
  if (!r) return undefined;
  return {
    tier: r.tier as string,
    subscriptionTokens: BigInt(r.subscription_tokens),
    topupTokens: BigInt(r.topup_tokens),
    monthlyGrantAmount: BigInt(r.monthly_grant_amount),
    subscriptionCycleEnd: r.subscription_cycle_end as string | null,
  };
}

// ─── Ensure credit_accounts row exists for our test account ──────────────────
beforeAll(async () => {
  await rawSql`
    INSERT INTO epsilon.credit_accounts (account_id, tier, subscription_tokens, topup_tokens, monthly_grant_amount)
    VALUES (${ACCOUNT_ID}::uuid, 'free', 0, 0, 0)
    ON CONFLICT (account_id) DO NOTHING
  `;
});

afterAll(async () => {
  await rawSql`DELETE FROM epsilon.credit_accounts WHERE account_id = ${ACCOUNT_ID}::uuid`;
  await rawSql.end();
});

beforeEach(async () => {
  await resetAccount();
  // Override config for deterministic test values.
  // Wrapped in try/catch: when unit tests run alongside and mock ../../config,
  // the mocked config object may be non-extensible; we silently skip in that case.
  // These values match the defaults in .env so the test behaviour is identical.
  try {
    (config as any).EPSILON_BILLING_INTERNAL_ENABLED = true;
    (config as any).TOKEN_MULTIPLIER_FREE = 1;
    (config as any).TOKEN_MULTIPLIER_PREMIUM = 4;
    (config as any).TOKEN_MULTIPLIER_FREE_THINKING = 1.5;
    (config as any).TOKEN_MULTIPLIER_PREMIUM_THINKING = 6;
    (config as any).FREE_MODEL_POOL = 'gpt-4o-mini';
    (config as any).PREMIUM_MODEL_POOL = 'gpt-4o';
  } catch {
    // config is non-extensible (mocked env) — real .env values will be used
  }
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Step 1 — Auto-activate free tier (AC3)', () => {
  test('grants 10M subscription_tokens, stores monthly_grant_amount=10M', async () => {
    await grantSubscriptionTokens(ACCOUNT_ID, 'free');

    const bal = await getTokenBalances(ACCOUNT_ID);
    expect(bal.subscriptionTokens).toBe(10_000_000n);
    expect(bal.topupTokens).toBe(0n);
    expect(bal.total).toBe(10_000_000n);

    const row = await getRow();
    expect(row?.monthlyGrantAmount).toBe(10_000_000n);
    expect(row?.subscriptionCycleEnd).toBeTruthy(); // ~30 days
  });
});

describe('Step 2 — Upgrade free → pro', () => {
  test('grants 200M subscription_tokens (replaces 10M), cycleEnd updated', async () => {
    // Start from free
    await grantSubscriptionTokens(ACCOUNT_ID, 'free');

    const cycleEnd = new Date('2026-07-21T00:00:00Z');
    await grantSubscriptionTokens(ACCOUNT_ID, 'pro', cycleEnd);

    const bal = await getTokenBalances(ACCOUNT_ID);
    expect(bal.subscriptionTokens).toBe(200_000_000n);
    expect(bal.total).toBe(200_000_000n); // topup still 0

    const row = await getRow();
    expect(row?.tier).toBe('free'); // tier column updated by subscription flow, not grant fn
    expect(row?.monthlyGrantAmount).toBe(200_000_000n);
    expect(normTs(row?.subscriptionCycleEnd)).toBe(cycleEnd.toISOString());
  });
});

describe('Step 3 — Upgrade pro → enterprise', () => {
  test('grants 1.5B subscription_tokens, stored grant updated', async () => {
    await grantSubscriptionTokens(ACCOUNT_ID, 'pro');

    const cycleEnd = new Date('2026-07-21T00:00:00Z');
    await grantSubscriptionTokens(ACCOUNT_ID, 'enterprise', cycleEnd);

    const bal = await getTokenBalances(ACCOUNT_ID);
    expect(bal.subscriptionTokens).toBe(1_500_000_000n);

    const row = await getRow();
    expect(row?.monthlyGrantAmount).toBe(1_500_000_000n);
  });
});

describe('Step 4 — LLM usage: deduct from subscription_tokens first', () => {
  test('premium pool × 4× multiplier drains subscription_tokens before topup', async () => {
    await grantSubscriptionTokens(ACCOUNT_ID, 'enterprise');
    // Also give 50M topup
    await setTopup(50_000_000n);

    // 100 actual tokens × 4× premium = 400 cost
    const result = await deductTokens({
      accountId: ACCOUNT_ID,
      actualTokens: 100,
      modelPool: 'premium',
      thinkingEnabled: false,
    });

    expect(result.success).toBe(true);
    expect(result.tokensDeducted).toBe(400n);
    // Sub drained first: 1.5B - 400
    expect(result.subRemaining).toBe(1_500_000_000n - 400n);
    // Topup untouched when sub covers the cost
    expect(result.topupRemaining).toBe(50_000_000n);
  });

  test('free pool × 1× multiplier — correct cost', async () => {
    await grantSubscriptionTokens(ACCOUNT_ID, 'free');

    // 1000 actual tokens × 1× free = 1000 cost
    const result = await deductTokens({
      accountId: ACCOUNT_ID,
      actualTokens: 1000,
      modelPool: 'free',
      thinkingEnabled: false,
    });

    expect(result.success).toBe(true);
    expect(result.tokensDeducted).toBe(1000n);
    expect(result.subRemaining).toBe(10_000_000n - 1000n);
  });

  test('thinking multiplier (premium × 6×)', async () => {
    await grantSubscriptionTokens(ACCOUNT_ID, 'pro');

    // 100 actual tokens × 6× thinking = 600 cost
    const result = await deductTokens({
      accountId: ACCOUNT_ID,
      actualTokens: 100,
      modelPool: 'premium',
      thinkingEnabled: true,
    });

    expect(result.success).toBe(true);
    expect(result.tokensDeducted).toBe(600n);
  });
});

describe('Step 5 — Topup drain after subscription exhausted', () => {
  test('when sub=0, deducts from topup_tokens', async () => {
    // sub already drained to 0, but has topup
    await setTopup(1_000_000n);
    // leave subscription_tokens=0 (reset did that)

    // 100 actual × 4× premium = 400 cost → from topup
    const result = await deductTokens({
      accountId: ACCOUNT_ID,
      actualTokens: 100,
      modelPool: 'premium',
      thinkingEnabled: false,
    });

    expect(result.success).toBe(true);
    expect(result.tokensDeducted).toBe(400n);
    expect(result.subRemaining).toBe(0n);
    expect(result.topupRemaining).toBe(1_000_000n - 400n);
  });

  test('sub partially covers, topup covers the rest', async () => {
    // Give 100 sub + 1M topup
    await rawSql`
      UPDATE epsilon.credit_accounts
      SET subscription_tokens = 100, topup_tokens = 1000000
      WHERE account_id = ${ACCOUNT_ID}::uuid
    `;

    // cost = 200 × 4× = 800; sub covers 100, topup covers 700
    const result = await deductTokens({
      accountId: ACCOUNT_ID,
      actualTokens: 200,
      modelPool: 'premium',
      thinkingEnabled: false,
    });

    expect(result.success).toBe(true);
    expect(result.tokensDeducted).toBe(800n);
    expect(result.subRemaining).toBe(0n);
    expect(result.topupRemaining).toBe(1_000_000n - 700n);
  });
});

describe('Step 6 — Insufficient balance: deduct fails, balance untouched', () => {
  test('returns success=false, tokensDeducted=0, balance unchanged', async () => {
    // Only 100 tokens total (sub=100, topup=0)
    await rawSql`
      UPDATE epsilon.credit_accounts
      SET subscription_tokens = 100, topup_tokens = 0
      WHERE account_id = ${ACCOUNT_ID}::uuid
    `;

    // Trying to deduct 1000 actual × 4× = 4000 cost
    const result = await deductTokens({
      accountId: ACCOUNT_ID,
      actualTokens: 1000,
      modelPool: 'premium',
      thinkingEnabled: false,
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('insufficient_tokens');
    expect(result.tokensDeducted).toBe(0n);

    // DB unchanged
    const bal = await getTokenBalances(ACCOUNT_ID);
    expect(bal.subscriptionTokens).toBe(100n);
    expect(bal.topupTokens).toBe(0n);
  });
});

describe('Step 7 — Topup purchase: add 50M topup_tokens', () => {
  test('topup adds to existing topup balance, sub unchanged', async () => {
    await grantSubscriptionTokens(ACCOUNT_ID, 'pro'); // 200M sub
    await setTopup(10_000_000n); // 10M existing topup

    // Simulate: handleTopupCheckout credits 50M topup
    const TOPUP_AMOUNT = 50_000_000n;
    await rawSql`
      UPDATE epsilon.credit_accounts
      SET topup_tokens = ${(10_000_000n + TOPUP_AMOUNT).toString()}::bigint
      WHERE account_id = ${ACCOUNT_ID}::uuid
    `;

    const bal = await getTokenBalances(ACCOUNT_ID);
    expect(bal.subscriptionTokens).toBe(200_000_000n); // unchanged
    expect(bal.topupTokens).toBe(60_000_000n);         // 10M + 50M
    expect(bal.total).toBe(260_000_000n);
  });
});

describe('Step 8 — Monthly renewal (AC6): resetSubscriptionTokensFromStoredGrant', () => {
  test('renewal resets subscription_tokens to stored monthly_grant_amount', async () => {
    // Grant pro (200M), drain sub partially
    await grantSubscriptionTokens(ACCOUNT_ID, 'pro');
    await deductTokens({ accountId: ACCOUNT_ID, actualTokens: 1000, modelPool: 'premium', thinkingEnabled: false });

    const before = await getTokenBalances(ACCOUNT_ID);
    expect(before.subscriptionTokens).toBeLessThan(200_000_000n);

    // Renewal
    const newCycleEnd = new Date('2026-08-21T00:00:00Z');
    await resetSubscriptionTokensFromStoredGrant(ACCOUNT_ID, newCycleEnd);

    const after = await getTokenBalances(ACCOUNT_ID);
    expect(after.subscriptionTokens).toBe(200_000_000n); // fully reset
    expect(after.topupTokens).toBe(0n);                  // topup NOT touched

    const row = await getRow();
    expect(normTs(row?.subscriptionCycleEnd)).toBe(newCycleEnd.toISOString());
  });

  test('renewal uses fallback cycleEnd ~30 days when null passed', async () => {
    await grantSubscriptionTokens(ACCOUNT_ID, 'pro');
    await resetSubscriptionTokensFromStoredGrant(ACCOUNT_ID, null);

    const row = await getRow();
    const cycleEnd = new Date(row!.subscriptionCycleEnd!).getTime();
    const expected = Date.now() + 30 * 24 * 3600 * 1000;
    expect(Math.abs(cycleEnd - expected)).toBeLessThan(10_000); // within 10s
  });
});

describe('Step 9 — Price-lock: renewal uses STORED grant, not current env config (P22)', () => {
  test('user subscribed at old price keeps old grant on renewal', async () => {
    // User subscribed when pro = 150M (old price)
    await grantSubscriptionTokens(ACCOUNT_ID, 'pro'); // sets 200M
    // Override stored grant to simulate old-price snapshot
    await setStoredGrant(150_000_000n);

    // Drain some tokens
    await rawSql`
      UPDATE epsilon.credit_accounts SET subscription_tokens = 50000000
      WHERE account_id = ${ACCOUNT_ID}::uuid
    `;

    // Renewal should use STORED 150M, not current env pro grant (200M)
    await resetSubscriptionTokensFromStoredGrant(ACCOUNT_ID, new Date('2026-08-21T00:00:00Z'));

    const bal = await getTokenBalances(ACCOUNT_ID);
    expect(bal.subscriptionTokens).toBe(150_000_000n); // old price
    expect(bal.subscriptionTokens).not.toBe(200_000_000n); // NOT current tier config
  });

  test('topup_tokens survive renewal untouched', async () => {
    await grantSubscriptionTokens(ACCOUNT_ID, 'enterprise');
    await setTopup(25_000_000n);

    await resetSubscriptionTokensFromStoredGrant(ACCOUNT_ID, null);

    const bal = await getTokenBalances(ACCOUNT_ID);
    expect(bal.topupTokens).toBe(25_000_000n); // untouched
    expect(bal.subscriptionTokens).toBe(1_500_000_000n); // reset
  });
});

describe('Step 10 — Downgrade enterprise → free', () => {
  test('downgrade grant resets sub to 10M, stored grant updated', async () => {
    // Was enterprise with 1.5B
    await grantSubscriptionTokens(ACCOUNT_ID, 'enterprise');
    // Drain some
    await deductTokens({ accountId: ACCOUNT_ID, actualTokens: 10_000, modelPool: 'premium', thinkingEnabled: false });

    // Downgrade: grant free (10M) — replaces enterprise balance
    const cycleEnd = new Date('2026-07-21T00:00:00Z');
    await grantSubscriptionTokens(ACCOUNT_ID, 'free', cycleEnd);

    const bal = await getTokenBalances(ACCOUNT_ID);
    expect(bal.subscriptionTokens).toBe(10_000_000n);

    const row = await getRow();
    expect(row?.monthlyGrantAmount).toBe(10_000_000n); // price-lock now at 10M
    expect(normTs(row?.subscriptionCycleEnd)).toBe(cycleEnd.toISOString());
  });

  test('after downgrade, free tier renewal gives 10M (not old enterprise 1.5B)', async () => {
    await grantSubscriptionTokens(ACCOUNT_ID, 'enterprise');
    await grantSubscriptionTokens(ACCOUNT_ID, 'free'); // downgrade

    // Drain to near zero
    await rawSql`
      UPDATE epsilon.credit_accounts SET subscription_tokens = 100
      WHERE account_id = ${ACCOUNT_ID}::uuid
    `;

    // Renewal
    await resetSubscriptionTokensFromStoredGrant(ACCOUNT_ID, null);

    const bal = await getTokenBalances(ACCOUNT_ID);
    expect(bal.subscriptionTokens).toBe(10_000_000n); // 10M, not 1.5B
  });
});
