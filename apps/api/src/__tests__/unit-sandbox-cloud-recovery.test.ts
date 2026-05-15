import { describe, expect, test } from 'bun:test';

import { shouldReprovisionFailedSandbox } from '../platform/services/sandbox-reinitialize';

describe('sandbox cloud recovery decisions', () => {
  test('reprovisions errored sandboxes with no provider machine id', () => {
    expect(shouldReprovisionFailedSandbox('justavps', 'error', '', null)).toBe(true);
  });

  test('reprovisions errored sandboxes when provider reports removed', () => {
    expect(shouldReprovisionFailedSandbox('justavps', 'error', 'machine_123', 'removed')).toBe(true);
  });

  test('does not reprovision healthy provider machines', () => {
    expect(shouldReprovisionFailedSandbox('justavps', 'error', 'machine_123', 'running')).toBe(false);
    expect(shouldReprovisionFailedSandbox('justavps', 'error', 'machine_123', 'unknown')).toBe(false);
  });

  test('ignores non-error sandboxes', () => {
    expect(shouldReprovisionFailedSandbox('justavps', 'active', 'machine_123', 'removed')).toBe(false);
  });

  test('reprovisions errored daytona sandboxes', () => {
    expect(shouldReprovisionFailedSandbox('daytona', 'error', 'sandbox_123', 'unknown')).toBe(true);
  });
});
