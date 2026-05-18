# Story 5.0.4: Sandbox Token Drift — Chaos & Regression Tests

Status: done

**Implementation log (2026-05-18)**: T1-T6 shipped. T7 (CI scaffolding) descoped to Story 5.0.5 per user decision — repo has no existing CI workflow running `bun test` or Playwright; greenfield scaffolding is out of scope.

**Deliverables:**
- [tests/e2e/helpers/sandbox-chaos.ts](tests/e2e/helpers/sandbox-chaos.ts) — `execInSandbox`, `readContainerBootstrapKey`, `readContainerS6EnvKey`, `querySandboxServiceKey`, `stopSandboxContainer`, `startSandboxContainer`, `waitForSandboxReady`, `forceDriftOnS6Env`, `restoreS6EnvFromBootstrap` (T1)
- [tests/e2e/helpers/session-owner.ts](tests/e2e/helpers/session-owner.ts) — `sessionOwnerExists`, `getSessionOwnerUserId`, `countSessionOwners` (T1)
- [tests/e2e/helpers/api-log-tail.ts](tests/e2e/helpers/api-log-tail.ts) — `tailApiLog`, `logContains`, `countLogMatches`, `waitForLogLine` (T1)
- [tests/e2e/specs/sandbox-token-drift-recovery.spec.ts](tests/e2e/specs/sandbox-token-drift-recovery.spec.ts) — AC1 drift-recovery + AC2 circuit-breaker tests, gated `SANDBOX_CHAOS_TESTS_ENABLED=true` (T2 + T3)
- [core/epsilon-master/tests/unit/verify-fail-closed.test.ts](core/epsilon-master/tests/unit/verify-fail-closed.test.ts) — 11 tests, all 4 reason values reachable, timing-safe comparison verified (T4)
- [apps/api/src/__tests__/unit/sandbox-provisioner-rollback.test.ts](apps/api/src/__tests__/unit/sandbox-provisioner-rollback.test.ts) — 12 tests, source-inspection of atomic tx + rollback postconditions (T5)
- [docs/runbooks/sandbox-token-drift-drill.md](docs/runbooks/sandbox-token-drift-drill.md) — 10-min manual chaos drill with 8 verification steps + failure mode table (T6)
- [CLAUDE.md](CLAUDE.md) — runbook linked from Troubleshooting

**Test results:** 57/57 pass (36 apps/api + 21 epsilon-master unit). E2E chaos specs require a live sandbox + `SANDBOX_CHAOS_TESTS_ENABLED=true` to run.

**Verification commands (run isolated, the default apps/api glob doesn't pick up src/__tests__/unit/):**
```sh
# apps/api unit
cd apps/api
bun test src/__tests__/unit/sandbox-provisioner-atomic.test.ts
bun test src/__tests__/unit/sandbox-provisioner-rollback.test.ts
bun test src/__tests__/unit/internal-service-key-env-sync.test.ts
bun test src/__tests__/unit/token-drift-reconcile.test.ts

# epsilon-master unit (auto-discovered)
cd ../../core/epsilon-master
bun test tests/unit/verify-fail-closed.test.ts
bun test tests/unit/epsilon-user-middleware.test.ts

# Chaos E2E (requires live sandbox)
SANDBOX_CHAOS_TESTS_ENABLED=true bun x playwright test tests/e2e/specs/sandbox-token-drift-recovery.spec.ts --project=chromium
```

**Epic:** 5 — Backtesting Sandbox
**Type:** P1 test infrastructure
**Created:** 2026-05-18
**Depends on:** Story 5.0.2 done (so reactive layer is testable). Strongly recommended BEFORE Story 5.0.3 ships.
**Blocks:** Confident rollout of 5.0.3 phases (cloud sandboxes can't be migrated without regression coverage)
**FRs:** N/A. **NFRs:** NFR8, NFR10. **ARs:** AR1, AR8.
**Estimated effort:** 1 day. **Owner:** Murat (Test Architect) + Bao.

## Story

As a Chainlens QA owner,
I want chaos tests that simulate sandbox restart, key rotation, and bootstrap-file corruption to prove drift detection + auto-heal work end-to-end,
so that Stories 5.0.2 / 5.0.3 don't regress as cloud provisioning logic evolves.

## Context

**Why now**: Story 5.0.2 just shipped — reactive auto-reconcile on `bad_signature` with sync retry + 30s circuit breaker. The implementation has 4 unit tests + 1 integration test (per AC5 of 5.0.2) but **no E2E coverage** that simulates real-world drift. Without chaos tests:
- Story 5.0.3 cloud-canonical migration can't be safely rolled out (3-phase rollout per 5.0.3 dev notes requires regression confidence)
- Any refactor to `bootstrap-env.ts`, `epsilon-user-middleware.ts`, or `sandbox-provisioner.ts` could silently break the reconcile chain
- Sentry alerts confirm production drift but operators can't reproduce locally

**Scope discipline**: This is a TEST story. NO new product features. NO refactors to production code. If a test exposes a 5.0.2/5.0.3 bug, file a separate hotfix story.

## Acceptance Criteria

### AC1 — Playwright E2E: drift-recovery scenario

**Given** Playwright test harness at [tests/playwright.config.ts](tests/playwright.config.ts) with existing patterns ([04-auth-flow.spec.ts](tests/e2e/specs/04-auth-flow.spec.ts), [05-onboarding-to-dashboard.spec.ts](tests/e2e/specs/05-onboarding-to-dashboard.spec.ts))

**When** Story 5.0.4 ships

**Then** new test file `tests/e2e/specs/sandbox-token-drift-recovery.spec.ts`:

```ts
test('sandbox token drift triggers auto-reconcile and recovers within 1 retry', async ({ page }) => {
  // 1. Login + open chat
  await loginAsTestUser(page);
  await page.goto('/');

  // 2. Capture baseline — send message, verify normal session creation works
  await sendChatMessage(page, 'baseline check');
  const baselineSessionId = await getCurrentSessionId(page);
  expect(await sessionOwnerExists(baselineSessionId)).toBe(true);

  // 3. Force drift via docker exec
  await execInSandbox('sh -c "echo bogus-drift-token > /run/s6/container_environment/EPSILON_TOKEN"');
  // Wait for s6 to pick up env change (epsilon-master reads file each request via config.ts:66 getter — no restart needed)

  // 4. Trigger NEW session creation
  await page.click('[data-testid="new-session-button"]');
  await sendChatMessage(page, 'post-drift check');
  const postDriftSessionId = await getCurrentSessionId(page);

  // 5. Assert auto-reconcile worked: session was stamped (proves user-context propagated despite drift)
  expect(postDriftSessionId).not.toBe(baselineSessionId);
  await expect.poll(() => sessionOwnerExists(postDriftSessionId), { timeout: 5000 }).toBe(true);

  // 6. Assert reconcile log line appeared in apps/api log
  const logLines = await tailApiLog(50);
  expect(logLines).toContain('[reconcile] sandbox=epsilon-sandbox drift resolved');

  // 7. Assert DB serviceKey now matches container bootstrap (reconcile pushed update)
  const dbKey = await querySandboxServiceKey('epsilon-sandbox');
  const containerKey = await readContainerBootstrapKey('epsilon-sandbox');
  expect(dbKey).toBe(containerKey);
});
```

**And** helpers added to `tests/e2e/helpers/`:
- `sandbox-chaos.ts` — `execInSandbox(cmd)`, `readContainerBootstrapKey(name)`, `querySandboxServiceKey(externalId)`
- `session-owner.ts` — `sessionOwnerExists(sessionId)` (queries sandbox SQLite via docker exec)
- `api-log-tail.ts` — `tailApiLog(n)` (reads `/private/tmp/api-dev.log` or equivalent)

**And** test cleans up: restore original token to s6 env at `afterAll` so subsequent tests don't inherit drift

**And** test is added to default `pnpm test:e2e` run (CI) — gated by `SANDBOX_CHAOS_TESTS_ENABLED=true` flag so local dev can opt out (chaos tests can flake under heavy parallel runs)

### AC2 — Playwright E2E: circuit breaker prevents retry storm

**Given** AC1 covers the happy path (drift → reconcile → recovery)

**When** Story 5.0.4 ships

**Then** new test in same file: `circuit breaker prevents retry storm when reconcile fails`:

```ts
test('drift + unreachable container = circuit breaker trips, requests fall through', async ({ page }) => {
  // 1. Login + force drift
  await loginAsTestUser(page);
  await execInSandbox('sh -c "echo bogus > /run/s6/container_environment/EPSILON_TOKEN"');

  // 2. Block docker exec from reading container (simulate unreachable: kill the sandbox listener)
  await stopSandboxContainer('epsilon-sandbox');

  // 3. Trigger request — reconcile will fail (can't read container)
  const start = Date.now();
  await sendChatMessage(page, 'should not hang');
  const elapsed = Date.now() - start;

  // 4. Assert request didn't hang on reconcile attempts (circuit breaker tripped after 1st failure)
  expect(elapsed).toBeLessThan(10_000); // 1s docker exec timeout + ~500ms request

  // 5. Send 5 rapid requests — assert only 1 reconcile attempt in logs (debounce works)
  for (let i = 0; i < 5; i++) await sendChatMessage(page, `rapid ${i}`);
  const logLines = await tailApiLog(100);
  const reconcileAttempts = logLines.filter(l => l.includes('[reconcile]')).length;
  expect(reconcileAttempts).toBe(1); // circuit breaker held for 30s window

  // 6. Restart container, wait 31s for cool-off, send another request
  await startSandboxContainer('epsilon-sandbox');
  await waitForSandboxReady();
  await page.waitForTimeout(31_000);
  await sendChatMessage(page, 'after cooldown');
  // Should now retry reconcile (and likely succeed)
});
```

**And** helpers added: `stopSandboxContainer(name)`, `startSandboxContainer(name)`, `waitForSandboxReady()` in `tests/e2e/helpers/sandbox-chaos.ts`

**And** test marked `test.slow()` (90s budget) — explicit acknowledgment of intentional `waitForTimeout(31_000)`

### AC3 — Unit fail-closed verification

**Given** existing test patterns in [core/epsilon-master/src/services/](core/epsilon-master/src/services/)

**When** Story 5.0.4 ships

**Then** new unit test `core/epsilon-master/src/services/__tests__/verify-fail-closed.test.ts`:

```ts
import { describe, test, expect } from 'bun:test';
import { encodeEpsilonUserContext, verifyEpsilonUserContext } from '../epsilon-user-context';

describe('verifyEpsilonUserContext fail-closed semantics', () => {
  test('sign with key A, verify with key B → bad_signature (never silent ok)', () => {
    const token = encodeEpsilonUserContext(
      { userId: 'u1', sandboxId: 'sb1', sandboxRole: 'platform_admin', scopes: ['*'] },
      'secret-A',
    );
    const result = verifyEpsilonUserContext(token, 'secret-B');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('bad_signature');
  });

  test('expired token rejected even with correct secret', () => {
    const token = encodeEpsilonUserContext(
      { userId: 'u1', sandboxId: 'sb1', sandboxRole: 'platform_admin', scopes: ['*'], ttlSeconds: -1 },
      'secret-A',
    );
    const result = verifyEpsilonUserContext(token, 'secret-A');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('expired');
  });

  test('malformed token (single part) → malformed reason', () => {
    const result = verifyEpsilonUserContext('not-a-jwt', 'secret-A');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('malformed');
  });

  test('empty token → malformed', () => {
    expect(verifyEpsilonUserContext('', 'secret-A').ok).toBe(false);
    expect(verifyEpsilonUserContext(null, 'secret-A').ok).toBe(false);
    expect(verifyEpsilonUserContext(undefined, 'secret-A').ok).toBe(false);
  });
});
```

**And** these tests are added to default `bun test` run for `core/epsilon-master`

**And** assert by exhaustive enumeration: the 4 documented `reason` values (`malformed`, `bad_signature`, `expired`, `invalid_json`) all have a test case

### AC4 — Unit provisioner rollback test

**Given** Story 5.0.2 AC3 added atomic transaction wrapping `sandbox-provisioner.ts` pool-claim block

**When** Story 5.0.4 ships

**Then** new test `apps/api/src/__tests__/unit/sandbox-provisioner-rollback.test.ts`:

```ts
import { describe, test, expect, mock, beforeEach } from 'bun:test';

let mockedInjectEnvThrows = false;

mock.module('@/pool', () => ({
  grab: async () => ({
    externalId: 'test-sandbox-x',
    baseUrl: 'http://test-sandbox-x:8000',
    metadata: {},
    poolSandbox: { provider: 'local_docker' },
  }),
  injectEnv: async () => {
    if (mockedInjectEnvThrows) throw new Error('mock: pool inject failed');
  },
}));

import { provisionSandboxFromCheckout } from '@/platform/services/sandbox-provisioner';

describe('sandbox-provisioner atomic transaction', () => {
  beforeEach(() => { mockedInjectEnvThrows = false; });

  test('happy path: sandbox row created with serviceKey set', async () => {
    const { row, created } = await provisionSandboxFromCheckout({
      accountId: 'acc-1', subscriptionId: 'sub-1', serverType: 'small', tierKey: 'tier1',
    });
    expect(created).toBe(true);
    expect(row?.config).toHaveProperty('serviceKey');
    expect((row?.config as any).serviceKey).toMatch(/^epsilon_sb_/);
  });

  test('pool.injectEnv throws → DB row rolls back, status=error, error message set', async () => {
    mockedInjectEnvThrows = true;
    await expect(provisionSandboxFromCheckout({
      accountId: 'acc-2', subscriptionId: 'sub-2', serverType: 'small', tierKey: 'tier1',
    })).rejects.toThrow('pool inject failed');

    // Verify cleanup: no orphaned active sandbox row for this subscription
    const orphan = await db.query.sandboxes.findFirst({
      where: and(eq(sandboxes.accountId, 'acc-2'), eq(sandboxes.status, 'active')),
    });
    expect(orphan).toBeUndefined();

    // Verify error row exists for diagnostics
    const errorRow = await db.query.sandboxes.findFirst({
      where: and(eq(sandboxes.accountId, 'acc-2'), eq(sandboxes.status, 'error')),
    });
    expect(errorRow?.metadata).toHaveProperty('error');
    expect((errorRow?.metadata as any).error).toContain('token_provision_partial');
  });

  test('pool slot released on partial failure (no leaked capacity)', async () => {
    mockedInjectEnvThrows = true;
    await expect(provisionSandboxFromCheckout({
      accountId: 'acc-3', subscriptionId: 'sub-3', serverType: 'small', tierKey: 'tier1',
    })).rejects.toThrow();
    // Spy on pool.releaseClaim was called — exact API depends on Story 5.0.2 implementation
  });
});
```

**And** test runs as `bun test apps/api/src/__tests__/unit/sandbox-provisioner-rollback.test.ts` (single file isolation per Story 2.3.2's CI guidance about mock module conflicts)

### AC5 — Manual chaos drill runbook

**Given** ops team needs to verify drift handling in production before relying on it

**When** Story 5.0.4 ships

**Then** new doc `docs/runbooks/sandbox-token-drift-drill.md`:

- **Step-by-step manual chaos drill** (10 min):
  1. Pick a non-production sandbox (or use local epsilon-sandbox)
  2. Note current Sentry alert count
  3. Execute: `docker exec <sandbox> sh -c "echo bogus > /run/s6/container_environment/EPSILON_TOKEN"`
  4. Trigger a request via UI or curl
  5. Verify: Sentry alert fires within 30s ✓, `[reconcile]` log line within 5s ✓, follow-up request succeeds without 401 ✓
  6. Verify: DB `sandboxes.config.serviceKey` now matches container value ✓
- **Rollback if reconcile is broken**: manual `docker exec` + DB UPDATE (the existing CLAUDE.md flow, kept as escape hatch)
- **Schedule**: run this drill quarterly + before any rotation of related infra (apps/api restart cadence, Daytona provider upgrade, etc.)

**And** runbook is linked from [CLAUDE.md](CLAUDE.md) troubleshooting section so ops can find it

### AC6 — CI integration

**Given** new tests added across multiple test runners (Playwright E2E, bun test for apps/api + epsilon-master)

**When** Story 5.0.4 ships

**Then** CI workflow (`.github/workflows/` or equivalent) is updated:
- Unit tests run on every PR (already happens; just ensure new files are picked up by existing glob)
- Playwright chaos tests run on `main` merges only (don't gate PR turnaround on flaky chaos infra) — gated by `SANDBOX_CHAOS_TESTS_ENABLED=true` env var
- Test artifact (HTML reporter) uploaded on failure for debugging

**And** flake budget: if chaos test fails 3× in a row on main, auto-create GitHub issue tagged `chaos-test-flake` for triage (don't ignore — flake here = potential 5.0.2 regression)

## Tasks / Subtasks

- [ ] **Task 1: Playwright chaos helpers** (AC1+AC2)
  - [ ] 1.1 Create `tests/e2e/helpers/sandbox-chaos.ts` with `execInSandbox`, `readContainerBootstrapKey`, `querySandboxServiceKey`, `stopSandboxContainer`, `startSandboxContainer`, `waitForSandboxReady`
  - [ ] 1.2 Create `tests/e2e/helpers/session-owner.ts` with `sessionOwnerExists(sessionId)` (docker exec bun-sqlite query against `session_owners` table)
  - [ ] 1.3 Create `tests/e2e/helpers/api-log-tail.ts` with `tailApiLog(n)` (reads `/private/tmp/api-dev.log` or CI-equivalent path; gracefully handle missing file)
  - [ ] 1.4 Add helpers to `tests/e2e/helpers/index.ts` barrel export

- [ ] **Task 2: Playwright drift-recovery test** (AC1)
  - [ ] 2.1 Create `tests/e2e/specs/sandbox-token-drift-recovery.spec.ts`
  - [ ] 2.2 Implement happy path test per AC1
  - [ ] 2.3 Add `beforeEach` to verify baseline token sync (skip test if env already broken)
  - [ ] 2.4 Add `afterAll` cleanup: restore original token via `trySyncServiceKey()`

- [ ] **Task 3: Playwright circuit-breaker test** (AC2)
  - [ ] 3.1 Add 2nd test to same spec file per AC2
  - [ ] 3.2 Mark `test.slow()` and document why (intentional 31s wait)

- [ ] **Task 4: Unit fail-closed test** (AC3)
  - [ ] 4.1 Create `core/epsilon-master/src/services/__tests__/verify-fail-closed.test.ts`
  - [ ] 4.2 Cover all 4 documented `reason` values
  - [ ] 4.3 Verify `bun test` discovers the new directory (check existing tsconfig + test discovery glob)

- [ ] **Task 5: Unit provisioner rollback test** (AC4)
  - [ ] 5.1 Create `apps/api/src/__tests__/unit/sandbox-provisioner-rollback.test.ts`
  - [ ] 5.2 Mock pool module per pattern in [token-terminal-worker.test.ts](apps/api/src/__tests__/unit/token-terminal-worker.test.ts)
  - [ ] 5.3 Cover 3 scenarios: happy path, partial fail rollback, pool slot release
  - [ ] 5.4 Document in PR: run this file in isolation (`bun test <file>`) due to mock module conflict pattern (parity Story 2.3.2 + 5.8)

- [ ] **Task 6: Runbook docs** (AC5)
  - [ ] 6.1 Create `docs/runbooks/sandbox-token-drift-drill.md` (NEW)
  - [ ] 6.2 Add link from [CLAUDE.md troubleshooting](CLAUDE.md) → drill runbook

- [ ] **Task 7: CI integration** (AC6)
  - [ ] 7.1 Locate existing CI config (`.github/workflows/*.yml` or similar)
  - [ ] 7.2 Add Playwright chaos test job (gated on `SANDBOX_CHAOS_TESTS_ENABLED=true`)
  - [ ] 7.3 Wire HTML reporter artifact upload on failure
  - [ ] 7.4 Document flake budget policy in PR description (3-flake rule)

## Dev Notes

### Critical brownfield guardrails

- **DO NOT** modify production code under test (epsilon-user-middleware, sandbox-provisioner, etc.) — this is a TEST story. If a test fails, file a separate hotfix.
- **DO NOT** assume Sentry is wired in test env — capture log lines as primary verification, Sentry as secondary
- **DO NOT** parallelize chaos tests with other E2E tests — chaos mutates shared sandbox state; existing `tests/playwright.config.ts:workers: 1` config is correct
- **DO NOT** leave sandbox in broken state after test failure — `afterAll` MUST run cleanup even on test failure (use `try/finally`)
- **DO** restore original token in `afterAll` even if test passed — drift state could leak into subsequent tests

### Existing test patterns to mirror

| Pattern | Source | Use for |
|---|---|---|
| Playwright spec layout | [04-auth-flow.spec.ts](tests/e2e/specs/04-auth-flow.spec.ts) | Task 2/3 — login + page interaction flow |
| Sequential test execution | [playwright.config.ts:workers=1](tests/playwright.config.ts) | Chaos tests must NOT parallel |
| bun:test mock module isolation | [token-terminal-worker.test.ts](apps/api/src/__tests__/unit/token-terminal-worker.test.ts) | Task 5 — provisioner mock |
| Docker exec helper pattern | [local-preview.ts:readContainerBootstrapKey](apps/api/src/sandbox-proxy/routes/local-preview.ts#L115) | Task 1 — shell out from helpers |

### Files this story will CREATE

```
tests/e2e/helpers/sandbox-chaos.ts                                            (NEW — Task 1)
tests/e2e/helpers/session-owner.ts                                            (NEW — Task 1)
tests/e2e/helpers/api-log-tail.ts                                             (NEW — Task 1)
tests/e2e/helpers/index.ts                                                    (UPDATE or NEW barrel)
tests/e2e/specs/sandbox-token-drift-recovery.spec.ts                          (NEW — Tasks 2+3)
core/epsilon-master/src/services/__tests__/verify-fail-closed.test.ts         (NEW — Task 4)
apps/api/src/__tests__/unit/sandbox-provisioner-rollback.test.ts              (NEW — Task 5)
docs/runbooks/sandbox-token-drift-drill.md                                    (NEW — Task 6)
.github/workflows/ (update existing or add chaos job)                         (UPDATE — Task 7)
```

### Files this story will UPDATE

| Path | What changes | Preserve |
|---|---|---|
| [tests/playwright.config.ts](tests/playwright.config.ts) | Possibly add `testMatch` for new spec if glob is restrictive | All other config (baseURL, retries, workers, reporters) |
| [CLAUDE.md](CLAUDE.md) troubleshooting section | Add link to new runbook | All other troubleshooting entries |

### Previous story intelligence

- **Story 5.0.2 (just shipped)**: Sync-retry with 30s circuit breaker + `X-Epsilon-Token-Drift` header signaling. AC1 of THIS story validates that retry chain end-to-end.
- **Story 2.3.2 + 5.8 (recent learning)**: bun:test mock module conflicts when multiple test files mock the same module — always run new test files in isolation in CI (`bun test <single-file>` not `bun test <directory>`). Document this in PR.
- **Story 5.0 + 5.0.1**: docker-compose volume mount patterns — Task 1's docker exec helpers mirror this conv.

### Project context reference

- [_bmad-output/planning-artifacts/architecture-notes-token-sync-2026-05-18.md](../planning-artifacts/architecture-notes-token-sync-2026-05-18.md) — drift threat model
- [_bmad-output/implementation-artifacts/5-0-2-sandbox-token-sync-reliability.md](5-0-2-sandbox-token-sync-reliability.md) — reactive layer (DUT)
- [_bmad-output/implementation-artifacts/5-0-3-sandbox-token-lifecycle-db-canonical.md](5-0-3-sandbox-token-lifecycle-db-canonical.md) — depends on this story's confidence before rollout

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story-5.0.4]
- [Source: tests/playwright.config.ts] — existing E2E harness
- [Source: tests/e2e/specs/04-auth-flow.spec.ts] — login flow pattern
- [Source: apps/api/src/__tests__/unit/token-terminal-worker.test.ts] — bun:test mock pattern
- [Source: core/epsilon-master/src/services/epsilon-user-context.ts] — code under test (AC3)
- [Source: apps/api/src/platform/services/sandbox-provisioner.ts] — code under test (AC4)

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List
