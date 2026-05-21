import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const hookSource = readFileSync(
  join(process.cwd(), 'src/components/backtest/use-multi-backtest-run.ts'),
  'utf8',
);
const editorSource = readFileSync(
  join(process.cwd(), 'src/components/backtest/multi-strategy-editor.tsx'),
  'utf8',
);

describe('multi-strategy run lifecycle extraction safety net', () => {
  test('runIdRef increments per run invocation', () => {
    expect(hookSource).toContain('runIdRef.current += 1');
  });

  test('cancelAll aborts controllers and closes streams', () => {
    expect(hookSource).toContain('abortRefs.current.forEach((ctrl) => ctrl.abort())');
    expect(hookSource).toContain('streamRefs.current.forEach((s) => s.close())');
  });

  test('stale timeout callbacks bail on run id mismatch', () => {
    expect(hookSource).toContain('if (runIdRef.current !== thisRun) return;');
    expect(hookSource).toContain('onTimeout');
  });

  test('editor is wired to shared hook', () => {
    expect(editorSource).toContain('useMultiBacktestRun');
    expect(editorSource).toContain('const result = await run(payloads);');
  });
});
