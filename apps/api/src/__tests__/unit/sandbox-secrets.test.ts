import { describe, expect, test } from 'bun:test';
import {
  buildSandboxServiceKeyConfigPatch,
  getSandboxServiceKeyFromConfig,
  setSandboxServiceKeyInConfig,
} from '../../shared/sandbox-secrets';

describe('sandbox service key encrypted config helper', () => {
  test('stores service keys encrypted and removes plaintext field', () => {
    const config = setSandboxServiceKeyInConfig({ other: 'kept', serviceKey: 'epsilon_sb_old' }, 'epsilon_sb_new');

    expect(config.other).toBe('kept');
    expect(config.serviceKey).toBeUndefined();
    expect(typeof config.serviceKeyEnc).toBe('string');
    expect(String(config.serviceKeyEnc).startsWith('enc:v1:')).toBe(true);
    expect(getSandboxServiceKeyFromConfig(config)).toBe('epsilon_sb_new');
  });

  test('falls back to plaintext during migration when encrypted payload cannot decrypt', () => {
    const config = {
      serviceKeyEnc: 'enc:v1:default:bad:bad:bad',
      serviceKey: 'epsilon_sb_plaintext_fallback',
    };

    expect(getSandboxServiceKeyFromConfig(config)).toBe('epsilon_sb_plaintext_fallback');
  });

  test('builds JSONB merge patch without plaintext serviceKey', () => {
    const patch = buildSandboxServiceKeyConfigPatch('epsilon_sb_patch');

    expect(patch.serviceKey).toBeUndefined();
    expect(typeof patch.serviceKeyEnc).toBe('string');
    expect(patch.serviceKeyEncAlg).toBe('aes-256-gcm');
  });
});
