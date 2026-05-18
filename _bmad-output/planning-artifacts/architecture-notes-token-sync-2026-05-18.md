# Architecture Note — Sandbox Token Sync Debt (2026-05-18)

Author: Winston (System Architect)
Audience: Platform / Infra owners (Bao, Luisphan)
Status: Decision needed — pick design option before Story 5.0.2 spec

## 1. Root cause analysis

Token `epsilon_sb_*` exists in **4 storage layers** authored by **2 owners**, with NO transactional reconciler:

| Layer | Path | Owner | Lifetime |
|---|---|---|---|
| A | `apps/api/.env` `INTERNAL_SERVICE_KEY` | Manual / generator | Until manual edit |
| B | `epsilon.sandboxes.config.serviceKey` (DB JSONB) | apps/api on provision + 401 retry | Per-sandbox row |
| C | Container `/workspace/.secrets/.bootstrap-env.json` | epsilon-master `saveBootstrapEnv()` | Survives restarts |
| D | s6 env `/run/s6/container_environment/EPSILON_TOKEN` | epsilon-master boot ([config.ts:66](core/epsilon-master/src/config.ts#L66)) | Per-process |

**Drift sequence observed today:**
1. Initial provision: A=B=C=D = `pUxkDw5g…` (consistent)
2. Sandbox restarted → epsilon-master `loadBootstrapEnv()` ([bootstrap-env.ts:43](core/epsilon-master/src/services/bootstrap-env.ts#L43)) restored C; but Docker env passed a NEWER value from somewhere → `existing !== val` → wrote new value `v3Gfy1KcN…` into D, persisted into C. **Bootstrap file silently mutated.** A & B unchanged → drift.
3. Reverse-sync hooks fire too late:
   - apps/api startup ([local-preview.ts](apps/api/src/sandbox-proxy/routes/local-preview.ts)) reads C via `docker exec` → updates B → A & DB out of sync only by accident
   - 401-retry path ([local-preview.ts:299](apps/api/src/sandbox-proxy/routes/local-preview.ts#L299)) covers Bearer-token validation, **not HMAC signing chain**

**Critical hidden coupling** — the HMAC sign/verify chain ([sandbox-proxy/index.ts:39](apps/api/src/sandbox-proxy/index.ts#L39) signs with B; [epsilon-user-middleware.ts:49](core/epsilon-master/src/services/epsilon-user-middleware.ts#L49) verifies with D). When B ≠ D → `bad_signature` → user context dropped silently → `stampSessionOwner` skipped → every per-user feature degrades to anonymous.

## 2. Design options (trade-offs, not verdicts)

| Option | Pros | Cons | Risk |
|---|---|---|---|
| **A** — DB-canonical, sandbox pulls on boot via API | Single source; rotate via SQL UPDATE; production-ready | Bootstrap requires DB online; chicken-and-egg if apps/api still booting | Med — needs init ordering |
| **B** — Sandbox-canonical + reconcile loop on apps/api (current implicit) | Survives DB wipe; sandbox always self-consistent | Multi-sandbox = N truths; rotation requires per-sandbox `docker exec`; race-prone | **High** — what we're debugging |
| **C** — Static per-deploy key from `.env`/secrets manager mounted into both sides | Zero drift by construction; trivial to verify | Manual rotation; breaks BYOK roadmap; loses per-sandbox isolation | Low (local dev), Med (cloud multi-tenant) |

**My recommendation**: hybrid → **A for cloud (Daytona, JustAVPS)** where DB always reachable + **C for local dev** (`epsilon-sandbox` reads `INTERNAL_SERVICE_KEY` from mounted `.env` file via volume bind). Eliminates the bootstrap-file-mutation path that broke us today.

## 3. Production risk if pattern scales unchanged

- **Memory (Story 5.8), spending-cap (Story 5.4), audit trail** all assume signed user-context. **All silently degrade to anonymous** on drift — no 4xx, no log alert.
- **Multi-sandbox**: each container has independent bootstrap → N keys to reconcile. `apps/api` startup hook only syncs the **default** local sandbox (looks up by `SANDBOX_CONTAINER_NAME`). Cloud sandboxes provisioned per-user will drift the moment Daytona restarts a pod.
- **Audit forensics**: bad-signature events log as `[epsilon-user] Ignoring bad … (bad_signature)` then **proceed without auth** → operations attributed to no user → SOC2 / compliance gap.
- **BYOK collision** (Story 5.7): if user-LLM-key encryption derives from `INTERNAL_SERVICE_KEY`, rotation invalidates ALL stored keys. Not the case today but easy to introduce.

## 4. P0 vs deferred

**P0 (this sprint, < 1 day)** — STOP THE BLEED:
- [P0.1] Alert on `bad_signature` count > 0 in 5-min window (epsilon-master log → Sentry/Logtail)
- [P0.2] On signature failure, refresh DB.serviceKey from container bootstrap **before** dropping context (extend [epsilon-user-middleware.ts:49](core/epsilon-master/src/services/epsilon-user-middleware.ts#L49) → request apps/api re-sync)
- [P0.3] On every `provisionSandbox`, write the SAME generated key to A + B + C atomically (use DB txn + container write fence)

**P1 (next sprint)** — STRUCTURAL:
- [P1.1] Implement Option A: DB-canonical, sandbox pulls via `GET /v1/internal/bootstrap-token` on boot
- [P1.2] Deprecate `.bootstrap-env.json` mutation; make it read-only mirror
- [P1.3] Reconciler job (cron 1-min) compares A/B/C/D per sandbox, emits Prometheus drift metric

**Defer** — local-dev `.env` manual edit pattern can stay; document it.

## 5. Test strategy

- **Unit**: `verifyEpsilonUserContext` round-trip with rotated key (sign with old, verify with new) → must fail closed not silently
- **Integration**: kill sandbox container → restart → confirm A=B=C=D within 30s (drift detector test)
- **E2E (Playwright)**: new session created via UI → assert `session_owners` row exists within 2s after `POST /session` 200
- **Chaos**: random `docker restart epsilon-sandbox` mid-test; memory inject still works on retry

## 6. References

- [apps/api/src/sandbox-proxy/index.ts:32-44](apps/api/src/sandbox-proxy/index.ts#L32) — sign path
- [apps/api/src/sandbox-proxy/routes/local-preview.ts:299-321](apps/api/src/sandbox-proxy/routes/local-preview.ts#L299) — 401 retry hook
- [core/epsilon-master/src/services/epsilon-user-middleware.ts:42-56](core/epsilon-master/src/services/epsilon-user-middleware.ts#L42) — verify path (silent fail)
- [core/epsilon-master/src/config.ts:66-96](core/epsilon-master/src/config.ts#L66) — runtime token resolution
- [core/epsilon-master/src/services/bootstrap-env.ts:43-108](core/epsilon-master/src/services/bootstrap-env.ts#L43) — bootstrap mutation point
- [CLAUDE.md troubleshooting](CLAUDE.md) — already documents manual fix
