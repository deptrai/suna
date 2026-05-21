import { eq } from 'drizzle-orm';
import { creditAccounts } from '@epsilon/db';
import { db } from '../../shared/db';
import { getTier } from './tiers';
import { getStripe } from '../../shared/stripe';

export async function grantSubscriptionTokens(accountId: string, tierName: string, cycleEnd?: Date | null) {
  const tier = getTier(tierName);
  const monthlyTokenGrant = BigInt(tier.monthlyTokenGrant ?? 0);
  const nextCycleEnd = cycleEnd ? cycleEnd.toISOString() : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  await db
    .update(creditAccounts)
    .set({
      subscriptionTokens: monthlyTokenGrant,
      monthlyGrantAmount: monthlyTokenGrant,
      subscriptionCycleEnd: nextCycleEnd,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(creditAccounts.accountId, accountId));

  console.log(`[TOKEN] accountId=${accountId} granted ${monthlyTokenGrant} subscription_tokens (tier=${tierName})`);
}

// P22: On renewal, use the stored monthly_grant_amount (snapshotted at tier-change)
// rather than re-reading from env config. This guarantees users who subscribed at one
// price keep that grant until they explicitly change tier (Stripe/Notion/Slack pattern).
export async function resetSubscriptionTokensFromStoredGrant(
  accountId: string,
  cycleEnd: Date | null,
) {
  const [row] = await db
    .select({ monthlyGrantAmount: creditAccounts.monthlyGrantAmount })
    .from(creditAccounts)
    .where(eq(creditAccounts.accountId, accountId))
    .limit(1);

  const grant = BigInt(row?.monthlyGrantAmount ?? 0n);
  if (grant <= 0n) {
    console.warn(`[TOKEN] accountId=${accountId} renewal: stored monthly_grant_amount=0, skipping reset`);
    return;
  }

  const nextCycleEnd = cycleEnd ?? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  await db
    .update(creditAccounts)
    .set({
      subscriptionTokens: grant,
      subscriptionCycleEnd: nextCycleEnd.toISOString(),
      updatedAt: new Date().toISOString(),
    })
    .where(eq(creditAccounts.accountId, accountId));

  console.log(`[TOKEN] accountId=${accountId} renewal: reset subscription_tokens=${grant} (stored grant)`);
}

export async function grantSubscriptionTokensFromStripePeriod(
  accountId: string,
  tierName: string,
  stripeSubscriptionId?: string | null,
) {
  if (!stripeSubscriptionId) {
    await grantSubscriptionTokens(accountId, tierName);
    return;
  }

  try {
    const stripe = getStripe();
    const subscription = await stripe.subscriptions.retrieve(stripeSubscriptionId);
    const cycleEnd = new Date(subscription.current_period_end * 1000);
    await grantSubscriptionTokens(accountId, tierName, cycleEnd);
  } catch (error) {
    console.error(`[TOKEN] failed to fetch stripe period for ${accountId}:`, error);
    await grantSubscriptionTokens(accountId, tierName);
  }
}
