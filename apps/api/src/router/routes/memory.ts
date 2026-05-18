import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { accountMemories } from '@epsilon/db';
import type { AppContext, AuthVariables } from '../../types';
import { db } from '../../shared/db';
import { extractMemoriesForAccount } from '../services/memory-extraction';
import { renderMemoriesForAccount } from '../services/memory-render';
import {
  resolveAccountIdFromUserId,
  verifyUserBelongsToAccount,
} from '../services/memory-account-resolver';

type MemoryVars = AppContext & AuthVariables;
export const memory = new Hono<{ Variables: MemoryVars }>();

// Accept UUID or the well-known local-dev sentinel ("local-dev-admin").
// In production sandboxes session_owners always carries a real UUID; the
// sentinel is only injected by combinedAuth's local bypass (auth.ts:171).
const userIdSchema = z.string().min(1).max(128).refine(
  (s) => s === 'local-dev-admin' || /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s),
  { message: 'userId must be a UUID or the local-dev sentinel' },
);

const renderSchema = z.object({
  userId: userIdSchema,
  sessionId: z.string().min(1).max(128),
  maxTokens: z.number().int().min(100).max(2000).optional(),
});

const extractSchema = z.object({
  userId: userIdSchema,
  sessionId: z.string().min(1).max(128),
  // F17: min(1) — empty messages array would just burn a Haiku call returning [].
  // Plugin already guards with `messages.length < 5` but the HTTP endpoint must
  // not trust callers.
  messages: z.array(z.object({ role: z.string().min(1).max(32), content: z.string().min(1).max(20000) })).min(1).max(20),
});

const extractionRateMap = new Map<string, { count: number; resetAt: number }>();
const RATE_WINDOW_MS = 60 * 60 * 1000;
const RATE_MAX = 10;

function checkExtractionRate(accountId: string): boolean {
  const now = Date.now();
  // Prune expired entries opportunistically (cap iterations to avoid pathological scans)
  let pruned = 0;
  for (const [key, value] of extractionRateMap.entries()) {
    if (value.resetAt <= now) {
      extractionRateMap.delete(key);
      if (++pruned >= 100) break;
    }
  }
  const current = extractionRateMap.get(accountId);
  // F18: prune cap may leave THIS account's stale entry unpruned. Reset its
  // window here so a legitimate request after window expiry isn't falsely 429.
  if (!current || current.resetAt <= now) {
    extractionRateMap.set(accountId, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }
  if (current.count >= RATE_MAX) return false;
  current.count += 1;
  return true;
}

memory.post('/render', async (c) => {
  // accountId comes from validated apiKeyAuth token — never trust body for ownership.
  const tokenAccountId = c.get('accountId');
  if (!tokenAccountId) throw new HTTPException(401, { message: 'Service token missing accountId' });

  const parsed = renderSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw new HTTPException(400, { message: 'Invalid request body' });

  // Body userId is for audit only. Verify it actually belongs to the token's account
  // to prevent tokens from one account rendering memory tied to another account's user.
  const ok = await verifyUserBelongsToAccount(parsed.data.userId, tokenAccountId);
  if (!ok) throw new HTTPException(403, { message: 'userId does not belong to caller account' });

  const result = await renderMemoriesForAccount(tokenAccountId, parsed.data.maxTokens ?? 500);
  return c.json({ rendered: result.rendered, memoryCount: result.memoryCount });
});

memory.post('/extract', async (c) => {
  const tokenAccountId = c.get('accountId');
  if (!tokenAccountId) throw new HTTPException(401, { message: 'Service token missing accountId' });

  const parsed = extractSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw new HTTPException(400, { message: 'Invalid request body' });

  const ok = await verifyUserBelongsToAccount(parsed.data.userId, tokenAccountId);
  if (!ok) throw new HTTPException(403, { message: 'userId does not belong to caller account' });

  if (!checkExtractionRate(tokenAccountId)) throw new HTTPException(429, { message: 'Extraction rate limit exceeded' });

  const result = await extractMemoriesForAccount({
    accountId: tokenAccountId,
    userId: parsed.data.userId,
    sessionId: parsed.data.sessionId,
    messages: parsed.data.messages,
  });
  return c.json({ extracted: result.extracted, deduped: result.deduped, skipped: !!result.skipped });
});

memory.get('/', async (c) => {
  const userId = c.get('userId') as string;
  const accountId = await resolveAccountIdFromUserId(userId);
  if (!accountId) throw new HTTPException(403, { message: 'Account not found' });

  const rows = await db.query.accountMemories.findMany({
    where: and(eq(accountMemories.accountId, accountId), isNull(accountMemories.invalidatedAt)),
    orderBy: desc(accountMemories.updatedAt),
  });
  return c.json({ items: rows });
});

memory.delete('/:id', async (c) => {
  const userId = c.get('userId') as string;
  const accountId = await resolveAccountIdFromUserId(userId);
  if (!accountId) throw new HTTPException(403, { message: 'Account not found' });

  const id = c.req.param('id');
  // F19: return 404 when id doesn't exist or belongs to a different account so
  // clients can distinguish a real delete from a silent no-op.
  const updated = await db
    .update(accountMemories)
    .set({ invalidatedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(accountMemories.id, id), eq(accountMemories.accountId, accountId)))
    .returning({ id: accountMemories.id });

  if (updated.length === 0) throw new HTTPException(404, { message: 'Memory not found' });
  return c.json({ success: true });
});

memory.delete('/', async (c) => {
  const userId = c.get('userId') as string;
  const accountId = await resolveAccountIdFromUserId(userId);
  if (!accountId) throw new HTTPException(403, { message: 'Account not found' });

  await db
    .update(accountMemories)
    .set({ invalidatedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(accountMemories.accountId, accountId), isNull(accountMemories.invalidatedAt)));

  return c.json({ success: true });
});
