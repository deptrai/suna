import { eq } from 'drizzle-orm';
import { creditAccounts } from '@epsilon/db';
import { db } from '../../shared/db';
import { config, getToolCost } from '../../config';
import {
  checkCredits as checkCreditsDb,
  deductCredits as deductCreditsDb,
} from '../../repositories/credits';
import type { BillingCheckResult, BillingDeductResult } from '../../types';

/**
 * Check if account has sufficient credits.
 *
 * Uses direct DB query via Drizzle. Requires DATABASE_URL to be configured.
 */
export async function checkCredits(
  accountId: string,
  minimumRequired: number = 0.01,
  options?: { skipDevCheck?: boolean }
): Promise<BillingCheckResult> {
  if (!config.DATABASE_URL) {
    // In local mode without a DB, skip credit checks entirely
    if (config.isLocal()) {
      return { hasCredits: true, balance: 0, message: 'Credits check skipped (local mode, no DB)' };
    }
    throw new Error('DATABASE_URL is required for credit checks');
  }

  const result = await checkCreditsDb(accountId, minimumRequired);

  // In local mode, allow even when no credit account row exists (e.g. migrations not run)
  if (!result.hasCredits && config.isLocal()) {
    return { hasCredits: true, balance: 0, message: 'Credits check skipped (local mode)' };
  }

  return {
    hasCredits: result.hasCredits,
    message: result.message,
    balance: result.balance,
  };
}

/**
 * Deduct credits for a Epsilon tool call.
 *
 * Uses direct DB atomic deduction via Drizzle. Requires DATABASE_URL to be configured.
 */
export async function deductToolCredits(
  accountId: string,
  toolName: string,
  resultCount: number = 0,
  description?: string,
  sessionId?: string,
  options?: { skipDevCheck?: boolean }
): Promise<BillingDeductResult> {
  const cost = getToolCost(toolName, resultCount);
  if (cost <= 0) {
    return { success: true, cost: 0, newBalance: 0 };
  }

  const baseDescription =
    description ||
    `Epsilon ${toolName.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())}`;
  const deductDescription = sessionId ? `${baseDescription} [session:${sessionId}]` : baseDescription;

  if (!config.DATABASE_URL) {
    if (config.isLocal()) {
      return { success: true, cost: 0, newBalance: 0 };
    }
    throw new Error('DATABASE_URL is required for credit deductions');
  }

  // Skip deduction in local mode regardless of DB. ENV_MODE=local users
  // are running their own dev stack (no Stripe, no real subscriptions),
  // and billing on a $0 balance just stalls everything with
  // InsufficientCreditsError. Cloud mode (ENV_MODE=cloud) still bills.
  if (!config.EPSILON_BILLING_INTERNAL_ENABLED) {
    return { success: true, cost: 0, newBalance: 0 };
  }

  console.info(`[BILLING] Deducting $${cost.toFixed(4)} for ${toolName} (direct DB)`);

  const result = await deductCreditsDb(accountId, cost, deductDescription);

  if (!result.success) {
    return { success: false, cost: 0, newBalance: 0, error: result.error };
  }

  console.info(`[BILLING] Deducted $${cost.toFixed(4)}. New balance: $${result.newBalance?.toFixed(2)}`);

  return {
    success: true,
    cost: result.amountDeducted || cost,
    newBalance: result.newBalance || 0,
    transactionId: result.transactionId,
  };
}

/**
 * Deduct credits for LLM usage.
 *
 * Uses direct DB atomic deduction via Drizzle. Requires DATABASE_URL to be configured.
 */
export async function deductLLMCredits(
  accountId: string,
  model: string,
  inputTokens: number,
  outputTokens: number,
  calculatedCost: number,
  sessionId?: string
): Promise<BillingDeductResult> {
  if (calculatedCost <= 0) {
    return { success: true, cost: 0, newBalance: 0 };
  }

  const baseDescription = `LLM: ${model} (${inputTokens}/${outputTokens} tokens)`;
  const description = sessionId ? `${baseDescription} [session:${sessionId}]` : baseDescription;

  if (!config.DATABASE_URL) {
    if (config.isLocal()) {
      return { success: true, cost: 0, newBalance: 0 };
    }
    throw new Error('DATABASE_URL is required for credit deductions');
  }

  // Skip deduction in local mode (see deductToolCredits for full rationale).
  if (!config.EPSILON_BILLING_INTERNAL_ENABLED) {
    return { success: true, cost: 0, newBalance: 0 };
  }

  console.info(`[BILLING] Deducting $${calculatedCost.toFixed(6)} for ${model} (direct DB)`);

  const result = await deductCreditsDb(accountId, calculatedCost, description);

  if (!result.success) {
    return { success: false, cost: 0, newBalance: 0, error: result.error };
  }

  console.info(`[BILLING] Deducted $${calculatedCost.toFixed(6)}. New balance: $${result.newBalance?.toFixed(2)}`);

  return {
    success: true,
    cost: result.amountDeducted || calculatedCost,
    newBalance: result.newBalance || 0,
    transactionId: result.transactionId,
  };
}

export type AccountTier = 'tier1' | 'tier2' | 'tier3';

// In-memory cache: accountId → { tier, expiresAt }
const tierCache = new Map<string, { tier: AccountTier; expiresAt: number }>();
const TIER_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Resolve account tier from credit_accounts.tier column.
 * Tier values in DB: 'free' → tier1, 'pro' → tier2, 'enterprise' → tier3.
 * Defaults to tier1 if account not found or DB unavailable.
 */
export async function resolveAccountTier(accountId: string): Promise<AccountTier> {
  const cached = tierCache.get(accountId);
  if (cached && Date.now() < cached.expiresAt) return cached.tier;

  if (!config.DATABASE_URL) return 'tier1';

  try {
    const [row] = await db
      .select({ tier: creditAccounts.tier })
      .from(creditAccounts)
      .where(eq(creditAccounts.accountId, accountId))
      .limit(1);

    const raw = row?.tier ?? 'free';
    const tier: AccountTier =
      raw === 'enterprise' ? 'tier3' :
      raw === 'pro' ? 'tier2' :
      'tier1';

    tierCache.set(accountId, { tier, expiresAt: Date.now() + TIER_CACHE_TTL_MS });
    return tier;
  } catch {
    return 'tier1';
  }
}
