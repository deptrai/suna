/**
 * sandbox-provisioner.ts
 *
 * Called by billing webhooks to provision/archive sandboxes.
 * 1 subscription = 1 instance. Deduped by subscription ID.
 */

import { eq } from 'drizzle-orm';
import { sandboxes } from '@epsilon/db';
import { db } from '../../shared/db';
import { config } from '../../config';
import * as pool from '../../pool';
import { createSandbox, generateSandboxName } from './ensure-sandbox';
import { createApiKey } from '../../repositories/api-keys';
const provisioningSubscriptions = new Set<string>();

/** Find sandbox by subscription ID — checks both column and metadata */
async function findBySubscription(accountId: string, subscriptionId: string) {
  const all = await db.select().from(sandboxes).where(eq(sandboxes.accountId, accountId));
  return all.find((s) => {
    if (s.status === 'archived') return false;
    if ((s as any).stripeSubscriptionId === subscriptionId) return true;
    const meta = (s.metadata as Record<string, unknown>) ?? {};
    return meta.stripe_subscription_id === subscriptionId;
  });
}

/**
 * Provision a new sandbox from a completed Stripe checkout.
 * Skips if a sandbox already exists for this subscription.
 */
export async function provisionSandboxFromCheckout(opts: {
  accountId: string;
  subscriptionId: string;
  serverType: string;
  location?: string;
  tierKey: string;
}) {
  const { accountId, subscriptionId, serverType, location, tierKey } = opts;

  if (provisioningSubscriptions.has(subscriptionId)) {
    console.log(`[sandbox-provisioner] Provision already in progress for sub ${subscriptionId}, skipping`);
    return { row: null, created: false };
  }
  provisioningSubscriptions.add(subscriptionId);

  try {
    const existing = await findBySubscription(accountId, subscriptionId);
    if (existing) {
      console.log(`[sandbox-provisioner] Already exists for sub ${subscriptionId}: ${existing.sandboxId}`);
      return { row: existing, created: false };
    }

    // Try pool claim first
    if (config.isPoolEnabled()) {
      let claimed: Awaited<ReturnType<typeof pool.grab>> = null;
      // 5.0.2 review P1+P6: hoisted to outer try scope so the outer catch can
      // see whether the inner partial-provision handler already ran and cleaned
      // up the pool slot — avoids double-remove and silent fall-through to
      // createSandbox.
      let innerProvisionFailed = false;
      try {
        claimed = await pool.grab({ serverType, location: location || undefined });
        console.log(`[sandbox-provisioner] Pool grab: ${claimed ? 'CLAIMED ' + claimed.externalId : 'empty'}`);

        if (claimed) {
          const claim = claimed; // local binding so TS retains narrowing inside async callback
          const name = await generateSandboxName(accountId);
          // Story 5.0.2 AC3: atomic provision — wrap DB insert/update + pool inject
          // in a transaction. If pool.injectEnv throws (container unreachable, env
          // file write failed), the DB row is rolled back so we don't leak a
          // half-provisioned sandbox row that has a serviceKey the container
          // doesn't know about.
          let provisioned: { row: typeof sandboxes.$inferSelect; sandboxKey: string } | null = null;
          try {
            provisioned = await db.transaction(async (tx) => {
              const [insertedRow] = await tx
                .insert(sandboxes)
                .values({
                  accountId,
                  name,
                  provider: claim.poolSandbox.provider,
                  externalId: claim.externalId,
                  status: 'active',
                  baseUrl: claim.baseUrl,
                  config: {},
                  metadata: claim.metadata,
                  isIncluded: false,
                })
                .returning();

              // 5.0.2 review P9: pass tx so the api_keys insert is part of the
              // same atomic boundary — on rollback, no orphan epsilon_api_keys row.
              const sandboxKey = await createApiKey({
                sandboxId: insertedRow.sandboxId,
                accountId,
                title: 'Sandbox Token',
                type: 'sandbox',
              }, tx);

              await tx
                .update(sandboxes)
                .set({ config: { serviceKey: sandboxKey.secretKey }, updatedAt: new Date() })
                .where(eq(sandboxes.sandboxId, insertedRow.sandboxId));

              // pool.injectEnv inside the transaction: if it throws, Drizzle rolls
              // back DB writes. Re-fetch the updated row so we return the version
              // with serviceKey populated.
              await pool.injectEnv(claim, sandboxKey.secretKey);

              const [refreshedRow] = await tx
                .select()
                .from(sandboxes)
                .where(eq(sandboxes.sandboxId, insertedRow.sandboxId));

              return { row: refreshedRow, sandboxKey: sandboxKey.secretKey };
            });
          } catch (provisionErr) {
            innerProvisionFailed = true;
            const errMsg = provisionErr instanceof Error ? provisionErr.message : String(provisionErr);
            console.error(`[sandbox-provisioner] Atomic provision failed (rolled back DB write): ${errMsg}`);
            // Mark sandbox row outside the rolled-back transaction so operators
            // can see the failure in admin UI. Use a fresh insert (the rolled-back
            // row never persisted).
            try {
              await db.insert(sandboxes).values({
                accountId,
                name: `${name}-provision-failed`,
                provider: claim.poolSandbox.provider,
                externalId: claim.externalId,
                status: 'error',
                baseUrl: claim.baseUrl,
                config: {},
                metadata: {
                  ...((claim.metadata as Record<string, unknown>) ?? {}),
                  error: `token_provision_partial: ${errMsg}`,
                  failedAt: new Date().toISOString(),
                },
                isIncluded: false,
              });
            } catch (markErr) {
              console.error('[sandbox-provisioner] Could not record error row:', markErr);
            }
            // Release pool slot back to ready state so capacity isn't leaked.
            // Pool inventory has no explicit "release back" — destroy the orphan
            // and let the pool refiller create a replacement.
            try {
              await pool.inventory.destroyOne(claim.poolSandbox);
              console.log(`[sandbox-provisioner] Destroyed orphaned pool sandbox after partial-provision failure: ${claim.externalId}`);
            } catch (cleanupErr) {
              console.error(`[sandbox-provisioner] Failed to destroy orphaned pool sandbox ${claim.externalId}:`, cleanupErr);
            }
            // 5.0.2 review P1: propagate to caller. The outer catch checks
            // innerProvisionFailed and re-throws to avoid silently falling
            // through to the createSandbox fallback path.
            throw provisionErr;
          }

          console.log(`[sandbox-provisioner] Claimed from pool atomically: ${provisioned.row.sandboxId} (ext: ${claim.externalId})`);
          return { row: provisioned.row, created: true };
        }
      } catch (err) {
        // 5.0.2 review P1: if the inner partial-provision handler already ran
        // (already cleaned up the pool slot, recorded the error row), this catch
        // must re-throw so we don't silently fall through to createSandbox.
        // The user asked for a pool claim — a partial-provision failure is a
        // real error, not a reason to silently double-provision a fresh sandbox.
        if (innerProvisionFailed) {
          throw err;
        }
        console.warn('[sandbox-provisioner] Pool claim failed, falling back:', err);
        // 5.0.2 review P6: only clean up here when the inner cleanup did NOT
        // run (i.e. pool.grab itself threw, or claimed but never entered the
        // inner try). Otherwise we'd double-remove and emit log noise.
        if (claimed?.externalId) {
          try {
            const { getProvider } = await import('../providers');
            const provider = getProvider(claimed.poolSandbox.provider as any);
            await provider.remove(claimed.externalId);
            console.log(`[sandbox-provisioner] Cleaned up orphaned pool sandbox: ${claimed.externalId}`);
          } catch (cleanupErr) {
            console.error(`[sandbox-provisioner] Failed to clean up orphaned pool sandbox ${claimed.externalId}:`, cleanupErr);
          }
        }
      }
    }

    console.log(`[sandbox-provisioner] Provisioning new sandbox for ${accountId} (type=${serverType}, loc=${location})`);
    const result = await createSandbox({
      accountId,
      userId: accountId,
      provider: 'justavps',
      serverType,
      location,
      isIncluded: false,
    });

    // Tag the sandbox with its subscription ID
    if (result.row) {
      const meta = (result.row.metadata as Record<string, unknown>) ?? {};
      await db
        .update(sandboxes)
        .set({
          metadata: { ...meta, stripe_subscription_id: subscriptionId, tier_key: tierKey },
          updatedAt: new Date(),
        })
        .where(eq(sandboxes.sandboxId, result.row.sandboxId));
    }

    return result;
  } finally {
    provisioningSubscriptions.delete(subscriptionId);
  }
}

/**
 * Archive the sandbox tied to a deleted Stripe subscription.
 */
export async function archiveSandboxBySubscription(
  accountId: string,
  subscriptionId: string,
): Promise<void> {
  const match = await findBySubscription(accountId, subscriptionId);
  if (!match) {
    console.warn(`[sandbox-provisioner] No sandbox for sub ${subscriptionId}`);
    return;
  }

  await db
    .update(sandboxes)
    .set({ status: 'archived', updatedAt: new Date() })
    .where(eq(sandboxes.sandboxId, match.sandboxId));

  if (match.externalId) {
    try {
      const { getProvider } = await import('../providers');
      const provider = getProvider(match.provider);
      await provider.stop(match.externalId);
    } catch (err) {
      console.warn(`[sandbox-provisioner] Failed to stop ${match.externalId}:`, err);
    }
  }

  console.log(`[sandbox-provisioner] Archived ${match.sandboxId} (sub=${subscriptionId})`);
}
