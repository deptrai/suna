# Story 5.0.3: Sandbox Token Lifecycle — DB-Canonical Migration

Status: in-progress

**Epic:** 5 — Backtesting Sandbox
**Type:** P1 architectural migration (deferred from 5.0.2 hotfix)
**Created:** 2026-05-18 (architect note 2026-05-18, hybrid Option A+C)
**Depends on:** Story 5.0.2 done (reconcile auto-heal in place — safe to migrate canonical source)
**Blocks:** Future cloud-scale (>10 sandboxes per tenant), Story 5.7 BYOK key derivation, SOC2 audit trail completeness
**FRs:** N/A. **NFRs:** NFR8, NFR10. **ARs:** AR1, AR3, AR8.
**Estimated effort:** 3 days. **Owner:** Bao + Luisphan code review.

## Story

As a Chainlens platform operator,
I want `epsilon.sandboxes.config.serviceKey` to be the single source of truth for sandbox tokens (with `.env` static fallback only for local dev),
so that future rotation, multi-sandbox provisioning, and BYOK encryption derivation have a predictable invariant.

## Context

**Why this story exists**: Story 5.0.2 stops the bleed reactively (auto-reconcile on drift), but the root cause — `bootstrap-env.json` mutation in container ([bootstrap-env.ts:94-112](core/epsilon-master/src/services/bootstrap-env.ts#L94)) — still exists. As long as sandbox can independently mutate its own token storage, drift WILL recur after every restart. 5.0.3 eliminates the mutation paths.

**Decision** (per [architect note 2026-05-18](../planning-artifacts/architecture-notes-token-sync-2026-05-18.md)): hybrid **Option A** (cloud) + **Option C** (local dev):

| Environment | Canonical source | Sandbox role |
|---|---|---|
| Cloud (Daytona, JustAVPS) | DB `epsilon.sandboxes.config.serviceKey` | Pull on boot via `GET /v1/internal/bootstrap-token` |
| Local dev (`epsilon-sandbox`) | Host `apps/api/.env INTERNAL_SERVICE_KEY` | Bind-mount as read-only file |

Sandbox never mutates the key in either case. Bootstrap file becomes a **read-only mirror** (NOT a write target). `saveBootstrapEnv()` is removed.

## Acceptance Criteria

### AC1 — Cloud sandbox: DB-canonical pull on boot

> **Cross-ref**: this AC requires `PROVISIONING_KEY` schema + injection from **AC5** — ship both together in same PR (audit L4). The bootstrap pull endpoint is unusable until `provisioningKey` is generated + hashed + injected at provision time.

**Given** a cloud sandbox (Daytona/JustAVPS) boots fresh
**And** apps/api has provisioned the sandbox with `serviceKey` written to DB (per AC3 of [Story 5.0.2](5-0-2-sandbox-token-sync-reliability.md))
**And** sandbox container has `PROVISIONING_KEY` env (a short-lived per-sandbox bootstrap credential injected at provision time, distinct from `serviceKey`)

**When** epsilon-master starts inside container

**Then** boot script (NEW: `core/epsilon-master/scripts/bootstrap-token.sh` or inline in `src/index.ts` before `loadBootstrapEnv()`) calls:
```
GET ${EPSILON_API_URL}/v1/internal/bootstrap-token?sandboxId=${SANDBOX_ID}
Authorization: Bearer ${PROVISIONING_KEY}
```

**And** apps/api's new route `apps/api/src/router/routes/internal-bootstrap.ts` validates:
- `PROVISIONING_KEY` matches `sandboxes.config.provisioningKey` for the given `sandboxId` (separate column from `serviceKey`)
- Request comes from internal network (Docker DNS resolves to known sandbox IP) OR cloud-provider IP allowlist
- Returns `{ serviceKey: <canonical from DB>, expiresAt: <iat + 24h> }` over HTTPS

**And** sandbox writes returned `serviceKey` to:
- `process.env.EPSILON_TOKEN` (in-memory)
- `process.env.INTERNAL_SERVICE_KEY` (alias)
- `/run/s6/container_environment/EPSILON_TOKEN` (s6 env file — for child processes)
- `/workspace/.persistent-system/secrets/.bootstrap-env.json` (as a **read-only mirror cache** — for offline recovery if DB temporarily unreachable on next restart)

**And** new helper `loadCanonicalToken()` replaces `loadBootstrapEnv()`:
- ALWAYS hits the internal API first (cloud mode)
- Falls back to bootstrap mirror file only if API returns 5xx (DB offline) — log WARN
- NEVER mutates DB (deprecated `saveBootstrapEnv` calls removed)

**And** old `saveBootstrapEnv()` and `updateBootstrapKey()` from [bootstrap-env.ts](core/epsilon-master/src/services/bootstrap-env.ts) are deleted; any caller is migrated to new pull-based flow

### AC2 — Local dev: static `.env` mount

**Given** local dev `epsilon-sandbox` container
**And** developer runs `docker compose up` from `scripts/compose/`

**When** Story 5.0.3 ships

**Then** [scripts/compose/docker-compose.yml](scripts/compose/docker-compose.yml) is updated:
- Bind-mount `apps/api/.env`-derived secret file (e.g. `/tmp/epsilon-sandbox-token` written by a pre-up hook script) into container at `/run/s6/container_environment/EPSILON_TOKEN` as `:ro`
- OR (cleaner): mount a dedicated single-line secret file `./secrets/sandbox-token.txt` (gitignored, generated from `.env` by a `make sandbox-token` target)

**And** container's epsilon-master detects local mode (`ENV_MODE=local`), skips the cloud bootstrap-token API call, uses the bind-mounted file directly

**And** rotation requires:
1. Edit `apps/api/.env INTERNAL_SERVICE_KEY`
2. Run `make sandbox-token` (regenerates `./secrets/sandbox-token.txt`)
3. `docker compose restart epsilon-sandbox`

**And** [CLAUDE.md troubleshooting section](CLAUDE.md) is updated with the new rotation flow (replace existing `docker exec ... bootstrap-env.json` instructions)

**And** if `.env INTERNAL_SERVICE_KEY` is changed without regenerating secret file → next `docker compose up` boot fails fast with `[bootstrap] INTERNAL_SERVICE_KEY .env mismatch — run 'make sandbox-token'` (don't let drift sneak in via stale file)

### AC3 — Drift reconciler cron

**Given** apps/api runs a recurring job (1-min interval, BullMQ or simple `setInterval`)
**And** the cron iterates over all active sandboxes from `epsilon.sandboxes WHERE status='active'`

**When** Story 5.0.3 ships

**Then** for each sandbox, reconciler queries 3 sources:
1. DB `sandboxes.config.serviceKey` (in-process read)
2. Container bootstrap mirror via `GET /env/INTERNAL_SERVICE_KEY` (existing route in [core/epsilon-master/src/routes/env.ts:194](core/epsilon-master/src/routes/env.ts#L194)) — pass through apps/api proxy with admin auth
3. (Optional) s6 env via `GET /env/EPSILON_TOKEN` — same endpoint

**And** computes pairwise diff. If any pair differs:
- Emit Prometheus counter `sandbox_token_drift_total{sandbox_id, source_pair}` (use existing `prom-client` if installed, else log INFO with structured fields)
- Emit Sentry breadcrumb (NOT alert — alert was AC1 in 5.0.2)
- In **cloud mode**: auto-heal by writing DB value into container via `PUT /env/INTERNAL_SERVICE_KEY` (existing route at [env.ts:264](core/epsilon-master/src/routes/env.ts#L264)) — bootstrap file mirror updates as side effect
- In **local mode**: log WARN, do NOT auto-heal (operator owns local rotation, see AC2)

**And** reconciler skips sandboxes in `status='provisioning'` or `status='error'` to avoid racing with 5.0.2's atomic provision flow

**And** cron is gated by feature flag `config.SANDBOX_TOKEN_DRIFT_RECONCILER_ENABLED` (default `true` in cloud, `false` in local — local dev sees alerts but no auto-heal)

### AC4 — Admin-API rotation with grace period

**Given** admin rotates a sandbox's `serviceKey` via existing admin route (or new route if not present)

**When** Story 5.0.3 ships

**Then** rotation writes new key to DB → triggers reconcile-now for that sandbox (writes to container immediately)

**And** apps/api emits internal event `sandbox.token.rotated` to in-memory pub/sub

**And** all open WebSocket / SSE connections from that sandbox receive a `re-auth` signal (sandbox plugin reconnects with new key from refreshed env)

**And** in-flight HTTP requests using the OLD key continue to verify successfully for a 30-second grace period (cache both old and new keys in `verifyEpsilonUserContext` with `acceptOldUntil` field)

**And** after grace period expires, old key returns `bad_signature` — caught by 5.0.2's auto-reconcile chain (no user-visible failure)

**And** rotation audit log entry includes: `rotated_by_user_id`, `sandbox_id`, `old_key_prefix`, `new_key_prefix`, `reason` (manual/scheduled/compromised)

### AC5 — `provisioningKey` separation

> **Storage decision (audit Q1, 2026-05-18)**: `provisioningKey` is hashed via existing `hashSecretKey` (HMAC-SHA256 keyed by `API_KEY_SECRET`) — parity with `secret_key_hash` in `epsilon.api_keys` table. **NOT** libsodium-encrypted (that's Story 5.7 user-key territory; provisioningKey is platform-owned, single-purpose, replaceable on re-provision).

**Given** Story 5.0.2's atomic provision generates `serviceKey` and writes to 3 targets (DB, container env, in-process cache)
**And** Story 5.0.3 introduces `PROVISIONING_KEY` as a SEPARATE short-lived bootstrap credential

**When** Story 5.0.3 ships

**Then** schema migration adds column `provisioningKey` (varchar(128) NOT NULL) to `epsilon.sandboxes.config` JSONB or as a top-level column on the table:
- Generated alongside `serviceKey` at provision time (HMAC-based with 24h TTL)
- Injected as `PROVISIONING_KEY` env var into container at provision (one-shot, never rotated)
- Used ONLY for the boot-time `GET /v1/internal/bootstrap-token` call
- After successful pull, sandbox can discard it (still kept in DB for re-bootstrap if container restarts mid-life)

**And** if a leaked `PROVISIONING_KEY` is detected (multiple bootstrap pulls in short window from unexpected IPs), apps/api invalidates it + forces re-provision

**And** rotation of `serviceKey` does NOT rotate `PROVISIONING_KEY` (they have different threat models)

### AC6 — Tests

**Unit (apps/api):**
- `apps/api/src/__tests__/unit/internal-bootstrap-route.test.ts` — token endpoint auth (valid vs invalid `PROVISIONING_KEY`)
- `apps/api/src/__tests__/unit/sandbox-drift-reconciler.test.ts` — pairwise diff detection + auto-heal cloud / no-op local
- `apps/api/src/__tests__/unit/sandbox-token-rotation.test.ts` — grace period acceptOldUntil

**Unit (core/epsilon-master):**
- `core/epsilon-master/src/services/__tests__/load-canonical-token.test.ts` — pull happy path, fallback to mirror on 5xx, NEVER mutates DB

**Integration:**
- `apps/api/src/__tests__/integration/cloud-sandbox-bootstrap.test.ts` — mock container boot → assert `GET /v1/internal/bootstrap-token` → assert sandbox env populated

**E2E (covered by Story 5.0.4 — DEFER, do not block 5.0.3 ship on these)**

## Tasks / Subtasks

- [x] **Task 1: Add `provisioningKey` to sandbox schema** (AC5)
  - [x] 1.1 Migration `0012_sandbox_provisioning_key.sql` — add column `provisioning_key varchar(128)` to `epsilon.sandboxes` (or nest under `config` JSONB if preferred). **Sequence note (audit 2026-05-18)**: 0010 is consumed by Story 5.6 TOFU ownership, 0011 by Story 5.8 memory pgvector; 0012 is genuinely next available.
  - [x] 1.2 Update [`packages/db/src/schema/epsilon.ts`](packages/db/src/schema/epsilon.ts) sandboxes table
  - [x] 1.3 Update [`apps/api/src/platform/services/sandbox-provisioner.ts:78`](apps/api/src/platform/services/sandbox-provisioner.ts#L78) — generate `PROVISIONING_KEY` (HMAC-based, distinct from `serviceKey`) at provision time, write to DB + inject as env var via `pool.injectEnv`

- [ ] **Task 2: Internal bootstrap-token API** (AC1)
  - [x] 2.1 New route `apps/api/src/router/routes/internal-bootstrap.ts` exposing `GET /v1/internal/bootstrap-token`
  - [x] 2.2 Auth: validate `Bearer ${PROVISIONING_KEY}` against `sandboxes.config.provisioningKey` for the queried sandboxId
  - [x] 2.3 IP allowlist: cloud provider CIDR ranges OR Docker DNS resolution check (lookup by container hostname)
  - [x] 2.4 Response: `{ serviceKey, expiresAt: now + 24h, sandboxId }`
  - [x] 2.5 Rate limit: max 10 bootstrap pulls / sandbox / hour (prevent abuse)
  - [x] 2.6 Audit log entry: `[bootstrap-token] sandbox=X requested from ip=Y`

- [x] **Task 3: Cloud sandbox boot pull** (AC1)
  - [x] 3.1 New helper `core/epsilon-master/src/services/load-canonical-token.ts` exporting `loadCanonicalToken(): Promise<{ source: 'api' | 'mirror' | 'env' }>`:
    - Read `process.env.PROVISIONING_KEY` + `EPSILON_API_URL` + `SANDBOX_ID`
    - If all present (cloud mode): call internal API
    - Else (local mode): read static `.env` mount from `/run/s6/container_environment/EPSILON_TOKEN` (AC2)
    - On API 5xx: fall back to mirror file `/workspace/.persistent-system/secrets/.bootstrap-env.json` (log WARN)
    - Write resolved key to: `process.env.EPSILON_TOKEN`, `process.env.INTERNAL_SERVICE_KEY`, s6 env file, mirror file (read-only)
  - [x] 3.2 Replace `loadBootstrapEnv()` calls in [`core/epsilon-master/src/index.ts:62`](core/epsilon-master/src/index.ts#L62) with `loadCanonicalToken()`
  - [x] 3.3 DELETE `saveBootstrapEnv()` and `updateBootstrapKey()` from [`core/epsilon-master/src/services/bootstrap-env.ts`](core/epsilon-master/src/services/bootstrap-env.ts) — verify NO remaining callers (grep + fix)
  - [x] 3.4 Update env routes in [`core/epsilon-master/src/routes/env.ts`](core/epsilon-master/src/routes/env.ts) — `POST /env/:key` and `PUT /env/:key` reject writes to `EPSILON_TOKEN`, `INTERNAL_SERVICE_KEY` (return 403 with `{ error: 'managed by canonical source — use admin rotation API' }`)

- [ ] **Task 4: Local-dev `.env` bind mount** (AC2)
  - [x] 4.1 Add `make sandbox-token` target to root `Makefile`: reads `apps/api/.env INTERNAL_SERVICE_KEY` → writes `./secrets/sandbox-token.txt`
  - [x] 4.2 Update [`scripts/compose/docker-compose.yml`](scripts/compose/docker-compose.yml) `epsilon-sandbox` service: add bind mount `./secrets/sandbox-token.txt:/run/s6/container_environment/EPSILON_TOKEN:ro`
  - [x] 4.3 Add `./secrets/` to root `.gitignore` (already present? verify)
  - [ ] 4.4 Boot check in `loadCanonicalToken()`: if local mode AND mount file missing → log clear error `[bootstrap] sandbox-token.txt missing — run 'make sandbox-token' on host`
  - [ ] 4.5 Update [CLAUDE.md troubleshooting](CLAUDE.md) section "Backend API Cannot connect" — replace `docker exec ... bootstrap-env.json` flow with `make sandbox-token` flow

- [x] **Task 5: Drift reconciler cron** (AC3)
  - [x] 5.1 New service `apps/api/src/platform/services/sandbox-drift-reconciler.ts`
  - [x] 5.2 Run every 60s via BullMQ recurring (preferred — restartable) OR `setInterval` (simpler — restarts on backend restart, acceptable)
  - [x] 5.3 For each active sandbox: query DB serviceKey + GET container `/env/INTERNAL_SERVICE_KEY` (use admin token) + compare
  - [x] 5.4 On drift: emit metric + breadcrumb; in cloud mode → call PUT `/env/INTERNAL_SERVICE_KEY` with DB value (auto-heal); in local mode → log only
  - [x] 5.5 Add config flag `SANDBOX_TOKEN_DRIFT_RECONCILER_ENABLED` (default true cloud, false local)
  - [x] 5.6 Wire into `apps/api/src/index.ts` startup (next to existing BullMQ workers)

- [ ] **Task 6: Admin rotation with grace** (AC4)
  - [x] 6.1 New route `apps/api/src/router/routes/admin-rotate-sandbox-token.ts` — POST `/v1/admin/sandboxes/:id/rotate-token`
  - [x] 6.2 Generate new key → DB write → emit `sandbox.token.rotated` event
  - [x] 6.3 Update `verifyEpsilonUserContext` in [`core/epsilon-master/src/services/epsilon-user-context.ts`](core/epsilon-master/src/services/epsilon-user-context.ts) to support `acceptOldUntil: number` — pass via env var refreshed on rotation
  - [ ] 6.4 Plugin reconnect signal: send WebSocket message `{ type: 'reauth', newKeyVersion: N }` to active sandbox connections
  - [ ] 6.5 Audit log: `rotated_by`, `sandbox_id`, `old_prefix`, `new_prefix`, `reason`

- [ ] **Task 7: Tests + docs**
  - [ ] 7.1 Write unit tests per AC6
  - [ ] 7.2 Write integration test per AC6
  - [ ] 7.3 Update [docs/architecture.md](docs/architecture.md) (if exists) with new bootstrap flow diagram
  - [ ] 7.4 Update [CLAUDE.md](CLAUDE.md) — replace troubleshooting section
  - [ ] 7.5 Verify Story 5.0.2's reconcile path still works (regression smoke)
  - [ ] 7.6 **(audit M1)** Migrate Story 5.0.2's atomic provision test from 3-layer to 2-layer expectations: DB write + container env write (no longer "writes to apps/api .env" — that path is replaced by DB-canonical pull in cloud mode). Local-dev test stays as-is (bind-mount path).

## Dev Notes

### Critical brownfield guardrails

- **DO NOT** delete `bootstrap-env.json` file from container — keep it as read-only mirror for offline recovery (sandbox can boot if DB temporarily unreachable). Only remove the WRITE paths.
- **DO NOT** rotate `PROVISIONING_KEY` on `serviceKey` rotation — they have different threat models (provisioning = first-boot only, service = ongoing).
- **DO NOT** ship 5.0.3 without 5.0.4 (chaos tests) — too easy to introduce subtle race conditions; defer until tests are in place.
- **DO** verify Story 5.0.2's auto-reconcile still works after migration — 5.0.3 reduces frequency of drift but doesn't eliminate edge cases (DB outage, network partition).
- **DO** maintain backward compatibility for one release: old sandboxes without `PROVISIONING_KEY` in DB fall back to existing 5.0.2 behavior (read bootstrap file directly). Hard-cut after 2 releases.

### Existing helpers TO REUSE

| Helper | Location | Use for |
|---|---|---|
| `GET /env/:key` | [core/epsilon-master/src/routes/env.ts:194](core/epsilon-master/src/routes/env.ts#L194) | Task 5 — drift reconciler reads container key |
| `PUT /env/:key` | [core/epsilon-master/src/routes/env.ts:299](core/epsilon-master/src/routes/env.ts#L299) | Task 5 — auto-heal writes |
| `pool.injectEnv` | [apps/api/src/pool/inventory.ts](apps/api/src/pool/inventory.ts) | Task 1 — inject `PROVISIONING_KEY` at provision |
| `hashSecretKey` | [apps/api/src/shared/crypto.ts:94](apps/api/src/shared/crypto.ts#L94) | Task 1 — hash `PROVISIONING_KEY` for DB storage (don't store plaintext) |
| `apiKeyAuth` middleware | [apps/api/src/middleware/auth.ts:45](apps/api/src/middleware/auth.ts#L45) | Task 2 — pattern for `PROVISIONING_KEY` validation |
| Drizzle `db.transaction` | stdlib | Task 1 — keep provision atomic (extend 5.0.2's transaction to include new column) |

### Files this story will UPDATE

| Path | What changes | What MUST be preserved |
|---|---|---|
| [core/epsilon-master/src/index.ts:62](core/epsilon-master/src/index.ts#L62) | Replace `loadBootstrapEnv()` with `loadCanonicalToken()` | Boot order: token resolution MUST complete before any HTTP server starts (otherwise auth middleware sees empty secret) |
| [core/epsilon-master/src/services/bootstrap-env.ts](core/epsilon-master/src/services/bootstrap-env.ts) | DELETE write paths; keep load-from-mirror for offline fallback | `loadBootstrapEnv` can stay as a thin wrapper that ONLY reads (no write side effect) |
| [core/epsilon-master/src/routes/env.ts:264,299](core/epsilon-master/src/routes/env.ts#L264) | Reject writes to `EPSILON_TOKEN`/`INTERNAL_SERVICE_KEY` (return 403) | Other env vars (e.g. `EPSILON_YOLO_API_KEY`) still writable |
| [apps/api/src/platform/services/sandbox-provisioner.ts:78](apps/api/src/platform/services/sandbox-provisioner.ts#L78) | Add `provisioningKey` generation alongside `serviceKey` | Story 5.0.2's atomic transaction wrapper MUST encompass new column write |
| [packages/db/src/schema/epsilon.ts](packages/db/src/schema/epsilon.ts) | Add `provisioningKey` to sandboxes table | All other sandbox columns unchanged (no destructive migrations) |
| [scripts/compose/docker-compose.yml](scripts/compose/docker-compose.yml) | Add bind mount for `secrets/sandbox-token.txt` | All existing volumes + service deps unchanged |
| [CLAUDE.md](CLAUDE.md) | Replace troubleshooting section | Other troubleshooting entries unchanged |

### Files this story will CREATE

```
apps/api/src/router/routes/internal-bootstrap.ts                      (NEW — Task 2)
apps/api/src/router/routes/admin-rotate-sandbox-token.ts              (NEW — Task 6)
apps/api/src/platform/services/sandbox-drift-reconciler.ts            (NEW — Task 5)
core/epsilon-master/src/services/load-canonical-token.ts              (NEW — Task 3)
packages/db/drizzle/0012_sandbox_provisioning_key.sql                 (NEW — Task 1)
Makefile (or add target if exists)                                    (UPDATE — Task 4)
secrets/.gitkeep + secrets/.gitignore                                 (NEW — Task 4)
apps/api/src/__tests__/unit/internal-bootstrap-route.test.ts          (NEW — AC6)
apps/api/src/__tests__/unit/sandbox-drift-reconciler.test.ts          (NEW — AC6)
apps/api/src/__tests__/unit/sandbox-token-rotation.test.ts            (NEW — AC6)
core/epsilon-master/src/services/__tests__/load-canonical-token.test.ts  (NEW — AC6)
apps/api/src/__tests__/integration/cloud-sandbox-bootstrap.test.ts    (NEW — AC6)
```

### Migration safety (rollout sequence)

**Pre-flight (audit M2)**: Story 5.0.4 chaos tests MUST be live in CI with `SANDBOX_CHAOS_TESTS_ENABLED=true` BEFORE Phase 2. Without chaos regression coverage, cloud rollout proceeds blind to drift edge cases. Verify CI workflow PR for 5.0.4 merged before kicking off Phase 2.

**Phase 1 (this story, week 1):**
- Ship Task 1+2 first: add `provisioningKey` column + bootstrap endpoint (backward compatible — sandboxes ignore endpoint if `PROVISIONING_KEY` env not set)
- Re-provision all sandboxes within 1 week to populate `provisioningKey`

**Phase 2 (week 2)** — requires 5.0.4 chaos tests green in last 3 main runs:
- Ship Task 3 (sandbox-side `loadCanonicalToken`) — sandboxes start pulling from API
- Verify zero `bad_signature` events in Sentry for 24h before proceeding

**Phase 3 (week 3):**
- Ship Task 4 (local-dev bind mount)
- Ship Task 5 (drift reconciler with auto-heal)

**Phase 4 (week 4):**
- Ship Task 6 (admin rotation) — only after Phase 1-3 stable
- DELETE `saveBootstrapEnv()` after 14-day quiet period

### Project context reference

- [_bmad-output/planning-artifacts/architecture-notes-token-sync-2026-05-18.md](../planning-artifacts/architecture-notes-token-sync-2026-05-18.md) — decision rationale
- [_bmad-output/implementation-artifacts/5-0-2-sandbox-token-sync-reliability.md](5-0-2-sandbox-token-sync-reliability.md) — reactive auto-heal layer (must be live before 5.0.3 ships)

### Previous story intelligence

- **Story 5.0.2 (just shipped)**: `proxyToSandbox` already intercepts `X-Epsilon-Token-Drift` header + sync retries. 5.0.3 reduces drift frequency by eliminating mutation paths; 5.0.2's reconcile remains the safety net.
- **Story 5.0 + 5.0.1**: Foundation patterns for sandbox provisioning + Docker compose volumes — Task 4's bind mount follows same convention.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story-5.0.3]
- [Source: _bmad-output/planning-artifacts/architecture-notes-token-sync-2026-05-18.md] — Option A vs B vs C trade-offs
- [Source: 5-0-2-sandbox-token-sync-reliability.md] — reactive layer (prerequisite)
- [Source: core/epsilon-master/src/services/bootstrap-env.ts] — current mutation point (TO REMOVE)
- [Source: apps/api/src/platform/services/sandbox-provisioner.ts:78] — provision flow (TO EXTEND)
- [Source: core/epsilon-master/src/routes/env.ts] — existing env endpoints (TO HARDEN)

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List
