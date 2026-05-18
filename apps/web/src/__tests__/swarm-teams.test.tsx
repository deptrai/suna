import { describe, test, expect, mock } from 'bun:test';

import { SWARM_PRESETS, type SwarmPreset } from '@/components/swarm-teams/preset-catalog';
import { buildSwarmPrompt, dispatchSwarmPrompt } from '@/app/(dashboard)/dashboard/swarm-teams/swarm-teams.utils';
import { isTier1 } from '@/components/tier-gate.utils';

describe('SWARM_PRESETS catalog', () => {
  test('contains the 4 canonical presets from VT (2026-05)', () => {
    const names = SWARM_PRESETS.map((p) => p.name).sort();
    expect(names).toEqual([
      'crypto_due_diligence',
      'investment_committee',
      'macro_regime_scout',
      'quant_strategy_desk',
    ]);
  });

  test('every preset has at least one required variable', () => {
    for (const preset of SWARM_PRESETS) {
      expect(preset.requiredVars.length).toBeGreaterThan(0);
      for (const v of preset.requiredVars) {
        expect(v.name).toBeTruthy();
        expect(v.label).toBeTruthy();
        expect(v.placeholder).toBeTruthy();
      }
    }
  });
});

describe('swarm-teams tier gate', () => {
  test('Tier 1 sentinels block the grid', () => {
    expect(isTier1(undefined)).toBe(true);
    expect(isTier1('free')).toBe(true);
    expect(isTier1('none')).toBe(true);
  });

  test('Tier 2+ keys unlock the grid', () => {
    expect(isTier1('pro')).toBe(false);
    expect(isTier1('enterprise')).toBe(false);
  });
});

describe('buildSwarmPrompt', () => {
  const preset = SWARM_PRESETS[0]; // investment_committee

  test('embeds preset name and JSON-stringified vars', () => {
    const prompt = buildSwarmPrompt(preset, { target: 'AAPL.US', market: 'us' });
    expect(prompt).toContain(`"${preset.name}"`);
    // Story 5.5.1 — dispatches via vibe_trading_swarm OpenCode wrapper,
    // NOT the deprecated run_swarm MCP tool (proxy returns 410 for that).
    expect(prompt).toContain('vibe_trading_swarm');
    expect(prompt).not.toContain('run_swarm');
    expect(prompt).toContain('"target": "AAPL.US"');
    expect(prompt).toContain('"market": "us"');
  });

  test('JSON.stringify safely handles backticks and template syntax in values', () => {
    const prompt = buildSwarmPrompt(preset, { target: 'AAPL`${attack}`', market: 'us' });
    // JSON.stringify escapes nothing for backticks, but the surrounding template uses
    // \n line break, so the value is in a JSON string body — no template-literal eval.
    expect(prompt).toContain('AAPL`${attack}`');
  });
});

describe('dispatchSwarmPrompt', () => {
  function setupStorage() {
    const storage = new Map<string, string>();
    const setItem = mock((key: string, value: string) => storage.set(key, value));
    (globalThis as { sessionStorage?: { setItem: (k: string, v: string) => void } }).sessionStorage = { setItem };
    return storage;
  }

  test('writes sessionStorage with chainlens-tier2 and navigates with serverId', async () => {
    const storage = setupStorage();
    const openTabSpy = mock(() => {});

    await dispatchSwarmPrompt(async () => ({ id: 'swarm-sess' }), 'PROMPT', openTabSpy as any, 'srv-1');

    expect(storage.get('opencode_pending_prompt:swarm-sess')).toBe('PROMPT');
    expect(storage.get('opencode_pending_options:swarm-sess')).toBe(JSON.stringify({ agent: 'chainlens-tier2' }));
    expect(openTabSpy).toHaveBeenCalledTimes(1);
  });

  test('createSession rejection propagates so runPreset can surface error', async () => {
    setupStorage();
    const openTabSpy = mock(() => {});
    const failing = mock(async () => { throw new Error('VT MCP unavailable'); });

    await expect(
      dispatchSwarmPrompt(failing, 'p', openTabSpy as any, 'srv-1'),
    ).rejects.toThrow('VT MCP unavailable');

    expect(openTabSpy).not.toHaveBeenCalled();
  });
});
