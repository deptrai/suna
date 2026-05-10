import { describe, test, expect, beforeEach, afterEach } from 'bun:test';

// Test pure utility functions exported from strategy-editor (no DOM required)
import {
  getDraftKey,
  loadDraft,
  saveDraft,
  INITIAL_TEMPLATE,
} from '../strategy-editor';

// ── Minimal localStorage mock for Bun ────────────────────────────────────────
const store: Record<string, string> = {};
const mockLocalStorage = {
  getItem: (k: string) => store[k] ?? null,
  setItem: (k: string, v: string) => { store[k] = v; },
  removeItem: (k: string) => { delete store[k]; },
  clear: () => { Object.keys(store).forEach((k) => delete store[k]); },
};

if (typeof globalThis.localStorage === 'undefined') {
  Object.defineProperty(globalThis, 'localStorage', {
    value: mockLocalStorage,
    writable: true,
  });
} else {
  // Override if already defined
  globalThis.localStorage = mockLocalStorage as unknown as Storage;
}

beforeEach(() => mockLocalStorage.clear());
afterEach(() => mockLocalStorage.clear());

// ── getDraftKey ────────────────────────────────────────────────────────────────

describe('getDraftKey', () => {
  test('scopes key by accountId', () => {
    expect(getDraftKey('user-abc')).toBe('chainlens:backtest:draft:user-abc');
    expect(getDraftKey('user-xyz')).toBe('chainlens:backtest:draft:user-xyz');
  });

  test('different accounts get different keys', () => {
    expect(getDraftKey('a')).not.toBe(getDraftKey('b'));
  });
});

// ── saveDraft / loadDraft ──────────────────────────────────────────────────────

describe('saveDraft + loadDraft round-trip', () => {
  test('saves and loads content', () => {
    saveDraft('user-1', '{ "foo": 1 }');
    expect(loadDraft('user-1')).toBe('{ "foo": 1 }');
  });

  test('returns null for unknown accountId', () => {
    expect(loadDraft('nobody')).toBeNull();
  });

  test('returns null when draft is older than 7 days', () => {
    const key = getDraftKey('user-old');
    const staleEntry = JSON.stringify({
      content: 'old content',
      savedAt: Date.now() - 8 * 24 * 60 * 60 * 1000, // 8 days ago
    });
    mockLocalStorage.setItem(key, staleEntry);

    expect(loadDraft('user-old')).toBeNull();
    // Should also remove the stale entry
    expect(mockLocalStorage.getItem(key)).toBeNull();
  });

  test('loadDraft returns null on malformed JSON in storage', () => {
    mockLocalStorage.setItem(getDraftKey('user-bad'), 'not json!!!');
    expect(loadDraft('user-bad')).toBeNull();
  });

  test('different accounts do not share drafts', () => {
    saveDraft('user-a', 'content-A');
    saveDraft('user-b', 'content-B');

    expect(loadDraft('user-a')).toBe('content-A');
    expect(loadDraft('user-b')).toBe('content-B');
  });

  test('saveDraft is idempotent — last write wins', () => {
    saveDraft('user-idem', 'v1');
    saveDraft('user-idem', 'v2');
    expect(loadDraft('user-idem')).toBe('v2');
  });
});

// ── INITIAL_TEMPLATE ──────────────────────────────────────────────────────────

describe('INITIAL_TEMPLATE', () => {
  test('is a non-empty string', () => {
    expect(typeof INITIAL_TEMPLATE).toBe('string');
    expect(INITIAL_TEMPLATE.length).toBeGreaterThan(0);
  });

  test('contains required top-level keys', () => {
    expect(INITIAL_TEMPLATE).toContain('simulation_environment');
    expect(INITIAL_TEMPLATE).toContain('risk_management');
    expect(INITIAL_TEMPLATE).toContain('context_rules');
    expect(INITIAL_TEMPLATE).toContain('execution_flags');
  });

  test('parses as JSON5 (comments allowed)', async () => {
    const JSON5 = await import('json5').then((m) => m.default);
    expect(() => JSON5.parse(INITIAL_TEMPLATE)).not.toThrow();
  });

  test('instrument_type is SPOT (backend accepts SPOT|PERPETUAL, not FUTURES)', async () => {
    const JSON5 = await import('json5').then((m) => m.default);
    const parsed = JSON5.parse(INITIAL_TEMPLATE) as any;
    expect(parsed.simulation_environment.instrument_type).toBe('SPOT');
  });
});
