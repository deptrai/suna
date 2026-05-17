---
stepsCompleted: ['step-01-preflight-and-context', 'step-02-identify-targets', 'step-03-generate-tests']
lastStep: 'step-03-generate-tests'
lastSaved: '2026-05-17T10:00:00Z'
inputDocuments:
  - /Users/luisphan/Documents/suna/_bmad-output/implementation-artifacts/2-1-1-mempool-sniffing-mev-tracking.md
  - /Users/luisphan/Documents/suna/_bmad-output/implementation-artifacts/2-1-2-entity-hacker-wallet-tracking.md
  - /Users/luisphan/Documents/suna/_bmad-output/planning-artifacts/prd.md
  - /Users/luisphan/Documents/suna/_bmad-output/planning-artifacts/architecture.md
---

## Step 1: Preflight & Context Loading Summary

- `BMad-Integrated` mode
- `fullstack` stack detected
- Framework validated via `tests/playwright.config.ts`
- `playwright-cli` not installed, so browser exploration skipped
- Loaded knowledge:
  - `test-levels-framework.md`
  - `test-priorities-matrix.md`
  - `data-factories.md`
  - `selective-testing.md`
  - `ci-burn-in.md`
  - `test-quality.md`
  - `api-testing-patterns.md`
  - `fixture-architecture.md`
  - `overview.md`

## Step 2: Automation Targets & Coverage Plan

### Targets

Primary target: Story 2.1.1 mempool sniffing and MEV tracking worker.

### Test Levels

- `Unit`
- `Integration / API`

### Priority

- `P0`: parser/classifier correctness, route contract, auth/billing guardrails
- `P1`: worker lifecycle, queue/job registration, websocket normalization
- `P2`: OpenCode wrapper ergonomics and sanitized error handling

### Coverage Plan

- `apps/api/src/router/services/mempool.ts`
- `apps/api/src/queue/bullmq/workers/mempool-worker.ts`
- `apps/api/src/router/routes/mempool-alerts.ts`
- `apps/api/src/router/index.ts` auth mounting for `/v1/router/mempool-alerts`
- `core/epsilon-master/opencode/tools/mempool_alerts.ts`

### Existing Coverage Found

- Parser coverage already exists for large swap, malformed input, and non-router tx.
- Route coverage already exists for shape and limit clamping.
- Tool wrapper coverage already exists for env handling and URL clamping.

### Gaps To Fill

- Missing auth + billing integration coverage for the mempool alerts route.
- Missing worker lifecycle coverage for disabled startup, missing WSS config, and scheduler setup.
- Missing negative-path coverage for OpenCode tool upstream errors.

### Strategy

- Keep logic-heavy checks at unit level.
- Use integration/API tests for auth, billing, and route contract.
- Avoid E2E/browser tests because this feature has no new UI journey.

## Step 3: Generated Test Coverage

- Execution mode resolved to `sequential` because subagent dispatch was not used in this run.
- Added integration coverage for `/v1/router/mempool-alerts` auth + billing + route wiring.
- Added worker lifecycle coverage for disabled startup, missing WSS config, scheduler registration, and shutdown cleanup.
- Expanded OpenCode tool coverage for upstream HTTP failures and network exceptions.

### Files Written

- `apps/api/src/__tests__/integrations/mempool-alerts.integration.test.ts`
- `apps/api/src/__tests__/unit/mempool-worker.test.ts`
- `core/epsilon-master/opencode/mempool_alerts.test.ts`

### Validation

- `bun test apps/api/src/__tests__/unit/mempool-service.test.ts apps/api/src/__tests__/unit/mempool-alerts-route.test.ts apps/api/src/__tests__/integrations/mempool-alerts.integration.test.ts apps/api/src/__tests__/unit/mempool-worker.test.ts`
- `bun test apps/api/src/__tests__/integrations/mempool-alerts.integration.test.ts`
- `bun test apps/api/src/__tests__/unit/mempool-worker.test.ts`
- `bunx vitest run core/epsilon-master/opencode/mempool_alerts.test.ts`

### Fixture Needs

- None beyond the existing local `bun:test` and `vitest` mocks.

---

## Dune Analytics Failover — Coverage Addendum (2026-05-17)

### Coverage Plan

**Primary targets (new code added in Dune failover implementation):**
- `apps/api/src/router/services/dune-labels.ts` — zero coverage, entirely new service
- `apps/api/src/queue/bullmq/workers/entity-wallet-worker.ts` — new failover branches

**Test Levels:** Unit (bun:test) — pure logic, HTTP mocks, DB insert capture

**Gaps filled:**

| Gap | Priority | File |
|-----|----------|------|
| `fetchDuneAddressLabel` config guard, HTTP contract, poll COMPLETED/FAILED, normalizer | P0 | `dune-labels.test.ts` |
| `fetchDuneTokenHolders` config guard, holder mapping, limit clamp to 100, lowercase token_address | P0 | `dune-labels.test.ts` |
| DUNE_API_KEY not leaked in error results | P0 | `dune-labels.test.ts` |
| Worker starts with Dune-only config (no Arkham key) | P0 | `entity-wallet-worker.test.ts` |
| Worker returns null when neither Arkham nor Dune configured | P0 | `entity-wallet-worker.test.ts` |
| `processTokenHolders` Dune-only path — `entityWalletLabels.source = 'dune'` | P0 | `entity-wallet-worker.test.ts` |
| `processTokenHolders` Arkham→Dune fallback on throw — `source = 'dune'` | P0 | `entity-wallet-worker.test.ts` |
| `processTokenHolders` Arkham path unchanged — `source = 'arkham'` | P0 | `entity-wallet-worker.test.ts` |

### Files Written / Updated

- `apps/api/src/__tests__/unit/dune-labels.test.ts` — 22 tests (new, bun:test)
- `apps/api/src/__tests__/unit/entity-wallet-worker.test.ts` — updated: 14 tests total (was 6; +2 startup guard, +5 failover, updated 1 existing test description)

### Cross-File Mock Isolation Note

`entity-wallet-worker.test.ts` registers `mock.module('../../router/services/dune-labels', ...)` at process level. Because Bun runs all test files in the **same process** with a shared module registry, `dune-labels.test.ts` must run in a **separate `bun test` invocation** — otherwise entity-wallet-worker.test.ts's module mock overrides the real dune-labels code under test.

### Validation

```bash
# dune-labels alone (22 pass) — must run separately
bun test src/__tests__/unit/dune-labels.test.ts

# entity-wallet 5-file suite (66 pass — integration test has pre-existing same-process isolation issue, passes when run alone)
bun test \
  src/__tests__/unit/entity-wallet-service.test.ts \
  src/__tests__/unit/entity-wallet-worker.test.ts \
  src/__tests__/unit/entity-wallet-route.test.ts \
  src/__tests__/unit/arkham-service.test.ts \
  src/__tests__/integrations/entity-wallet.integration.test.ts

# integration test alone (11 pass)
bun test src/__tests__/integrations/entity-wallet.integration.test.ts
```

### Test Count Summary (Dune addendum)

| File | Tests | Framework | Status |
|------|-------|-----------|--------|
| `dune-labels.test.ts` | 22 (new) | bun:test | run separately |
| `entity-wallet-worker.test.ts` | 14 (+8 new) | bun:test | part of 5-file suite |
| **Net new** | **30** | | |

---

## Story 2.1.2 — Entity & Hacker Wallet Tracking

### Coverage Plan

**Primary targets:**
- `apps/api/src/router/services/arkham.ts` — fetch helpers (token holders, address intelligence, batch)
- `apps/api/src/queue/bullmq/workers/entity-wallet-worker.ts` — BullMQ worker lifecycle & scheduler
- `apps/api/src/router/routes/entity-wallet-risk.ts` — Hono route integration (auth, billing, DB hit/miss, enqueueing)
- `core/epsilon-master/opencode/tools/entity_wallet_risk.ts` — OpenCode tool wrapper

**Existing coverage (28 tests pre-this-run):**
- `entity-wallet-service.test.ts` — `scoreEntity` + `computeHolderRiskSummary` pure logic
- `entity-wallet-worker.test.ts` — Worker lifecycle (start/stop/idempotency)
- `entity-wallet-route.test.ts` — Route contract, auth/billing, DB scenarios

**Gaps filled:**

| Gap | Priority | File |
|-----|----------|------|
| `fetchArkhamTokenHolders` HTTP contract, error handling, key leak prevention | P0 | `arkham-service.test.ts` |
| `fetchArkhamAddressIntelligence` 404 / non-404 / network | P0 | `arkham-service.test.ts` |
| `fetchArkhamBatchAddressIntelligence` graceful degradation, batch POST | P0 | `arkham-service.test.ts` |
| Route integration: auth→billing→DB hit→queue→response contract end-to-end | P0 | `entity-wallet.integration.test.ts` |
| `raw_response` never exposed on any path | P0 | `entity-wallet.integration.test.ts` |
| OpenCode tool: EPSILON_TOKEN / EPSILON_API_URL env guards | P0 | `entity_wallet_risk.test.ts` |
| OpenCode tool: proxy URL not Arkham, Bearer auth header | P0 | `entity_wallet_risk.test.ts` |
| OpenCode tool: 402/5xx/network/invalid-JSON error paths | P0 | `entity_wallet_risk.test.ts` |

### Security AC Assertions

- **AC-S1** `raw_response` asserted absent on every response path in integration test
- **AC-S2** `fetchArkhamTokenHolders` sanitizes network error messages (no key leak)
- **AC-S3** OpenCode tool only calls `EPSILON_API_URL/v1/router/entity-wallet-risk`, never `arkm.com`
- **AC-S4** OpenCode tool uses `Bearer EPSILON_TOKEN`, never `API-Key ARKHAM_API_KEY`

### Files Written

- `apps/api/src/__tests__/unit/arkham-service.test.ts` — 20 tests (bun:test)
- `apps/api/src/__tests__/integrations/entity-wallet.integration.test.ts` — 11 tests (bun:test)
- `core/epsilon-master/opencode/entity_wallet_risk.test.ts` — 15 tests (vitest)

### Cross-File Mock Isolation Fixes

Two changes were needed to allow all 5 entity-wallet test files to run together cleanly in the same Bun process:

1. **Removed `mock.restore()` from `entity-wallet-worker.test.ts` `afterAll`** — `mock.restore()` clears ALL module mocks globally, invalidating mocks registered by other test files in the same process. Bun handles inter-process cleanup automatically.

2. **Added `mock.module('ioredis', ...)` + `REDIS_URL` to `arkham-service.test.ts`** — Bun cascades mock invalidation: when `../../config` is replaced, any module that imports it (including `connection.ts`) may be re-evaluated. Mocking ioredis prevents `new Redis(...)` from being called during that re-evaluation.

### Validation

```bash
# All 5 files together (59 pass, 0 fail)
bun test \
  src/__tests__/unit/entity-wallet-service.test.ts \
  src/__tests__/unit/entity-wallet-worker.test.ts \
  src/__tests__/unit/entity-wallet-route.test.ts \
  src/__tests__/unit/arkham-service.test.ts \
  src/__tests__/integrations/entity-wallet.integration.test.ts

# OpenCode tool (vitest)
bunx vitest run core/epsilon-master/opencode/entity_wallet_risk.test.ts
```

### Test Count Summary

| File | Tests | Framework |
|------|-------|-----------|
| `entity-wallet-service.test.ts` | 14 (pre-existing) | bun:test |
| `entity-wallet-worker.test.ts` | 6 (pre-existing) | bun:test |
| `entity-wallet-route.test.ts` | 18 (pre-existing) | bun:test |
| `arkham-service.test.ts` | 20 (new) | bun:test |
| `entity-wallet.integration.test.ts` | 11 (new) | bun:test |
| `entity_wallet_risk.test.ts` | 15 (new) | vitest |
| **Total** | **84** | |
