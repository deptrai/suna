/**
 * Story 5.0.4 Task 1 — query the sandbox's session_owners SQLite table to
 * verify that a session was successfully stamped with a user owner. This is
 * the canonical signal that the X-Epsilon-User-Context HMAC verified
 * successfully — if drift broke verification, session_owners stays empty.
 *
 * SQLite path mirrors the convention in
 * [core/epsilon-master/tests/e2e/_helpers-sqlite-check.ts] and the production
 * plugin code in [core/epsilon-master/opencode/plugin/epsilon-system/lib/session-owner-lookup.ts].
 */

import { execSync } from 'child_process';

import { SANDBOX_CONTAINER } from './sandbox-chaos';

const SESSIONS_DB_PATH =
  process.env.SESSIONS_DB_PATH ?? '/home/vibe/.opencode/storage/sessions.db';

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function dockerExec(container: string, cmd: string, timeoutMs = 8_000): string {
  return execSync(`docker exec ${container} sh -c ${shellQuote(cmd)}`, {
    encoding: 'utf8',
    timeout: timeoutMs,
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

/**
 * Returns true iff session_owners has a row for the given sessionId. Returns
 * false when the row is absent OR when the DB doesn't exist yet (fresh sandbox).
 */
export function sessionOwnerExists(
  sessionId: string,
  container = SANDBOX_CONTAINER,
): boolean {
  try {
    const out = dockerExec(
      container,
      `sqlite3 ${SESSIONS_DB_PATH} "SELECT COUNT(*) FROM session_owners WHERE session_id = '${escapeSql(sessionId)}';" 2>/dev/null || echo 0`,
    );
    return parseInt(out, 10) > 0;
  } catch {
    // Container down or sqlite missing — treat as not-stamped so callers can
    // re-poll without crashing the test.
    return false;
  }
}

/**
 * Returns the owner_user_id stamped for a session, or null if not stamped.
 * Useful for asserting that the right user was attributed (not just that
 * SOME user was — drift can leave the row empty too).
 */
export function getSessionOwnerUserId(
  sessionId: string,
  container = SANDBOX_CONTAINER,
): string | null {
  try {
    const out = dockerExec(
      container,
      `sqlite3 -separator '|' ${SESSIONS_DB_PATH} "SELECT owner_user_id FROM session_owners WHERE session_id = '${escapeSql(sessionId)}' LIMIT 1;" 2>/dev/null`,
    );
    return out.length > 0 ? out : null;
  } catch {
    return null;
  }
}

/**
 * Count rows in session_owners. Useful baseline assertion — capture before
 * a drift mutation, verify the count increased by N after the drill request.
 */
export function countSessionOwners(container = SANDBOX_CONTAINER): number {
  try {
    const out = dockerExec(
      container,
      `sqlite3 ${SESSIONS_DB_PATH} "SELECT COUNT(*) FROM session_owners;" 2>/dev/null || echo 0`,
    );
    return parseInt(out, 10);
  } catch {
    return 0;
  }
}

function escapeSql(value: string): string {
  // Single-quote escape for sqlite literal (double the quote).
  return value.replace(/'/g, "''");
}
