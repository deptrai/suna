/**
 * Story 5.0.2 AC3 / AC5 — atomic provision behavior.
 *
 * Verifies (via source-inspection — the provisioner imports a deep config /
 * pool / db chain that's painful to mock per-test; the contract here is the
 * implementation shape):
 *  - Pool-claim block is wrapped in db.transaction (atomic boundary).
 *  - createApiKey is called WITH the transaction handle (review P9 — so the
 *    api_keys insert rolls back with the sandbox row on partial failure).
 *  - Inner partial-provision sets innerProvisionFailed = true and re-throws
 *    (review P1 — no silent fallback to createSandbox).
 *  - Outer catch re-throws when innerProvisionFailed (review P1).
 *  - Outer catch skips its own cleanup when inner already destroyed the
 *    pool slot (review P6 — no double remove).
 *  - createApiKey signature accepts an optional tx param (review P9).
 *
 * Run in isolation:
 *   bun test apps/api/src/__tests__/unit/sandbox-provisioner-atomic.test.ts
 */

import { describe, test, expect } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';

function readSource(relative: string): string {
  return fs.readFileSync(path.resolve(process.cwd(), relative), 'utf8');
}

describe('AC3 atomic provision contract (review P1+P6+P9)', () => {
  const provisionerSource = readSource('src/platform/services/sandbox-provisioner.ts');

  test('pool-claim block is wrapped in db.transaction', () => {
    expect(provisionerSource).toMatch(/provisioned = await db\.transaction\(async \(tx\) => \{/);
  });

  test('createApiKey is invoked with the transaction handle (review P9 — no orphan key row on rollback)', () => {
    // The call must pass `tx` as the second arg so the api_keys insert
    // participates in the same atomic boundary as the sandboxes insert.
    expect(provisionerSource).toMatch(
      /const sandboxKey = await createApiKey\(\{[\s\S]*?\}, tx\);/,
    );
  });

  test('inner partial-provision sets innerProvisionFailed and re-throws (review P1)', () => {
    expect(provisionerSource).toMatch(/let innerProvisionFailed = false;/);
    expect(provisionerSource).toMatch(
      /catch \(provisionErr\) \{\s*\n\s*innerProvisionFailed = true;/,
    );
    expect(provisionerSource).toMatch(/throw provisionErr;/);
  });

  test('outer catch re-throws when innerProvisionFailed (review P1 — no silent fallback)', () => {
    // The smoking gun: outer catch must check innerProvisionFailed and re-throw
    // before logging the fallback warning. Without this, the inner throw is
    // silently caught and provisioning falls through to createSandbox.
    expect(provisionerSource).toMatch(
      /} catch \(err\) \{[\s\S]*?if \(innerProvisionFailed\) \{[\s\S]*?throw err;[\s\S]*?\}[\s\S]*?console\.warn\('\[sandbox-provisioner\] Pool claim failed/,
    );
  });

  test('innerProvisionFailed is hoisted to outer try scope so outer catch can read it', () => {
    // The variable must be declared OUTSIDE the if (claimed) block so the
    // outer catch can see it. If it's nested inside the if-block, the outer
    // catch references would not compile.
    const declarations = provisionerSource.match(/let innerProvisionFailed = false;/g);
    expect(declarations).not.toBeNull();
    expect(declarations!.length).toBe(1); // exactly one, hoisted
  });

  test('pool slot destroyed inside inner cleanup (review P6 inner half)', () => {
    expect(provisionerSource).toMatch(
      /await pool\.inventory\.destroyOne\(claim\.poolSandbox\);[\s\S]*?Destroyed orphaned pool sandbox/,
    );
  });
});

describe('AC3 review P9 — createApiKey signature accepts tx', () => {
  const apiKeysSource = readSource('src/repositories/api-keys.ts');

  test('createApiKey signature has optional tx parameter', () => {
    expect(apiKeysSource).toMatch(
      /export async function createApiKey\(\s*params: CreateApiKeyParams,\s*tx\?: DbOrTx,?\s*\): Promise<CreateApiKeyResult>/,
    );
  });

  test('createApiKey uses tx ?? db handle for the insert', () => {
    expect(apiKeysSource).toMatch(/const handle = \(tx \?\? db\) as Database;/);
    expect(apiKeysSource).toMatch(/await handle\s*\n?\s*\.insert\(epsilonApiKeys\)/);
  });

  test('DbOrTx type alias declared for tx parameter', () => {
    expect(apiKeysSource).toMatch(/type DbOrTx = Database \| Parameters<Parameters<Database\['transaction'\]>\[0\]>\[0\];/);
  });
});

describe('AC3 review P1 — error marker row uses fresh db.insert (rolled-back tx insert never persisted)', () => {
  const provisionerSource = readSource('src/platform/services/sandbox-provisioner.ts');

  test('error marker row written via module-level db, not tx', () => {
    // Inside the catch (provisionErr) block, the marker row must be inserted
    // via the module-level `db` handle, not `tx` — because the tx has been
    // rolled back at that point.
    expect(provisionerSource).toMatch(
      /catch \(provisionErr\)[\s\S]*?await db\.insert\(sandboxes\)\.values\(\{[\s\S]*?status: 'error',/,
    );
  });

  test('error marker metadata.error prefix matches spec (token_provision_partial)', () => {
    expect(provisionerSource).toMatch(/error: `token_provision_partial: \$\{errMsg\}`/);
  });
});
