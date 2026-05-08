---
title: 'Refactor 05-onboarding-to-dashboard.spec.ts'
type: 'refactor'
created: '2026-05-08'
status: 'done'
baseline_commit: '54fdb32186ae2198f4e2a39dd0536365600a9822'
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The E2E test file `05-onboarding-to-dashboard.spec.ts` is overly large (127 lines) with a single monolithic test block, violating the atomic principle. Additionally, it abuses hard waits (`setTimeout`, `waitForTimeout`), leading to flakiness and poor maintainability (Determinism score 0 in recent review).

**Approach:** Refactor the file by grouping related logic into `test.describe` blocks and breaking the monolithic test into smaller, atomic `test` cases (e.g., Auth Flow, Onboarding Flow, Dashboard Verification). Replace all hard waits with state-based Playwright waits (e.g., `waitForURL`, `waitForSelector`, or `expect().toBeVisible()`).

## Boundaries & Constraints

**Always:** Maintain the original test coverage and assertions. Ensure all tests run independently and reliably. Use `[P0]`, `[P1]`, etc., priority markers if applicable based on the surrounding context.

**Ask First:** If replacing a hard wait requires significant changes to the application's underlying timing logic or exposes a genuine race condition in the app itself.

**Never:** Delete existing test assertions without providing equivalent coverage. Do not introduce new hard waits.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Refactored Tests | Existing E2E environment | All tests pass deterministically without hard waits | N/A |

</frozen-after-approval>

## Code Map

- `tests/e2e/specs/05-onboarding-to-dashboard.spec.ts` -- Target test file requiring refactoring to improve maintainability and determinism.

## Tasks & Acceptance

**Execution:**
- [x] `tests/e2e/specs/05-onboarding-to-dashboard.spec.ts` -- Read current content to understand the monolithic flow.
- [x] `tests/e2e/specs/05-onboarding-to-dashboard.spec.ts` -- Refactor: Add `test.describe` block. Break the single `test` into multiple smaller `test` cases (e.g., 'should complete authentication', 'should complete onboarding', 'should verify dashboard').
- [x] `tests/e2e/specs/05-onboarding-to-dashboard.spec.ts` -- Refactor: Identify all instances of `setTimeout` or `page.waitForTimeout()` and replace them with robust Playwright waits (e.g., waiting for specific network responses, elements to be visible, or URL changes).

**Acceptance Criteria:**
- Given the refactored `05-onboarding-to-dashboard.spec.ts`, when executed by Playwright, then all tests pass consistently without relying on arbitrary time delays.
- Given the file structure, when inspected, then it uses `test.describe` and multiple atomic `test` blocks instead of one massive block.

## Spec Change Log

## Verification

**Commands:**
- `pnpm exec playwright test tests/e2e/specs/05-onboarding-to-dashboard.spec.ts` -- expected: All tests pass successfully and deterministically.

## Suggested Review Order

**Test Structure & Atomicity**
- Wrap entire suite in `test.describe.serial` and manage shared `page` state in `beforeAll`
  [`05-onboarding-to-dashboard.spec.ts:5`](../../tests/e2e/specs/05-onboarding-to-dashboard.spec.ts#L5)
- Break out "bootstrap owner and sign in" into an atomic `[P0]` block
  [`05-onboarding-to-dashboard.spec.ts:16`](../../tests/e2e/specs/05-onboarding-to-dashboard.spec.ts#L16)
- Break out "navigate through onboarding wizard" into an atomic `[P0]` block
  [`05-onboarding-to-dashboard.spec.ts:40`](../../tests/e2e/specs/05-onboarding-to-dashboard.spec.ts#L40)
- Break out "skip onboarding to reach dashboard" into an atomic `[P0]` block
  [`05-onboarding-to-dashboard.spec.ts:70`](../../tests/e2e/specs/05-onboarding-to-dashboard.spec.ts#L70)
- Break out "verify API access from dashboard" into an atomic `[P1]` block
  [`05-onboarding-to-dashboard.spec.ts:80`](../../tests/e2e/specs/05-onboarding-to-dashboard.spec.ts#L80)
- Break out "verify re-login works" into an atomic `[P1]` block
  [`05-onboarding-to-dashboard.spec.ts:102`](../../tests/e2e/specs/05-onboarding-to-dashboard.spec.ts#L102)

**Determinism & Robust Waits**
- Replace lock screen `setTimeout` with `expect().toBeVisible()` using `.or()` locators
  [`05-onboarding-to-dashboard.spec.ts:31`](../../tests/e2e/specs/05-onboarding-to-dashboard.spec.ts#L31)
- Replace wizard button `setTimeout` with `.or()` locator expectations for `continueBtn` vs `skipBtn`
  [`05-onboarding-to-dashboard.spec.ts:63`](../../tests/e2e/specs/05-onboarding-to-dashboard.spec.ts#L63)
- Replace re-login UI `setTimeout` with robust `expect().toBeVisible()`
  [`05-onboarding-to-dashboard.spec.ts:137`](../../tests/e2e/specs/05-onboarding-to-dashboard.spec.ts#L137)
