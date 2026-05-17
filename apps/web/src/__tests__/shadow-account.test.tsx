import { describe, test, expect, mock } from 'bun:test';

import { buildShadowAnalyzePrompt, dispatchShadowPrompt } from '@/app/(dashboard)/dashboard/shadow-account/shadow-account.utils';
import { isTier1 } from '@/components/tier-gate.utils';

describe('shadow-account tier gate', () => {
  test('classifies free/none/undefined/null as Tier 1', () => {
    expect(isTier1(undefined)).toBe(true);
    expect(isTier1(null)).toBe(true);
    expect(isTier1('')).toBe(true);
    expect(isTier1('free')).toBe(true);
    expect(isTier1('none')).toBe(true);
  });

  test('classifies paid tier_keys as Tier 2+', () => {
    // Real values emitted by /api/billing/account-state
    expect(isTier1('pro')).toBe(false);
    expect(isTier1('enterprise')).toBe(false);
    // Internal naming sometimes used in tests/code paths
    expect(isTier1('tier2')).toBe(false);
    expect(isTier1('tier3')).toBe(false);
  });
});

describe('buildShadowAnalyzePrompt', () => {
  test('embeds uploaded path and host into expected template', () => {
    const prompt = buildShadowAnalyzePrompt('/workspace/uploads/journal.csv', 'example.com');
    expect(prompt).toContain('analyze_trade_journal');
    expect(prompt).toContain('extract_shadow_strategy');
    expect(prompt).toContain('run_shadow_backtest');
    expect(prompt).toContain('render_shadow_report');
    expect(prompt).toContain('scan_shadow_signals');
    expect(prompt).toContain('/workspace/uploads/journal.csv');
    expect(prompt).toContain('https://example.com/v1/router/vibe-trading/shadow-reports/<shadow_id>?format=html');
  });

  test('escapes special chars in path safely (no template literal injection)', () => {
    const prompt = buildShadowAnalyzePrompt('/workspace/uploads/${attack}.csv', 'host');
    expect(prompt).toContain('/workspace/uploads/${attack}.csv');
  });
});

describe('dispatchShadowPrompt', () => {
  function setupStorage() {
    const storage = new Map<string, string>();
    const setItem = mock((key: string, value: string) => storage.set(key, value));
    (globalThis as { sessionStorage?: { setItem: (k: string, v: string) => void } }).sessionStorage = { setItem };
    return { storage, setItem };
  }

  test('writes both sessionStorage keys with chainlens-tier2 agent', async () => {
    const { storage } = setupStorage();
    const openTabSpy = mock(() => {});
    const mutateAsync = mock(async () => ({ id: 'sess-1' }));

    await dispatchShadowPrompt(mutateAsync, 'PROMPT-BODY', 'Shadow Account analysis', openTabSpy as any, 'srv-1');

    expect(mutateAsync).toHaveBeenCalledTimes(1);
    expect(storage.get('opencode_pending_prompt:sess-1')).toBe('PROMPT-BODY');
    expect(storage.get('opencode_pending_options:sess-1')).toBe(JSON.stringify({ agent: 'chainlens-tier2' }));
    expect(openTabSpy).toHaveBeenCalledTimes(1);
  });

  test('passes serverId through to navigate', async () => {
    setupStorage();
    let captured: any;
    const openTabSpy = mock((arg: any) => { captured = arg; });

    await dispatchShadowPrompt(async () => ({ id: 'sess-2' }), 'p', 't', openTabSpy as any, 'srv-X');

    expect(captured.serverId).toBe('srv-X');
    expect(captured.id).toBe('sess-2');
    expect(captured.href).toBe('/sessions/sess-2');
    expect(captured.type).toBe('session');
  });

  test('createSession rejection propagates so caller can show error', async () => {
    setupStorage();
    const failingMutate = mock(async () => { throw new Error('quota exceeded'); });
    const openTabSpy = mock(() => {});

    await expect(
      dispatchShadowPrompt(failingMutate, 'p', 't', openTabSpy as any, 'srv-1'),
    ).rejects.toThrow('quota exceeded');

    expect(openTabSpy).not.toHaveBeenCalled();
  });
});
