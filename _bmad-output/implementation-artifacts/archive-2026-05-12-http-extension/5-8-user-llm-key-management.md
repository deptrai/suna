# Story 5.8: User LLM Key Management (Core Infrastructure)

Status: backlog

**Depends on**: [Story 5.7](5-7-web-file-tools-and-swarm-readonly.md) done.
**Blocks**: [Story 5.9](5-9-swarm-teams-run-ui.md) — Swarm execution requires user keys.

<!-- Created 2026-05-12 by Winston. Split from earlier unified 5.8 spec.
     This story covers the reusable key management primitive ONLY.
     Story 5.9 consumes it to enable Swarm Teams execution. -->

## Context

Chainlens has no user-scoped credential storage today. Multiple future features need it:
- Swarm Teams (Story 5.9): user's `OPENAI_API_KEY` for LLM worker spawning
- BYOK (PRD FR16): user's Anthropic/OpenAI key for cost-reward accounting
- Tushare A-share data (Story 5.5+ optional): user's `TUSHARE_TOKEN`
- LLM Proxy MaaS (PRD FR18): user-configurable provider routing

Story 5.8 builds the **reusable primitive** — not the consumers. Each future story adds its
key type to a whitelist and reuses the encryption + injection pipeline.

## Product Decisions (RESOLVED)

### Decision 1: Tier gate on Settings → AI Keys

**Resolved**: Settings → AI Keys page accessible to **ALL tiers** (Tier 1, 2, 3).

**Rationale**: PRD FR16 (BYOK & Proof of Contribution) explicitly applies to all tiers — free
users who BYOK earn `$CLENS` airdrop as bootstrap mechanism. Gating the Settings page would
conflict with PRD intent. Individual consumers (e.g. Swarm Teams in 5.9) can still tier-gate
their usage separately.

### Decision 2: NFR8 atomic billing compatibility

**Resolved**: No conflict with NFR8.

**Rationale**: NFR8 governs **Chainlens internal credits** deduction atomicity. User's own
OpenAI key bypasses Chainlens credit system entirely — user pays OpenAI directly on their own
bill. Chainlens charges only a separate *orchestration fee* (in internal credits) which remains
subject to NFR8 atomic deduction. This is a clean boundary:
- LLM tokens → user ↔ OpenAI (outside Chainlens billing)
- Orchestration fee (e.g. Swarm run launch) → Chainlens internal credits (NFR8 applies)

Document this in tool response metadata so downstream UI can show "Chainlens fee: $X | LLM
cost: billed by OpenAI".

## Story

As a Chainlens user (any tier),
I want configure my own API keys (OpenAI, Anthropic, Tushare, etc.) securely encrypted at rest,
so that future features requiring external LLM access or premium data can use my credentials
without Chainlens storing raw keys.

## Acceptance Criteria

### AC1 — DB schema for encrypted user AI keys (AR3 compliant)

**Given** Drizzle ORM additive-only migration policy
**When** Story 5.8 ships
**Then** thêm bảng `user_ai_keys` vào `packages/db/src/schema/`:

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

**And** unique constraint enforced on `(userId, keyType)` — 1 key per type per user
**And** rollback documented as `DROP TABLE user_ai_keys;`
**And** master key `AI_KEYS_MASTER_KEY` generated via `openssl rand -base64 32` — documented in `apps/api/.env.example`

### AC2 — Key management API routes

**Given** `apps/api/src/router/routes/` pattern
**When** Story 5.8 ships
**Then** thêm routes:

```
POST   /v1/ai-keys              { keyType, value, label }   → encrypt + insert
GET    /v1/ai-keys                                            → list (masked values)
DELETE /v1/ai-keys/:keyType                                   → delete
POST   /v1/ai-keys/:keyType/test                              → verify key works
```

**And** auth: `combinedAuth` — accessible from dashboard + API key
**And** `POST /v1/ai-keys` validation:
- `keyType` whitelist: `['openai', 'anthropic', 'tushare', 'langchain_model']`
- `value` length 8-512 chars
- If `(userId, keyType)` already exists → 409 Conflict with message "Delete existing key first"

**And** `GET /v1/ai-keys` returns masked values: `sk-****abc123` (first 3 + last 6 chars only)

**And** `POST /test` issues minimal API call:
- `openai` → `GET https://api.openai.com/v1/models` with Bearer → expect 200
- `anthropic` → `GET https://api.anthropic.com/v1/models` with x-api-key → expect 200
- `tushare` → `GET http://api.tushare.pro/trade_cal?token=...` with `&start_date=20260101&end_date=20260101` → expect 200
- `langchain_model` — no test (env var only, not API-callable)

**And** `test` endpoint SSRF protection: reuse `url-guard.ts` from Story 5.7 — hardcode
allow-list of known provider hosts (not arbitrary URLs)

### AC3 — Settings page UI `/dashboard/settings/ai-keys`

**Given** ANY user truy cập page (Tier 1/2/3 — per Product Decision 1)
**When** page loads
**Then**:
- List of configured keys: masked value, keyType badge, label, last test status, Test + Remove buttons
- "Add Key" button opens modal:
  - keyType dropdown (whitelist from AC2)
  - `value` password input (type=password, paste-friendly)
  - `label` optional input (max 128 chars)
  - "Save" submits POST /v1/ai-keys
- "Test" button: POST /v1/ai-keys/:keyType/test, shows result inline (success/invalid/rate_limited)
- "Remove" button: confirmation dialog → DELETE /v1/ai-keys/:keyType

**And** NO tier gate on this page — open to all authenticated users

**And** empty state explains "Why configure keys?": Link to docs explaining which features use which key types

### AC4 — Encrypted-at-rest via libsodium sealed box

**Given** master key `AI_KEYS_MASTER_KEY` (32 bytes, base64) in `apps/api/.env`
**When** Story 5.8 ships
**Then** encryption via `libsodium-wrappers` npm:
- `crypto_secretbox_easy(plaintext, nonce, masterKey)` — authenticated encryption
- Random 24-byte nonce per key, stored alongside ciphertext
- Master key NEVER logged, NEVER returned in API responses
- Decrypt-on-demand only — no pre-decryption cache

**And** if `AI_KEYS_MASTER_KEY` missing at boot → API refuses to start with error
`"AI_KEYS_MASTER_KEY required. Generate via: openssl rand -base64 32"`

**And** unit tests for encrypt/decrypt roundtrip + tamper detection (auth tag failure)

### AC5 — Pool env injector extension (decrypt-on-demand at session spawn)

**Given** Story 5.0 `apps/api/src/pool/env-injector.ts` pattern
**When** Tier 2+ user starts chat session
**Then** env-injector queries `user_ai_keys` for current user, decrypts each, and injects:
- `OPENAI_API_KEY` (if user has `openai` key)
- `ANTHROPIC_API_KEY` (if user has `anthropic` key)
- `TUSHARE_TOKEN` (if user has `tushare` key)
- `LANGCHAIN_MODEL_NAME` (if user has `langchain_model` key)

**And** log injection event: `[AI-KEY-INJECTED] user=${userId} keyType=openai session=${sid}` — no value leaked

**And** existing Story 5.0 pool-env-injection tests pass (regression check)

**And** test: user without keys → session spawns without those env vars (no crash, no log)

### AC6 — No tier gate on Settings page (see Product Decision 1)

**Given** PRD FR16 BYOK applies to all tiers
**When** Tier 1 user configures OpenAI key
**Then** key stored + injectable, but Tier 1 tools/features don't consume it (Tier 1 has no VT tools)
**And** when Tier 1 user upgrades to Tier 2 → key already in place, no re-entry needed

### AC7 — Tests

- Encryption roundtrip tests: 4 tests (encrypt/decrypt happy, tamper detection, wrong master key, missing nonce)
- Route tests: 12 tests (CRUD happy + validation + auth + test endpoint + SSRF guard)
- Pool injector regression + extension: 3 tests (no keys → no injection; with keys → correct env; existing Story 5.0 tests still pass)
- UI tests: 3 tests (renders, add flow, delete flow)
- TypeScript clean

## Tasks / Subtasks

### Task 1 — DB schema + migration (AC1)

- [ ] Create `packages/db/src/schema/user-ai-keys.ts`
- [ ] Generate Drizzle migration: `pnpm -F db drizzle:generate`
- [ ] Verify migration is additive only (inspect SQL)
- [ ] Document rollback in migration comment

### Task 2 — Encryption service (AC4)

- [ ] Install `libsodium-wrappers` in `apps/api`
- [ ] Create `apps/api/src/router/services/encryption.ts`:
  - `encrypt(plaintext) → {encrypted, nonce}`
  - `decrypt(encrypted, nonce) → plaintext`
  - Master key lazy-init + fail-fast on missing env
- [ ] Unit tests at `apps/api/src/__tests__/unit/encryption.test.ts`

### Task 3 — AI keys API (AC2)

- [ ] Create `apps/api/src/router/services/ai-keys.ts`:
  - CRUD functions with Drizzle queries
  - Test-connection logic per keyType (reuse Story 5.7 url-guard)
- [ ] Create `apps/api/src/router/routes/ai-keys.ts`:
  - 4 Hono routes per AC2
  - Zod validation
  - Register in `apps/api/src/router/index.ts` with `combinedAuth`
- [ ] Tests at `apps/api/src/__tests__/unit/ai-keys-route.test.ts`

### Task 4 — Settings page UI (AC3)

- [ ] Create `apps/web/src/app/(dashboard)/settings/ai-keys/page.tsx` (server component, NO tier gate)
- [ ] Create `apps/web/src/components/ai-keys/ai-keys-manager.tsx` ("use client"):
  - List + add modal + test + remove
  - Use existing UI primitives
- [ ] Tests at `apps/web/src/components/ai-keys/ai-keys-manager.test.tsx`

### Task 5 — Pool env injector extension (AC5)

- [ ] Edit `apps/api/src/pool/env-injector.ts` — add user key decrypt + inject
- [ ] Regression test: run existing `pool-env-injection.test.ts` — ensure green
- [ ] Add new tests for keyed scenarios

### Task 6 — Config + docs

- [ ] Add `AI_KEYS_MASTER_KEY` to `apps/api/src/config.ts` envSchema (required, not optional)
- [ ] Update `apps/api/.env.example` with generation instructions:
  ```
  # 32-byte base64 master key for user AI key encryption (libsodium sealed box).
  # Generate once per environment: openssl rand -base64 32
  AI_KEYS_MASTER_KEY=
  ```
- [ ] Add operations runbook to `apps/api/README.md`:
  - Master key rotation procedure (deferred, document only)
  - Incident response if key leaked (rotate master, re-encrypt all, revoke user keys)

## Dev Notes

### Why libsodium-wrappers (not crypto.subtle)

- `crypto.subtle` (Web Crypto) requires WebCryptoKey object ceremony every call — slow for high-throughput session spawn
- `libsodium-wrappers` is battle-tested (same primitives as WireGuard + Signal)
- Bun supports it natively via WASM load, <100ms cold start

### Key rotation (deferred)

Future story: add `AI_KEYS_MASTER_KEY_V2` env, migrate rows in background (decrypt V1, re-encrypt V2), update DB column `nonce_version`. Not in 5.8 scope.

### Source Tree Components to Touch

**NEW files:**
- `packages/db/src/schema/user-ai-keys.ts`
- `packages/db/migrations/XXX_user_ai_keys.sql` (Drizzle-generated)
- `apps/api/src/router/services/encryption.ts`
- `apps/api/src/router/services/ai-keys.ts`
- `apps/api/src/router/routes/ai-keys.ts`
- `apps/api/src/__tests__/unit/encryption.test.ts`
- `apps/api/src/__tests__/unit/ai-keys-route.test.ts`
- `apps/web/src/app/(dashboard)/settings/ai-keys/page.tsx`
- `apps/web/src/components/ai-keys/ai-keys-manager.tsx`
- `apps/web/src/components/ai-keys/ai-keys-manager.test.tsx`

**Modified files:**
- `apps/api/src/pool/env-injector.ts` — decrypt + inject user keys
- `apps/api/src/router/index.ts` — register `/ai-keys/*`
- `apps/api/src/config.ts` — add `AI_KEYS_MASTER_KEY` required env
- `apps/api/.env.example` — master key placeholder + instructions
- `apps/api/README.md` — runbook section

### Testing Standards

- `bun test` across all files
- Integration test: start Tier 2 session for user with OpenAI key → verify env var injected
- Security test: tamper ciphertext → decrypt should throw

### Performance Budget

| Operation | Target |
|---|---|
| Key encrypt | <2ms |
| Key decrypt | <2ms |
| libsodium WASM load (cold) | <100ms (one-time per process) |
| Session env injection with 2 keys | +10-20ms overhead |

### Risk Register

| Risk | Mitigation |
|---|---|
| Master key leak | Document rotation runbook; store in secrets manager, not repo |
| libsodium WASM load time | Preload at API boot (not lazy); measure in bench |
| User uploads wrong key type | Test endpoint validates before accepting |
| User key becomes invalid mid-session | Session continues with stale key; user notices failure + re-configures |

### References

- [Story 5.7](5-7-web-file-tools-and-swarm-readonly.md) — url-guard reused for test endpoint SSRF
- [Story 5.9](5-9-swarm-teams-run-ui.md) — first consumer of this infrastructure
- [libsodium-wrappers](https://www.npmjs.com/package/libsodium-wrappers)
- [PRD FR16 BYOK](_bmad-output/planning-artifacts/prd.md) — business requirement
