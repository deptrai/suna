# Story 5.8: Per-User Persistent Memory (v2)

Status: backlog

**Depends on**: Story 5.0 done. Session-ownership layer ([session-ownership.ts](../../core/epsilon-master/src/services/session-ownership.ts)) đã ship — là nguồn `userId` authoritative cho plugin.
**Blocks**: Không block story nào.

<!-- v1 (2026-05-12): Winston architect review phát hiện 5 critical issues.
     v2 (2026-05-12): Rewrite — accountId scoping, session.idle event, Layer 1-only v1,
     loại bỏ OpenAI key conflict với Story 5.7, đơn giản hóa conflict resolution. -->

## Context

Chainlens đã có file-based memory tại [sessions.ts:56](../../core/epsilon-master/opencode/plugin/epsilon-system/sessions.ts#L56)
(`.epsilon/USER.md` + `.epsilon/MEMORY.md` inject vào mỗi LLM call) nhưng:

1. **Không persistent**: Sandbox container recreate → mất hết memory
2. **Không auto-extract**: Agent phải tự `write` file thủ công, không học từ conversation
3. **Không scope theo account**: Shared pool sandbox, nhiều users dùng chung → collision risk

Story này thêm **account-scoped structured memory** trong Supabase (Layer 1 only v1).
Layer 2 (pgvector semantic search) defer sang v2 để không couple với BYOK.

### Scope decisions (v2)

- **Layer 1 only** (structured top-10 inject). Layer 2 (vector search) = v2 scope riêng
- **accountId scoping** (consistent với billing, credits, sandboxes)
- **No embeddings v1** — không conflict với Story 5.7 BYOK OPENAI_API_KEY
- **LLM-based conflict resolution** via Claude Haiku (không cần cosine similarity)
- **session.idle** với debounce 10 phút (event `session.completed` không tồn tại)

## Architecture

### userId/accountId propagation (CRITICAL)

Pool sandboxes shared, nhiều users → KHÔNG thể inject `EPSILON_USER_ID` vào env vars.
Thay vào đó, dùng pattern có sẵn:

```
┌───────────────────────────────────────────────────────────────────┐
│  Per-session userId flow (đã ship sẵn, không sửa)                 │
│                                                                   │
│  1. User tạo session                                              │
│     Browser → apps/api → epsilon-master POST /session             │
│     epsilon-master stampSessionOwner(sessionId, userId)           │
│     → INSERT session_owners (session_id, user_id) vào             │
│       /workspace/.epsilon/epsilon.db (SQLite local)              │
│                                                                   │
│  2. Plugin runtime trong sandbox                                  │
│     sessions.ts đã có currentSessionId từ "session.created"      │
│     → Query session_owners SQLite: userId ← sessionId            │
│                                                                   │
│  3. Plugin gọi apps/api với userId + EPSILON_TOKEN                │
│     POST /v1/memory/render { sessionId, userId, lastMessages }   │
│     apps/api validates EPSILON_TOKEN → userId → accountId         │
│     → fetch account_memories + render markdown                    │
└───────────────────────────────────────────────────────────────────┘
```

**Tại sao cách này đúng**:
- `session_owners` SQLite đã tồn tại trong `/workspace/.epsilon/epsilon.db` — plugin access local, không network
- `EPSILON_TOKEN` đã được inject (env-injector.ts) — auth apps/api
- apps/api query Supabase `account_members` để resolve `userId → accountId` (đã có pattern)

### Memory layers

```
Layer 0 — Procedural (GIỮ NGUYÊN)
  .epsilon/USER.md + MEMORY.md — file-based, agent tự edit
  "How to work with this user" (persona, habits)

Layer 1 — Account Preferences (NEW, v1 scope)
  Supabase: account_memories table
  Top 10 active entries, ~300 tokens, inject mỗi session start
  Auto-extracted qua Claude Haiku sau session.idle debounce

Layer 2 — Semantic Recall (DEFERRED v2)
  Supabase: account_memory_vectors (pgvector)
  recall_memory tool — agent on-demand search
  Requires embeddings infrastructure — ship sau khi v1 prove value
```

## Story

As a Chainlens account holder (any tier),
I want the agent to remember my trading preferences and risk profile across sessions,
so that I don't need to re-explain my context every time I start a new conversation.

## Acceptance Criteria

### AC1 — DB schema (AR3 additive)

**Given** Drizzle additive-only migration policy
**When** Story 5.8 ships
**Then** new table:

```ts
// packages/db/src/schema/account-memories.ts
export const accountMemories = pgTable('account_memories', {
  id: uuid('id').primaryKey().defaultRandom(),
  accountId: uuid('account_id').notNull()
    .references(() => accounts.accountId, { onDelete: 'cascade' }),
  createdByUserId: uuid('created_by_user_id'),  // audit: ai đóng góp memory này
  category: varchar('category', { length: 32 }).notNull(),
  // whitelist: 'preference' | 'trading_style' | 'risk_profile' | 'fact' | 'tool_usage'
  content: text('content').notNull(),            // max 200 chars enforced at API layer
  confidence: real('confidence').default(1.0),
  sourceSessionId: varchar('source_session_id', { length: 128 }),
  invalidatedAt: timestamp('invalidated_at'),    // soft delete, never hard delete (audit)
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (t) => ({
  accountActiveIdx: index('account_memories_account_active_idx')
    .on(t.accountId, t.invalidatedAt),
  accountCategoryIdx: index('account_memories_account_category_idx')
    .on(t.accountId, t.category),
  // Dedupe: 1 account không được có 2 memory identical trong cùng category
  accountContentUnique: unique('account_memories_unique')
    .on(t.accountId, t.category, t.content),
}));
```

**And** rollback: `DROP TABLE account_memories;`
**And** NO pgvector extension required v1 (defer v2)

### AC2 — Memory API routes (apps/api)

```
POST /v1/memory/render   → Plugin-called, returns markdown block to inject
POST /v1/memory/extract  → Plugin-called, async extraction from session messages
GET  /v1/memory          → User-facing list (Settings UI)
DELETE /v1/memory/:id    → User-facing soft delete
DELETE /v1/memory         → User-facing Clear All
```

**Auth**:
- `/v1/memory/render` + `/v1/memory/extract` — service-to-service via `EPSILON_TOKEN` (Bearer) + body validated
- `/v1/memory` + `/v1/memory/:id` — user-facing via `combinedAuth` (Supabase JWT)

**POST /v1/memory/render** request:
```ts
{
  userId: string,        // from session_owners SQLite lookup in plugin
  sessionId: string,     // for audit logging
  maxTokens?: number     // default 500
}
```
**Response**:
```ts
{
  rendered: string,      // "## Persistent Memory\n[preference] ...\n[risk_profile] ..."
  memoryCount: number
}
```

**Server-side logic**:
1. Verify `EPSILON_TOKEN` Bearer
2. Lookup `accountId` from `account_members WHERE user_id = $userId AND account_role = 'owner'` (personal account)
3. Fetch `account_memories WHERE account_id = $accountId AND invalidated_at IS NULL ORDER BY updated_at DESC LIMIT 10`
4. Render markdown, truncate to maxTokens budget
5. Return — nếu 0 memories → `rendered: "", memoryCount: 0`

**POST /v1/memory/extract** request:
```ts
{
  userId: string,
  sessionId: string,
  messages: Array<{ role: string, content: string }>  // last 20, max 20KB
}
```
**Response**: `{ extracted: number, deduped: number }` — async-ish, OK return sau khi Haiku finish

**Server-side extraction**:
1. Verify `EPSILON_TOKEN`
2. Resolve `accountId` from `userId`
3. Call Claude Haiku với system prompt (AC3 below)
4. For mỗi fact extracted → conflict check → INSERT or UPDATE
5. Idempotency key: `sourceSessionId` — nếu đã extract session này trong < 1h, skip

### AC3 — Extraction prompt + conflict resolution

**System prompt** (Claude Haiku, ~$0.001/session):
```
Extract memorable facts about the user from this conversation.
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

Return [] if no memorable facts found. Do NOT hallucinate.
```

**Conflict resolution** (no embeddings, no cosine):

```ts
for (const newFact of extractedFacts) {
  const existing = await db.query
    .account_memories
    .findFirst({ where: and(
      eq(accountId),
      eq(category, newFact.category),
      isNull(invalidatedAt)
    )});

  if (!existing) {
    // INSERT new
    await db.insert(...).values({ accountId, userId, ...newFact });
    continue;
  }

  // Levenshtein >= 0.8 → treat as duplicate, UPDATE
  if (textSimilarity(existing.content, newFact.content) >= 0.8) {
    await db.update(...).set({
      content: newFact.content,  // latest truth wins
      updatedAt: now(),
      confidence: Math.min(existing.confidence + 0.1, 1.0)
    });
  } else {
    // Conflict: same category, different content → KEEP BOTH (user might have multiple preferences)
    // But limit: if > 3 memories in same category, invalidate oldest
    await enforceCategoryLimit(accountId, category, 3);
    await db.insert(...).values({ accountId, userId, ...newFact });
  }
}
```

**Fallback nếu Haiku API fail**: log error, skip extraction, không retry. Next session sẽ trigger lại.

### AC4 — Session-start injection

**Given** Plugin runtime khi session bắt đầu
**When** `session.created` event fires với `sessionId`
**Then**:

```ts
// sessions.ts — modify the "experimental.chat.messages.transform" hook
"experimental.chat.messages.transform": async (_input, output) => {
  try {
    const parts: string[] = []

    // [EXISTING] session context
    if (currentSessionId) {
      parts.push(wrapInEpsilonSystemTags(`Session ID: ${currentSessionId}`, ...))
    }

    // [EXISTING] .epsilon/USER.md + MEMORY.md (Layer 0)
    const mergedMemory = renderMergedMemoryContext(import.meta.dir)
    if (mergedMemory) parts.push(wrapInEpsilonSystemTags(...))

    // [NEW] Layer 1: account_memories from apps/api
    const userId = currentSessionId ? lookupSessionOwner(currentSessionId) : null
    if (userId) {
      const layer1 = await fetchAccountMemories(userId, currentSessionId)
      if (layer1) parts.push(wrapInEpsilonSystemTags(layer1, { type: "account-memory" }))
    }

    // [EXISTING] project context, etc.
    ...
  }
}
```

**And** `lookupSessionOwner()` đọc từ local SQLite `/workspace/.epsilon/epsilon.db` — **không network call**
**And** `fetchAccountMemories()` HTTP POST `${EPSILON_API_URL}/v1/memory/render` với `Bearer ${EPSILON_TOKEN}`
**And** Timeout 1.5s — nếu fail hoặc timeout → log warning, **không block** session start
**And** Budget: max 500 tokens (apps/api enforce)

### AC5 — Post-session extraction (session.idle với debounce)

**Given** `session.idle` event fires mỗi khi agent idle (có thể nhiều lần/session)
**When** idle event fires
**Then**:
- Debounce map: `Map<sessionId, timeoutId>`, reset timer mỗi idle event
- Sau 10 phút idle không có event mới → trigger extract
- Idempotency: nếu session này đã extract trong < 1h → skip (check `source_session_id` trong DB)

```ts
// sessions.ts
const extractionTimers = new Map<string, NodeJS.Timeout>()
const EXTRACTION_DEBOUNCE_MS = 10 * 60 * 1000  // 10 phút

async function scheduleExtraction(sessionId: string) {
  const existing = extractionTimers.get(sessionId)
  if (existing) clearTimeout(existing)

  const timer = setTimeout(async () => {
    extractionTimers.delete(sessionId)
    try {
      const userId = lookupSessionOwner(sessionId)
      if (!userId) return

      const messages = await client.session.messages({ path: { id: sessionId } })
      if (!messages.data || messages.data.length < 5) return  // skip short sessions

      // Fire-and-forget — không block plugin
      fetch(`${EPSILON_API_URL}/v1/memory/extract`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${EPSILON_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          sessionId,
          messages: messages.data.slice(-20).map(m => ({ role: m.info?.role, content: formatContent(m.parts) }))
        }),
        signal: AbortSignal.timeout(30_000)
      }).catch(err => console.warn('[memory-extract] fire-and-forget failed:', err))
    } catch (err) {
      console.warn('[memory-extract] scheduler error:', err)
    }
  }, EXTRACTION_DEBOUNCE_MS)

  extractionTimers.set(sessionId, timer)
}

// Hook
"event": async ({ event }) => {
  if (event.type === "session.idle") {
    const sid = event.properties?.sessionID
    if (sid) scheduleExtraction(sid)
  }
  if (event.type === "session.deleted") {
    const sid = event.properties?.info?.id
    if (sid) {
      const t = extractionTimers.get(sid)
      if (t) { clearTimeout(t); extractionTimers.delete(sid) }
    }
  }
}
```

**And** rate limit tại apps/api: max 10 extractions/hour/account (return 429 nếu vượt)

### AC6 — Settings UI: `/dashboard/settings/memory`

**Given** User muốn xem/quản lý memories của mình
**When** Load page
**Then**:
- List active memories, grouped by category (Preferences / Trading Style / Risk Profile / Facts / Tool Usage)
- Mỗi memory: content text, "Delete" icon, `updatedAt` relative ("3 days ago")
- "Clear All" button với confirm dialog ("This will delete all N memories. Cannot be undone.")
- Empty state: "No memories yet. Chat more with the agent to build up memory."
- No tier gate — tất cả tiers

**v1 KHÔNG có**: Edit content, manual add memory, export — defer v2.

### AC7 — Tests

**Unit tests** (apps/api):
- `account_memories` CRUD (3 tests: insert, update with conflict, soft delete)
- Extraction: valid Haiku response, empty messages, rate limit (3 tests)
- Conflict resolution: new insert, text-similarity update, category limit enforce (3 tests)
- Render endpoint: 0 memories, N memories, token budget truncation (3 tests)
- Auth: invalid EPSILON_TOKEN → 401, mismatched userId → 403 (2 tests)

**Integration tests**:
- Plugin `lookupSessionOwner()` → SQLite → apps/api `/v1/memory/render` (mock HTTP)
- Debounce scheduler: fire 3 idle events in 5s → only 1 extraction after 10min (1 test)
- Idempotency: extract same session twice in 1h → 2nd returns cached (1 test)

**UI tests**:
- List memories grouped by category, delete single, clear all (3 tests)

## Tasks

### Task 1 — DB schema
- `packages/db/src/schema/account-memories.ts` — Drizzle schema
- `packages/db/drizzle/XXXX_account_memories.sql` — auto-generated migration
- Export từ `packages/db/src/schema/index.ts`

### Task 2 — Memory API routes (apps/api)
- `apps/api/src/router/services/memory-extraction.ts` — Claude Haiku + conflict resolution
- `apps/api/src/router/services/memory-render.ts` — top-10 fetch + markdown render
- `apps/api/src/router/services/memory-account-resolver.ts` — userId → accountId lookup
- `apps/api/src/router/routes/memory.ts` — 5 routes
- `apps/api/src/router/index.ts` — register `/memory/*`
- Rate limiter middleware: 10 extractions/hour/account

### Task 3 — Plugin integration
- `core/epsilon-master/opencode/plugin/epsilon-system/lib/memory-client.ts` — NEW HTTP client
- `core/epsilon-master/opencode/plugin/epsilon-system/lib/session-owner-lookup.ts` — NEW SQLite reader
- `core/epsilon-master/opencode/plugin/epsilon-system/sessions.ts` — integrate Layer 1 + debounce extraction

### Task 4 — Settings UI
- `apps/web/src/app/(dashboard)/settings/memory/page.tsx`
- `apps/web/src/components/memory/memory-list.tsx` — grouped list + delete actions

### Task 5 — Tests
- Unit: 14 tests (apps/api services)
- Integration: 2 tests (plugin ↔ apps/api)
- UI: 3 tests (Settings page)

### Task 6 — Docs
- Update `core/epsilon-master/opencode/agents/chainlens-tier1.md` và `chainlens-tier2.md` — mô tả brief về persistent memory
- `apps/api/.env.example` — document `ANTHROPIC_API_KEY` cho Haiku (nếu chưa có)

## Dev Notes

### Cost estimate

Haiku extraction: ~$0.001/session × 50 sessions/month × 1000 active accounts = **$50/month**.
Acceptable. Nếu scale lên 10k accounts = $500/month — vẫn OK.

Layer 1 only → **no embedding cost** v1.

### Context budget

Layer 0 (USER.md + MEMORY.md): ~200-400 tokens
Layer 1 (account_memories): max 500 tokens
Total: ~700-900 tokens (~0.35% của 200k context). Well within best-practice 30% budget.

### Why SQLite lookup in plugin, not API call?

`session_owners` SQLite đã có tại `/workspace/.epsilon/epsilon.db`. Read trực tiếp = sub-ms,
không network. Nếu gọi API để lookup userId → 2 HTTP calls mỗi session start = latency đôi.

### Why accountId scoping, not userId?

- **Team accounts**: analyst team nên share memory ("team đang track memecoins")
- **Billing**: credits deduct theo accountId, memory extraction là cost → consistent
- **Personal accounts**: auto 1-1 với userId qua `account_members WHERE account_role='owner'`

### Why Layer 2 (pgvector) deferred?

3 lý do:
1. **Conflict với Story 5.7**: Semantic search cần embeddings → OPENAI_API_KEY. Story 5.7 BYOK nghĩa là user's key, không phải server's. Nếu ship chung → confusing: "tại sao memory cần OpenAI key của tôi?"
2. **Prove value trước**: Top-10 structured inject cover 80% use case. Chỉ cần Layer 2 khi memory count > 100 entries/account — đa số user không bao giờ tới đó
3. **Ship velocity**: Layer 1 only = 3 ngày. Thêm Layer 2 = +2-3 ngày cho embedding infra không mang lại value tương xứng v1

### Rollout plan

**Phase 1 (this story)**: Layer 1 only, Claude Haiku extraction
**Phase 2 (future story)**: nếu user count > 1000 và memory count > 100/account → add Layer 2 với `recall_memory` tool
**Phase 3 (future story)**: memory import/export, manual add, GDPR compliance

### Source Tree

**NEW:**
- `packages/db/src/schema/account-memories.ts`
- `packages/db/drizzle/XXXX_account_memories.sql`
- `apps/api/src/router/services/memory-extraction.ts`
- `apps/api/src/router/services/memory-render.ts`
- `apps/api/src/router/services/memory-account-resolver.ts`
- `apps/api/src/router/routes/memory.ts`
- `apps/api/src/__tests__/unit/memory-extraction.test.ts`
- `apps/api/src/__tests__/unit/memory-render.test.ts`
- `core/epsilon-master/opencode/plugin/epsilon-system/lib/memory-client.ts`
- `core/epsilon-master/opencode/plugin/epsilon-system/lib/session-owner-lookup.ts`
- `apps/web/src/app/(dashboard)/settings/memory/page.tsx`
- `apps/web/src/components/memory/memory-list.tsx`

**Modified:**
- `core/epsilon-master/opencode/plugin/epsilon-system/sessions.ts` — Layer 1 inject + debounce extraction scheduler
- `apps/api/src/router/index.ts` — register `/memory/*`
- `packages/db/src/schema/index.ts` — export `accountMemories`
- `apps/api/.env.example` — document `ANTHROPIC_API_KEY` requirement

### References

- [session-ownership.ts](../../core/epsilon-master/src/services/session-ownership.ts) — userId source
- [sessions.ts:56](../../core/epsilon-master/opencode/plugin/epsilon-system/sessions.ts#L56) — existing Layer 0 hook
- [env-injector.ts](../../apps/api/src/pool/env-injector.ts) — env var injection pattern (EPSILON_TOKEN already injected)
- [epsilon-user-context.ts](../../apps/api/src/shared/epsilon-user-context.ts) — request-level userId (NOT used here, we use session-scoped)
- [Story 5.0](5-0-vibe-trading-platform-foundation.md) — pool pattern
- [Story 5.7](5-7-user-llm-key-management.md) — separate concern (BYOK for user LLM, not server embeddings)
- mem0 extraction pattern: https://docs.mem0.ai/core-concepts/memory-operations

### Changelog

**v2 (2026-05-12)** — Winston architect review fixes:
- FIX: `accountId` scoping thay vì `userId` (consistent với billing/credits model)
- FIX: `userId` từ `session_owners` SQLite (không phải env var — pool sandbox shared)
- FIX: `session.idle` + debounce 10min (event `session.completed` không tồn tại trong OpenCode)
- FIX: Bỏ OPENAI_API_KEY dependency (conflict với Story 5.7 BYOK)
- FIX: Conflict resolution LLM/text-similarity (không cần cosine + embeddings)
- DEFER: Layer 2 pgvector sang v2 (chỉ cần khi memory count > 100/account)
- Estimated: 5 ngày → 3 ngày

**v1 (2026-05-12)** — Initial draft (deprecated)
