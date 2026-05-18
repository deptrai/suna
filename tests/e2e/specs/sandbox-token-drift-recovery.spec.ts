/**
 * Story 5.0.4 AC1 + AC2 — Sandbox token drift end-to-end chaos tests.
 *
 * AC1: Drift detection → auto-reconcile → recovery within 1 retry. Proves
 * Story 5.0.2's reactive layer fires under real drift conditions.
 *
 * AC2: Circuit breaker prevents retry storm when container unreachable.
 *
 * Gating: SANDBOX_CHAOS_TESTS_ENABLED=true required to run. These tests
 * MUTATE shared sandbox state and must NOT run in parallel with other E2E
 * tests (playwright.config.ts already pins workers=1 so this is enforced by
 * config). On test failure, `afterAll` MUST restore the sandbox to a
 * known-good state regardless of failure mode.
 *
 * Cleanup discipline: every mutation is paired with a restore in
 * afterAll — drift state must not leak into subsequent test runs.
 */

import { test, expect } from '@playwright/test';
import { getAccessToken, apiBase } from '../helpers/auth';
import {
  SANDBOX_CONTAINER,
  execInSandbox,
  forceDriftOnS6Env,
  readContainerBootstrapKey,
  restoreS6EnvFromBootstrap,
  startSandboxContainer,
  stopSandboxContainer,
  waitForSandboxReady,
  querySandboxServiceKey,
} from '../helpers/sandbox-chaos';
import { logContains, countLogMatches, waitForLogLine } from '../helpers/api-log-tail';

const CHAOS_ENABLED = process.env.SANDBOX_CHAOS_TESTS_ENABLED === 'true';

test.describe('Sandbox token drift — chaos & regression (5.0.4 AC1+AC2)', () => {
  test.skip(!CHAOS_ENABLED, 'set SANDBOX_CHAOS_TESTS_ENABLED=true to enable chaos tests');

  // Sequential by playwright.config.ts workers=1. afterAll restores layer D
  // from layer C (the canonical bootstrap file) so the sandbox is left in
  // a known-good state even if a test failed mid-mutation.
  test.afterAll(async () => {
    try {
      // If we stopped the container in a circuit-breaker test, restart it.
      try {
        await waitForSandboxReady(SANDBOX_CONTAINER, 1_000);
      } catch {
        startSandboxContainer(SANDBOX_CONTAINER);
        await waitForSandboxReady(SANDBOX_CONTAINER, 30_000);
      }
      restoreS6EnvFromBootstrap(SANDBOX_CONTAINER);
    } catch (err) {
      // Surface cleanup failures to the test report so ops know to manually fix.
      console.error(`[chaos-cleanup] Could not restore sandbox ${SANDBOX_CONTAINER}:`, err);
      throw err;
    }
  });

  test('AC1 — drift on layer D triggers auto-reconcile and recovers within 1 retry', async () => {
    test.setTimeout(60_000);

    const token = await getAccessToken();
    const baselineBootstrap = readContainerBootstrapKey(SANDBOX_CONTAINER);
    expect(baselineBootstrap).toBeTruthy();

    // 1. Baseline check — verify the sandbox is responsive BEFORE we mutate.
    const baselineResp = await fetch(`${apiBase}/p/${SANDBOX_CONTAINER}/8000/health`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(baselineResp.status).toBe(200);

    // 2. Force drift on layer D (s6 env) — most realistic mutation.
    const bogusValue = forceDriftOnS6Env(
      `chaos-drift-${Date.now()}`,
      SANDBOX_CONTAINER,
    );
    expect(bogusValue).toMatch(/^chaos-drift-/);

    // 3. Trigger a request — this is the one that should fire the
    //    auto-reconcile chain in [local-preview.ts].
    const postDriftResp = await fetch(`${apiBase}/p/${SANDBOX_CONTAINER}/8000/health`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    // Reconcile + retry should produce a final 200 within the request lifetime.
    expect(postDriftResp.status).toBe(200);

    // 4. Wait for the reconcile log line to confirm the chain actually fired
    //    (not just that the retry happened to succeed for other reasons).
    const sawReconcile = await waitForLogLine(
      `[reconcile] sandbox=${SANDBOX_CONTAINER}`,
      5_000,
    );
    expect(sawReconcile).toBe(true);

    const sawResolved = logContains(
      `drift resolved (DB`,
      500,
    );
    expect(sawResolved).toBe(true);

    // 5. Verify DB → bootstrap convergence (Story 5.0.2 P10 — reconcile updates
    //    the right row by externalId).
    const dbKey = querySandboxServiceKey(SANDBOX_CONTAINER);
    const bootstrapKey = readContainerBootstrapKey(SANDBOX_CONTAINER);
    expect(dbKey).toBe(bootstrapKey);

    // 6. The X-Epsilon-Token-Drift response header MUST be stripped before
    //    the response leaves apps/api (Story 5.0.2 P5 — info leak prevention).
    expect(postDriftResp.headers.get('x-epsilon-token-drift')).toBeNull();
  });

  test('AC2 — circuit breaker trips when reconcile cannot read container, prevents retry storm', async () => {
    test.slow(); // explicit acknowledgment of the intentional 31s wait below.
    test.setTimeout(90_000);

    const token = await getAccessToken();

    // 1. Force drift first so the next request would attempt reconcile.
    forceDriftOnS6Env(`chaos-circuit-${Date.now()}`, SANDBOX_CONTAINER);

    // 2. Stop the container — reconcile's docker exec read will fail.
    stopSandboxContainer(SANDBOX_CONTAINER);

    // 3. Count `[reconcile]` lines BEFORE so we can assert the delta.
    const beforeCount = countLogMatches('[reconcile]');

    // 4. Fire 5 rapid requests — circuit should trip after the first failure
    //    and the remaining 4 should fall through without further reconcile attempts.
    const responses = await Promise.all(
      Array.from({ length: 5 }, () =>
        fetch(`${apiBase}/p/${SANDBOX_CONTAINER}/8000/health`, {
          headers: { Authorization: `Bearer ${token}` },
          // Short timeout so a hanging request fails the test fast.
          signal: AbortSignal.timeout(10_000),
        }).catch((err) => ({ status: 0, error: String(err) }) as any),
      ),
    );

    // Each request returns SOME response (success, 4xx, 5xx, or fetch error) —
    // the contract is "doesn't hang", not "all succeed". The container is
    // stopped so 5xx is expected.
    expect(responses.length).toBe(5);

    // 5. Allow log lines to settle and assert only ONE reconcile attempt fired.
    await new Promise((r) => setTimeout(r, 2_000));
    const afterCount = countLogMatches('[reconcile]');
    const reconcileDelta = afterCount - beforeCount;

    // We expect AT MOST 1-2 reconcile attempts (the first one trips the circuit;
    // a race window of one concurrent request may also slip through). Five
    // would mean the circuit isn't tripping at all.
    expect(reconcileDelta).toBeLessThanOrEqual(2);

    // 6. Restart container.
    startSandboxContainer(SANDBOX_CONTAINER);
    await waitForSandboxReady(SANDBOX_CONTAINER, 60_000);

    // 7. Wait past the 30s cool-off window before the next reconcile is allowed.
    await new Promise((r) => setTimeout(r, 31_000));

    // 8. Fire one more request — reconcile should now be allowed AND should
    //    succeed because the container is back up. After reconcile, the layer
    //    D drift is restored from bootstrap by the helper below in afterAll.
    const postCooldownResp = await fetch(
      `${apiBase}/p/${SANDBOX_CONTAINER}/8000/health`,
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    );
    // After the cool-off + drift still present on layer D, the request will
    // trigger reconcile which reads the bootstrap (now back online), writes
    // it everywhere, and retries. Final status: 200.
    expect(postCooldownResp.status).toBe(200);
  });
});
