import { and, desc, eq, gte, isNull, sql } from 'drizzle-orm';
import { accountMemories } from '@epsilon/db';
import { db } from '../../shared/db';
import { proxyToAnthropic } from './anthropic';
import { resolveAccountIdFromUserId } from './memory-account-resolver';
import { enforceCategoryLimit, textSimilarity } from './memory-conflict';

const CATEGORIES = new Set(['preference', 'trading_style', 'risk_profile', 'fact', 'tool_usage']);

const EXTRACTION_SYSTEM_PROMPT = `Extract memorable facts about the user from this conversation.
Return JSON array, max 5 items, strict schema:
[{ "category": "preference|trading_style|risk_profile|fact|tool_usage", "content": "string (max 15 words)" }]

RULES:
- ONLY high-signal, reusable facts (NOT: emotional state, speculation, PII, session-specific context)
- Category definitions:
  - preference: UI/workflow preferences ("prefers 4H timeframe", "dislikes notifications")
  - trading_style: trading approach ("uses 10% position sizing", "scalps with 1m entries")
  - risk_profile: risk tolerance ("conservative, avoids leverage", "comfortable with 2x")
  - fact: domain knowledge about user ("focuses on ETH and BTC", "has 5 years trading experience")
  - tool_usage: tool preferences ("always asks for RSI analysis", "prefers Vibe Trading backtest")
- EXAMPLES GOOD: "Prefers 4H timeframe for crypto", "Risk profile: conservative, max 2% per trade"
- EXAMPLES BAD: "User seemed frustrated today", "Asked about BTC price"

Return [] if no memorable facts found. Do NOT hallucinate.`;

type Fact = { category: string; content: string };

type ExtractResult = { extracted: number; deduped: number; accountId: string | null; skipped?: boolean };

export function sanitizeFacts(input: unknown): Fact[] {
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

// F11: Layer 2 (semantic recall via pgvector) is DEFERRED per spec v2.1.
// The `account_memory_vectors` table is kept so a future story can ship real
// embeddings without another migration. Until then we no-op the upsert rather
// than write meaningless pseudo-hashes that would mislead any future consumer.
async function upsertVector(_memoryId: string, _accountId: string, _content: string): Promise<void> {
  // Intentional no-op. Re-enable when Layer 2 ships with real embeddings.
}

async function extractFacts(messages: Array<{ role: string; content: string }>): Promise<Fact[]> {
  const compact = messages.map((m) => `${m.role}: ${m.content}`).join('\n').slice(0, 20_000);
  const body = {
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 500,
    stream: false,
    system: EXTRACTION_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: compact }],
  } as Record<string, unknown>;

  const res = await proxyToAnthropic(body, false);
  if (!res.ok) return [];
  const json = await res.json().catch(() => null) as any;
  const text = json?.content?.find?.((p: any) => p?.type === 'text')?.text;
  if (!text || typeof text !== 'string') return [];
  // Haiku sometimes wraps JSON in ```json ... ``` markdown fences; also handle leading prose.
  const cleaned = extractJsonArray(text);
  if (!cleaned) {
    console.warn('[memory-extraction] Haiku returned no parseable JSON array, skipping');
    return [];
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    console.warn('[memory-extraction] Haiku returned non-JSON text, skipping');
    return [];
  }
  return sanitizeFacts(parsed);
}

/**
 * Extract the first valid JSON array substring from arbitrary LLM text.
 * F15: try every `[…]` block found, return first that parses to an array of objects.
 * Handles prose-with-brackets like "Here are [the] facts: [{…}]".
 * F16: only enter escape mode when inside a string AND prev char is `\`, so
 * `\\"` inside string bodies doesn't confuse the depth counter.
 */
export function extractJsonArray(text: string): string | null {
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenceMatch ? fenceMatch[1] : text;

  let searchFrom = 0;
  while (searchFrom < candidate.length) {
    const start = candidate.indexOf('[', searchFrom);
    if (start < 0) return null;
    const block = scanBalancedArray(candidate, start);
    if (block) {
      try {
        const parsed = JSON.parse(block);
        if (Array.isArray(parsed)) return block;
      } catch {
        // not a valid array — try next `[`
      }
      searchFrom = start + block.length;
    } else {
      // unbalanced — give up, no more matches possible
      return null;
    }
  }
  return null;
}

function scanBalancedArray(s: string, start: number): string | null {
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    if (inString) {
      if (escape) { escape = false; continue; }
      if (ch === '\\') { escape = true; continue; }
      if (ch === '"') { inString = false; continue; }
      continue;
    }
    if (ch === '"') { inString = true; continue; }
    if (ch === '[') depth++;
    else if (ch === ']') {
      depth--;
      if (depth === 0) return s.slice(start, i + 1);
    }
  }
  return null;
}

export async function extractMemoriesForAccount(payload: {
  accountId: string;
  userId: string;
  sessionId: string;
  messages: Array<{ role: string; content: string }>;
}): Promise<ExtractResult> {
  const { accountId } = payload;

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

/** @deprecated Use extractMemoriesForAccount; kept for backwards compatibility. */
export async function extractMemoriesForUser(payload: {
  userId: string;
  sessionId: string;
  messages: Array<{ role: string; content: string }>;
}): Promise<ExtractResult> {
  const accountId = await resolveAccountIdFromUserId(payload.userId);
  if (!accountId) return { extracted: 0, deduped: 0, accountId: null };
  return extractMemoriesForAccount({ accountId, ...payload });
}
