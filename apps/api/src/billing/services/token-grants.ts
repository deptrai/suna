import { eq } from 'drizzle-orm';
import { creditAccounts } from '@epsilon/db';
import { db } from '../../shared/db';
import { getTier } from './tiers';
import { getStripe } from '../../shared/stripe';

export async function grantSubscriptionTokens(accountId: string, tierName: string, cycleEnd?: Date | null) {
  const tier = getTier(tierName);
  const monthlyTokenGrant = tier.monthlyTokenGrant ?? 0;
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
