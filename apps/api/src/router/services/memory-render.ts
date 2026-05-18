import { and, desc, eq, isNull } from 'drizzle-orm';
import { accountMemories } from '@epsilon/db';
import { db } from '../../shared/db';
import { resolveAccountIdFromUserId } from './memory-account-resolver';

function truncateByTokenBudget(text: string, maxTokens: number): string {
  const approxChars = Math.max(32, maxTokens * 4);
  if (text.length <= approxChars) return text;
  return `${text.slice(0, approxChars - 3)}...`;
}

export async function renderMemoriesForUser(userId: string, maxTokens = 500): Promise<{ rendered: string; memoryCount: number; accountId: string | null }> {
  const accountId = await resolveAccountIdFromUserId(userId);
  if (!accountId) return { rendered: '', memoryCount: 0, accountId: null };

  const rows = await db.query.accountMemories.findMany({
    where: and(eq(accountMemories.accountId, accountId), isNull(accountMemories.invalidatedAt)),
    orderBy: desc(accountMemories.updatedAt),
    limit: 10,
    columns: { category: true, content: true },
  });

  if (rows.length === 0) return { rendered: '', memoryCount: 0, accountId };
  const body = ['## Persistent Memory', ...rows.map((r) => `[${r.category}] ${r.content}`)].join('\n');
  return { rendered: truncateByTokenBudget(body, maxTokens), memoryCount: rows.length, accountId };
}
