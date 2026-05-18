import { and, eq } from 'drizzle-orm';
import { accountMembers } from '@epsilon/db';
import { db } from '../../shared/db';
import { config } from '../../config';

/**
 * Resolve the owner account for a userId. Filters by accountRole='owner' so users
 * who are members of multiple accounts (e.g. team + personal) get a deterministic
 * personal account back. Without the role filter, findFirst returns arbitrary rows.
 */
export async function resolveAccountIdFromUserId(userId: string): Promise<string | null> {
  const row = await db.query.accountMembers.findFirst({
    where: and(eq(accountMembers.userId, userId), eq(accountMembers.accountRole, 'owner')),
    columns: { accountId: true },
  });
  return row?.accountId ?? null;
}

/**
 * Verify that a userId is actually a member of the given accountId.
 * Used to prevent IDOR on service-to-service routes that receive userId from the body.
 * Returns true if the user belongs to the account, false otherwise.
 *
 * Local-dev special case: combinedAuth injects userId="local-dev-admin" (auth.ts:171)
 * instead of a UUID when ENV_MODE=local. session_owners propagates the sentinel into
 * sandbox SQLite. Treat it as a member of *any* account ONLY when running in local
 * mode — production must never honor this bypass even if the sentinel leaks.
 */
export async function verifyUserBelongsToAccount(userId: string, accountId: string): Promise<boolean> {
  if (userId === 'local-dev-admin' && config.isLocal()) return true;
  const row = await db.query.accountMembers.findFirst({
    where: and(eq(accountMembers.userId, userId), eq(accountMembers.accountId, accountId)),
    columns: { userId: true },
  });
  return !!row;
}
