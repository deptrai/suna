/**
 * Story 5.0.4 Task 1 — tail the apps/api dev log so chaos tests can assert
 * specific reconcile log lines fired (e.g. `[reconcile] sandbox=...drift
 * resolved`). Gracefully handles missing log file so the helper doesn't
 * crash on CI where stdout might not be redirected to a file.
 *
 * Default log path mirrors `bun run dev` redirect convention but can be
 * overridden via E2E_API_LOG_PATH env for CI.
 */

import { existsSync, readFileSync, statSync } from 'fs';

const DEFAULT_LOG_PATH =
  process.env.E2E_API_LOG_PATH ?? '/private/tmp/apps-api-dev.log';

/**
 * Read the last `n` lines from the apps/api log file. Returns empty array
 * when the file does not exist or is unreadable so tests can degrade
 * gracefully (a missing log file just means the assertion can't run, not
 * that the test should crash).
 */
export function tailApiLog(n = 100, logPath = DEFAULT_LOG_PATH): string[] {
  if (!existsSync(logPath)) return [];
  try {
    const stat = statSync(logPath);
    if (stat.size === 0) return [];
    // Simple tail — read the whole file and slice. For multi-MB logs we'd
    // seek from the end, but apps-api dev logs rarely exceed a few MB in
    // a single test run and the simplicity is worth more than the I/O.
    const content = readFileSync(logPath, 'utf8');
    const lines = content.split('\n').filter((l) => l.length > 0);
    return lines.slice(-n);
  } catch {
    return [];
  }
}

/**
 * Convenience helper: returns true iff any of the last `n` log lines
 * contains the given substring. Useful for one-line assertions like
 * `expect(logContains('[reconcile] sandbox=epsilon-sandbox drift resolved')).toBe(true);`.
 */
export function logContains(substring: string, n = 100, logPath = DEFAULT_LOG_PATH): boolean {
  const lines = tailApiLog(n, logPath);
  return lines.some((l) => l.includes(substring));
}

/**
 * Returns count of lines in the last `n` containing the given substring.
 * Useful for circuit-breaker assertions — fire 5 rapid requests, assert
 * `countLogMatches('[reconcile]') === 1` (debounce held the other 4).
 */
export function countLogMatches(substring: string, n = 200, logPath = DEFAULT_LOG_PATH): number {
  const lines = tailApiLog(n, logPath);
  return lines.filter((l) => l.includes(substring)).length;
}

/**
 * Wait for a substring to appear in the log within timeoutMs. Polls every
 * 250ms. Returns true on found, false on timeout. Use sparingly — explicit
 * polling shouldn't replace deterministic Playwright waits where possible.
 */
export async function waitForLogLine(
  substring: string,
  timeoutMs = 5_000,
  logPath = DEFAULT_LOG_PATH,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (logContains(substring, 500, logPath)) return true;
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}
