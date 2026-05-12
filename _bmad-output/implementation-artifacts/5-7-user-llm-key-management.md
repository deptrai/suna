# Story 5.7: User LLM Key Management (BYOK Infrastructure)

Status: backlog

**Depends on**: [Story 5.5](5-5-vibe-trading-mcp-proxy.md) done.
**Blocks**: Swarm Teams `run_swarm` execution (currently fails without user OpenAI key).

<!-- Created 2026-05-12 (v3). Renamed from old Story 5.8. Same scope — user-scoped
     encrypted credential storage — but now with resolved product decisions. -->

## Context

Chainlens has no user-scoped credential storage today. Multiple features need it:
- Swarm Teams (Story 5.5 MCP `run_swarm`): user's `OPENAI_API_KEY` for LLM worker spawning
- BYOK (PRD FR16): user's Anthropic/OpenAI key for cost-reward accounting
- Tushare A-share data (MCP `get_market_data` with A-share codes): user's `TUSHARE_TOKEN`
- LLM Proxy MaaS (PRD FR18): user-configurable provider routing

This story builds the **reusable primitive** — not the consumers. Each future feature
adds its key type to a whitelist.

## Product Decisions (RESOLVED)

### Decision 1: Tier gate on Settings → AI Keys

**Resolved**: Settings → AI Keys page accessible to **ALL tiers**.

**Rationale**: PRD FR16 (BYOK) applies to all tiers — free users BYOK to earn `$CLENS` airdrop
as bootstrap. Gating Settings would conflict. Individual consumers (Swarm) gate separately.

### Decision 2: NFR8 atomic billing compatibility

**Resolved**: No conflict.

**Rationale**: NFR8 governs Chainlens internal credits atomicity. User's own OpenAI key
bypasses Chainlens credit system — user pays OpenAI directly. Chainlens charges only an
*orchestration fee* in internal credits (NFR8 applies to that fee). Clean boundary:
- LLM tokens → user ↔ OpenAI (outside Chainlens billing)
- Orchestration fee → Chainlens credits (NFR8 atomic)

## Story

As a Chainlens user (any tier),
I want configure API keys (OpenAI, Anthropic, Tushare) securely encrypted at rest,
so that features requiring external LLM access or premium data can use my credentials.

## Acceptance Criteria

### AC1 — DB schema (AR3 additive)

**Given** Drizzle additive-only migration policy
**When** Story 5.7 ships
**Then** new table `user_ai_keys`:

```ts
export const userAiKeys = pgTable('user_ai_keys', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  keyType: varchar('key_type', { length: 64 }).notNull(),
  encryptedValue: text('encrypted_value').notNull(),
  nonce: varchar('nonce', { length: 64 }).notNull(),
  label: varchar('label', { length: 128 }),
  lastTestedAt: timestamp('last_tested_at'),
  lastTestResult: varchar('last_test_result', { length: 32 }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => ({
  userKeyTypeUnique: unique().on(table.userId, table.keyType),
}));
```

**And** rollback: `DROP TABLE user_ai_keys;`
**And** `AI_KEYS_MASTER_KEY` generated via `openssl rand -base64 32`, stored in `apps/api/.env`

### AC2 — Key management API

```
POST   /v1/ai-keys              { keyType, value, label }   → encrypt + insert
GET    /v1/ai-keys                                            → list (masked)
DELETE /v1/ai-keys/:keyType                                   → delete
POST   /v1/ai-keys/:keyType/test                              → verify key
```

**And**:
- `keyType` whitelist: `['openai', 'anthropic', 'tushare']`
- `value` length 8-512
- `(userId, keyType)` conflict → 409 "Delete existing first"
- List returns masked `sk-****abc123`
- Test endpoint issues minimal provider API call to verify

### AC3 — Settings page `/dashboard/settings/ai-keys`

**Given** ALL tiers accessible (Decision 1)
**When** user loads page
**Then**:
- List configured keys with mask + test + remove buttons
- "Add Key" modal: keyType dropdown + password input + optional label
- No tier gate

### AC4 — Encryption at rest (libsodium)

**Given** `AI_KEYS_MASTER_KEY` (32-byte base64) in env
**When** Story 5.7 ships
**Then**:
- `crypto_secretbox_easy` authenticated encryption (libsodium-wrappers npm)
- 24-byte random nonce per key
- Master key NEVER logged
- API refuses to start if `AI_KEYS_MASTER_KEY` missing

### AC5 — Sandbox env injection at session spawn

**Given** Story 5.0 `pool/env-injector.ts` pattern
**When** Tier 2 user starts session
**Then** env-injector queries user's keys, decrypts, injects as env vars:
- `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `TUSHARE_TOKEN`

**And** existing Story 5.0 pool-env-injection tests PASS (regression)
**And** log: `[AI-KEY-INJECTED] user=${userId} keyType=openai session=${sid}` (no value)

### AC6 — VT MCP proxy forwards keys per-request (not container env)

**Given** MCP proxy (Story 5.5) forwards user requests to `vibe-trading-mcp` container
**When** user's tool call needs their key (e.g. `run_swarm` needs OpenAI)
**Then** proxy extracts user's decrypted key from request context, injects into VT MCP call via HTTP header:
```
X-User-OPENAI-API-KEY: sk-...
```

**And** VT MCP server reads header at request entry, sets env var for duration of that one call, clears after
**And** VT MCP patch required (~15 LOC in `mcp_server.py` startup hook or FastMCP middleware)

**OR alternative:** agent tool-call payload includes `openai_key` field, VT tool signature extended. Whichever is simpler — decide during implementation.

### AC7 — Tests

- Encryption roundtrip + tamper detection (4 tests)
- Key CRUD + validation + SSRF-safe test endpoint (10 tests)
- Pool injector regression + extension (3 tests)
- UI tests (3 tests)

## Tasks

### Task 1 — DB schema + encryption utility
### Task 2 — AI keys CRUD API
### Task 3 — Settings page UI (no tier gate)
### Task 4 — Pool env injector extension
### Task 5 — MCP proxy header forwarding
### Task 6 — Tests + docs

## Dev Notes

### Encryption choice

`libsodium-wrappers` — battle-tested, same primitives as Signal/WireGuard. Preload WASM at API
boot (~100ms cold start), not lazy. Subsequent ops <2ms.

### Master key rotation

Deferred. Document runbook in `apps/api/README.md`: add `AI_KEYS_MASTER_KEY_V2`, migrate rows
background (decrypt V1, re-encrypt V2), update `key_version` column.

### Source Tree

**NEW:**
- `packages/db/src/schema/user-ai-keys.ts` + migration
- `apps/api/src/router/services/encryption.ts`
- `apps/api/src/router/services/ai-keys.ts`
- `apps/api/src/router/routes/ai-keys.ts`
- `apps/api/src/__tests__/unit/encryption.test.ts`
- `apps/api/src/__tests__/unit/ai-keys-route.test.ts`
- `apps/web/src/app/(dashboard)/settings/ai-keys/page.tsx`
- `apps/web/src/components/ai-keys/ai-keys-manager.tsx`

**Modified:**
- `apps/api/src/pool/env-injector.ts` — decrypt + inject user keys
- `apps/api/src/router/routes/vibe-trading-mcp.ts` — forward keys per-request (AC6)
- `apps/api/src/router/index.ts` — register `/ai-keys/*`
- `apps/api/src/config.ts` — `AI_KEYS_MASTER_KEY` required env
- `apps/api/.env.example` — master key placeholder
- `Vibe-Trading/agent/mcp_server.py` — read `X-User-OPENAI-API-KEY` header (~15 LOC)

### References

- [Story 5.5](5-5-vibe-trading-mcp-proxy.md) — MCP proxy consumes key injection
- [libsodium-wrappers](https://www.npmjs.com/package/libsodium-wrappers)
- [PRD FR16 BYOK](_bmad-output/planning-artifacts/prd.md)
