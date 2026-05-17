import { describe, test, expect, mock } from 'bun:test';

import { buildShadowAnalyzePrompt, dispatchShadowPrompt } from '@/app/(dashboard)/dashboard/shadow-account/shadow-account.utils';
import { isTier1 } from '@/components/tier-gate.utils';

describe('shadow-account page logic', () => {
  test('tier gate classifies free/none/undefined as Tier 1', () => {
    expect(isTier1(undefined)).toBe(true);
    expect(isTier1('free')).toBe(true);
    expect(isTier1('none')).toBe(true);
    expect(isTier1('tier2')).toBe(false);
  });

  test('builds expected analyze prompt with uploaded path and host', () => {
    const prompt = buildShadowAnalyzePrompt('/workspace/uploads/journal.csv', 'example.com');
    expect(prompt).toContain('analyze_trade_journal');
    expect(prompt).toContain('/workspace/uploads/journal.csv');
    expect(prompt).toContain('https://example.com/v1/router/vibe-trading/shadow-reports/<shadow_id>?format=html');
  });

  test('dispatch writes sessionStorage keys with chainlens-tier2', async () => {
    const storage = new Map<string, string>();
    const setItem = mock((key: string, value: string) => {
      storage.set(key, value);
    });
    (globalThis as { sessionStorage?: { setItem: (key: string, value: string) => void } }).sessionStorage = { setItem };

    const openTabSpy = mock(() => {});

    await dispatchShadowPrompt(
      async () => ({ id: 'sess-1' }),
      'prompt',
      'Shadow Account analysis',
      openTabSpy as any,
      'srv-1',
    );

    expect(storage.get('opencode_pending_prompt:sess-1')).toBe('prompt');
    expect(storage.get('opencode_pending_options:sess-1')).toBe(JSON.stringify({ agent: 'chainlens-tier2' }));
    expect(openTabSpy).toHaveBeenCalledTimes(1);
  });
});
