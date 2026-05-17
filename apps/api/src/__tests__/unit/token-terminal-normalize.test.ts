import { describe, test, expect } from 'bun:test';
import { safeRatio, classifyValuation, buildSnapshot, percentile } from '../../router/services/token-terminal-normalize';

describe('token-terminal normalize', () => {
  test('positive denominator computes ratios', () => {
    expect(safeRatio(10, 2)).toBe(5);
  });

  test('zero/null denominator => null', () => {
    expect(safeRatio(10, 0)).toBeNull();
    expect(safeRatio(10, null)).toBeNull();
  });

  test('deterministic percentile + classification', () => {
    expect(percentile([1, 2, 3, 4], 3)).toBe(75);
    expect(classifyValuation(2, 3, 4)).toBe('undervalued');
    expect(classifyValuation(12, 10, 8)).toBe('fair');
    expect(classifyValuation(30, 20, 25)).toBe('overvalued');
  });

  test('buildSnapshot includes insufficient_data risk when denominator missing', () => {
    const snap = buildSnapshot({ projectId: 'x', values: { market_cap_circulating: 100 } });
    expect(snap.riskFactors).toContain('insufficient_data');
    expect(snap.valuationSignal).toBe('insufficient_data');
  });
});
