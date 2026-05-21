import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  tryAcquireRunLock,
  releaseRunLock,
  hasRunLock,
} from '@/components/thread/tool-views/opencode/proposal-store';

// Resolve sources relative to this test (not process.cwd()) so the suite passes whether
// `bun test` runs from repo root or apps/web.
const here = dirname(fileURLToPath(import.meta.url));
const componentsDir = join(here, '..');
const hookSource = readFileSync(join(componentsDir, 'use-multi-backtest-run.ts'), 'utf8');
const editorSource = readFileSync(join(componentsDir, 'multi-strategy-editor.tsx'), 'utf8');

// ── Pure-behavior tests for the session run lock ────────────────────────────────
// The lock helpers are pure (no React, no Zustand instance) — these are the only
// behavioral assertions we can make without `@testing-library/react`. Story 5.9.1 spec
// guardrail: do NOT add @testing-library/react solely for this story.

describe('session run lock (pure behavior)', () => {
  // Each test uses a unique session id and cleans up its own lock — no beforeEach hook
  // needed (bun:test types don't currently re-export it across all consumer suites).

  test('tryAcquireRunLock returns true on first acquire, false on second', () => {
    const sid = 'lock-test-1';
    try {
      expect(tryAcquireRunLock(sid)).toBe(true);
      expect(tryAcquireRunLock(sid)).toBe(false);
      expect(hasRunLock(sid)).toBe(true);
    } finally {
      releaseRunLock(sid);
    }
  });

  test('releaseRunLock frees the session for re-acquire', () => {
    const sid = 'lock-test-2';
    tryAcquireRunLock(sid);
    releaseRunLock(sid);
    expect(hasRunLock(sid)).toBe(false);
    expect(tryAcquireRunLock(sid)).toBe(true);
    releaseRunLock(sid);
  });

  test('lock is per-session — different session ids do not block each other', () => {
    const a = 'lock-test-3a';
    const b = 'lock-test-3b';
    try {
      expect(tryAcquireRunLock(a)).toBe(true);
      expect(tryAcquireRunLock(b)).toBe(true);
    } finally {
      releaseRunLock(a);
      releaseRunLock(b);
    }
  });

  test('empty sessionId opts out of the lock (legacy surfaces allowed)', () => {
    // Hook surfaces without a session pass '' or undefined → lock should be a no-op so
    // /dashboard/backtest multi-tab editor (no chat session) continues to work.
    expect(tryAcquireRunLock('')).toBe(true);
    expect(tryAcquireRunLock('')).toBe(true);
    expect(hasRunLock('')).toBe(false);
  });
});

// ── Hook source patterns (extraction safety net — Task 4.0) ──────────────────────
// Behavioral hook tests would require `@testing-library/react` (out of scope per Story
// 5.9.1 guardrails). These source-pattern assertions are SPECIFIC enough to catch the
// concrete regressions the extraction could introduce; they are not "contains 'runIdRef'"
// keyword-noise.

describe('useMultiBacktestRun extraction safety net (source patterns)', () => {
  test('runIdRef increments inside run() (stale-callback bail)', () => {
    expect(hookSource).toMatch(/const run = useCallback\(async[\s\S]+?runIdRef\.current \+= 1/);
  });

  test('every async callback bails when runIdRef advances (stale-run guard)', () => {
    // onPhaseB, onFailed, onTimeout, onError, the post-await stream open check, and the
    // poll IIFE all must check `runIdRef.current !== thisRun` before mutating state.
    const guardCount = (hookSource.match(/runIdRef\.current !== thisRun/g) ?? []).length;
    expect(guardCount).toBeGreaterThanOrEqual(5);
  });

  test('closeAllStreams aborts all controllers AND closes all streams', () => {
    expect(hookSource).toMatch(/closeAllStreams = useCallback\([\s\S]+?abortRefs\.current\.forEach\(\(ctrl\) => ctrl\.abort\(\)\)/);
    expect(hookSource).toMatch(/closeAllStreams = useCallback\([\s\S]+?streamRefs\.current\.forEach\(\(s\) => s\.close\(\)\)/);
  });

  test('closeAllStreams bumps runIdRef so in-flight IIFEs bail', () => {
    expect(hookSource).toMatch(/closeAllStreams = useCallback\([\s\S]+?runIdRef\.current \+= 1/);
  });

  test('poll fallback IIFE catches errors with diagnostic log (no unhandled rejection)', () => {
    // Original editor had `catch (err) { ... console.warn ... }` — extracted hook MUST
    // preserve it or AbortError from `pollRun` leaks as an unhandled promise rejection.
    expect(hookSource).toMatch(/await pollRun\([\s\S]+?\}\s*catch\s*\(\s*err\s*\)\s*\{[\s\S]+?console\.warn\(/);
  });

  test('hook does NOT return runIdRef (internal mutability, dead code)', () => {
    // runIdRef is an internal stale-callback ordering primitive; exposing it lets
    // consumers stomp it and break the bail logic.
    const returnStart = hookSource.lastIndexOf('return {');
    expect(returnStart).toBeGreaterThan(-1);
    const returnBlock = hookSource.slice(returnStart);
    expect(returnBlock).not.toContain('runIdRef,');
  });

  test('retry is its own callback (NOT a `retry: run` alias) — guards against undefined payloads', () => {
    const returnStart = hookSource.lastIndexOf('return {');
    const returnBlock = hookSource.slice(returnStart);
    expect(returnBlock).not.toMatch(/retry:\s*run\b/);
    // Retry must reference the memoized last payloads, not just forward to run().
    expect(hookSource).toContain('lastPayloadsRef');
  });

  test('session lock helpers are wired (Story 5.9.1 D3b — cross-instance double-run prevention)', () => {
    expect(hookSource).toContain('tryAcquireRunLock');
    expect(hookSource).toContain('releaseRunLock');
  });

  test('cleanup effect releases the session lock on unmount', () => {
    expect(hookSource).toMatch(/return\s*\(\)\s*=>\s*\{[\s\S]+?releaseRunLock\(sessionId\)/);
  });
});

describe('editor is wired to shared hook (parity)', () => {
  test('editor consumes useMultiBacktestRun + awaits run()', () => {
    expect(editorSource).toContain('useMultiBacktestRun');
    expect(editorSource).toContain('const result = await run(payloads);');
  });
});
