import { describe, expect, test } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';

const SOURCE_PATH = path.resolve(process.cwd(), 'src/platform/services/sandbox-drift-reconciler.ts');
const SOURCE = fs.readFileSync(SOURCE_PATH, 'utf8');

describe('story 5.0.3 drift reconciler contract', () => {
  test('runs on a 60-second interval and gated by config flag', () => {
    expect(SOURCE).toContain('const INTERVAL_MS = 60_000;');
    expect(SOURCE).toContain('if (!config.SANDBOX_TOKEN_DRIFT_RECONCILER_ENABLED) return;');
  });

  test('reads INTERNAL_SERVICE_KEY and EPSILON_TOKEN from sandbox env', () => {
    expect(SOURCE).toContain("getEnvValue(sandbox.baseUrl, 'INTERNAL_SERVICE_KEY', headers)");
    expect(SOURCE).toContain("getEnvValue(sandbox.baseUrl, 'EPSILON_TOKEN', headers)");
  });

  test('auto-heals in cloud via rotate-token endpoint', () => {
    expect(SOURCE).toContain("fetch(`${baseUrl}/env/rotate-token`");
    expect(SOURCE).toContain("if (config.ENV_MODE === 'cloud')");
  });

  test('does not auto-heal in local mode and logs warning', () => {
    expect(SOURCE).toContain('local mode drift detected; manual operator action required');
  });
});
