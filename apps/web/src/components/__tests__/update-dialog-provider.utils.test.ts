import { describe, expect, test } from 'bun:test';
import {
  DEV_PHASES,
  getDevPhase,
  getDevProgress,
  shouldForceCloseUpdateDialog,
  shouldForceOpenUpdateDialog,
} from '../update-dialog-provider.utils';

describe('update-dialog-provider utils', () => {
  test('exposes the dev phase sequence', () => {
    expect(DEV_PHASES).toEqual(['pulling', 'patching', 'stopping', 'restarting', 'verifying', 'complete']);
  });

  test('maps dev mode phase and progress deterministically', () => {
    expect(getDevPhase(true, 0, 'verifying')).toBe('pulling');
    expect(getDevPhase(true, 4, 'pulling')).toBe('verifying');
    expect(getDevPhase(false, 2, 'verifying')).toBe('verifying');
    expect(getDevProgress(true, 0, 55)).toBe(0);
    expect(getDevProgress(true, 5, 55)).toBe(100);
    expect(getDevProgress(false, 5, 55)).toBe(55);
  });

  test('forces update dialog close/open only on the intended branches', () => {
    expect(shouldForceCloseUpdateDialog(true, true, false)).toBe(true);
    expect(shouldForceCloseUpdateDialog(true, true, true)).toBe(false);
    expect(shouldForceCloseUpdateDialog(false, true, false)).toBe(false);
    expect(shouldForceOpenUpdateDialog(false, true)).toBe(true);
    expect(shouldForceOpenUpdateDialog(true, true)).toBe(false);
  });
});
