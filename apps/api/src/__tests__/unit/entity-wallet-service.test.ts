import { describe, expect, test } from 'bun:test';
import { scoreEntity, computeHolderRiskSummary, riskScoreToLevel, type ArkhamHolderEntry } from '../../router/services/arkham';

// ─── riskScoreToLevel ────────────────────────────────────────────────────────

describe('riskScoreToLevel', () => {
  test.each([
    [0, 'none'],
    [9, 'none'],
    [10, 'low'],
    [39, 'low'],
    [40, 'medium'],
    [79, 'medium'],
    [80, 'high'],
    [89, 'high'],
    [90, 'critical'],
    [100, 'critical'],
  ])('score %i → %s', (score, expected) => {
    expect(riskScoreToLevel(score)).toBe(expected);
  });
});

// ─── scoreEntity ──────────────────────────────────────────────────────────────

describe('scoreEntity', () => {
  test('[P0] hacker tag → critical', () => {
    const r = scoreEntity(['hacker'], null, null);
    expect(r.riskLevel).toBe('critical');
    expect(r.riskScore).toBe(95);
    expect(r.riskCategory).toBe('hacker');
  });

  test('[P0] sanctioned tag → critical score 100', () => {
    const r = scoreEntity(['sanctioned'], null, null);
    expect(r.riskLevel).toBe('critical');
    expect(r.riskScore).toBe(100);
  });

  test('[P0] cex entityType → medium', () => {
    const r = scoreEntity([], 'cex', null);
    expect(r.riskLevel).toBe('medium');
    expect(r.riskCategory).toBe('cex');
  });

  test('[P0] unknown entity → none/unknown', () => {
    const r = scoreEntity([], null, null);
    expect(r.riskLevel).toBe('none');
    expect(r.riskCategory).toBe('unknown');
    expect(r.riskScore).toBe(0);
  });

  test('[P1] mixer tag in entityName → high', () => {
    const r = scoreEntity([], null, 'Tornado mixer');
    expect(r.riskLevel).toBe('high');
    expect(r.riskCategory).toBe('mixer');
  });

  test('[P1] highest score wins when multiple tags', () => {
    const r = scoreEntity(['vc', 'hacker'], null, null);
    expect(r.riskLevel).toBe('critical');
    expect(r.riskScore).toBe(95);
  });

  test('[P1] bridge entityType → low', () => {
    const r = scoreEntity([], 'bridge', null);
    expect(r.riskLevel).toBe('low');
  });
});

// ─── computeHolderRiskSummary ─────────────────────────────────────────────────

function holder(tags: string[], entityType: string | null = null, entityName: string | null = null): ArkhamHolderEntry {
  return { address: '0x' + Math.random().toString(16).slice(2).padStart(40, '0'), tags, entityId: null, entityName, entityType };
}

describe('computeHolderRiskSummary', () => {
  test('[P0] empty holders → none risk, no factors', () => {
    const r = computeHolderRiskSummary([]);
    expect(r.riskLevel).toBe('none');
    expect(r.riskScore).toBe(0);
    expect(r.riskFactors).toHaveLength(0);
    expect(r.riskyHolderCount).toBe(0);
  });

  test('[P0] single hacker holder → critical + HIGH_RISK_HOLDER factor', () => {
    const r = computeHolderRiskSummary([holder(['hacker'])]);
    expect(r.riskLevel).toBe('critical');
    expect(r.riskScore).toBe(95);
    expect(r.riskyHolderCount).toBe(1);
    const factor = r.riskFactors.find((f) => f.code === 'HIGH_RISK_HOLDER');
    expect(factor).toBeDefined();
    expect(factor?.severity).toBe('high');
  });

  test('[P0] 3+ cex holders → CEX_CONCENTRATION factor', () => {
    const holders = [holder(['exchange']), holder(['cex']), holder(['exchange'])];
    const r = computeHolderRiskSummary(holders);
    const factor = r.riskFactors.find((f) => f.code === 'CEX_CONCENTRATION');
    expect(factor).toBeDefined();
    expect(factor?.severity).toBe('medium');
  });

  test('[P1] 2 cex holders → no CEX_CONCENTRATION factor', () => {
    const r = computeHolderRiskSummary([holder(['cex']), holder(['cex'])]);
    expect(r.riskFactors.find((f) => f.code === 'CEX_CONCENTRATION')).toBeUndefined();
  });

  test('[P1] all clean holders → low/none risk', () => {
    const r = computeHolderRiskSummary([holder(['treasury']), holder(['protocol'])]);
    expect(['none', 'low']).toContain(r.riskLevel);
    expect(r.riskyHolderCount).toBe(0);
  });
});
