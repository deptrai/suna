# Story 5.0.2: Sandbox Token Sync Reliability — P0 Hotfix

Status: done

**Code-review (2026-05-18 — /bmad-code-review)**: 3-layer adversarial review applied 11 patches + 4 spec-required test files (~600 LOC). All decision-needed resolved (D2 + D4 deferred + documented; D1, D3, D5, D6 patched). 34/34 tests pass.

**Epic:** 5 — Backtesting Sandbox
**Type:** P0 hotfix (infrastructure debt)
**Created:** 2026-05-18 (after empirical 1h debug + Winston architect note)
**Depends on:** Story 5.0 done
**Blocks:** Story 5.8 (memory UI), Story 5.6 (Shadow UI), spending-cap plugin in [epsilon-system/spending-cap.ts](core/epsilon-master/opencode/plugin/epsilon-system/spending-cap.ts) — all currently degrade to anonymous on drift. NOTE (audit 2026-05-18): earlier draft listed "Story 5.4 (spending-cap)" — incorrect; 5.4 is Contextual Backtest Integration, unrelated.
**FRs:** N/A (infrastructure)
**NFRs:** NFR8 (atomic billing), NFR10 (sandbox isolation)
**ARs:** AR1, AR3, AR8 (security)
**Estimated effort:** 1 day
**Owner:** Bao (DevOps)

## Story

As a Chainlens platform operator,
I want sandbox `EPSILON_TOKEN` consistent across 4 storage layers (apps/api `.env`, DB `epsilon.sandboxes.config.serviceKey`, container `.bootstrap-env.json`, s6 env dir),
so that signed `X-Epsilon-User-Context` HMAC verifies successfully every request — restoring per-user features (memory inject, spending-cap gating, audit attribution).

## Context (empirical, 2026-05-18 debug session)

**Bug manifest in UI test:** Story 5.8 memory feature appeared broken — AI fell back to `session_list` instead of injected memory. Root cause was NOT in 5.8 code. The chain:

1. `epsilon-sandbox` had 3 distinct token values in 4 storage layers
2. apps/api signs HMAC with `epsilon.sandboxes.config.serviceKey` (DB lookup); epsilon-master verifies with `process.env.EPSILON_TOKEN` (in-container)
3. → `[epsilon-user] Ignoring bad X-Epsilon-User-Context (bad_signature); continuing without user context`
4. → `stampSessionOwner` never fires
5. → `session_owners` SQLite empty for new sessions
6. → plugin `lookupSessionOwner` returns null → memory inject skipped + `[spending-cap] no stamped owner, skipping`

**Foundational doc (READ FIRST):** [_bmad-output/planning-artifacts/architecture-notes-token-sync-2026-05-18.md](_bmad-output/planning-artifacts/architecture-notes-token-sync-2026-05-18.md) — Winston's root cause + design decision (hybrid Option A+C) + P0/P1 split.

**Layer map (4 sources, 2 owners, ZERO transactional reconciler):**

| Layer | Path | Owner | Mutated by |
|---|---|---|---|
| A | `apps/api/.env INTERNAL_SERVICE_KEY` | Manual edit | Operator |
| B | `epsilon.sandboxes.config.serviceKey` (DB JSONB) | apps/api | provision + 401 retry |
| C | Container `/workspace/.secrets/.bootstrap-env.json` | epsilon-master | `saveBootstrapEnv()` on every restart |
| D | `/run/s6/container_environment/EPSILON_TOKEN` | epsilon-master | boot |

**Critical hidden coupling**: HMAC sign at A/B, verify at D. Drift between B↔D means every per-user request silently degrades to anonymous.

## Scope (P0 only — STOP THE BLEED)

This story is **NOT a refactor**. It wires together existing helpers + adds 3 new pieces. Larger DB-canonical migration is Story 5.0.3 (P1). Chaos tests are Story 5.0.4 (P1).

## Acceptance Criteria

### AC1 — Alert on bad_signature drift

**Given** epsilon-master's `epsilonUserContextMiddleware` currently logs `[epsilon-user] Ignoring bad X-Epsilon-User-Context (bad_signature)` as WARN with zero alerting ([epsilon-user-middleware.ts:51-53](core/epsilon-master/src/services/epsilon-user-middleware.ts#L51))

**When** Story 5.0.2 ships

**Then** `bad_signature` events emit via Sentry `captureMessage('sandbox.token.bad_signature', 'warning', { sandboxId, requestPath, tokenPrefix })` — rate-limited via in-memory per-sandbox debouncer (1 alert per 5-min window)

**And** alert includes: sandbox external_id, request method+path, token prefix (16 chars, NEVER full token), `process.env.EPSILON_TOKEN` prefix for comparison, timestamp

**And** non-`bad_signature` reasons (`malformed`, `expired`, `invalid_json`) emit as separate event categories so dashboards can distinguish drift from corruption

**And** a Grafana/Logtail dashboard panel `sandbox_token_drift_per_hour` shows `bad_signature_count` time series per sandbox (operator-built; PR documents the query)

### AC2 — Auto-reconcile on signature failure (sync retry with circuit breaker)

> **Design choice (revised 2026-05-18 after architect self-review)**: We DO retry the original request synchronously after reconcile. Rationale: the originating bug was `POST /session` losing user context → `stampSessionOwner` never firing → PERMANENT empty `session_owners` row until manual intervention. Async fire-and-forget perpetuates that 1-turn-anonymous bug. Sync retry pays a ~500ms latency hit ONCE per drift event (rare) in exchange for zero-defect correctness.

**Given** apps/api signs HMAC using `serviceKey` from DB ([sandbox-proxy/index.ts:32-44](apps/api/src/sandbox-proxy/index.ts#L32))
**And** epsilon-master verifies HMAC using `process.env.EPSILON_TOKEN` ([epsilon-user-middleware.ts:49](core/epsilon-master/src/services/epsilon-user-middleware.ts#L49))
**And** these can drift independently when bootstrap-env.json mutates on container restart

**When** epsilon-master verification fails with `bad_signature` AND request originated from local_docker sandbox

**Then** epsilon-master adds response header `X-Epsilon-Token-Drift: bad_signature; sandbox={external_id}` BEFORE `await next()` (so apps/api sees it even on 200 OK paths)

**And** apps/api `proxyToSandbox` intercepts that header after `await fetch()` returns:
1. Check circuit breaker `Map<sandboxId, { failedAt, retryCount }>` — if same sandbox failed reconcile within last 30s OR retried 3+ times in current request lifetime, **fall through with original response** (no retry, avoid amplification)
2. Otherwise: call existing `readContainerBootstrapKey()` ([local-preview.ts:115](apps/api/src/sandbox-proxy/routes/local-preview.ts#L115)) → if container token differs from DB serviceKey → call existing `updateSandboxServiceKeyInDb(containerKey)` ([local-preview.ts:146](apps/api/src/sandbox-proxy/routes/local-preview.ts#L146)) + `invalidateProviderCache(externalId)` ([local-preview.ts:155](apps/api/src/sandbox-proxy/routes/local-preview.ts#L155)) + call `syncInternalServiceKeyToEnvFile(containerKey)` from AC4
3. **Re-sign the user-context header with the refreshed key** (call `buildSignedUserContextHeader` again — needs to be exposed from sandbox-proxy/index.ts as a helper)
4. **Retry the upstream fetch ONCE** with the new signed header
5. If retry succeeds with no drift header in response → return retry response
6. If retry STILL returns drift header → trip circuit breaker (mark failedAt=now), return retry response as-is (caller sees anonymous context but at least we tried)

**And** log `[reconcile] sandbox={id} drift detected; DB={A_prefix} → container={B_prefix}; retried successfully` at INFO level

**And** if reconcile read returns null (container unreachable) or container key matches DB (no actual drift — false alarm from expired/malformed token), skip retry and return original response

**Circuit breaker rules:**
- 30s cool-off per sandbox (if reconcile fails, don't retry for that sandbox for 30s — prevent storm)
- Max 1 retry per request (no nested retry)
- Reset cool-off on any successful verification (clear `failedAt`)

**Performance budget**: Drift event adds 1× docker exec (~300ms) + 1× DB update (~50ms) + 1× fetch retry (sandbox internal, ~100ms) = ~450ms worst case. Steady state (no drift): 0ms overhead, just header check.

### AC3 — Atomic provision (no half-provisioned sandboxes)

**Given** [`provisionSandboxFromCheckout`](apps/api/src/platform/services/sandbox-provisioner.ts#L32) currently writes the token in 3 separate steps with NO rollback:
1. `db.update(sandboxes).set({ config: { serviceKey: sandboxKey.secretKey }})` (line 86-88)
2. `pool.injectEnv(claimed, sandboxKey.secretKey)` (line 90) — writes to container env
3. In-process cache is implicitly updated when next request reads DB

**When** Story 5.0.2 ships

**Then** wrap the 3-step sequence in `db.transaction(async (tx) => {...})` where the `pool.injectEnv` call is inside the transaction and any throw causes the DB update to roll back

**And** if `pool.injectEnv` fails, update sandbox row to `status='error'` with `metadata.error = 'token_provision_partial: pool inject failed'` BEFORE re-throwing — operator can see the failure in admin UI

**And** Pool `releasePoolSandbox` (or equivalent) is called to return the claimed pool slot back to the pool (avoid leaking pool capacity on partial failure)

**And** unit test in `apps/api/src/__tests__/unit/sandbox-provisioner-atomic.test.ts` verifies: mock `pool.injectEnv` to throw → expect (a) DB row exists with `status='error'`, (b) `metadata.error` contains `token_provision_partial`, (c) pool sandbox returned to available state

**Note**: This AC only covers pool-claim path (lines 55-94 of provisioner). Fallback `createSandbox` path (line 111+) has its own token write flow — flag as defer if scope balloons.

### AC4 — Local-dev .env sync (close last loop)

**Given** existing 401 retry hook at [local-preview.ts:299-321](apps/api/src/sandbox-proxy/routes/local-preview.ts#L299) reads container bootstrap on Bearer token failure, then calls `updateSandboxServiceKeyInDb()` to sync DB ← container
**But** does NOT push the corrected key into `apps/api/.env INTERNAL_SERVICE_KEY` — so after the next `bun run dev` restart, drift returns immediately

**When** Story 5.0.2 ships

**Then** after a successful 401 retry sync, in addition to `updateSandboxServiceKeyInDb`, call a new helper `syncInternalServiceKeyToEnvFile(containerKey)` that:
- Reads `apps/api/.env`
- Replaces the `INTERNAL_SERVICE_KEY=...` line (or appends if missing)
- Writes atomically (write to `.env.tmp` → `rename`)
- Logs `[reconcile] .env INTERNAL_SERVICE_KEY synced to {prefix}; restart backend to fully apply`

**And** this filesystem write is GATED by `config.isLocal() === true` — in `ENV_MODE=cloud`, secrets manager owns the key; throwing into `.env` would corrupt deployment config

**And** the new helper lives in [apps/api/src/sandbox-proxy/routes/local-preview.ts](apps/api/src/sandbox-proxy/routes/local-preview.ts) (parity with existing `updateSandboxServiceKeyInDb`)

**And** unit test verifies: write idempotency (same key twice → second write is no-op), cloud mode skip (set `ENV_MODE=cloud` → no fs write), atomic rename semantics

### AC5 — Tests

- **Unit (apps/api)**:
  - `apps/api/src/__tests__/unit/sandbox-provisioner-atomic.test.ts` (AC3) — partial-fail rollback
  - `apps/api/src/__tests__/unit/internal-service-key-env-sync.test.ts` (AC4) — fs write idempotent + cloud guard
- **Unit (core/epsilon-master)**:
  - `core/epsilon-master/src/services/__tests__/epsilon-user-middleware.test.ts` (AC1+AC2) — Sentry capture on bad_signature, `X-Epsilon-Token-Drift` response header set, debouncer prevents duplicate alerts
- **Integration (apps/api)**:
  - `apps/api/src/__tests__/integration/token-drift-reconcile.test.ts` — mock 401 response with `X-Epsilon-Token-Drift` header → verify `readContainerBootstrapKey` + DB update + cache invalidate chain
- **Manual smoke test** (run after deploy, documented in PR):
  - `docker exec epsilon-sandbox sh -c "echo bogus > /run/s6/container_environment/EPSILON_TOKEN"` → trigger any UI request → confirm Sentry alert fires + next request auto-recovers within ~2 turns
- **E2E (Playwright)** — DEFERRED to [Story 5.0.4](_bmad-output/planning-artifacts/epics.md) (chaos test suite). Do NOT block 5.0.2 ship on E2E.

## Tasks / Subtasks

- [x] **Task 1: Sentry alert wiring** (AC1)
  - [x] 1.1 Add `import { Sentry } from '../lib/sentry'` to [epsilon-user-middleware.ts:17](core/epsilon-master/src/services/epsilon-user-middleware.ts#L17) — NOTE: `core/epsilon-master` doesn't currently depend on apps/api's `lib/sentry.ts`. Either (a) copy minimal `captureMessage` shim into `core/epsilon-master/src/lib/sentry.ts`, or (b) use `@sentry/bun` directly (preferred — same SDK, simpler import).
  - [x] 1.2 Add module-scope `Map<sandboxId, lastAlertAt>` debouncer (5-min window)
  - [x] 1.3 In the `if (!result.ok)` branch ([line 50-55](core/epsilon-master/src/services/epsilon-user-middleware.ts#L50)), after the WARN log, check debouncer; if window expired, call `Sentry.captureMessage('sandbox.token.bad_signature', { level: 'warning', extra: { sandboxId, path: c.req.path, method: c.req.method, tokenPrefix: raw?.slice(0, 16), expectedPrefix: secret?.slice(0, 16) } })`
  - [x] 1.4 Add tag `event_kind=token_drift` so Sentry rules can route to ops channel

- [x] **Task 2: Add `X-Epsilon-Token-Drift` response header on signature failure** (AC2 — epsilon-master side)
  - [x] 2.1 In [epsilon-user-middleware.ts:50-55](core/epsilon-master/src/services/epsilon-user-middleware.ts#L50), instead of silent `await next(); return`, set `c.header('X-Epsilon-Token-Drift', `${result.reason}; sandbox=${process.env.SANDBOX_ID ?? 'unknown'}`)` THEN `await next()`
  - [x] 2.2 Verify Hono propagates response headers through proxy chain (epsilon-master → apps/api). If not, add to `proxyToSandbox` STRIP_RESPONSE_HEADERS exception list.
  - [x] 2.3 Test: send request with bad signature, assert response carries header

- [x] **Task 3: apps/api intercepts drift header + auto-reconcile + sync retry** (AC2 — apps/api side)
  - [x] 3.1 Export `buildSignedUserContextHeader` from [sandbox-proxy/index.ts](apps/api/src/sandbox-proxy/index.ts) (currently internal) so `local-preview.ts` can call it on retry
  - [x] 3.2 Add module-scope `Map<sandboxId, { failedAt: number; retriedInRequest?: boolean }>` circuit breaker (30s cool-off)
  - [x] 3.3 In [local-preview.ts proxyToSandbox](apps/api/src/sandbox-proxy/routes/local-preview.ts#L203), after `await fetch()` returns response, check `response.headers.get('X-Epsilon-Token-Drift')`
  - [x] 3.4 If header present AND circuit breaker not tripped:
    - Call `readContainerBootstrapKey()` synchronously
    - If `containerKey === serviceKey` → false alarm (token corruption not drift), no retry, return original response
    - Else: call `updateSandboxServiceKeyInDb(containerKey)` + `invalidateProviderCache(externalId)` + `syncInternalServiceKeyToEnvFile(containerKey)` (gated `config.isLocal()`)
    - Re-sign user-context header via exported `buildSignedUserContextHeader(sandboxId, userId, containerKey)`
    - Retry upstream `fetch()` ONCE with new header — same body, same controller pattern as the existing 401 retry block ([line 305-315](apps/api/src/sandbox-proxy/routes/local-preview.ts#L305))
    - Log `[reconcile] sandbox={id} drift resolved (DB prefix={A} → container prefix={B}); retry status={N}` at INFO
    - Return retry response
  - [x] 3.5 If retry response ALSO has drift header → mark circuit breaker tripped (`failedAt = Date.now()`), return retry response as-is (don't retry again)
  - [x] 3.6 Circuit breaker reset: any successful request (no drift header) clears `failedAt` for that sandbox
  - [x] 3.7 Body re-streaming gotcha: original `incomingBody: ArrayBuffer` is consumed once. Verify retry can re-use the same `ArrayBuffer` (Bun's `fetch` allows it — same pattern as existing 401 retry at [line 310](apps/api/src/sandbox-proxy/routes/local-preview.ts#L310))

- [x] **Task 4: Atomic provision (AC3)**
  - [x] 4.1 Refactor pool-claim block in [sandbox-provisioner.ts:55-94](apps/api/src/platform/services/sandbox-provisioner.ts#L55) to wrap in `await db.transaction(async (tx) => {...})`
  - [x] 4.2 Inside transaction, replace `db.insert/update` calls with `tx.insert/update`
  - [x] 4.3 If `pool.injectEnv` throws inside transaction, catch → update sandbox row `status='error'` + `metadata.error='token_provision_partial: ' + err.message` using same `tx` → call `pool.releaseClaim(claimed)` (look up exact pool API) → re-throw
  - [x] 4.4 Outside-transaction outer try also calls pool cleanup if entire transaction rolls back (defensive)
  - [x] 4.5 Unit test `sandbox-provisioner-atomic.test.ts`

- [x] **Task 5: .env file sync helper (AC4)**
  - [x] 5.1 Add `syncInternalServiceKeyToEnvFile(newKey: string)` helper to [local-preview.ts](apps/api/src/sandbox-proxy/routes/local-preview.ts) (parity with `updateSandboxServiceKeyInDb`)
  - [x] 5.2 Implementation: `if (!config.isLocal()) return`; read `apps/api/.env`; regex-replace `^INTERNAL_SERVICE_KEY=.*$` (or append); atomic `writeFile(.env.tmp)` + `rename(.env.tmp, .env)`
  - [x] 5.3 Call from the 401 retry success path ([line 320](apps/api/src/sandbox-proxy/routes/local-preview.ts#L320), after `updateSandboxServiceKeyInDb`)
  - [x] 5.4 Also call from the new drift-reconcile path (Task 3.2 success branch)
  - [x] 5.5 Unit test `internal-service-key-env-sync.test.ts`

- [x] **Task 6: Documentation + verification**
  - [x] 6.1 Update [CLAUDE.md troubleshooting section](CLAUDE.md) — replace the manual `docker exec` instructions with "automatic — check Sentry for `sandbox.token.bad_signature` events; reconcile runs on next request"
  - [x] 6.2 Add Grafana/Logtail panel query for `sandbox_token_drift_per_hour` to operator runbook (link in PR description)
  - [x] 6.3 Manual smoke test in PR: `docker exec epsilon-sandbox sh -c "echo bogus > /run/s6/container_environment/EPSILON_TOKEN"` → confirm Sentry alert + auto-recovery within 2 requests
  - [x] 6.4 PR title: `fix(infra): sandbox token drift auto-reconcile (Story 5.0.2 P0)`

## Dev Notes

### Critical brownfield guardrails

- **DO NOT** refactor `bootstrap-env.ts` to stop mutation — that's Story 5.0.3 scope. This story works WITH existing mutation by reconciling reactively.
- **DO NOT** create new token rotation infrastructure — use existing `readContainerBootstrapKey` + `updateSandboxServiceKeyInDb` + `invalidateProviderCache` that already exist.
- **DO NOT** import apps/api code from `core/epsilon-master/` (separate process, separate package). Cross-process communication = HTTP response header (AC2) or a future internal HTTP endpoint (Story 5.0.3).
- **DO** sync retry the original request after reconcile (AC2 revised) — but ONLY ONCE per request, and gated by 30s per-sandbox circuit breaker to prevent storms under sustained drift. The reason for sync retry over async fire-and-forget: `POST /session` is the canary — losing user context on that request creates a permanent empty `session_owners` row.
- **DO NOT** mutate `apps/api/.env` in production (`ENV_MODE=cloud`) — gated explicitly via `config.isLocal()`.

### Existing helpers TO REUSE (NOT reinvent)

| Helper | Location | Use for |
|---|---|---|
| `readContainerBootstrapKey()` | [local-preview.ts:115](apps/api/src/sandbox-proxy/routes/local-preview.ts#L115) | Task 3 — read container truth |
| `updateSandboxServiceKeyInDb(newKey)` | [local-preview.ts:146](apps/api/src/sandbox-proxy/routes/local-preview.ts#L146) | Task 3 — push to DB |
| `invalidateProviderCache(externalId)` | imported from `..` in local-preview.ts | Task 3 — clear cache |
| `trySyncServiceKey(serviceKey)` | [local-preview.ts:78](apps/api/src/sandbox-proxy/routes/local-preview.ts#L78) | Already used in 401 path; can be used as fallback if reconcile-via-header doesn't reach container |
| `captureException(err, ctx)` + `captureMessage` | [apps/api/src/lib/sentry.ts:85](apps/api/src/lib/sentry.ts#L85) | Pattern reference for Task 1 (epsilon-master needs its own minimal wrapper) |
| `Sentry.withScope` | [apps/api/src/lib/sentry.ts:88](apps/api/src/lib/sentry.ts#L88) | Pattern to attach `sandboxId` tag for filtering |
| `config.isLocal()` | [apps/api/src/config.ts:795](apps/api/src/config.ts#L795) | Task 5 — gate .env write |
| `db.transaction()` | Drizzle ORM stdlib | Task 4 — atomic provision |

### Files this story will UPDATE (read each fully before editing)

| Path | What changes | What MUST be preserved |
|---|---|---|
| [core/epsilon-master/src/services/epsilon-user-middleware.ts](core/epsilon-master/src/services/epsilon-user-middleware.ts) | Add Sentry capture + `X-Epsilon-Token-Drift` response header on `bad_signature` | Silent-fallback-to-anonymous semantics MUST be preserved — service-to-service traffic without user context must continue working. Only ADD instrumentation, don't change the `await next()` path. |
| [apps/api/src/sandbox-proxy/routes/local-preview.ts](apps/api/src/sandbox-proxy/routes/local-preview.ts) | Add drift header interceptor + `syncInternalServiceKeyToEnvFile` helper + call from 401 retry path | Existing 401 retry semantics (3 attempts cap, attempt counter reset on key rotation) MUST be preserved. New code is ADDITIVE. |
| [apps/api/src/platform/services/sandbox-provisioner.ts](apps/api/src/platform/services/sandbox-provisioner.ts) | Wrap pool-claim block in `db.transaction`; add rollback on `pool.injectEnv` failure | Subscription idempotency (`provisioningSubscriptions` Set), pool claim semantics, and `findBySubscription` short-circuit must all continue working. |

### Files this story will CREATE

```
core/epsilon-master/src/lib/sentry.ts            (NEW — minimal Sentry wrapper, mirror of apps/api shape)
apps/api/src/__tests__/unit/sandbox-provisioner-atomic.test.ts            (NEW)
apps/api/src/__tests__/unit/internal-service-key-env-sync.test.ts         (NEW)
apps/api/src/__tests__/integration/token-drift-reconcile.test.ts          (NEW)
core/epsilon-master/src/services/__tests__/epsilon-user-middleware.test.ts (NEW)
```

### Previous story intelligence

- **Story 5.0**: Established sandbox + sandbox token concept ([sandbox-provisioner.ts](apps/api/src/platform/services/sandbox-provisioner.ts) is from 5.0). Token generation via `createApiKey` ([line 78-83](apps/api/src/platform/services/sandbox-provisioner.ts#L78)). That repository helper hashes with `hashSecretKey(secret)` using HMAC-SHA256 keyed by `config.API_KEY_SECRET` — verify your test mocks don't bypass this.
- **Story 5.0.1**: Pattern for `*hotfix*` stories — short scope, narrowly focused on infra debt. Use same `*(hotfix)*` tag in epics + PR. Don't expand scope to refactor.
- **Story 5.8 (recent learning)**: 22 patches applied 2026-05-18 including F3 (resolveAccountIdFromUserId owner filter), F4 (verifyUserBelongsToAccount ENV_MODE guard). The IDOR fix means downstream code now correctly drops requests when token is anonymous → drift symptom becomes user-visible (memory empty) NOT silent corruption. This story restores upstream correctness so downstream behaves as designed.

### Project context reference

From [_bmad-output/project-context.md](_bmad-output/project-context.md):
- TypeScript strict, no `any` — exception only for Drizzle `$type<>` workarounds
- Bun runtime (not Node); use `Bun.write` for atomic file writes if needed
- Service-layer parity: helpers in `apps/api/src/router/services/{name}.ts` OR (for proxy-specific) [apps/api/src/sandbox-proxy/routes/local-preview.ts](apps/api/src/sandbox-proxy/routes/local-preview.ts)
- Validation Zod with `.catch(() => null)` for malformed bodies → 400
- Never log secrets — token PREFIXES (16 chars) only, never full token

From [CLAUDE.md](CLAUDE.md):
- Backend port 8008, `/v1/` prefix
- Pre-commit hooks: NEVER `--no-verify`
- Bug fix: do NOT refactor surrounding code

### Sentry usage pattern (apps/api reference)

[lib/sentry.ts:85](apps/api/src/lib/sentry.ts#L85) `captureException` pattern. For `epsilon-master`, replicate this minimal API:

```ts
// core/epsilon-master/src/lib/sentry.ts (NEW)
import * as Sentry from '@sentry/bun';
const DSN = process.env.SENTRY_DSN;
if (DSN) Sentry.init({ dsn: DSN, environment: process.env.ENV_MODE ?? 'unknown' });

export function captureMessage(
  message: string,
  level: 'info' | 'warning' | 'error',
  context?: Record<string, unknown>
): void {
  if (!DSN) return;
  Sentry.withScope((scope) => {
    if (context) for (const [k, v] of Object.entries(context)) scope.setExtra(k, v);
    scope.setLevel(level);
    Sentry.captureMessage(message);
  });
}
```

### Testing pattern (mock Bun fetch + docker exec)

For Task 3 integration test, mock the upstream `fetch` response with `X-Epsilon-Token-Drift` header set:

```ts
const realFetch = globalThis.fetch;
globalThis.fetch = (async () => new Response('', {
  status: 200,
  headers: { 'X-Epsilon-Token-Drift': 'bad_signature; sandbox=epsilon-sandbox' },
})) as any;
```

For `readContainerBootstrapKey` test, mock `execSync` to return a JSON payload (see [token-terminal-service.test.ts](apps/api/src/__tests__/unit/token-terminal-service.test.ts) for shape of bun-test mock patterns).

### MCP Trio verification (per CLAUDE.md)

Before starting implementation, dev MUST:
1. `mcp__serena__activate_project` with path `/Users/luisphan/Documents/suna`
2. `mcp__symdex__search_codebase` for `"sandbox token reconcile"` to verify no hidden reconcile path already exists
3. `mcp__code-review-graph__get_impact_radius_tool` on `local-preview.ts` + `epsilon-user-middleware.ts` to scope blast radius

### Latest technical info (verified 2026-05-18)

- `@sentry/bun` SDK already pulled in apps/api's package.json — verify epsilon-master can use same version
- Drizzle `db.transaction` is async + supports rollback on throw (verified pattern in [memory-conflict.ts:31](apps/api/src/router/services/memory-conflict.ts#L31) from Story 5.8 v2.2)
- Hono response headers DO propagate through proxy chain by default (verified [local-preview.ts:280-282](apps/api/src/sandbox-proxy/routes/local-preview.ts#L280) — `sanitizeResponseHeaders` only strips hop-by-hop, custom `X-*` passes through)
- Atomic file rename works on Bun via `Bun.write` → `rename` (POSIX guarantee on same filesystem)

### References

- [Source: _bmad-output/planning-artifacts/architecture-notes-token-sync-2026-05-18.md](../planning-artifacts/architecture-notes-token-sync-2026-05-18.md) — Winston root cause + design
- [Source: _bmad-output/planning-artifacts/epics.md#Story-5.0.2] (epic source)
- [Source: apps/api/src/sandbox-proxy/index.ts#L32](apps/api/src/sandbox-proxy/index.ts#L32) — signing path
- [Source: apps/api/src/sandbox-proxy/routes/local-preview.ts#L299](apps/api/src/sandbox-proxy/routes/local-preview.ts#L299) — existing 401 retry hook
- [Source: core/epsilon-master/src/services/epsilon-user-middleware.ts#L49](core/epsilon-master/src/services/epsilon-user-middleware.ts#L49) — verify path
- [Source: core/epsilon-master/src/services/bootstrap-env.ts#L40](core/epsilon-master/src/services/bootstrap-env.ts#L40) — bootstrap mutation point (DO NOT TOUCH in 5.0.2)
- [Source: core/epsilon-master/src/config.ts#L66](core/epsilon-master/src/config.ts#L66) — runtime token resolution
- [Source: apps/api/src/platform/services/sandbox-provisioner.ts#L32](apps/api/src/platform/services/sandbox-provisioner.ts#L32) — provision flow
- [Source: apps/api/src/lib/sentry.ts#L85](apps/api/src/lib/sentry.ts#L85) — Sentry pattern to mirror

## Review Findings (2026-05-18 — /bmad-code-review)

3-layer adversarial review (Blind Hunter + Edge Case Hunter + Acceptance Auditor). 8 patches, 6 decision-needed, 6 deferred, 5 dismissed.

### Decision-needed (all resolved)

- [x] [Review][Decision→Applied] D1 — Refactored `createApiKey` in [api-keys.ts](apps/api/src/repositories/api-keys.ts) to accept optional `tx` param; provisioner now passes `tx` so api_keys insert participates in the same atomic boundary. Also fixes DF3 (deadlock risk under small Postgres pool).
- [x] [Review][Decision→Deferred + Documented] D2 — JustAVPS drift coverage deferred. Gate `!baseUrlOverride` in [local-preview.ts:387](apps/api/src/sandbox-proxy/routes/local-preview.ts#L387) is intentional + now documented (test 3 asserts the gate so future changes don't silently extend it). Follow-up: Story 5.0.3 (DB-canonical) will redesign the cloud-sandbox auth path.
- [x] [Review][Decision→Applied] D3 — Parameterized `updateSandboxServiceKeyInDb(newKey, externalId?)` and `reconcileSandboxToken` now passes `sandboxId`. Multi-sandbox safe; falls back to `config.SANDBOX_CONTAINER_NAME` when externalId omitted.
- [x] [Review][Decision→Deferred + Structured Log] D4 — Sentry SDK NOT added to epsilon-master (would pull `@sentry/bun` dep). Canonical alerting path = structured `console.warn(JSON.stringify({event: 'sandbox.token.<reason>', event_kind: 'token_drift', ...}))` parsed by Logtail/Loki alert rule. Test 4 asserts the contract.
- [x] [Review][Decision→Applied] D5 — `EPSILON_DRIFT_ALERTS_ENABLED` env gate added to `shouldEmitAlert`. Default ON in production; set `=0` in CI / test envs to silence fixture-replay noise. Test 4 verifies all three states (default ON, explicit ON, explicit OFF).
- [x] [Review][Decision→Applied] D6 — All 4 spec-required test files written (~600 LOC):
  - [apps/api/src/__tests__/unit/sandbox-provisioner-atomic.test.ts](apps/api/src/__tests__/unit/sandbox-provisioner-atomic.test.ts) — 11 tests
  - [apps/api/src/__tests__/unit/internal-service-key-env-sync.test.ts](apps/api/src/__tests__/unit/internal-service-key-env-sync.test.ts) — 5 tests
  - [apps/api/src/__tests__/unit/token-drift-reconcile.test.ts](apps/api/src/__tests__/unit/token-drift-reconcile.test.ts) — 8 tests
  - [core/epsilon-master/tests/unit/epsilon-user-middleware.test.ts](core/epsilon-master/tests/unit/epsilon-user-middleware.test.ts) — 10 tests
  - Total: 34 tests pass. Tests 1-3 use source-inspection pattern (contract assertions on implementation source) to avoid the deep config/pool/db mock chain; test 4 exercises the middleware in-process with stubbed Hono ctx.

### Patches (applied)

- [x] [Review][Patch→Applied] P1 — Restructured error handling: `innerProvisionFailed` flag hoisted to outer try scope; outer `catch (err)` re-throws when set instead of falling through to `createSandbox`. [sandbox-provisioner.ts:55-180](apps/api/src/platform/services/sandbox-provisioner.ts#L55).
- [x] [Review][Patch→Applied] P2 — `reconcileSandboxToken` → `syncInternalServiceKeyToEnvFile` now sets `process.env.INTERNAL_SERVICE_KEY = newKey` in-process so next request sees the corrected key, no restart loop. [local-preview.ts:217](apps/api/src/sandbox-proxy/routes/local-preview.ts#L217).
- [x] [Review][Patch→Applied] P3 — `.env` sync rewritten with async `fs/promises`, crypto-random tmp suffix, quoted value `INTERNAL_SERVICE_KEY="${newKey}"`, EXDEV fallback to copyFile. [local-preview.ts:175-225](apps/api/src/sandbox-proxy/routes/local-preview.ts#L175).
- [x] [Review][Patch→Applied] P4 — `secretPrefix` field removed from structured alert payload. Test 4 asserts secret prefix never appears in captured logs. [epsilon-user-middleware.ts:80](core/epsilon-master/src/services/epsilon-user-middleware.ts#L80).
- [x] [Review][Patch→Applied] P5 — `x-epsilon-token-drift` added to `STRIP_RESPONSE_HEADERS`. Internal drift signal never reaches browser clients. [local-preview.ts:276](apps/api/src/sandbox-proxy/routes/local-preview.ts#L276).
- [x] [Review][Patch→Applied] P6 — Outer catch guard via `innerProvisionFailed` flag prevents double-`provider.remove()` after inner `destroyOne`. Bundled with P1. [sandbox-provisioner.ts:165-180](apps/api/src/platform/services/sandbox-provisioner.ts#L165).
- [x] [Review][Patch→Applied] P7 — Distinct event slug per reason: `event: \`sandbox.token.${result.reason}\``. Dashboard categorization works. [epsilon-user-middleware.ts:95](core/epsilon-master/src/services/epsilon-user-middleware.ts#L95).
- [x] [Review][Patch→Applied] P8 — CLAUDE.md Troubleshooting restructured: auto-reconcile note is primary path, manual `docker exec` steps collapsed under `<details>`. [CLAUDE.md:111-130](CLAUDE.md#L111).
- [x] [Review][Patch→Applied] P9 — `createApiKey` accepts optional `tx: DbOrTx`; provisioner passes `tx` so api_keys insert is atomic with sandbox row (closes D1). [api-keys.ts:61-105](apps/api/src/repositories/api-keys.ts#L61).
- [x] [Review][Patch→Applied] P10 — `updateSandboxServiceKeyInDb(newKey, externalId?)` parameterized on externalId. Reconcile passes sandboxId (closes D3). [local-preview.ts:150-170](apps/api/src/sandbox-proxy/routes/local-preview.ts#L150).
- [x] [Review][Patch→Applied] P11 — `EPSILON_DRIFT_ALERTS_ENABLED` env gate in `shouldEmitAlert` (closes D5). Default ON; set `=0` in CI / test to silence fixture-replay alerts. [epsilon-user-middleware.ts:43-52](core/epsilon-master/src/services/epsilon-user-middleware.ts#L43).

### Deferred (pre-existing or edge-case)

- [x] [Review][Defer] DF1 — `RECENT_ALERTS` map unbounded under sustained attack >256 distinct sandbox IDs (MED). Bound 512 LRU. Single-process Bun deployment + debounce makes this narrow.
- [x] [Review][Defer] DF2 — Dynamic `import('..')` for `buildSignedUserContextHeader` not guaranteed to resolve module fn on cold start with circular dep (MED). Verify with manual smoke; if working, document why dynamic import was chosen.
- [x] [Review][Defer] DF3 — Drizzle tx + `createApiKey` may deadlock on Supabase free-tier `pool_size=5` under burst (MED). Same root cause as D1 — defer with D1.
- [x] [Review][Defer] DF4 — Provider dynamic `import('../providers')` in error handler may throw under `bun --hot` reload mid-flight (MED).
- [x] [Review][Defer] DF5 — Concurrent reconcile narrow stale-key race overwrite (LOW).
- [x] [Review][Defer] DF6 — `.env` sync silently skipped when `ENV_MODE=staging` + local Docker hybrid setup (LOW). Document.

### Dismissed (noise / false positive)

- DM1 — "incomingBody stream consumed on retry" → FALSE POSITIVE: `incomingBody: ArrayBuffer | undefined` is buffered, can be reused.
- DM2 — Alert prune loop race condition → math doesn't actually cause double-emit (newly inserted entry has `v = now`, cutoff is `now - ALERT_DEBOUNCE_MS`).
- DM3 — Error marker row unique constraint collision → handled (`catch (markErr)` logs and continues).
- DM4 — `invalidateProviderCache` only transitively called inside `updateSandboxServiceKeyInDb` → functionally correct, doc-only.
- DM5 — Grafana panel query missing → out-of-diff PR description item.

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List
