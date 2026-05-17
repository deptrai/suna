import { describe, test, expect } from 'bun:test';

import { SWARM_PRESETS } from '@/components/swarm-teams/preset-catalog';
import { buildSwarmPrompt } from '@/app/(dashboard)/dashboard/swarm-teams/swarm-teams.utils';
import { isTier1 } from '@/components/tier-gate.utils';

describe('swarm-teams page logic', () => {
  test('preset catalog is available for Tier 2 grid', () => {
    expect(SWARM_PRESETS.length).toBeGreaterThan(0);
    expect(SWARM_PRESETS.some((p) => p.name === 'investment_committee')).toBe(true);
  });

  test('tier gate renders upgrade for Tier 1', () => {
    expect(isTier1('free')).toBe(true);
    expect(isTier1('tier3')).toBe(false);
  });

  test('buildSwarmPrompt includes preset + vars json', () => {
    const preset = SWARM_PRESETS[0];
    const prompt = buildSwarmPrompt(preset, { target: 'AAPL.US', market: 'us' });
    expect(prompt).toContain(`"${preset.name}"`);
    expect(prompt).toContain('run_swarm');
    expect(prompt).toContain('get_swarm_run_status');
    expect(prompt).toContain('"target": "AAPL.US"');
  });
});
