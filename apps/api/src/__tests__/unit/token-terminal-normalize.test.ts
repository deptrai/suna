import { describe, test, expect } from 'bun:test';
import {
  safeRatio,
  buildSnapshot,
  percentile,
  classifyValuationByPercentiles,
  classifyAgainstPeers,
  annualize,
  asNum,
} from '../../router/services/token-terminal-normalize';

describe('token-terminal normalize', () => {
  test('safeRatio positive denominator', () => {
    expect(safeRatio(10, 2)).toBe(5);
  });

  test('safeRatio zero/null denominator => null', () => {
    expect(safeRatio(10, 0)).toBeNull();
    expect(safeRatio(10, null)).toBeNull();
  });

  test('safeRatio allows negative denominator (e.g. P/E with losses)', () => {
    // negative earnings is meaningful — should NOT silently return null
    expect(safeRatio(100, -10)).toBe(-10);
  });

  test('safeRatio rejects NaN/Infinity', () => {
    expect(safeRatio(NaN, 1)).toBeNull();
    expect(safeRatio(1, NaN)).toBeNull();
    expect(safeRatio(Infinity, 1)).toBeNull();
  });

  test('asNum filters NaN/Infinity strings', () => {
    expect(asNum('NaN')).toBeNull();
    expect(asNum('Infinity')).toBeNull();
    expect(asNum('-')).toBeNull();
    expect(asNum('12.3')).toBe(12.3);
    expect(asNum(null)).toBeNull();
  });

  test('annualize honors days argument', () => {
    expect(annualize(100, 30)).toBeCloseTo(100 * (365 / 30));
    expect(annualize(100, 7)).toBeCloseTo(100 * (365 / 7));
    expect(annualize(100, 0)).toBeNull();
    expect(annualize(NaN, 30)).toBeNull();
  });

  test('percentile is deterministic', () => {
    expect(percentile([1, 2, 3, 4], 3)).toBe(75);
    expect(percentile([], 5)).toBeNull();
    expect(percentile([1, 2, 3], null)).toBeNull();
  });

  test('classifyValuationByPercentiles uses 33/67 cutoffs', () => {
    expect(classifyValuationByPercentiles(20, 25, 30)).toBe('undervalued');
    expect(classifyValuationByPercentiles(50, 50, 50)).toBe('fair');
    expect(classifyValuationByPercentiles(80, 75, 90)).toBe('overvalued');
    expect(classifyValuationByPercentiles(null, null, null)).toBe('insufficient_data');
  });

  test('classifyAgainstPeers returns undervalued when target ratios below sector peers', () => {
    const target = { psRatioFullyDiluted: 1, pfRatioFullyDiluted: 1, peRatio: 5 };
    const peers = [
      { projectId: 'a', psRatioFullyDiluted: 10, pfRatioFullyDiluted: 8, peRatio: 25 },
      { projectId: 'b', psRatioFullyDiluted: 12, pfRatioFullyDiluted: 9, peRatio: 30 },
      { projectId: 'c', psRatioFullyDiluted: 15, pfRatioFullyDiluted: 11, peRatio: 40 },
    ];
    const result = classifyAgainstPeers(target, peers);
    expect(result.valuationSignal).toBe('undervalued');
    expect(result.peerPercentiles.ps_ratio_fully_diluted).toBeLessThanOrEqual(33);
  });

  test('classifyAgainstPeers returns insufficient_data when no peers have data', () => {
    const result = classifyAgainstPeers(
      { psRatioFullyDiluted: 5, pfRatioFullyDiluted: null, peRatio: null },
      [{ projectId: 'a', psRatioFullyDiluted: null, pfRatioFullyDiluted: null, peRatio: null }],
    );
    expect(result.valuationSignal).toBe('insufficient_data');
    expect(result.peerPercentiles).toEqual({});
  });

  test('buildSnapshot returns structured risk factor objects with severity', () => {
    const snap = buildSnapshot({ projectId: 'x', values: { market_cap_circulating: 100 } });
    expect(snap.riskFactors.length).toBeGreaterThan(0);
    expect(snap.riskFactors[0]).toHaveProperty('code');
    expect(snap.riskFactors[0]).toHaveProperty('label');
    expect(snap.riskFactors[0]).toHaveProperty('severity');
    expect(['low', 'medium', 'high', 'critical']).toContain(snap.riskFactors[0]!.severity);
  });

  test('buildSnapshot flags negative_earnings when earnings annualized is negative', () => {
    const snap = buildSnapshot({
      projectId: 'x',
      values: { market_cap_circulating: 1000, revenue: 100, fees: 100, earnings: -50 },
      periodDays: 30,
    });
    expect(snap.peRatio).not.toBeNull();
    expect(snap.peRatio!).toBeLessThan(0);
    expect(snap.riskFactors.some((r) => r.code === 'negative_earnings')).toBe(true);
  });

  test('buildSnapshot honors periodDays for annualization', () => {
    const snap30 = buildSnapshot({ projectId: 'x', values: { fees: 100 }, periodDays: 30 });
    const snap7 = buildSnapshot({ projectId: 'x', values: { fees: 100 }, periodDays: 7 });
    expect(snap7.feesAnnualizedUsd).toBeGreaterThan(snap30.feesAnnualizedUsd!);
  });

  test('buildSnapshot does not propagate NaN through ratios', () => {
    // simulating provider returning NaN string mapped via asNum
    const snap = buildSnapshot({
      projectId: 'x',
      values: { market_cap_fully_diluted: asNum('NaN'), revenue: asNum('Infinity'), fees: 1, earnings: 1 },
    });
    expect(snap.psRatioFullyDiluted).toBeNull();
  });
});
