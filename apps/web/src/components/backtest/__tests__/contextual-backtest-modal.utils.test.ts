import { describe, expect, test } from 'bun:test';
import {
  shouldCloseContextualModal,
  shouldRemountEditor,
} from '../contextual-backtest-modal.utils';

describe('ContextualBacktestModal utils', () => {
  describe('shouldRemountEditor', () => {
    test('returns false when code is unchanged', () => {
      expect(shouldRemountEditor('same-code', 'same-code')).toBe(false);
      expect(shouldRemountEditor(undefined, undefined)).toBe(false);
    });

    test('returns true when code changes', () => {
      expect(shouldRemountEditor('old', 'new')).toBe(true);
      expect(shouldRemountEditor(undefined, 'new')).toBe(true);
      expect(shouldRemountEditor('old', undefined)).toBe(true);
    });
  });

  describe('shouldCloseContextualModal', () => {
    test('always allows open action', () => {
      let called = false;
      const allowed = shouldCloseContextualModal(true, true, () => {
        called = true;
        return false;
      });

      expect(allowed).toBe(true);
      expect(called).toBe(false);
    });

    test('allows close immediately when not executing', () => {
      let called = false;
      const allowed = shouldCloseContextualModal(false, false, () => {
        called = true;
        return false;
      });

      expect(allowed).toBe(true);
      expect(called).toBe(false);
    });

    test('requires confirmation when closing during execution', () => {
      let called = 0;
      const denied = shouldCloseContextualModal(false, true, () => {
        called += 1;
        return false;
      });
      const allowed = shouldCloseContextualModal(false, true, () => {
        called += 1;
        return true;
      });

      expect(denied).toBe(false);
      expect(allowed).toBe(true);
      expect(called).toBe(2);
    });
  });
});
