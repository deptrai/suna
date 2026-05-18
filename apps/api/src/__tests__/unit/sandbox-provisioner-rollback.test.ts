/**
 * Story 5.0.4 AC4 — sandbox-provisioner atomic transaction rollback contract.
 *
 * Sister test to [sandbox-provisioner-atomic.test.ts] (5.0.2 review P9+P1+P6).
 * This file focuses on the rollback POSTCONDITION evidence in the
 * implementation:
 *  - Error marker row is inserted via the module-level `db` (NOT the
 *    rolled-back `tx`), with status='error' and metadata.error prefix
 *    'token_provision_partial:' so operators can see what failed in admin UI.
 *  - Pool slot is destroyed inside the inner cleanup so capacity isn't leaked.
 *  - The provisioner re-throws past the outer catch — no silent
 *    double-provision via the createSandbox fallback path.
 *
 * Uses source-inspection (regex assertions on the provisioner implementation
 * source) — runtime mocking the full pool/db/createSandbox chain is high-cost
 * relative to value here, and the contract is structural. Run isolated:
 *
 *   bun test apps/api/src/__tests__/unit/sandbox-provisioner-rollback.test.ts
 */

import { describe, test, expect } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';

const SOURCE_PATH = path.resolve(
  process.cwd(),
  'src/platform/services/sandbox-provisioner.ts',
);
const PROVISIONER_SOURCE = fs.readFileSync(SOURCE_PATH, 'utf8');

describe('AC4 atomic transaction wrapping (5.0.2 ship)', () => {
  test('pool-claim block opens a db.transaction', () => {
    expect(PROVISIONER_SOURCE).toMatch(/provisioned = await db\.transaction\(async \(tx\) => \{/);
  });

  test('inserts use the transaction handle (tx.insert)', () => {
    expect(PROVISIONER_SOURCE).toMatch(/await tx\s*\n?\s*\.insert\(sandboxes\)/);
    expect(PROVISIONER_SOURCE).toMatch(/await tx\s*\n?\s*\.update\(sandboxes\)/);
  });

  test('pool.injectEnv is called INSIDE the transaction (rolls back DB on throw)', () => {
    // Find the transaction body and assert injectEnv is inside it. The body
    // ends right before the catch (provisionErr) clause.
    const txMatch = PROVISIONER_SOURCE.match(
      /db\.transaction\(async \(tx\) => \{([\s\S]*?)\n[ ]+\}\);\s*\n\s*\} catch \(provisionErr\)/,
    );
    expect(txMatch).not.toBeNull();
    expect(txMatch![1]).toContain('await pool.injectEnv(claim, sandboxKey.secretKey, provisioningKey);');
  });
});

describe('AC4 rollback postconditions (P1+P6+P9)', () => {
  test('catch (provisionErr) sets innerProvisionFailed and re-throws', () => {
    expect(PROVISIONER_SOURCE).toMatch(
      /catch \(provisionErr\) \{\s*\n\s*innerProvisionFailed = true;/,
    );
    expect(PROVISIONER_SOURCE).toMatch(/throw provisionErr;/);
  });

  test('error marker row uses module-level db (not rolled-back tx)', () => {
    // After tx rollback, the marker row needs to be inserted via the
    // module-level `db` handle so it actually persists.
    expect(PROVISIONER_SOURCE).toMatch(
      /catch \(provisionErr\)[\s\S]*?await db\.insert\(sandboxes\)\.values\(\{[\s\S]*?status: 'error'/,
    );
  });

  test('error marker metadata records token_provision_partial prefix', () => {
    expect(PROVISIONER_SOURCE).toMatch(/error: `token_provision_partial: \$\{errMsg\}`/);
    expect(PROVISIONER_SOURCE).toMatch(/failedAt: new Date\(\)\.toISOString\(\)/);
  });

  test('inner cleanup destroys pool slot via pool.inventory.destroyOne', () => {
    expect(PROVISIONER_SOURCE).toMatch(
      /await pool\.inventory\.destroyOne\(claim\.poolSandbox\);[\s\S]*?Destroyed orphaned pool sandbox/,
    );
  });

  test('outer catch checks innerProvisionFailed and re-throws (no createSandbox fallback)', () => {
    expect(PROVISIONER_SOURCE).toMatch(
      /} catch \(err\) \{[\s\S]*?if \(innerProvisionFailed\) \{[\s\S]*?throw err;/,
    );
  });

  test('outer catch only cleans up when claimed AND inner cleanup did not run (review P6)', () => {
    // The outer cleanup branch is reached only when innerProvisionFailed is false
    // — guaranteed by the early-return throw above. Additionally, it gates on
    // claimed?.externalId so a no-claim path doesn't try to clean up.
    expect(PROVISIONER_SOURCE).toMatch(
      /} catch \(err\) \{[\s\S]*?if \(innerProvisionFailed\)[\s\S]*?throw err;[\s\S]*?\}[\s\S]*?if \(claimed\?\.externalId\) \{[\s\S]*?await provider\.remove\(claimed\.externalId\);/,
    );
  });

  test('createApiKey signature accepts the tx handle (review P9 — no orphan api_keys row on rollback)', () => {
    expect(PROVISIONER_SOURCE).toMatch(/await createApiKey\(\{[\s\S]*?\}, tx\);/);
  });
});

describe('AC4 capacity / leak prevention', () => {
  test('inner cleanup uses pool.inventory.destroyOne not provider.remove directly', () => {
    // destroyOne handles pool inventory bookkeeping (so capacity isn't leaked).
    // A naive provider.remove would deregister the container but not update
    // the pool inventory ready-count.
    const innerCleanup = PROVISIONER_SOURCE.match(
      /catch \(provisionErr\)([\s\S]*?)throw provisionErr;/,
    );
    expect(innerCleanup).not.toBeNull();
    expect(innerCleanup![1]).toContain('pool.inventory.destroyOne(claim.poolSandbox)');
  });

  test('partial-failure error log is informative enough for operators (errMsg captured)', () => {
    expect(PROVISIONER_SOURCE).toMatch(
      /const errMsg = provisionErr instanceof Error \? provisionErr\.message : String\(provisionErr\);/,
    );
    expect(PROVISIONER_SOURCE).toMatch(
      /console\.error\(`\[sandbox-provisioner\] Atomic provision failed \(rolled back DB write\): \$\{errMsg\}`\);/,
    );
  });
});
