import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { accountMemories } from '@epsilon/db';
import { db } from '../../shared/db';

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp = Array.from({ length: m + 1 }, (_, i) => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[m][n];
}

export function textSimilarity(a: string, b: string): number {
  const aa = a.trim().toLowerCase();
  const bb = b.trim().toLowerCase();
  if (!aa && !bb) return 1;
  if (!aa || !bb) return 0;
  const dist = levenshtein(aa, bb);
  return 1 - dist / Math.max(aa.length, bb.length);
}

// F14: Atomic via Postgres advisory lock keyed on (accountId, category) hash.
// Read-then-update over two roundtrips lets concurrent extracts both decide the
// cap is fine, then both insert. The advisory lock serializes the enforcement
// per (account, category) so only one extraction at a time can invalidate +
// caller-insert. Lock auto-released at txn end.
export async function enforceCategoryLimit(accountId: string, category: string, maxEntries = 3): Promise<void> {
  await db.transaction(async (tx) => {
    // Two int4 lock keys: hash of accountId + category. pg_advisory_xact_lock
    // releases on txn commit/rollback.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${accountId}), hashtext(${category}))`);

    const rows = await tx.query.accountMemories.findMany({
      where: and(
        eq(accountMemories.accountId, accountId),
        eq(accountMemories.category, category),
        isNull(accountMemories.invalidatedAt),
      ),
      orderBy: asc(accountMemories.updatedAt),
      columns: { id: true },
    });
    if (rows.length < maxEntries) return;
    const toInvalidate = rows.slice(0, rows.length - maxEntries + 1).map((r) => r.id);
    await tx
      .update(accountMemories)
      .set({ invalidatedAt: new Date(), updatedAt: new Date() })
      .where(inArray(accountMemories.id, toInvalidate));
  });
}
