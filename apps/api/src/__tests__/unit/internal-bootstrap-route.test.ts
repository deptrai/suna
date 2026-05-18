import { describe, expect, test } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';

const SOURCE_PATH = path.resolve(process.cwd(), 'src/router/routes/internal-bootstrap.ts');
const SOURCE = fs.readFileSync(SOURCE_PATH, 'utf8');

describe('story 5.0.3 internal bootstrap route contract', () => {
  test('exposes GET /bootstrap-token route', () => {
    expect(SOURCE).toContain("internalBootstrap.get('/bootstrap-token'");
  });

  test('requires bearer provisioning key and compares hash', () => {
    expect(SOURCE).toContain("authHeader.startsWith('Bearer ')");
    expect(SOURCE).toContain('const providedHash = hashSecretKey(rawToken);');
    expect(SOURCE).toContain('providedHash !== sandbox.provisioningKey');
  });

  test('enforces per-sandbox hourly rate limit', () => {
    expect(SOURCE).toContain('const RATE_LIMIT_PER_HOUR = 10;');
    expect(SOURCE).toContain('rate limit exceeded');
  });

  test('returns canonical service key payload with expiresAt', () => {
    expect(SOURCE).toContain('serviceKey,');
    expect(SOURCE).toContain('expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()');
  });
});
