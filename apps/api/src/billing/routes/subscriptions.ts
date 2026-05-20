import { Hono } from 'hono';
import type { AppEnv } from '../../types';
import {
  createCheckoutSession,
  createInlineCheckout,
  confirmInlineCheckout,
  createPortalSession,
  cancelSubscription,
  reactivateSubscription,
  scheduleDowngrade,
  cancelScheduledChange,
  syncSubscription,
  getCheckoutSessionDetails,
  confirmCheckoutSession,
  getProrationPreview,
} from '../services/subscriptions';
import { resolveAccountId } from '../../shared/resolve-account';
import { getTier } from '../services/tiers';
import { config } from '../../config';
import { getStripe } from '../../shared/stripe';

export const subscriptionsRouter = new Hono<AppEnv>();

subscriptionsRouter.post('/create-checkout-session', async (c) => {
  const accountId = await resolveAccountId(c.get('userId'));
  const email = c.get('userEmail');
  const body = await c.req.json();

  const result = await createCheckoutSession({
    accountId,
    email,
    tierKey: body.tier_key,
    successUrl: body.success_url,
    cancelUrl: body.cancel_url,
    commitmentType: body.commitment_type,
    locale: body.locale,
    serverType: body.server_type,
    location: body.location,
  });

  return c.json(result);
});

subscriptionsRouter.post('/create-inline-checkout', async (c) => {
  const accountId = await resolveAccountId(c.get('userId'));
  const email = c.get('userEmail');
  const body = await c.req.json();

  const result = await createInlineCheckout({
    accountId,
    email,
    tierKey: body.tier_key,
    billingPeriod: body.billing_period,
    promoCode: body.promo_code,
  });

  return c.json(result);
});

subscriptionsRouter.post('/confirm-inline-checkout', async (c) => {
  const accountId = await resolveAccountId(c.get('userId'));
  const body = await c.req.json();

  const result = await confirmInlineCheckout({
    accountId,
    subscriptionId: body.subscription_id,
    tierKey: body.tier_key,
  });

  return c.json(result);
});

subscriptionsRouter.post('/create-portal-session', async (c) => {
  const accountId = await resolveAccountId(c.get('userId'));
  const email = c.get('userEmail');
  const body = await c.req.json();
  const result = await createPortalSession(accountId, body.return_url, email);
  return c.json(result);
});

subscriptionsRouter.post('/cancel-subscription', async (c) => {
  const accountId = await resolveAccountId(c.get('userId'));
  const body = await c.req.json().catch(() => ({}));
  const result = await cancelSubscription(accountId, body.feedback);
  return c.json(result);
});

subscriptionsRouter.post('/reactivate-subscription', async (c) => {
  const accountId = await resolveAccountId(c.get('userId'));
  const result = await reactivateSubscription(accountId);
  return c.json(result);
});

subscriptionsRouter.post('/schedule-downgrade', async (c) => {
  const accountId = await resolveAccountId(c.get('userId'));
  const body = await c.req.json();
  const result = await scheduleDowngrade(accountId, body.target_tier_key, body.commitment_type);
  return c.json(result);
});

subscriptionsRouter.post('/cancel-scheduled-change', async (c) => {
  const accountId = await resolveAccountId(c.get('userId'));
  const result = await cancelScheduledChange(accountId);
  return c.json(result);
});

subscriptionsRouter.post('/sync-subscription', async (c) => {
  const accountId = await resolveAccountId(c.get('userId'));
  const result = await syncSubscription(accountId);
  return c.json(result);
});

subscriptionsRouter.get('/proration-preview', async (c) => {
  const accountId = await resolveAccountId(c.get('userId'));
  const newPriceId = c.req.query('new_price_id');
  if (!newPriceId) return c.json({ error: 'new_price_id required' }, 400);

  const result = await getProrationPreview(accountId, newPriceId);
  return c.json(result);
});

subscriptionsRouter.get('/checkout-session/:sessionId', async (c) => {
  const sessionId = c.req.param('sessionId');
  const result = await getCheckoutSessionDetails(sessionId);
  return c.json(result);
});

subscriptionsRouter.post('/confirm-checkout-session', async (c) => {
  const accountId = await resolveAccountId(c.get('userId'));
  const body = await c.req.json<{ session_id?: string }>();
  if (!body.session_id) return c.json({ error: 'session_id required' }, 400);

  const result = await confirmCheckoutSession({
    accountId,
    sessionId: body.session_id,
  });

  return c.json(result);
});

subscriptionsRouter.post('/subscriptions/upgrade', async (c) => {
  const accountId = await resolveAccountId(c.get('userId'));
  const body = await c.req.json<{ targetTier?: 'pro' | 'enterprise'; success_url?: string; cancel_url?: string }>();
  const targetTier = body.targetTier;
  if (!targetTier || !['pro', 'enterprise'].includes(targetTier)) {
    return c.json({ error: 'targetTier must be pro or enterprise' }, 400);
  }

  const tier = getTier(targetTier);
  if (!tier.stripeMonthlyPriceId) {
    return c.json({ error: 'Stripe monthly price ID not configured' }, 500);
  }

  const stripe = getStripe();
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    line_items: [{ price: tier.stripeMonthlyPriceId, quantity: 1 }],
    success_url: body.success_url ?? `${config.FRONTEND_URL}/dashboard/billing?checkout=success`,
    cancel_url: body.cancel_url ?? `${config.FRONTEND_URL}/dashboard/billing?checkout=cancel`,
    metadata: {
      account_id: accountId,
      target_tier: targetTier,
      type: 'upgrade',
    },
  });

  return c.json({ checkoutUrl: session.url });
});

subscriptionsRouter.post('/topup/checkout', async (c) => {
  const accountId = await resolveAccountId(c.get('userId'));
  const body = await c.req.json<{ packageTokens?: number; success_url?: string; cancel_url?: string }>();
  const packageTokens = Math.floor(body.packageTokens ?? 0);
  if (packageTokens <= 0) {
    return c.json({ error: 'packageTokens must be > 0' }, 400);
  }

  const { getCreditAccount } = await import('../repositories/credit-accounts');
  const account = await getCreditAccount(accountId);
  const tier = getTier(account?.tier ?? 'free');
  if (!tier.canPurchaseTopup) {
    return c.json({ error: 'Top-up is not available for this tier' }, 403);
  }

  const priceInCents = Math.ceil((packageTokens / 1_000_000) * config.TOPUP_TOKEN_UNIT_PRICE_CENTS);
  const stripe = getStripe();
  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: [{
      price_data: {
        currency: 'usd',
        unit_amount: priceInCents,
        product_data: { name: `${packageTokens.toLocaleString()} Chainlens Tokens` },
      },
      quantity: 1,
    }],
    success_url: body.success_url ?? `${config.FRONTEND_URL}/dashboard/billing?topup=success`,
    cancel_url: body.cancel_url ?? `${config.FRONTEND_URL}/dashboard/billing?topup=cancel`,
    metadata: {
      account_id: accountId,
      topup_tokens: String(packageTokens),
      type: 'topup',
    },
  });

  return c.json({ checkoutUrl: session.url });
});
