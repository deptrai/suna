/**
 * Story 5.0.4 Task 1 — sandbox chaos helpers for Playwright drift / circuit
 * breaker E2E tests.
 *
 * All helpers shell out via `docker exec` / `docker stop/start` against a
 * named sandbox container. They are deliberately synchronous-ish (use
 * child_process.execSync) so test assertions can rely on completion before
 * the next step. None of these helpers leak state — every call is idempotent
 * and exits non-zero on failure for visibility.
 *
 * Default container name resolves from env $SANDBOX_NAME or falls back to
 * 'epsilon-sandbox' (local-dev convention per CLAUDE.md).
 */

import { execSync } from 'child_process';

export const SANDBOX_CONTAINER = process.env.SANDBOX_NAME ?? 'epsilon-sandbox';
const PG_CONTAINER = process.env.PG_CONTAINER ?? 'supabase_db_epsilon-local';
const PG_PASSWORD = process.env.PG_PASSWORD ?? 'postgres';
const EXEC_TIMEOUT_MS = 10_000;

function sh(cmd: string, timeoutMs = EXEC_TIMEOUT_MS): string {
  return execSync(cmd, {
    encoding: 'utf8',
    timeout: timeoutMs,
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

/**
 * Run an arbitrary shell command inside the sandbox container via docker exec.
 * Returns stdout. Throws on non-zero exit.
 */
export function execInSandbox(cmd: string, container = SANDBOX_CONTAINER): string {
  return sh(`docker exec ${container} sh -c ${shellQuote(cmd)}`);
}

/**
 * Read the EPSILON_TOKEN that the sandbox's epsilon-master process will use
 * for HMAC verification (canonical truth source after bootstrap-env regen).
 * Reads from /workspace/.persistent-system/secrets/.bootstrap-env.json first,
 * falls back to /workspace/.secrets/.bootstrap-env.json for older sandbox builds.
 */
export function readContainerBootstrapKey(container = SANDBOX_CONTAINER): string {
  const out = sh(
    `docker exec ${container} sh -c "cat /workspace/.persistent-system/secrets/.bootstrap-env.json 2>/dev/null || cat /workspace/.secrets/.bootstrap-env.json"`,
  );
  const parsed = JSON.parse(out) as { INTERNAL_SERVICE_KEY?: string; EPSILON_TOKEN?: string };
  const key = parsed.INTERNAL_SERVICE_KEY ?? parsed.EPSILON_TOKEN;
  if (!key) throw new Error(`No INTERNAL_SERVICE_KEY in bootstrap file for ${container}`);
  return key;
}

/**
 * Read the s6-env layer (Layer D in the 4-layer token store). This is what
 * the running epsilon-master process actually loaded — drift here is the
 * tightest possible test of the verify path.
 */
export function readContainerS6EnvKey(container = SANDBOX_CONTAINER): string {
  return sh(`docker exec ${container} cat /run/s6/container_environment/EPSILON_TOKEN`);
}

/**
 * Read the DB's view of the sandbox's serviceKey (Layer B).
 */
export function querySandboxServiceKey(externalId: string): string {
  const out = sh(
    `docker exec -e PGPASSWORD=${PG_PASSWORD} ${PG_CONTAINER} psql -U supabase_admin -d postgres -tA -c "SELECT config->>'serviceKey' FROM epsilon.sandboxes WHERE external_id = '${externalId}';"`,
  );
  return out.trim();
}

/**
 * Stop the named container — used in circuit-breaker test to simulate
 * "container unreachable" so reconcile cannot read the bootstrap file.
 */
export function stopSandboxContainer(container = SANDBOX_CONTAINER): void {
  sh(`docker stop ${container}`, 15_000);
}

/**
 * Start the named container.
 */
export function startSandboxContainer(container = SANDBOX_CONTAINER): void {
  sh(`docker start ${container}`, 15_000);
}

/**
 * Poll until the sandbox's epsilon-master returns 200 from /health, up to
 * timeoutMs. Throws on timeout so test fails fast instead of hanging.
 */
export async function waitForSandboxReady(
  container = SANDBOX_CONTAINER,
  timeoutMs = 60_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const code = sh(`docker exec ${container} sh -c "curl -sf -o /dev/null -w '%{http_code}' http://localhost:8000/health"`, 3_000);
      if (code === '200') return;
    } catch {
      /* container not yet up — keep polling */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Sandbox ${container} did not become ready within ${timeoutMs}ms`);
}

/**
 * Force a drift on Layer D (s6 env). Most realistic chaos — simulates
 * container restart with stale env. Returns the bogus value used so the
 * caller can verify reconcile produced something OTHER than this.
 */
export function forceDriftOnS6Env(
  bogusValue = 'bogus-drift-token-from-chaos-test',
  container = SANDBOX_CONTAINER,
): string {
  execInSandbox(
    `echo ${shellQuote(bogusValue)} > /run/s6/container_environment/EPSILON_TOKEN`,
    container,
  );
  return bogusValue;
}

/**
 * Restore Layer D from the bootstrap file (canonical recovery — what the
 * sandbox init scripts do). Use in `afterAll` cleanup to leave the sandbox
 * in a known-good state regardless of test outcome.
 */
export function restoreS6EnvFromBootstrap(container = SANDBOX_CONTAINER): void {
  const truthKey = readContainerBootstrapKey(container);
  execInSandbox(
    `echo ${shellQuote(truthKey)} > /run/s6/container_environment/EPSILON_TOKEN`,
    container,
  );
}

/** Defensive shell quoting — wraps the arg in single quotes with proper escaping. */
function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}
