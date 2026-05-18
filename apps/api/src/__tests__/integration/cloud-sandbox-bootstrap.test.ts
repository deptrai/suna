import { describe, expect, test } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';

const ROUTE_SOURCE = fs.readFileSync(path.resolve(process.cwd(), 'src/router/routes/internal-bootstrap.ts'), 'utf8');
const ENSURE_SOURCE = fs.readFileSync(path.resolve(process.cwd(), 'src/platform/services/ensure-sandbox.ts'), 'utf8');

describe('story 5.0.3 cloud bootstrap integration contract', () => {
  test('provisioning path injects PROVISIONING_KEY into sandbox env', () => {
    expect(ENSURE_SOURCE).toContain('PROVISIONING_KEY: provisioningKey');
  });

  test('internal bootstrap endpoint returns canonical service key from DB config', () => {
    expect(ROUTE_SOURCE).toContain('serviceKey = (sandbox.config as Record<string, unknown> | null)?.serviceKey;');
    expect(ROUTE_SOURCE).toContain('return c.json({');
    expect(ROUTE_SOURCE).toContain('serviceKey,');
  });

  test('bootstrap endpoint validates hashed provisioning key', () => {
    expect(ROUTE_SOURCE).toContain('const providedHash = hashSecretKey(rawToken);');
    expect(ROUTE_SOURCE).toContain('providedHash !== sandbox.provisioningKey');
  });
});
