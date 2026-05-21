import { eq } from 'drizzle-orm';
import { creditAccounts } from '@epsilon/db';
import { db } from '../../shared/db';
import { config, getToolCost } from '../../config';
import {
  checkCredits as checkCreditsDb,
  deductCredits as deductCreditsDb,
} from '../../repositories/credits';
import { deductTokens, getTokenBalances } from './token-billing';
import { poolForTier } from './model-pool';
import type { BillingCheckResult, BillingDeductResult } from '../../types';

/**
 * Check if account has sufficient tokens (token economy) or credits (USD legacy).
 *
 * When EPSILON_BILLING_INTERNAL_ENABLED: checks subscription_tokens + topup_tokens > 0.
 * Falls back to local/no-DB bypass for self-hosted deployments.
 */
export async function checkCredits(
  accountId: string,
  minimumRequired: number = 0.01,
  options?: { skipDevCheck?: boolean }
): Promise<BillingCheckResult> {
  if (!config.DATABASE_URL) {
    if (config.isLocal()) {
      return { hasCredits: true, balance: 0, message: 'Credits check skipped (local mode, no DB)' };
    }
    throw new Error('DATABASE_URL is required for credit checks');
  }

  if (!config.EPSILON_BILLING_INTERNAL_ENABLED) {
    return { hasCredits: true, balance: 0, message: 'Credits check skipped (billing disabled)' };
  }

  // Token economy: check subscription_tokens + topup_tokens
  const balances = await getTokenBalances(accountId);
  const hasCredits = balances.total > 0n;

  // In local mode, allow even when no credit account row exists
  if (!hasCredits && config.isLocal()) {
    return { hasCredits: true, balance: 0, message: 'Credits check skipped (local mode)' };
  }

  return {
    hasCredits,
    balance: Number(balances.total),
    message: hasCredits ? 'OK' : 'Insufficient tokens — please top up or upgrade your plan',
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
 * Deduct tokens for LLM usage (token economy).
 *
 * Formula: actualTokens = round(inputTokens × 0.25 + outputTokens)
 * Cost:    Math.ceil(actualTokens × getMultiplier(pool, thinking))
 *
 * Pool is resolved from account tier: free → 'free', pro/enterprise → 'premium'.
 * Signature is backward-compatible — callers pass same 5 positional args; opts is new.
 */
export async function deductLLMCredits(
  accountId: string,
  model: string,
  inputTokens: number,
  outputTokens: number,
  calculatedCost: number,
  sessionId?: string,
  opts?: { thinkingEnabled?: boolean }
): Promise<BillingDeductResult> {
  if (!config.DATABASE_URL) {
    if (config.isLocal()) {
      return { success: true, cost: 0, newBalance: 0 };
    }
    throw new Error('DATABASE_URL is required for credit deductions');
  }

  if (!config.EPSILON_BILLING_INTERNAL_ENABLED) {
    return { success: true, cost: 0, newBalance: 0 };
  }

  // Weighted token formula: input counts as 0.25× (cheaper), output counts as 1×
  const actualTokens = Math.round(inputTokens * 0.25 + outputTokens);
  if (actualTokens <= 0) {
    return { success: true, cost: 0, newBalance: 0 };
  }

  const tier = await resolveAccountTier(accountId);
  const pool = poolForTier(tier);
  const thinkingEnabled = opts?.thinkingEnabled ?? false;

  console.info(`[BILLING] token deduct: model=${model} input=${inputTokens} output=${outputTokens} actual=${actualTokens} pool=${pool} thinking=${thinkingEnabled}`);

  const result = await deductTokens({ accountId, actualTokens, modelPool: pool, thinkingEnabled });

  if (!result.success) {
    console.warn(`[BILLING] token deduct failed: ${result.error} sub=${result.subRemaining} topup=${result.topupRemaining}`);
    return { success: false, cost: 0, newBalance: 0, error: result.error };
  }

  const newBalance = Number(result.subRemaining + result.topupRemaining);
  console.info(`[BILLING] deducted ${result.tokensDeducted} tokens. remaining=${newBalance}`);

  return {
    success: true,
    cost: Number(result.tokensDeducted),
    newBalance,
  };
}

export type AccountTier = 'free' | 'pro' | 'enterprise';

// In-memory cache: accountId → { tier, expiresAt }
const tierCache = new Map<string, { tier: AccountTier; expiresAt: number }>();
const TIER_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Resolve account tier from credit_accounts.tier column.
 * Returns canonical tier name: 'free' | 'pro' | 'enterprise'.
 * Defaults to 'free' if account not found or DB unavailable.
 */
export async function resolveAccountTier(accountId: string): Promise<AccountTier> {
  const cached = tierCache.get(accountId);
  if (cached && Date.now() < cached.expiresAt) return cached.tier;

  if (!config.DATABASE_URL) return 'free';

  try {
    const [row] = await db
      .select({ tier: creditAccounts.tier })
      .from(creditAccounts)
      .where(eq(creditAccounts.accountId, accountId))
      .limit(1);

    const raw = row?.tier ?? 'free';
    const tier: AccountTier =
      raw === 'enterprise' ? 'enterprise' :
      raw === 'pro' ? 'pro' :
      'free';

    tierCache.set(accountId, { tier, expiresAt: Date.now() + TIER_CACHE_TTL_MS });
    return tier;
  } catch {
    return 'free';
  }
}
