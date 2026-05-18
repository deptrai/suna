import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { accountMemories } from '@epsilon/db';
import type { AppContext, AuthVariables } from '../../types';
import { db } from '../../shared/db';
import { extractMemoriesForUser } from '../services/memory-extraction';
import { renderMemoriesForUser } from '../services/memory-render';
import { resolveAccountIdFromUserId } from '../services/memory-account-resolver';

type MemoryVars = AppContext & AuthVariables;
export const memory = new Hono<{ Variables: MemoryVars }>();

const renderSchema = z.object({
  userId: z.string().uuid(),
  sessionId: z.string().min(1).max(128),
  maxTokens: z.number().int().min(100).max(2000).optional(),
});

const extractSchema = z.object({
  userId: z.string().uuid(),
  sessionId: z.string().min(1).max(128),
  messages: z.array(z.object({ role: z.string().min(1).max(32), content: z.string().min(1).max(20000) })).max(20),
});

const extractionRateMap = new Map<string, { count: number; resetAt: number }>();

function checkExtractionRate(accountId: string): boolean {
  const now = Date.now();
  const current = extractionRateMap.get(accountId);
  if (!current || current.resetAt <= now) {
    extractionRateMap.set(accountId, { count: 1, resetAt: now + 60 * 60 * 1000 });
    return true;
  }
  if (current.count >= 10) return false;
  current.count += 1;
  return true;
}

memory.post('/render', async (c) => {
  const parsed = renderSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw new HTTPException(400, { message: 'Invalid request body' });
  const { userId, maxTokens } = parsed.data;
  const result = await renderMemoriesForUser(userId, maxTokens ?? 500);
  return c.json({ rendered: result.rendered, memoryCount: result.memoryCount });
});

memory.post('/extract', async (c) => {
  const parsed = extractSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw new HTTPException(400, { message: 'Invalid request body' });
  const accountId = await resolveAccountIdFromUserId(parsed.data.userId);
  if (!accountId) throw new HTTPException(403, { message: 'Account not found for user' });
  if (!checkExtractionRate(accountId)) throw new HTTPException(429, { message: 'Extraction rate limit exceeded' });

  const result = await extractMemoriesForUser(parsed.data as {
    userId: string;
    sessionId: string;
    messages: Array<{ role: string; content: string }>;
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
  await db
    .update(accountMemories)
    .set({ invalidatedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(accountMemories.id, id), eq(accountMemories.accountId, accountId)));

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
