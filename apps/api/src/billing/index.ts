import { Hono } from 'hono';
import { AUTO_TOPUP_DEFAULT_AMOUNT, AUTO_TOPUP_DEFAULT_THRESHOLD } from '@epsilon/shared';
import { supabaseAuth } from '../middleware/auth';
import { config } from '../config';

import { accountStateRouter } from './routes/account-state';
import { subscriptionsRouter } from './routes/subscriptions';
import { paymentsRouter } from './routes/payments';
import { creditsRouter } from './routes/credits';
import { webhooksRouter } from './routes/webhooks';
import { accountDeletionRouter } from './routes/account-deletion';

const billingApp = new Hono();
const accountDeletionApp = new Hono();

// Webhooks — NO auth (handlers verify signatures internally)
billingApp.route('/webhooks', webhooksRouter);
// Alias: /webhook → /webhooks (some providers send to singular form)
billingApp.route('/webhook', webhooksRouter);

// Auth for all billing routes except webhooks
billingApp.use('*', async (c, next) => {
  if (c.req.path.includes('/webhook')) {
    return next();
  }
  return supabaseAuth(c, next);
});

// Account state — always available (returns unlimited mock when billing disabled)
billingApp.route('/account-state', accountStateRouter);

// ── Billing gate ────────────────────────────────────────────────────────────
// Everything below requires billing to be enabled. Self-hosted / local users
// never hit Stripe, never get blocked by credits, never see subscription UI.
// Account-state (above) already returns the "Local (Unlimited)" mock.
billingApp.use('*', async (c, next) => {
  if (c.req.path.includes('/account-state') || c.req.path.includes('/webhooks')) {
    return next();
  }
  if (!config.EPSILON_BILLING_INTERNAL_ENABLED) {
    return c.json({ error: 'Billing is not enabled', billing_disabled: true }, 404);
  }
  return next();
});

// Setup initialize endpoint (requires billing — creates Stripe subscription + sandbox)
// DESIGN: Returns fast (<2s). Kicks off sandbox provisioning in the background.
// Sandbox status is polled via GET /platform/sandbox/:id/status.
billingApp.post('/setup/initialize', async (c: any) => {
  const userId = c.get('userId') as string;
  const email = c.get('userEmail') as string;
  const body = await c.req.json().catch(() => ({}));
  const requestedServerType = (body?.server_type as string | undefined) || undefined;
  const requestedLocation = (body?.location as string | undefined) || undefined;
  const { upsertCreditAccount, getCreditAccount } = await import('./repositories/credit-accounts');
  const { resolvePriceId, isPaidTier } = await import('./services/tiers');
  const { getOrCreateStripeCustomer } = await import('./services/subscriptions');
  const { resolveAccountId } = await import('../shared/resolve-account');

  const accountId = await resolveAccountId(userId);

  // ── Step 1: Create free Stripe subscription ──────────────────────────
  const existing = await getCreditAccount(accountId);
  let subscriptionStatus: 'already_initialized' | 'initialized' = 'initialized';
  const currentTier = existing?.tier ?? 'free';

  if (existing?.stripeSubscriptionId) {
    subscriptionStatus = 'already_initialized';
  } else {
    // P15: Free tier doesn't need a Stripe subscription — just upsert credit account + grant tokens directly
    await upsertCreditAccount(accountId, {
      tier: 'free',
      planType: 'monthly',
      balance: '0',
      dailyCreditsBalance: '0',
      autoTopupEnabled: false,
      autoTopupThreshold: String(AUTO_TOPUP_DEFAULT_THRESHOLD),
      autoTopupAmount: String(AUTO_TOPUP_DEFAULT_AMOUNT),
    });
  }

  // Initial token grant for free tier (token economy).
  if (subscriptionStatus === 'initialized' && currentTier === 'free') {
    const { grantSubscriptionTokens } = await import('./services/token-grants');
    await grantSubscriptionTokens(accountId, 'free');
  }

  // ── Step 2: Sandbox provisioning (only for paid plans) ────────────────
  // Free tier has sandbox quota support; provisioning flow remains unchanged in this story.
  // Paid users: machine creation is handled explicitly via the checkout / create-machine flow.
  let sandboxStatus: 'created' | 'exists' | 'provisioning' | 'skipped' | 'failed' = 'skipped';

  if (!isPaidTier(currentTier)) {
    console.log(`[setup/initialize] Free tier — no sandbox provisioning for account ${accountId}`);
  } else {
    console.log(`[setup/initialize] Paid tier ready for explicit machine checkout for account ${accountId}`);
  }

  return c.json({
    status: subscriptionStatus,
    tier: currentTier,
    sandbox: sandboxStatus,
  });
});

// Billing routes — subscriptions, payments, credits (all require billing enabled)
billingApp.route('/', subscriptionsRouter);
billingApp.route('/', paymentsRouter);
billingApp.route('/', creditsRouter);

// Account deletion (mounted at /v1/billing/account/*)
billingApp.route('/account', accountDeletionRouter);

// Backwards-compatible account deletion API (mounted at /v1/account/*)
accountDeletionApp.use('*', supabaseAuth);
accountDeletionApp.use('*', async (c, next) => {
  if (!config.EPSILON_BILLING_INTERNAL_ENABLED) {
    return c.json({ error: 'Billing is not enabled', billing_disabled: true }, 404);
  }
  return next();
});
accountDeletionApp.route('/', accountDeletionRouter);

// Yearly credit rotation cron endpoint
billingApp.post('/cron/yearly-rotation', async (c: any) => {
  if (!config.EPSILON_BILLING_INTERNAL_ENABLED) {
    return c.json({ skipped: true, reason: 'billing disabled' });
  }
  const { processYearlyCreditRotation } = await import('./services/yearly-rotation');
  const result = await processYearlyCreditRotation();
  return c.json(result);
});

if (!config.EPSILON_BILLING_INTERNAL_ENABLED && config.INTERNAL_EPSILON_ENV === 'prod') {
  console.warn('[BillingApp] WARNING: EPSILON_BILLING_INTERNAL_ENABLED=false in prod — token billing is disabled');
}

if (config.EPSILON_BILLING_INTERNAL_ENABLED) {
  // P13: BullMQ repeatable jobs — survive replica restarts, avoid multi-instance race
  void (async () => {
    try {
      const { Queue } = await import('bullmq');
      const { redisConnection } = await import('../queue/bullmq/connection');

      const billingQueue = new Queue('billing-cron', { connection: redisConnection });

      await billingQueue.upsertJobScheduler(
        'yearly-credit-rotation',
        { every: 60 * 60 * 1000 },
        { name: 'yearly-credit-rotation', data: {} },
      );

      await billingQueue.upsertJobScheduler(
        'tier1-monthly-reset',
        { every: 24 * 60 * 60 * 1000 },
        { name: 'tier1-monthly-reset', data: {} },
      );

      const { Worker } = await import('bullmq');
      new Worker('billing-cron', async (job) => {
        if (job.name === 'yearly-credit-rotation') {
          const { processYearlyCreditRotation } = await import('./services/yearly-rotation');
          await processYearlyCreditRotation();
        } else if (job.name === 'tier1-monthly-reset') {
          const { resetExpiredTier1Tokens } = await import('./cron/tier1-monthly-reset');
          await resetExpiredTier1Tokens();
        }
      }, { connection: redisConnection, concurrency: 1 });

      console.log('[BillingApp] BullMQ billing-cron workers registered');
    } catch (err) {
      console.error('[BillingApp] Failed to register BullMQ billing-cron workers:', err);
    }
  })();
}

export { billingApp, accountDeletionApp };
