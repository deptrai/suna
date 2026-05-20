import { eq, sql } from 'drizzle-orm';
import { db } from '../../shared/db';
import { config } from '../../config';
import { creditAccounts } from '@epsilon/db';

export interface TokenDeductParams {
  accountId: string;
  actualTokens: number;
  modelPool: 'free' | 'premium';
  thinkingEnabled: boolean;
}

export interface TokenDeductResult {
  success: boolean;
  tokensDeducted: bigint;
  subRemaining: bigint;
  topupRemaining: bigint;
  error?: 'insufficient_tokens' | 'db_error';
}

export function getMultiplier(pool: 'free' | 'premium', thinking: boolean): number {
  if (pool === 'free' && !thinking) return config.TOKEN_MULTIPLIER_FREE;
  if (pool === 'free' && thinking) return config.TOKEN_MULTIPLIER_FREE_THINKING;
  if (pool === 'premium' && !thinking) return config.TOKEN_MULTIPLIER_PREMIUM;
  return config.TOKEN_MULTIPLIER_PREMIUM_THINKING;
}

export async function deductTokens(params: TokenDeductParams): Promise<TokenDeductResult> {
  if (!config.EPSILON_BILLING_INTERNAL_ENABLED) {
    return { success: true, tokensDeducted: 0n, subRemaining: 0n, topupRemaining: 0n };
  }

  const cost = Math.ceil(params.actualTokens * getMultiplier(params.modelPool, params.thinkingEnabled));

  try {
    const result = await db.execute(sql`
      SELECT * FROM atomic_use_tokens(${params.accountId}::uuid, ${cost}::bigint)
    `);
    const row = (result as any)[0] ?? (result as any).rows?.[0];
    if (!row?.success) {
      return {
        success: false,
        tokensDeducted: BigInt(cost),
        subRemaining: BigInt(row?.sub_remaining ?? 0),
        topupRemaining: BigInt(row?.topup_remaining ?? 0),
        error: 'insufficient_tokens',
      };
    }

    return {
      success: true,
      tokensDeducted: BigInt(cost),
      subRemaining: BigInt(row.sub_remaining ?? 0),
      topupRemaining: BigInt(row.topup_remaining ?? 0),
    };
  } catch {
    return { success: false, tokensDeducted: BigInt(cost), subRemaining: 0n, topupRemaining: 0n, error: 'db_error' };
  }
}

export async function getTokenBalances(accountId: string): Promise<{
  subscriptionTokens: bigint;
  topupTokens: bigint;
  total: bigint;
  cycleEnd: Date | null;
}> {
  const [row] = await db
    .select({
      subscriptionTokens: creditAccounts.subscriptionTokens,
      topupTokens: creditAccounts.topupTokens,
      cycleEnd: creditAccounts.subscriptionCycleEnd,
    })
    .from(creditAccounts)
    .where(eq(creditAccounts.accountId, accountId))
    .limit(1);

  const sub = BigInt(row?.subscriptionTokens ?? 0);
  const topup = BigInt(row?.topupTokens ?? 0);
  return {
    subscriptionTokens: sub,
    topupTokens: topup,
    total: sub + topup,
    cycleEnd: row?.cycleEnd ? new Date(row.cycleEnd) : null,
  };
}
