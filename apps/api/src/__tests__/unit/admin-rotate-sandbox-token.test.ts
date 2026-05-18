import { describe, expect, test } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';

const SOURCE_PATH = path.resolve(process.cwd(), 'src/admin/index.ts');
const SOURCE = fs.readFileSync(SOURCE_PATH, 'utf8');

describe('story 5.0.3 admin rotate token contract', () => {
  test('exposes admin rotate route', () => {
    expect(SOURCE).toContain("adminApp.post('/api/sandboxes/:id/rotate-token'");
  });

  test('revokes old api key and creates new sandbox key', () => {
    expect(SOURCE).toContain(".set({ status: 'revoked' })");
    expect(SOURCE).toContain("type: 'sandbox'");
    expect(SOURCE).toContain('secretKeyHash');
  });

  test('updates sandbox config serviceKey and pushes rotate-token to sandbox', () => {
    expect(SOURCE).toContain('serviceKey: secretKey');
    expect(SOURCE).toContain("/env/rotate-token");
  });

  test('writes structured rotation audit log with prefixes and reason', () => {
    expect(SOURCE).toContain("event: 'sandbox.token.rotated'");
    expect(SOURCE).toContain('old_key_prefix');
    expect(SOURCE).toContain('new_key_prefix');
    expect(SOURCE).toContain('reason');
  });
});
