import { eq } from 'drizzle-orm';
import { shadowAccountOwnership } from '@epsilon/db';
import { db } from '../../shared/db';
import { config } from '../../config';

export class ShadowOwnershipError extends Error {
  constructor(shadowId: string, ownerAccountId: string) {
    super(`Shadow report ${shadowId} owned by ${ownerAccountId}`);
    this.name = 'ShadowOwnershipError';
  }
}

/**
 * TOFU ownership claim for shadow_id (Story 5.6).
 *
 * Inserts (shadow_id, account_id) on first call. On conflict, reads the existing
 * row and throws ShadowOwnershipError if the owner does not match the caller.
 *
 * Local mode without DATABASE_URL: skips the check (single-tenant).
 */
export async function claimOrAssertShadowOwnership(
  accountId: string,
  shadowId: string,
): Promise<void> {
  if (!config.DATABASE_URL) {
    if (config.isLocal()) return;
    throw new Error('DATABASE_URL is required for shadow ownership check');
  }

  const inserted = await db
    .insert(shadowAccountOwnership)
    .values({ shadowId, accountId })
    .onConflictDoNothing({ target: shadowAccountOwnership.shadowId })
    .returning({ shadowId: shadowAccountOwnership.shadowId });

  if (inserted.length > 0) return;

  const rows = await db
    .select({ accountId: shadowAccountOwnership.accountId })
    .from(shadowAccountOwnership)
    .where(eq(shadowAccountOwnership.shadowId, shadowId))
    .limit(1);

  const owner = rows[0]?.accountId;
  if (!owner || owner !== accountId) {
    throw new ShadowOwnershipError(shadowId, owner ?? 'unknown');
  }
}
