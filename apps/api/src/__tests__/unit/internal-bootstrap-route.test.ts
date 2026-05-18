import { describe, expect, test } from 'bun:test';
import {
  __testClearBootstrapAttemptState,
  __testNoteInvalidAttempt,
  validateProvisioningKeyExpiry,
} from '../../router/routes/internal-bootstrap';

describe('story 5.0.3 internal bootstrap route contract', () => {
  test('requires a valid provisioning-key expiry', () => {
    const now = Date.parse('2026-05-18T00:00:00.000Z');

    expect(validateProvisioningKeyExpiry({}, now)).toEqual({ ok: false, error: 'provisioning key expiry missing' });
    expect(validateProvisioningKeyExpiry({ provisioningKeyExpiresAt: 'not-a-date' }, now)).toEqual({ ok: false, error: 'provisioning key expiry invalid' });
    expect(validateProvisioningKeyExpiry({ provisioningKeyExpiresAt: '2026-05-17T23:59:59.000Z' }, now)).toEqual({ ok: false, error: 'provisioning key expired' });
    expect(validateProvisioningKeyExpiry({ provisioningKeyExpiresAt: '2026-05-18T00:00:01.000Z' }, now)).toEqual({ ok: true });
  });

  test('flags repeated invalid attempts even when client IP is unavailable', () => {
    const sandboxId = 'sandbox-no-ip';
    __testClearBootstrapAttemptState(sandboxId);

    expect(__testNoteInvalidAttempt(sandboxId, '')).toEqual({ suspicious: false, attempts: 1, uniqueIps: 0 });
    expect(__testNoteInvalidAttempt(sandboxId, '')).toEqual({ suspicious: false, attempts: 2, uniqueIps: 0 });
    expect(__testNoteInvalidAttempt(sandboxId, '')).toEqual({ suspicious: false, attempts: 3, uniqueIps: 0 });
    expect(__testNoteInvalidAttempt(sandboxId, '')).toEqual({ suspicious: false, attempts: 4, uniqueIps: 0 });
    expect(__testNoteInvalidAttempt(sandboxId, '')).toEqual({ suspicious: true, attempts: 5, uniqueIps: 0 });

    __testClearBootstrapAttemptState(sandboxId);
  });
});
