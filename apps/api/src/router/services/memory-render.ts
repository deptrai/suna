import { and, desc, eq, isNull } from 'drizzle-orm';
import { accountMemories } from '@epsilon/db';
import { db } from '../../shared/db';
import { resolveAccountIdFromUserId } from './memory-account-resolver';

function truncateByTokenBudget(text: string, maxTokens: number): string {
  // F21: Per-char ratio depends on script. ASCII ≈ 4 chars/token; Vietnamese
  // (with diacritics) and CJK ≈ 1-2 chars/token. Detect non-ASCII presence and
  // use a conservative 2 chars/token to avoid blowing the budget on multi-byte
  // memory entries. Real BPE tokenization would be better but adds a heavy dep.
  const hasNonAscii = /[^\x00-\x7F]/.test(text);
  const charsPerToken = hasNonAscii ? 2 : 4;
  const approxChars = Math.max(32, maxTokens * charsPerToken);
  if (text.length <= approxChars) return text;
  return `${text.slice(0, approxChars - 3)}...`;
}

export async function renderMemoriesForAccount(accountId: string, maxTokens = 500): Promise<{ rendered: string; memoryCount: number }> {
  const rows = await db.query.accountMemories.findMany({
    where: and(eq(accountMemories.accountId, accountId), isNull(accountMemories.invalidatedAt)),
    orderBy: desc(accountMemories.updatedAt),
    limit: 10,
    columns: { category: true, content: true },
  });

  if (rows.length === 0) return { rendered: '', memoryCount: 0 };
  const body = ['## Persistent Memory', ...rows.map((r) => `[${r.category}] ${r.content}`)].join('\n');
  return { rendered: truncateByTokenBudget(body, maxTokens), memoryCount: rows.length };
}

/** @deprecated Use renderMemoriesForAccount; kept for tests that mock by-userId path. */
export async function renderMemoriesForUser(userId: string, maxTokens = 500): Promise<{ rendered: string; memoryCount: number; accountId: string | null }> {
  const accountId = await resolveAccountIdFromUserId(userId);
  if (!accountId) return { rendered: '', memoryCount: 0, accountId: null };
  const result = await renderMemoriesForAccount(accountId, maxTokens);
  return { ...result, accountId };
}
