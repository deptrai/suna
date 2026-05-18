import { describe, expect, test } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';

// Spec AC1 + AC6: cloud sandbox bootstrap pull from API, fallback to mirror on
// non-2xx, NEVER mutates the canonical DB. Source-inspection test — runtime
// behavior covered by Story 5.0.4 chaos suite.

const SOURCE_PATH = path.resolve(__dirname, '..', 'load-canonical-token.ts');
const SOURCE = fs.readFileSync(SOURCE_PATH, 'utf8');

describe('story 5.0.3 loadCanonicalToken contract (AC1)', () => {
  test('exports loadCanonicalToken returning a TokenSource', () => {
    expect(SOURCE).toContain('export async function loadCanonicalToken()');
    expect(SOURCE).toMatch(/source:\s*TokenSource/);
  });

  test('cloud mode pulls from /v1/internal/bootstrap-token using PROVISIONING_KEY', () => {
    expect(SOURCE).toContain('/v1/internal/bootstrap-token');
    expect(SOURCE).toContain('Bearer ${provisioningKey}');
  });

  test('cloud mode requires baseUrl + sandboxId + provisioningKey before calling API', () => {
    expect(SOURCE).toContain('process.env.SANDBOX_ID');
    expect(SOURCE).toContain('process.env.PROVISIONING_KEY');
    expect(SOURCE).toContain('process.env.EPSILON_API_URL');
  });

  test('falls back to mirror on any non-2xx response (4xx + 5xx)', () => {
    // Should NOT gate fallback on `>= 500` — that was the original bug.
    // The fallback path executes for any non-ok status.
    const guarded5xxOnly = /if\s*\(\s*res\.status\s*>=\s*500\s*\)/.test(SOURCE);
    expect(guarded5xxOnly).toBe(false);
    expect(SOURCE).toContain('readMirrorToken()');
  });

  test('local mode reads bind-mounted s6 token file (AC2)', () => {
    expect(SOURCE).toContain('S6_ENV_DIR');
    expect(SOURCE).toContain('EPSILON_TOKEN');
  });

  test('local mode logs error when sandbox-token.txt missing', () => {
    expect(SOURCE).toContain("sandbox-token.txt missing");
  });

  test('local mode logs error when sandbox-token.txt is empty', () => {
    expect(SOURCE).toContain('sandbox-token.txt is empty');
  });

  test('NEVER imports drizzle/db modules (read-only canonical pull, no DB mutation)', () => {
    expect(SOURCE).not.toContain("from '@epsilon/db'");
    expect(SOURCE).not.toContain("from 'drizzle-orm'");
    expect(SOURCE).not.toMatch(/db\.(insert|update|delete)\b/);
  });

  test('writes resolved token to s6 env, mirror, and process.env (AC1)', () => {
    expect(SOURCE).toContain('writeCoreAuthVars');
    expect(SOURCE).toContain('writeS6File');
    expect(SOURCE).toContain('persistMirror');
  });
});
