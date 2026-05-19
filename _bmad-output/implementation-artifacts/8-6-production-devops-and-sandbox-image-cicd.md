# Story 8.6: Production DevOps Pipeline — Sandbox Image CI/CD + Comprehensive DevOps Reference

Status: ready-for-dev

**Epic:** 8 — Enterprise & Privacy / Production Reliability
**Type:** P1 infrastructure — automation + canonical DevOps reference document
**Created:** 2026-05-19 (post `/bmad-create-story` session — scope expanded by user to include full DevOps history as long-term reference)
**Depends on:**
  - Story 5.0.5 done (CI test workflow + `.github/workflows/test.yml` foundation)
  - Story 8.5 in-flight (production reliability — runtime fixes coexist with this)
  - Story 8.7 done-with-caveat (`ensureRunning()` auto-recovery foundation)
  - 3 hotfix commits this session (2026-05-19): `2930b7b` (ensureRunning + networkAllowList guard), `46c94af` (wire ensureRunning into wake flow), `60e6e18` (preview proxy auto-recovery)
**Blocks:**
  - Future "Auto-rollout existing sandboxes on new image" story (Story 8.x TBD)
  - Future "Registry consolidation cleanup — deprecate Docker Hub epsilonaicrypto" (cosmetic, optional)
**FRs:** Indirectly enables faster delivery of all FRs that involve sandbox runtime changes (Epic 1 OpenCode tools, Epic 2 workers running inside sandbox, Epic 5 vibe-trading swarm, Epic 10 autonomous agents).
**NFRs:** NFR8 (atomic credit & security regressions — bad image must not ship), NFR10 (sandbox isolation correctness), NFR12 (production uptime — circuit breaker prevents cascading bad deploys).
**Estimated effort:** 2.5 days net new work. Reference documentation (Part A) is mostly transcription from existing artifacts.
**Owner:** Bao implements; Luisphan reviews architecture decisions.

---

## Story

As **Chainlens production operator**,
I want **a fully-automated sandbox image CI/CD pipeline** that auto-builds on commit, smoke-tests via real Daytona sandbox spawn, auto-promotes to production with a circuit breaker, and provides a one-command rollback,
**AND a comprehensive reference document** of every production deployment surface — already-done **and** remaining-to-do — with status markers,
so that:
  1. Prompt/tool changes in `core/epsilon-master/` ship in **<10 minutes** automated instead of 30+ minutes SSH-build-tay cycle,
  2. Bad images never reach production (smoke gate),
  3. Cascading failures cannot silently drain credits (circuit breaker after 3 failed promotes),
  4. I (or any future maintainer / on-call engineer) have **one canonical reference** documenting how Chainlens production operates end-to-end — what's automated, what's manual, what's deferred.

---

## Context

### Why this story exists

**Problem 1 — Sandbox image build is the ONLY manual deploy step.** Frontend, API, Vibe-Trading all auto-deploy via Dokploy webhook from GitHub push. But sandbox image (`epsilonaicrypto/computer:daytona-fix-N`) requires:
  1. SSH to prod VPS
  2. rsync `core/` build context
  3. `docker buildx build` (~20 min)
  4. `docker push` (~5 min)
  5. Update `DAYTONA_SNAPSHOT` env in Dokploy
  6. Trigger API redeploy
  7. Verify

Total: ~30-45 minutes of human time per change. Story 8.7 incident postmortem (2026-05-19) identified this as a top-3 operational pain point — every prompt tune in `core/epsilon-master/opencode/agents/*.md` triggers this cycle.

**Problem 2 — Architectural intent unimplemented.** [`architecture.md:560`](_bmad-output/planning-artifacts/architecture.md#L560) explicitly states:
> "Auto-update loop: rolling update sandboxes với new image versions"

This is **stated but never built**. Today, updating `DAYTONA_SNAPSHOT` only affects NEW sandboxes — existing user sandboxes keep running old image until delete+recreate. (NOTE: this story does NOT solve the "rolling update existing sandboxes" gap — that's deferred. See AC12.)

**Problem 3 — No canonical DevOps reference.** Knowledge about how Chainlens production deploys is scattered across:
  - [`docs/production-deploy-guide.md`](docs/production-deploy-guide.md) — runbook, but historical & growing
  - [`CLAUDE.md`](CLAUDE.md) — assistant guidance, not human-friendly
  - Story files (5.0.x, 8.7) — point-in-time decisions
  - Dokploy dashboard — config state
  - Git commits — implementation history

A new engineer (or future Claude session) has no single document that answers "what services does production run, how do they ship, what's automated vs manual, what to do when X breaks?"

**This story creates that document** as Part A of the spec, then implements the missing automation as Part B.

### Architectural decisions baked in (user-confirmed 2026-05-19)

| Decision | Choice | Rationale |
|---|---|---|
| Build runner | **Self-hosted GH Actions agent on prod VPS** (`167.172.66.16`) | No external cost, docker daemon already present, network local to Dokploy fast |
| Registry | **GHCR** (`ghcr.io/deptrai/computer`) for both Daytona + JustAVPS | Unify on 1 registry, GitHub creds (PAT) already configured for repo |
| Promote gate | **Auto-promote if smoke test passes** | Speed > extra ceremony; smoke test must be high coverage; circuit breaker enforces safety |

### Risk register (acknowledged before AC design)

| Risk | Mitigation in this story |
|---|---|
| Auto-promote ships bad image to all new sandboxes | AC5 smoke test mandatory; AC7 circuit breaker locks after 3 fails |
| Self-hosted runner consumed by malicious PR build | AC2 restrict workflow to `push` events on protected branches only (NO PRs from forks) |
| Build job exhausts disk on prod VPS | AC2 set runner disk limit + cleanup `docker system prune -af` daily cron |
| GHCR private package — Daytona pull fail | AC8 verify pull with Daytona registry credentials before cutover |
| Existing sandbox stays on old image indefinitely | OUT OF SCOPE — AC12 defer with explicit note |

---

## Part A — Production Deployment Architecture Reference (DONE items)

> **Purpose:** Canonical reference for what's already shipped + automated. Future maintainers should read this section first to understand current state before reading Part B (changes this story makes).

### A.1 Production environment summary

**Server:** Hetzner/DigitalOcean VPS at `167.172.66.16` (Ubuntu 24.04, 8 vCPU, 16GB RAM, 160GB SSD)
**Orchestrator:** Dokploy (Docker Swarm + Traefik) on port 3000
**DNS:** `chainlens.net` (frontend), `api.chainlens.net` (API), Cloudflare DNS + Let's Encrypt via Dokploy
**Source repo:** `https://github.com/deptrai/chainlens` (private), main deployment branch `feat/rename-chainlens-epsilon`

| Surface | Status | Container | Source path | Trigger |
|---|---|---|---|---|
| **Frontend** (Next.js 15) | ✅ DONE | `frontend-pyzi0j` :3000 | `apps/web/` | Dokploy autoDeploy on branch push |
| **API** (Bun + Hono) | ✅ DONE | `api-djcsof` :8008 | `apps/api/` | Dokploy autoDeploy on branch push |
| **Vibe-Trading** (FastAPI) | ✅ DONE | `vibe-backend-jlwjp5` :8899 | `Vibe-Trading/` | Dokploy autoDeploy on branch push |
| **Redis** (BullMQ + cache) | ✅ DONE | `dokploy-redis` :6379 | N/A (Dokploy stock) | N/A |
| **Cloudflared LLM bridge** | ✅ DONE | `cloudflared-api-bridge` | N/A (vendor image) | systemd `tunnel-watchdog.service` polls every 30s |
| **Sandbox image (Daytona)** | ❌ MANUAL | N/A — pulled by Daytona | `core/` | **THIS STORY** automates |
| **Sandbox snapshot (JustAVPS legacy)** | ✅ DONE | N/A — pulled by JustAVPS | `core/` via GHCR | `.github/workflows/snapshot-build.yml` |

### A.2 Already-automated deploy paths (DONE)

#### A.2.1 ✅ Frontend (`apps/web/`)
**Workflow:** GitHub push → Dokploy webhook (`autoDeploy=true`) → Dokploy clone → `apps/web/Dockerfile` build → Swarm rolling update
**Build time:** ~3-5 minutes
**Branch protection:** Only `feat/rename-chainlens-epsilon` triggers prod deploy
**Rollback:** Dokploy UI → Deployments → Rollback button (rolls back to previous image)
**Config:** Dokploy app ID `Hc9BHcRy3H7vrPTcMMA2h`, env file managed via Dokploy UI

#### A.2.2 ✅ API (`apps/api/`)
**Workflow:** Same as frontend — Dokploy webhook → autoDeploy
**Build time:** ~1-2 minutes (Bun is fast)
**Dockerfile:** `apps/api/Dockerfile`, build arg `SERVICE=apps/api`
**Config:** Dokploy app ID `SESgs1lTKXGJz0YMXmoxs`, ~50 env vars set in Dokploy UI
**Critical envs (DO NOT FORGET when restoring from backup):**
  - `INTERNAL_SERVICE_KEY` (Story 5.0.3 canonical; must match between API and sandbox seed)
  - `DAYTONA_API_KEY`, `DAYTONA_SNAPSHOT`, `DAYTONA_TARGET=eu`
  - `EPSILON_URL` = current cloudflared tunnel URL (auto-rotated by watchdog — see A.2.5)
  - `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `OPENROUTER_API_KEY` (LLM)
  - `OPENROUTER_API_URL=https://v98store.com/v1` (LLM proxy via v98)
  - `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`
  - `ENCRYPTION_KEY`, `MCP_CREDENTIAL_ENCRYPTION_KEY`, `API_KEY_SECRET`

#### A.2.3 ✅ Vibe-Trading (`Vibe-Trading/`)
**Workflow:** Same Dokploy autoDeploy
**Build time:** ~5-8 minutes (Python deps heavier)
**Note:** Runs only inside `dokploy-network`, not exposed to public internet. apps/api calls via internal hostname `vibe-backend:8899`.

#### A.2.4 ✅ CI test workflow (Story 5.0.5)
**File:** [`.github/workflows/test.yml`](.github/workflows/test.yml) + [`.github/workflows/test-e2e.yml`](.github/workflows/test-e2e.yml)
**Triggers:**
  - `test-fast` (required, every PR): TypeScript typecheck + 9 targeted test files (~50 tests, ≤3 min)
  - `test-full-unit` (informational): full unit suites with ~218 baseline failures expected
  - `playwright-e2e` (`main` push only): boots Docker compose stack + chaos drill
**Branch protection:** Only `test-fast` is required status check
**Secrets required:** `GH_PAT` (private submodule access)
**Baseline failures runbook:** [`docs/runbooks/ci-baseline-failures.md`](docs/runbooks/ci-baseline-failures.md)

#### A.2.5 ✅ Cloudflared LLM bridge + watchdog
**Problem solved:** Daytona Envoy default whitelist allows `*.trycloudflare.com` but blocks direct `api.chainlens.net` + `v98store.com`. Sandbox needs LLM proxy callback path through approved tunnel domain.
**Container:** `cloudflared-api-bridge` running `cloudflare/cloudflared:latest`, target `http://api-djcsof:8008`
**URL drift:** Cloudflare quick tunnel URL changes on every cloudflared restart. Watchdog: [`scripts/tunnel-watchdog.sh`](scripts/tunnel-watchdog.sh) + [`scripts/tunnel-watchdog.service`](scripts/tunnel-watchdog.service)
**Polling:** Every 30s; on URL change → PATCH Dokploy `EPSILON_URL` env → trigger API redeploy
**Recovery time after tunnel restart:** ~2-3 minutes (detect + patch + Dokploy redeploy)
**State file:** `/var/lib/tunnel-watchdog/last-url`
**Logs:** `/var/log/tunnel-watchdog.log`

#### A.2.6 ✅ JustAVPS sandbox snapshot build (legacy provider)
**File:** [`.github/workflows/snapshot-build.yml`](.github/workflows/snapshot-build.yml)
**Pattern:** spawn ephemeral JustAVPS VM as Docker builder → pull image from GHCR → JustAVPS API creates snapshot → delete VM
**Image source:** `ghcr.io/deptrai/computer:<version>`
**Triggers:** `workflow_dispatch` (manual) + `workflow_call` (called by `deploy-dev.yml` and `release.yml`)
**Cleanup:** Keeps last 3 snapshots per channel (`epsilon-computer-vdev-*` for dev, `epsilon-computer-v*` for prod)
**Note:** This pattern is REUSED conceptually in this story for Daytona — but with self-hosted runner instead of ephemeral VM.

#### A.2.7 ✅ Sandbox token canonical lifecycle (Story 5.0.3)
**Source of truth:** DB `epsilon.sandboxes.config.serviceKey` (cloud) / `apps/api/.env INTERNAL_SERVICE_KEY` (local)
**Bootstrap:** sandbox calls `/v1/internal/bootstrap-token` at startup → fetches canonical token → writes to `/run/s6/container_environment/EPSILON_TOKEN`
**Local rotation:** `make sandbox-token` regenerates `secrets/sandbox-token.txt` → restart sandbox container

#### A.2.8 ✅ Token drift auto-reconcile (Story 5.0.2)
**Trigger:** any request to sandbox proxy detects bad signature
**Chain:** detect drift → re-fetch from DB → update `process.env.INTERNAL_SERVICE_KEY` in-place → retry request
**No restart needed** (patch P2 from 5.0.2 review)
**Circuit breaker:** 30s cool-off after repeated drift to prevent retry storm

#### A.2.9 ✅ Auto-recovery: `ensureRunning()` (3 commits this session 2026-05-19)
**Commit `2930b7b`** — `ensureRunning()` health-checks `/epsilon/health` after wake; re-triggers `startRuntime()` bootstrap if unreachable. Also adds `DAYTONA_NETWORK_ALLOW_LIST_CONFIRMED` opt-in guard.
**Commit `46c94af`** — Wires `ensureRunning()` into Daytona wake flow ([sandbox-cloud.ts:1016](apps/api/src/platform/routes/sandbox-cloud.ts#L1016)). Previously only JustAVPS had this.
**Commit `60e6e18`** — Preview proxy ([preview.ts:62](apps/api/src/sandbox-proxy/routes/preview.ts#L62)) auto-detects persistent 502 from a "running" sandbox (epsilon-master dead mid-session) and triggers `ensureRunning()` async with 2-min cooldown.

**Together these close two gaps:**
  - Archive-wake bootstrap (Daytona PID 1 doesn't run ENTRYPOINT)
  - Runtime-crash mid-session (API restart drops WS, epsilon-master exits)

#### A.2.10 ✅ DAYTONA_NETWORK_ALLOW_LIST safety guard (Story 8.7 incident fix)
**Problem:** Setting `DAYTONA_NETWORK_ALLOW_LIST` alone DISABLES Daytona default whitelist → AI providers + `*.trycloudflare.com` blocked → workspace offline.
**Fix:** [`daytona.ts`](apps/api/src/platform/providers/daytona.ts) refuses to pass `networkAllowList` unless `DAYTONA_NETWORK_ALLOW_LIST_CONFIRMED=true` is also set.
**Logs error + IGNORES** misconfiguration to fail-safe.

### A.3 What's still manual today (target of this story)

| Task | Frequency | Time cost | Risk |
|---|---|---|---|
| Build sandbox image | ~weekly (prompt tuning) | 30-45 min | Human error in tag naming, missing push, wrong env update |
| Update `DAYTONA_SNAPSHOT` in Dokploy | Same | 2-5 min | Wrong tag → all new sandboxes broken |
| Trigger API redeploy after env change | Same | 1-2 min | Forgotten → env update is no-op |
| Verify new sandbox provisions correctly | Same | 5-10 min | Skipped under time pressure → bad image silently shipped |
| Rollback to previous image | Rare (incident) | 5-15 min | Need to remember previous tag, manual Dokploy edit |

**Total weekly toil:** ~45-75 minutes for ~3 image builds. This story reduces to ~5 min/build (CI handles everything, human just reads Telegram notification).

---

## Part B — Acceptance Criteria (TO IMPLEMENT)

### AC1 — Two-layer Dockerfile split

**Given** the current `core/docker/Dockerfile` mixes OS+global binaries (slow-changing) with `core/epsilon-master/` source (fast-changing) in a single 477-line file,

**When** Story 8.6 ships,

**Then** the Dockerfile is split into:

- **`core/docker/Dockerfile.base`** — contains everything except the `COPY core/epsilon-master /opt/build/...` step and its associated `RUN rsync + bun install`. Outputs `ghcr.io/deptrai/computer-base:stable-N`. Build time: ~20-25 min.
- **`core/docker/Dockerfile`** (slim, ~25 lines) — `FROM ghcr.io/deptrai/computer-base:${BASE_TAG}`; copies `core/epsilon-master/`, runs `rsync + bun install + patches/apply.sh`, copies `core/daytona-start.sh`. Build time: ~5-8 min (cold), ~2-3 min (warm cache).

**And** local build verification passes:
```bash
# Base build (manual smoke):
docker build -f core/docker/Dockerfile.base -t test-base:local .

# Thin build (must succeed against the base):
docker build -f core/docker/Dockerfile --build-arg BASE_TAG=local -t test-thin:local .

# Smoke: container starts, /epsilon/health responds
docker run -d --name smoke -p 8000:8000 test-thin:local
sleep 30 && curl -sf http://localhost:8000/epsilon/health
docker rm -f smoke
```

**And** the `ARG BASE_TAG=stable-1` default in slim Dockerfile pins to the current promoted base tag (initially `stable-1`).

### AC2 — Self-hosted GitHub Actions runner on prod VPS

**Given** GitHub-hosted runners have only 14GB disk and the sandbox base image is ~10-15GB uncompressed,

**When** Story 8.6 ships,

**Then** a self-hosted runner is registered on `167.172.66.16`:
- Runner label: `sandbox-builder`
- Setup script: [`scripts/setup-self-hosted-runner.sh`](scripts/setup-self-hosted-runner.sh) (CREATED in this story; downloads runner agent, registers with GitHub repo token, installs as systemd service)
- Systemd unit: `actions.runner.deptrai-chainlens.sandbox-builder.service` (auto-restart on failure)
- Working dir: `/var/lib/github-runner` (separate disk partition if available)
- **Security restrictions** (CRITICAL):
  - Runner ONLY executes workflows triggered by `push` events on protected branches (`feat/rename-chainlens-epsilon`, `main`) — NOT `pull_request` (would allow fork PRs to execute on prod VPS)
  - GitHub repo setting: Actions → General → Fork pull request workflows → require approval from maintainers
  - Runner process user: dedicated `github-runner` non-root user
- **Disk hygiene:**
  - Daily cron `docker system prune -af --filter "until=72h"` to clean stale layers
  - Alert if `/var/lib/docker` > 100GB

**And** docs in [`docs/production-deploy-guide.md`](docs/production-deploy-guide.md) section "Self-hosted CI runner" explains setup, restart procedure, decommission steps.

### AC3 — Base image build workflow

**Given** the base image rebuild cadence is monthly (or when `OPENCODE_VERSION` / `AGENT_BROWSER_VERSION` / `OCX_VERSION` ARGs bump),

**When** Story 8.6 ships,

**Then** new workflow `.github/workflows/sandbox-base.yml` exists with:

- Triggers:
  - `workflow_dispatch` with input `base_tag` (default `stable-<incrementing-N>`)
  - `push` paths filter on `core/docker/Dockerfile.base` (auto-trigger on file change)
- Job runs on `sandbox-builder` self-hosted runner
- Steps:
  1. Checkout repo with submodules
  2. Log into GHCR using `GITHUB_TOKEN`
  3. `docker build -f core/docker/Dockerfile.base -t ghcr.io/deptrai/computer-base:<base_tag>`
  4. Smoke test: container starts, basic binaries present (`bun --version`, `node --version`, `opencode --version`)
  5. Push tag + retag `stable` alias
  6. Telegram notification: "Base image `<tag>` built + pushed"
- Concurrency: `group: sandbox-base, cancel-in-progress: false` (don't interrupt mid-build)
- Timeout: 35 minutes

### AC4 — Thin image auto-build workflow

**Given** `core/epsilon-master/**`, `core/daytona-start.sh`, `core/init-scripts/**` change frequently,

**When** Story 8.6 ships,

**Then** new workflow `.github/workflows/sandbox-build.yml` exists with:

- Triggers: `push` to `feat/rename-chainlens-epsilon` with paths filter:
  ```yaml
  paths:
    - 'core/epsilon-master/**'
    - 'core/daytona-start.sh'
    - 'core/init-scripts/**'
    - 'core/docker/Dockerfile'  # slim Dockerfile only
  ```
- Job runs on `sandbox-builder` self-hosted runner
- Steps:
  1. Checkout repo (submodules included)
  2. Compute SHA short: `SHA7=$(git rev-parse --short HEAD)`
  3. Log into GHCR
  4. `docker build -f core/docker/Dockerfile --build-arg BASE_TAG=stable -t ghcr.io/deptrai/computer:next-${SHA7} .`
  5. Push `next-${SHA7}` + alias `next`
  6. **Trigger smoke test workflow** via `workflow_dispatch` (or chain via `needs:` in same workflow)
- Concurrency: `group: sandbox-build-${{ github.ref }}, cancel-in-progress: true` (newer commit cancels older build)
- Timeout: 15 minutes

### AC5 — Smoke test workflow with real Daytona sandbox

**Given** smoke test must verify the image actually works end-to-end before promotion,

**When** Story 8.6 ships,

**Then** new workflow `.github/workflows/sandbox-smoke.yml` runs after AC4 build:

- Triggers: `workflow_call` from `sandbox-build.yml` after thin push succeeds
- Inputs: `image_tag` (the `next-<sha7>` from AC4)
- Steps:
  1. **Spawn ephemeral Daytona sandbox** with `DAYTONA_SNAPSHOT=ghcr.io/deptrai/computer:next-${SHA7}`:
     ```bash
     curl -X POST -H "Authorization: Bearer $DAYTONA_API_KEY" \
       "https://app.daytona.io/api/sandbox" \
       -d '{"buildInfo":{"dockerfileContent":"FROM ghcr.io/deptrai/computer:next-'$SHA7'"},"target":"eu","autoStopInterval":15,"env":{"ENV_MODE":"cloud","EPSILON_API_URL":"https://api.chainlens.net","INTERNAL_SERVICE_KEY":"'$SMOKE_INTERNAL_KEY'"}}'
     ```
  2. Wait for `state=started` (poll every 15s, max 5 min)
  3. Trigger bootstrap via Daytona toolbox proxy: `setsid bash -c 'nohup /usr/local/bin/epsilon-daytona-start ...'`
  4. **Smoke checks (ALL must pass):**
     - `curl /epsilon/health` returns 200 within 90s
     - OpenCode session create returns valid `sessionId`
     - Tool invocation: `sandbox_exec` running `echo hello` returns "hello"
     - Tool invocation: `agent-browser open about:blank` returns success
     - WebSocket connect to `/epsilon/ws` succeeds (epsilon-master WS handshake)
  5. **Cleanup:** `DELETE /api/sandbox/${SBID}` regardless of pass/fail
  6. On any check fail → exit 1 (do NOT promote)
- Timeout: 12 minutes total
- Required GitHub secrets: `DAYTONA_API_KEY`, `SMOKE_INTERNAL_KEY` (separate from prod INTERNAL_SERVICE_KEY)

### AC6 — Auto-promote on smoke pass

**Given** AC3 (smoke test) passed,

**When** the smoke workflow exits 0,

**Then** automatic promotion executes (within same workflow, after smoke step):

- Retag: `ghcr.io/deptrai/computer:next-${SHA7}` → `ghcr.io/deptrai/computer:stable-${SHA7}` + update alias `:stable`
- PATCH Dokploy API:
  ```bash
  curl -X POST "$DOKPLOY_URL/api/application.update" \
    -H "x-api-key: $DOKPLOY_API_KEY" \
    -d "{\"applicationId\":\"$APP_ID\",\"env\":\"...\nDAYTONA_SNAPSHOT=ghcr.io/deptrai/computer:stable-${SHA7}\n...\"}"
  ```
  (NOTE: Dokploy `application.update` requires FULL env string, not partial. Workflow must fetch current env, replace `DAYTONA_SNAPSHOT` line, repost.)
- Trigger API redeploy: `curl -X POST .../api/application.redeploy -d "{\"applicationId\":\"$APP_ID\"}"`
- Wait for redeploy `status=done` (poll Dokploy, max 5 min)
- Telegram notification (success): tag + commit message + Dokploy deployment URL
- If Dokploy step fails → exit 1, increment circuit breaker counter (see AC7)

### AC7 — Circuit breaker after 3 consecutive promote failures

**Given** auto-promote could ship a bad image despite smoke test passing (e.g. Dokploy redeploy fails, image works in isolation but breaks under prod env),

**When** 3 consecutive auto-promote attempts fail at the Dokploy redeploy step,

**Then** the circuit breaker activates:

- State file on self-hosted runner: `/var/lib/sandbox-ci/promote-history.json` — JSON array of last 3 promote attempts:
  ```json
  [
    {"sha": "abc1234", "ts": "2026-05-19T12:34:56Z", "dokploy_status": "failed", "error": "redeploy timed out"},
    ...
  ]
  ```
- Lock file: `/var/lib/sandbox-ci/auto-promote-lock` — when present, AC6 step skips promotion and exits with warning
- Telegram CRITICAL alert: "🔴 Auto-promote locked after 3 fails. Manual investigation required."
- Lock cleared via `workflow_dispatch unlock-promote.yml` (manual) — requires maintainer to run after triage
- If 3rd fail happens mid-sandbox-build run → workflow still pushes `:next-<sha7>` but does NOT promote `:stable`

### AC8 — Daytona GHCR pull verification + migration

**Given** Daytona currently pulls from `epsilonaicrypto/computer` (Docker Hub) and this story moves to `ghcr.io/deptrai/computer`,

**When** Story 8.6 ships,

**Then** before flipping production `DAYTONA_SNAPSHOT`:

1. Test pull from canary sandbox: provision 1 Daytona sandbox with `DAYTONA_SNAPSHOT=ghcr.io/deptrai/computer:stable-<sha>` → verify pull succeeds + bootstrap completes
2. If GHCR package is **private** (likely, given repo is private):
   - Generate read-only GitHub PAT with `read:packages` scope
   - Set in Daytona registry credentials (via Daytona dashboard or API)
   - Test pull again
3. Document the migration runbook in [`docs/production-deploy-guide.md`](docs/production-deploy-guide.md) — pull credential setup + rollback path (revert to `epsilonaicrypto/computer` if GHCR unreachable)
4. Keep old `epsilonaicrypto/computer:daytona-fix-11` tag on Docker Hub as rollback target for 30 days post-cutover

### AC9 — Rollback workflow

**Given** an auto-promoted image may turn out bad after production traffic hits it,

**When** Story 8.6 ships,

**Then** new workflow `.github/workflows/sandbox-rollback.yml`:

- Trigger: `workflow_dispatch` with input `target_sha` (a previously-promoted SHA7)
- Steps:
  1. Verify `ghcr.io/deptrai/computer:stable-${target_sha}` exists in GHCR (manifest inspect)
  2. Retag `:stable` alias to point at the rollback SHA
  3. PATCH Dokploy `DAYTONA_SNAPSHOT=ghcr.io/deptrai/computer:stable-${target_sha}`
  4. Trigger Dokploy API redeploy
  5. Reset circuit breaker state (clear `/var/lib/sandbox-ci/promote-history.json`)
  6. Telegram notification: "⏪ Rolled back to `stable-${target_sha}`"
- Bypasses smoke test (operator decision, assumed validated previously)
- GitHub Actions retention: keep last 30 days of build SHAs (default workflow run retention covers this)

### AC10 — Observability: Telegram alerts + Sentry release markers

**Given** auto-promote removes humans from the deploy path, monitoring must replace human judgment,

**When** Story 8.6 ships,

**Then:**

- **Telegram bot** (existing chainlens-admin channel — token from Dokploy env `TELEGRAM_ADMIN_BOT_TOKEN`) receives:
  - Every successful promote: tag SHA, commit message (first 200 chars), GitHub commit URL, Dokploy deployment URL
  - Every smoke fail: tag SHA, which check failed, smoke workflow log link
  - Every circuit breaker lock: "🔴 LOCKED" with last 3 failure details
  - Every rollback: target SHA + operator (GitHub user who triggered workflow)
- **Sentry release marker** on apps/api startup:
  - When `apps/api` detects `DAYTONA_SNAPSHOT` env value differs from last-seen (cache in `/tmp/last-snapshot.txt`)
  - Post to Sentry: `Sentry.captureMessage('Sandbox snapshot updated', { level: 'info', extra: { snapshot, prevSnapshot, sha } })`
  - Adds breadcrumb so subsequent sandbox errors during initial rollout are linked to the deploy event
- **Daily summary** Telegram message (cron 09:00 ICT) — # builds today, # promotes, # smoke fails, current `:stable` tag age

### AC11 — Documentation updates

**Given** the manual SSH-build workflow in [`docs/production-deploy-guide.md`](docs/production-deploy-guide.md) is now obsolete,

**When** Story 8.6 ships,

**Then:**

- Section "Build sandbox image (epsilon/computer)" in `production-deploy-guide.md` is REWRITTEN:
  - Mark old manual procedure as `<!-- DEPRECATED -->` (keep for historical reference + emergency fallback)
  - New section "Automated sandbox image build (Story 8.6)" explains:
    - When CI triggers (paths filter)
    - How to monitor build progress (GitHub Actions UI link)
    - How to interpret Telegram notifications
    - How to rollback (one-command `gh workflow run sandbox-rollback.yml -f target_sha=...`)
    - How to unlock circuit breaker
    - How to bump base image (`workflow_dispatch sandbox-base.yml`)
- New section "Self-hosted GitHub runner" — setup + decommission procedures
- `CLAUDE.md` updated:
  - Replace "Sandbox image build is manual" wording (if present) with reference to Story 8.6 automation
  - Add to "Troubleshooting / Known Issues": circuit breaker recovery procedure
- Story file (this doc) gets a Postmortem section at end after implementation: what worked, what didn't, what's deferred

### AC12 — Deferred work registry

**Given** several adjacent concerns are out of scope for this story,

**When** Story 8.6 ships,

**Then** [`_bmad-output/implementation-artifacts/deferred-work.md`](_bmad-output/implementation-artifacts/deferred-work.md) is updated with explicit entries:

1. **Auto-rollout existing sandboxes on new `:stable` tag** — Today, existing user sandboxes keep old image until delete+recreate. Need: background job that detects DB sandboxes with stale `image_tag` (vs Dokploy env `DAYTONA_SNAPSHOT`) and offers rolling update OR auto-recreate during low-traffic window. **Effort: ~3 days.** **Risk:** disrupts user mid-session if not done carefully (idle window detection). **Tracked as future Story 8.x.**
2. **Registry consolidation cleanup** — `snapshot-build.yml` builds JustAVPS snapshots from GHCR, this story also lands on GHCR. Docker Hub `epsilonaicrypto/computer` can be deprecated after 30-day grace period. **Effort: ~0.5 days.** **Tracked as housekeeping.**
3. **Base image multi-arch (arm64)** — Current Daytona EU is amd64-only. If Daytona adds arm64 nodes or we add Apple Silicon CI, base image needs multi-arch build via `docker buildx imagetools create`. **Effort: ~1 day.** **Tracked.**
4. **Self-hosted runner HA** — Single runner on prod VPS = single point of failure. If runner crashes mid-build, no auto-recovery. Future: register a backup runner on a separate machine OR fall back to ephemeral JustAVPS builder. **Effort: ~1 day.** **Tracked.**

---

## Part C — Out of Scope

The following are explicitly NOT part of Story 8.6:

- ❌ Rolling update of EXISTING sandboxes (deferred — AC12 entry 1)
- ❌ Multi-arch base image builds (deferred — AC12 entry 3)
- ❌ Decommissioning `snapshot-build.yml` (still needed for JustAVPS legacy path; convergence is housekeeping)
- ❌ Removing manual deploy script (`scripts/deploy-zero-downtime.sh`) — kept as fallback for catastrophic CI outage
- ❌ Changing Frontend / API / Vibe-Trading deploy paths (already automated, no change needed)
- ❌ Production VPS migration / disaster recovery / backup strategy — separate concern (no story yet)
- ❌ Cost optimization (e.g. caching base image on CDN) — premature optimization

---

## Tasks / Subtasks

Tasks listed in implementation order. Each task references the AC it satisfies.

### Task 1 — Dockerfile split (AC1, 4 hours)

- [ ] Read [`core/docker/Dockerfile`](core/docker/Dockerfile) end-to-end; identify cut point (currently around line 346 `COPY core/epsilon-master`)
- [ ] Create `core/docker/Dockerfile.base` = everything up to but NOT including the `COPY core/epsilon-master` + associated `RUN rsync + bun install` block. Keep all OS installs, global binaries, s6 services, DinD, init scripts.
- [ ] Update `core/docker/Dockerfile` to:
  ```dockerfile
  ARG BASE_TAG=stable-1
  FROM ghcr.io/deptrai/computer-base:${BASE_TAG}
  ARG SANDBOX_VERSION=0.0.0-dev
  COPY core/epsilon-master /opt/build/epsilon-master
  RUN set -eo pipefail && \
      rsync -a --exclude=node_modules --exclude=bun.lock --exclude=.git \
        /opt/build/epsilon-master/ /ephemeral/epsilon-master/ && \
      cd /ephemeral/epsilon-master && bun install && \
      bash /ephemeral/epsilon-master/opencode/patches/apply.sh && \
      chown -R abc:abc /ephemeral && \
      rm -rf /opt/build && \
      printf '{"version":"%s","updatedAt":"%s"}\n' \
        "${SANDBOX_VERSION}" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
        > /ephemeral/metadata/.version
  COPY core/daytona-start.sh /usr/local/bin/epsilon-daytona-start
  RUN chmod +x /usr/local/bin/epsilon-daytona-start
  ```
- [ ] Build base locally: `docker build -f core/docker/Dockerfile.base -t test-base:local .` — verify success, capture digest
- [ ] Tag local base as `ghcr.io/deptrai/computer-base:local` for testing
- [ ] Build thin locally: `docker build -f core/docker/Dockerfile --build-arg BASE_TAG=local -t test-thin:local .` — verify success in <5 min
- [ ] Smoke test thin locally: `docker run -d --name smoke -p 8000:8000 test-thin:local`, wait 30s, `curl http://localhost:8000/epsilon/health` → 200
- [ ] Commit both files in single commit: `feat(8-6): split Dockerfile into base + thin layers`

### Task 2 — Self-hosted runner setup on prod VPS (AC2, 3 hours)

- [ ] SSH to `167.172.66.16`, create non-root user: `useradd -m -s /bin/bash github-runner`, add to `docker` group
- [ ] Create directory `/var/lib/github-runner` owned by `github-runner`
- [ ] On GitHub: Settings → Actions → Runners → New self-hosted runner. Copy registration token.
- [ ] As `github-runner` user, download + configure runner agent per GitHub instructions (label: `sandbox-builder`)
- [ ] Install as systemd service per GitHub docs (`./svc.sh install github-runner && ./svc.sh start`)
- [ ] Verify runner appears in GitHub Actions UI as "Idle"
- [ ] Set up daily docker cleanup cron: `0 3 * * * docker system prune -af --filter "until=72h"` in `github-runner` crontab
- [ ] Create [`scripts/setup-self-hosted-runner.sh`](scripts/setup-self-hosted-runner.sh) capturing the procedure idempotently (for runner replacement)
- [ ] **Lock down repo settings:** Actions → General → Fork pull request workflows from outside collaborators → Require approval for all outside collaborators
- [ ] Test: trigger any existing workflow with `runs-on: sandbox-builder` (or temporarily reroute `test.yml`) → verify executes on self-hosted runner

### Task 3 — Base image build workflow (AC3, 3 hours)

- [ ] Create `.github/workflows/sandbox-base.yml` per AC3 spec
- [ ] Required secrets in GitHub repo: `GITHUB_TOKEN` is auto-provided; no new secrets needed for base (GHCR uses GITHUB_TOKEN)
- [ ] Add Telegram notification step using existing bot token (env from runner systemd `Environment=TELEGRAM_TOKEN=...` or secret `TELEGRAM_ADMIN_BOT_TOKEN`)
- [ ] Trigger build manually via `workflow_dispatch base_tag=stable-1` to seed initial base image
- [ ] Verify image appears in `https://github.com/deptrai?tab=packages` as `ghcr.io/deptrai/computer-base:stable-1`
- [ ] Pull from prod VPS to verify GHCR access: `docker pull ghcr.io/deptrai/computer-base:stable-1`

### Task 4 — Thin image auto-build workflow (AC4, 3 hours)

- [ ] Create `.github/workflows/sandbox-build.yml` per AC4 spec
- [ ] Paths filter MUST be exactly: `core/epsilon-master/**`, `core/daytona-start.sh`, `core/init-scripts/**`, `core/docker/Dockerfile`
- [ ] Add concurrency group keyed on `github.ref` with `cancel-in-progress: true`
- [ ] On first run: image should be `ghcr.io/deptrai/computer:next-<sha7>` + alias `:next`
- [ ] Verify build time: target ≤8 min cold, ≤3 min warm (subsequent builds same day)
- [ ] Test: make a trivial edit in `core/epsilon-master/opencode/agents/chainlens-tier1.md`, commit + push → verify workflow auto-fires

### Task 5 — Smoke test workflow (AC5, 6 hours)

- [ ] Add GitHub secrets: `DAYTONA_API_KEY` (copy from Dokploy env), `SMOKE_INTERNAL_KEY` (generate fresh: `openssl rand -hex 32`)
- [ ] Create [`scripts/smoke-sandbox.sh`](scripts/smoke-sandbox.sh) — shell script that:
  1. Takes `IMAGE_TAG` env var
  2. POSTs to Daytona API to create sandbox with that image
  3. Polls state until `started`
  4. Calls bootstrap via toolbox proxy (`setsid bash -c ...`)
  5. Polls `/epsilon/health` until 200 (max 90s)
  6. Calls OpenCode session create + tool invocation tests (via service key auth)
  7. Always DELETEs the sandbox on exit (trap EXIT)
  8. Exits 0 on full pass, 1 on any fail
- [ ] Create `.github/workflows/sandbox-smoke.yml` calling the script via self-hosted runner
- [ ] Chain from `sandbox-build.yml`: add `needs: [build]` step calling `sandbox-smoke` with `image_tag` input
- [ ] Test smoke locally first by running `bash scripts/smoke-sandbox.sh` with a known-good image

### Task 6 — Auto-promote + Dokploy patch (AC6, 4 hours)

- [ ] Audit Dokploy API: identify the exact endpoint to update env vars without losing other vars. Test with curl against staging app first if available.
  - Likely path: `GET /api/application.one?applicationId=...` to fetch current env → string replace `DAYTONA_SNAPSHOT=...` line → `POST /api/application.update` with full new env string
- [ ] Add GitHub secrets: `DOKPLOY_URL=http://167.172.66.16:3000`, `DOKPLOY_API_KEY` (from Dokploy Settings → API), `DOKPLOY_API_APP_ID=SESgs1lTKXGJz0YMXmoxs`
- [ ] Add promotion step to `sandbox-smoke.yml` post-smoke-pass:
  1. `docker manifest inspect` to confirm `next-<sha7>` is the same digest as the built image (no race)
  2. Retag via GHCR API: `PUT /v2/deptrai/computer/manifests/stable` pointing at `next-<sha7>` digest
  3. Also push `stable-<sha7>` tag
  4. PATCH Dokploy env
  5. Trigger Dokploy redeploy
  6. Poll Dokploy app `applicationStatus` until `done` (timeout 5 min)
  7. On any error → exit 1 (triggers AC7 circuit breaker counter)
- [ ] Telegram success message format: `✅ Promoted ghcr.io/deptrai/computer:stable-<sha7>\nCommit: <msg>\nDokploy: <url>`

### Task 7 — Circuit breaker (AC7, 3 hours)

- [ ] Create state file location: `mkdir -p /var/lib/sandbox-ci && chown github-runner /var/lib/sandbox-ci` (Task 2)
- [ ] Add `scripts/ci-circuit-breaker.sh`:
  - Function `record_failure <sha> <reason>` — append to history JSON
  - Function `should_lock` — return 0 if last 3 entries are all failures
  - Function `lock` — `touch /var/lib/sandbox-ci/auto-promote-lock`
  - Function `is_locked` — check file existence
  - Function `unlock` — remove lock file + clear history
- [ ] In `sandbox-smoke.yml` promote step: call `should_lock` → if true, exit 1 without promoting
- [ ] Telegram CRITICAL on lock: include last 3 failure details
- [ ] Create `.github/workflows/unlock-promote.yml` — `workflow_dispatch`, single step `bash scripts/ci-circuit-breaker.sh unlock`

### Task 8 — Daytona GHCR pull verification (AC8, 2 hours)

- [ ] Verify GHCR package visibility:
  - `gh api /user/packages/container/computer-base` — check `visibility` field
  - If private: configure Daytona registry credentials
- [ ] Daytona registry setup:
  - Generate fresh GitHub PAT with ONLY `read:packages` scope (no other scopes — least privilege)
  - In Daytona dashboard or via API: add registry credential for `ghcr.io` with username `deptrai` + the PAT as password
- [ ] Test pull: create canary Daytona sandbox with `DAYTONA_SNAPSHOT=ghcr.io/deptrai/computer:stable-<sha>` via API → wait for `state=started` → verify epsilon-master boots
- [ ] Document in `production-deploy-guide.md` how to rotate the GHCR PAT (it expires) — runbook entry

### Task 9 — Rollback workflow (AC9, 1.5 hours)

- [ ] Create `.github/workflows/sandbox-rollback.yml` per AC9 spec
- [ ] Input validation: verify `target_sha` matches pattern `[a-f0-9]{7}` (avoid command injection)
- [ ] Verify GHCR tag exists before patching Dokploy (fail fast)
- [ ] Reset circuit breaker after successful rollback (`bash scripts/ci-circuit-breaker.sh unlock`)
- [ ] Telegram message: `⏪ Rolled back to stable-<sha>` + operator name (`github.actor`)

### Task 10 — Observability: Telegram + Sentry (AC10, 3 hours)

- [ ] Create reusable Telegram action: `.github/actions/telegram-notify/action.yml` (composite action wrapping `curl` to bot API)
- [ ] Integrate in all 4 workflows (base, build, smoke, rollback)
- [ ] In `apps/api`: add startup hook in `apps/api/src/index.ts` that compares `DAYTONA_SNAPSHOT` to last-seen value (read from `/tmp/last-snapshot.txt`), and on diff calls `Sentry.captureMessage('Sandbox snapshot updated', ...)`. Use `Sentry.addBreadcrumb` so subsequent errors in next ~5 min are tagged with the deploy event.
- [ ] Daily summary: create `.github/workflows/sandbox-daily-summary.yml` — `cron: '0 2 * * *'` (09:00 ICT) — query GHCR + workflow run history, post summary to Telegram

### Task 11 — Docs (AC11, 3 hours)

- [ ] Rewrite "Build sandbox image" section in `docs/production-deploy-guide.md` — mark old as DEPRECATED, add new "Automated sandbox image build (Story 8.6)" section
- [ ] Add "Self-hosted GitHub runner" section
- [ ] Add "Circuit breaker recovery" runbook section
- [ ] Update `CLAUDE.md` Troubleshooting / Known Issues to reference Story 8.6 automation
- [ ] After implementation, write Postmortem section at end of THIS story file: actual vs planned effort, surprises encountered, deferred follow-ups discovered

### Task 12 — Deferred work registry (AC12, 0.5 hours)

- [ ] Append 4 entries to `_bmad-output/implementation-artifacts/deferred-work.md` per AC12 spec
- [ ] Update `_bmad-output/implementation-artifacts/sprint-status.yaml`:
  - Add `8-6-production-devops-and-sandbox-image-cicd: ready-for-dev`
  - Rename existing `# 8-6 reserved for "Load testing..."` comment → `# 8-9 reserved...`

### Task 13 — End-to-end verification (post-impl, 2 hours)

- [ ] Trigger a real `core/epsilon-master/` change (e.g. update an agent prompt typo)
- [ ] Watch full pipeline: build → smoke → promote → Dokploy redeploy → new sandbox provision uses new image
- [ ] Verify Telegram notifications fire correctly
- [ ] Verify Sentry release marker appears
- [ ] Verify rollback workflow works (test with previous SHA)
- [ ] Verify circuit breaker (manually corrupt smoke test 3 times → confirm lock)
- [ ] Document elapsed wall-clock time per stage for Postmortem

---

## Dev Notes

### Critical guardrails

1. **Self-hosted runner = security risk.** A malicious PR could exec arbitrary code on prod VPS if not gated. AC2 enforces:
   - Only `push` events from protected branches trigger workflows on this runner
   - Fork PRs require maintainer approval
   - Runner runs as non-root `github-runner` user
   - Docker daemon access is the runner's superpower — `github-runner` user is in `docker` group but NOT in `sudo` group

2. **Dokploy API contract is brittle.** Task 6 audit step is CRITICAL — Dokploy `application.update` likely requires full env string, partial PATCH may wipe other vars. Verify against staging or with a no-op write first.

3. **Smoke test must spawn REAL Daytona sandbox.** A Docker-only smoke would miss Daytona-specific bugs (PID 1 sleep, ENTRYPOINT bypass, egress whitelist). The smoke MUST use Daytona API to provision an ephemeral sandbox.

4. **GHCR public vs private affects Daytona pull.** Verify package visibility in Task 8 BEFORE flipping production `DAYTONA_SNAPSHOT`. If private + Daytona credentials misconfigured, every new sandbox provisioning silently fails.

5. **Circuit breaker state lives on runner, not in GitHub.** If runner is replaced or VPS rebuilt, state is lost. Acceptable for V1 (rare event); future improvement could persist to S3 or Postgres.

6. **Don't bypass smoke test.** The `auto-promote` decision (chosen by user 2026-05-19) trades human gate for smoke coverage. Future changes MUST maintain smoke coverage ≥ today's level or revert to manual approval.

### Files this story will CREATE

- `core/docker/Dockerfile.base` (~450 lines, mostly cut from existing Dockerfile)
- `core/docker/Dockerfile` (~25 lines, slim FROM base)
- `.github/workflows/sandbox-base.yml`
- `.github/workflows/sandbox-build.yml`
- `.github/workflows/sandbox-smoke.yml`
- `.github/workflows/sandbox-rollback.yml`
- `.github/workflows/unlock-promote.yml`
- `.github/workflows/sandbox-daily-summary.yml`
- `.github/actions/telegram-notify/action.yml`
- `scripts/setup-self-hosted-runner.sh`
- `scripts/smoke-sandbox.sh`
- `scripts/ci-circuit-breaker.sh`

### Files this story will UPDATE

- `docs/production-deploy-guide.md` — replace "Build sandbox image" section, add "Self-hosted runner" + "Circuit breaker recovery"
- `CLAUDE.md` — Troubleshooting / Known Issues entries
- `apps/api/src/index.ts` — startup Sentry release marker (~10 lines)
- `_bmad-output/implementation-artifacts/deferred-work.md` — 4 new entries
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — add 8-6 row + rename 8-6 reservation

### Files this story will DELETE / DEPRECATE

- `core/docker/Dockerfile` (current monolithic) → SPLIT (not deleted, slimmed)
- No deletions in this story

### Architecture references

- [`_bmad-output/planning-artifacts/architecture.md`](_bmad-output/planning-artifacts/architecture.md) — sections "Sandbox Container", "Auto-update loop" (line 560)
- [`docs/production-deploy-guide.md`](docs/production-deploy-guide.md) — section "Build sandbox image" (current manual procedure being replaced) + "Daytona sandbox lifecycle" (PID 1 / ENTRYPOINT bypass background)
- [`CLAUDE.md`](CLAUDE.md) — section "How CI works (Story 5.0.5)" — pattern this story extends

### Previous story intelligence

- **Story 5.0.5** (CI test workflow done) — established pattern of separating required vs informational CI jobs. This story reuses that pattern: `sandbox-build` is required (must pass to ship), `sandbox-daily-summary` is informational.
- **Story 8.5** (in flight) — touches sandbox image (Litestream + other reliability). Coordinate with 8.5 owner to avoid Dockerfile.base merge conflicts.
- **Story 8.7** (done-with-caveat) — incident postmortem identified the manual build pain point. The `ensureRunning()` auto-recovery from 8.7 makes this story safer: bad images that boot at all will self-heal; only bootstrap-broken images cause hard failures (smoke test catches these).
- **Story 5.0.4** (chaos tests done) — pattern of chaos drilling in CI. Future enhancement: chaos test the auto-promote flow itself (deliberately break smoke test, verify circuit breaker locks correctly).

### Git intelligence summary

Recent commits relevant to this story:
- `60e6e18558` — preview proxy auto-recovery (this session)
- `46c94afbf3` — wire ensureRunning into wake flow
- `2930b7b732` — ensureRunning + networkAllowList guard
- `863b6569f2` — config browser proxy optional
- Tag history on `epsilonaicrypto/computer`: `daytona-fix-10`, `daytona-fix-11` (current) — keep both 30 days post-cutover as rollback targets

### Latest tech information

Verified 2026-05-19:
- GitHub-hosted `ubuntu-latest` runners: 14GB disk, 2 vCPU — insufficient for ~10GB image builds (AC2 rationale)
- GHCR storage: free for public packages, 500MB free + $0.25/GB for private packages. Computer-base image ~5GB → ~$1/month if private.
- Daytona registry credentials: configurable per-snapshot via API or dashboard
- Dokploy API: `application.update` and `application.redeploy` endpoints exist (verified in current session via `mcp__dokploy__application-redeploy` MCP tool)
- Cloudflare quick tunnel: still active at runtime (per tunnel-watchdog), unaffected by this story

### Project context reference

- Production VPS: `167.172.66.16` (root access via SSH key per `.ssh/config`)
- Dokploy dashboard: `http://167.172.66.16:3000`
- GitHub repo: `https://github.com/deptrai/chainlens`
- Branch: `feat/rename-chainlens-epsilon`
- Last incident: 2026-05-19 Story 8.7 `DAYTONA_NETWORK_ALLOW_LIST` outage — informs this story's safety-first design

### References

- BMAD code review skill: run `/bmad-code-review` against this story's implementation before marking done
- Story format reference: [`5-0-5-ci-workflow-bun-test-playwright.md`](_bmad-output/implementation-artifacts/5-0-5-ci-workflow-bun-test-playwright.md)
- Production runbook: [`docs/production-deploy-guide.md`](docs/production-deploy-guide.md)
- CI baseline failures: [`docs/runbooks/ci-baseline-failures.md`](docs/runbooks/ci-baseline-failures.md)

---

## Review Findings

_To be filled in during `/bmad-code-review` after implementation._

---

## Dev Agent Record

### Agent Model Used

_To be filled in._

### Debug Log References

_To be filled in._

### Completion Notes List

_To be filled in._

### File List

_To be filled in._

---

## Postmortem

_To be written after Task 13 verification completes. Required sections:_

1. **Actual vs planned effort** — per-task hours, total story hours
2. **Surprises encountered** — anything that didn't match the spec assumptions
3. **What worked well** — patterns to repeat
4. **What didn't work** — anti-patterns to avoid
5. **Deferred follow-ups discovered during implementation** — append to deferred-work.md
6. **Operational metrics** — first week post-deploy: # builds, # promotes, # smoke fails, # rollbacks, mean build time
