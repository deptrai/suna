import { and, eq } from 'drizzle-orm';
import { accountMembers } from '@epsilon/db';
import { db } from '../../shared/db';

export async function resolveAccountIdFromUserId(userId: string): Promise<string | null> {
  const row = await db.query.accountMembers.findFirst({
    where: and(eq(accountMembers.userId, userId), eq(accountMembers.accountRole, 'owner')),
    columns: { accountId: true },
  });
  return row?.accountId ?? null;
}
