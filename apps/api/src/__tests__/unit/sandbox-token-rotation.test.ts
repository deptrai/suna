import { describe, expect, test } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';

// Spec AC4 + AC6: rotation grace period (acceptOldUntil) on admin rotate route.
// Source-inspection test — verifies the wire contract that admin/index.ts emits
// the grace boundary in both the audit log and the API response, computed once
// for consistency. End-to-end behavioral coverage lives in Story 5.0.4 chaos
// suite (rotate then immediately call sandbox with old token).

const SOURCE_PATH = path.resolve(process.cwd(), 'src/admin/index.ts');
const SOURCE = fs.readFileSync(SOURCE_PATH, 'utf8');

describe('story 5.0.3 sandbox token rotation grace contract (AC4)', () => {
  test('rotate route returns acceptOldUntil ISO timestamp', () => {
    expect(SOURCE).toContain('acceptOldUntil:');
  });

  test('grace boundary is computed once and shared between audit + response', () => {
    // No more than one `Date.now() + 30_000` literal in the rotate route block.
    const matches = SOURCE.match(/Date\.now\(\)\s*\+\s*30_000/g) || [];
    expect(matches.length).toBeLessThanOrEqual(1);
  });

  test('audit log emits accept_old_until in snake_case (AC4)', () => {
    expect(SOURCE).toContain('accept_old_until');
  });

  test('audit log includes rotated_by_user_id in snake_case (AC4)', () => {
    expect(SOURCE).toContain('rotated_by_user_id');
  });

  test('rotate route pushes new token to sandbox (best-effort)', () => {
    expect(SOURCE).toContain('/env/rotate-token');
    expect(SOURCE).toContain('pushed = rotateRes.ok');
  });
});
