import { and, desc, eq, gte, isNull, sql } from 'drizzle-orm';
import { accountMemories } from '@epsilon/db';
import { db } from '../../shared/db';
import { proxyToAnthropic } from './anthropic';
import { resolveAccountIdFromUserId } from './memory-account-resolver';
import { enforceCategoryLimit, textSimilarity } from './memory-conflict';

const CATEGORIES = new Set(['preference', 'trading_style', 'risk_profile', 'fact', 'tool_usage']);

type Fact = { category: string; content: string };

type ExtractResult = { extracted: number; deduped: number; accountId: string | null; skipped?: boolean };

function sanitizeFacts(input: unknown): Fact[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((x) => {
      const item = x as Record<string, unknown>;
      const category = typeof item.category === 'string' ? item.category.trim() : '';
      const content = typeof item.content === 'string' ? item.content.trim() : '';
      if (!CATEGORIES.has(category)) return null;
      if (!content || content.length > 200) return null;
      return { category, content };
    })
    .filter((x): x is Fact => !!x)
    .slice(0, 5);
}

function buildPseudoEmbedding(text: string, dims = 8): number[] {
  const out = new Array(dims).fill(0);
  for (let i = 0; i < text.length; i++) out[i % dims] += text.charCodeAt(i);
  const norm = Math.sqrt(out.reduce((a, b) => a + b * b, 0)) || 1;
  return out.map((v) => Number((v / norm).toFixed(6)));
}

async function upsertVector(memoryId: string, accountId: string, content: string): Promise<void> {
  const vec = `[${buildPseudoEmbedding(content).join(',')}]`;
  await db.execute(sql`
    INSERT INTO epsilon.account_memory_vectors (memory_id, account_id, embedding, updated_at)
    VALUES (${memoryId}::uuid, ${accountId}::uuid, ${vec}::vector, now())
    ON CONFLICT (memory_id)
    DO UPDATE SET embedding = EXCLUDED.embedding, updated_at = now()
  `);
}

async function extractFacts(messages: Array<{ role: string; content: string }>): Promise<Fact[]> {
  const compact = messages.map((m) => `${m.role}: ${m.content}`).join('\n').slice(0, 20_000);
  const body = {
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 500,
    stream: false,
    system: 'Extract memorable user facts. Return ONLY JSON array [{"category":"preference|trading_style|risk_profile|fact|tool_usage","content":"max 15 words"}] max 5 items.',
    messages: [{ role: 'user', content: compact }],
  } as Record<string, unknown>;

  const res = await proxyToAnthropic(body, false);
  if (!res.ok) return [];
  const json = await res.json().catch(() => null) as any;
  const text = json?.content?.find?.((p: any) => p?.type === 'text')?.text;
  if (!text || typeof text !== 'string') return [];
  const parsed = JSON.parse(text);
  return sanitizeFacts(parsed);
}

export async function extractMemoriesForUser(payload: {
  userId: string;
  sessionId: string;
  messages: Array<{ role: string; content: string }>;
}): Promise<ExtractResult> {
  const accountId = await resolveAccountIdFromUserId(payload.userId);
  if (!accountId) return { extracted: 0, deduped: 0, accountId: null };

  const recent = await db.query.accountMemories.findFirst({
    where: and(
      eq(accountMemories.accountId, accountId),
      eq(accountMemories.sourceSessionId, payload.sessionId),
      gte(accountMemories.updatedAt, new Date(Date.now() - 60 * 60 * 1000)),
    ),
    columns: { id: true },
  });
  if (recent) return { extracted: 0, deduped: 0, accountId, skipped: true };

  const facts = await extractFacts(payload.messages);
  if (facts.length === 0) return { extracted: 0, deduped: 0, accountId };

  let extracted = 0;
  let deduped = 0;

  for (const fact of facts) {
    const existing = await db.query.accountMemories.findFirst({
      where: and(
        eq(accountMemories.accountId, accountId),
        eq(accountMemories.category, fact.category),
        isNull(accountMemories.invalidatedAt),
      ),
      orderBy: desc(accountMemories.updatedAt),
    });

    if (!existing) {
      const inserted = await db.insert(accountMemories).values({
        accountId,
        createdByUserId: payload.userId,
        category: fact.category,
        content: fact.content,
        sourceSessionId: payload.sessionId,
      }).returning({ id: accountMemories.id });
      if (inserted[0]?.id) await upsertVector(inserted[0].id, accountId, fact.content);
      extracted++;
      continue;
    }

    if (textSimilarity(existing.content, fact.content) >= 0.8) {
      const updated = await db.update(accountMemories).set({
        content: fact.content,
        confidence: sql`LEAST(1.0, ${accountMemories.confidence} + 0.10)`,
        updatedAt: new Date(),
        sourceSessionId: payload.sessionId,
      }).where(eq(accountMemories.id, existing.id)).returning({ id: accountMemories.id });
      if (updated[0]?.id) await upsertVector(updated[0].id, accountId, fact.content);
      deduped++;
      continue;
    }

    await enforceCategoryLimit(accountId, fact.category, 3);
    const inserted = await db.insert(accountMemories).values({
      accountId,
      createdByUserId: payload.userId,
      category: fact.category,
      content: fact.content,
      sourceSessionId: payload.sessionId,
    }).returning({ id: accountMemories.id });
    if (inserted[0]?.id) await upsertVector(inserted[0].id, accountId, fact.content);
    extracted++;
  }

  return { extracted, deduped, accountId };
}
